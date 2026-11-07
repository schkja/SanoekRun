/**
 * Engine: renderer, scene, lights and the chase camera.
 *
 * The camera sits behind and above the runner and swings round with them at
 * every corner — that swing is most of what makes a turn feel good. It also
 * widens its field of view as the run speeds up, which sells the speed.
 */

import * as THREE from 'three';
import { TUNING } from '../game/tuning';
import type { WorldTheme } from '../game/worlds';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly abyss: THREE.Mesh;
  private readonly abyssMaterial: THREE.MeshBasicMaterial;
  /** The sky: a vertical gradient painted on a tiny canvas. */
  private readonly skyCanvas = document.createElement('canvas');
  private readonly sky: THREE.CanvasTexture;
  private readonly sunOffset = new THREE.Vector3(14, 26, 8);
  private readonly forward = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private yaw = 0;
  private camY = 0;
  private shake = 0;
  private fovKick = 0;
  private lift = 0;
  private roll = 0;
  /** Extra field of view on tall portrait screens, so all three lanes stay in view. */
  private portraitFov = 0;

  private container: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Filmic tone mapping: brighter, richer colours without blowing out.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(TUNING.camera.baseFov, 1, 0.1, 300);

    this.skyCanvas.width = 256;
    this.skyCanvas.height = 512;
    this.sky = new THREE.CanvasTexture(this.skyCanvas);
    this.sky.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog('#8fd1b5', 30, 110);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#3b5a40', 1.9);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const box = 24;
    Object.assign(this.sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 80 });
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    // The void under the path: dark in the jungle, molten in the lava cave.
    this.abyssMaterial = new THREE.MeshBasicMaterial({ color: '#14402d', fog: true });
    this.abyss = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), this.abyssMaterial);
    this.abyss.rotation.x = -Math.PI / 2;
    this.abyss.position.y = -22;
    this.scene.add(this.abyss);

    this.resize();
    window.addEventListener('resize', this.resize);
    // The container's size can change without a window resize (iOS home-screen
    // apps settle their real height a moment after launch).
    if ('ResizeObserver' in window) new ResizeObserver(this.resize).observe(container);
    this.container = container;
  }

  private weather: Weather | null = null;

  applyTheme(theme: WorldTheme): void {
    this.weather?.dispose(this.scene);
    this.weather = theme.weather ? new Weather(theme.weather) : null;
    this.weather?.attach(this.scene);
    paintSky(this.skyCanvas, theme);
    this.sky.needsUpdate = true;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(theme.fog);
    fog.near = theme.fogNear;
    fog.far = theme.fogFar;
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.abyssMaterial.color.set(theme.abyss);
    // A glowing abyss shouldn't fade into the fog — lava stays bright.
    this.abyssMaterial.fog = !theme.abyssGlow;
    this.abyssMaterial.needsUpdate = true;
    this.abyss.position.y = theme.ground ? -0.06 : theme.abyssY ?? (theme.abyssGlow ? -9 : -22);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Lean the camera into a corner: -1 left, 1 right. It eases back on its own. */
  tilt(dir: number, amount = 0.09): void {
    this.roll = -dir * amount;
  }

  /** A quick widening of the view, e.g. when diving through a portal. */
  kickFov(amount: number): void {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  /** Put the camera straight into position with no easing. */
  /**
   * Title screen: the camera stands in front of the hero, looking at them, so
   * they face you. It eases in, and `follow()` eases back out when a run starts.
   */
  showcase(target: THREE.Vector3, yaw: number, dt: number): void {
    this.weather?.update(dt, this.camera.position);
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    // Look below the hero, so they stand in the top half of the screen,
    // above the title card.
    const want = this.look.set(target.x, target.y + 1.6, target.z).addScaledVector(this.forward, 6.4);
    const k = dt === 0 ? 1 : Math.min(1, dt * 4);
    this.camera.position.lerp(want, k);
    this.camera.lookAt(target.x + this.forward.x * 0.6, target.y - 1.25, target.z + this.forward.z * 0.6);
    this.yaw = yaw + Math.PI;
    const fov = TUNING.camera.baseFov + this.portraitFov;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  snap(target: THREE.Vector3, yaw: number): void {
    this.yaw = yaw;
    this.camY = target.y;
    this.follow(target, yaw, 0, 0, false, this.lift);
  }

  /**
   * Follow the runner. `yaw` is the direction of travel; the camera eases
   * towards it, which produces the swing round corners. `speed01` is 0..1.
   */
  follow(target: THREE.Vector3, yaw: number, dt: number, speed01: number, falling: boolean, chaseView = 0): void {
    const C = TUNING.camera;
    this.weather?.update(dt, this.camera.position);
    // While the chaser is close, rise up so it shows at the bottom of the
    // screen chasing you instead of blocking the view.
    this.lift += (chaseView - this.lift) * Math.min(1, dt * 3);
    let delta = yaw - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * Math.min(1, dt * C.yawRate);

    // Don't bob with every jump; drift down slowly if the runner falls.
    const wantY = falling ? Math.max(target.y, this.camY - 6) : target.y * 0.45;
    this.camY += (wantY - this.camY) * Math.min(1, dt * (falling ? 1.5 : 6));

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.camera.position
      .set(target.x, this.camY + C.height + this.lift * 1.7, target.z)
      .addScaledVector(this.forward, -C.distance - this.lift * 0.4);
    this.look
      .set(target.x, (falling ? target.y : this.camY) + C.lookHeight, target.z)
      .addScaledVector(this.forward, C.lookAhead);
    this.camera.lookAt(this.look);
    if (Math.abs(this.roll) > 0.0005) {
      this.roll *= Math.max(0, 1 - dt * 4);
      this.camera.rotateZ(this.roll);
    }

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const k = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }

    this.fovKick = Math.max(0, this.fovKick - dt * 18);
    const fov = C.baseFov + this.portraitFov + (C.maxFov - C.baseFov) * speed01 + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Keep the shadow frustum and the abyss centred on the action.
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.position.set(target.x, 0, target.z).add(this.sunOffset);
    this.abyss.position.x = target.x;
    this.abyss.position.z = target.z;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize = (): void => {
    // Measure the container (sized by CSS to the real screen), not the window.
    const box = this.container ?? this.renderer.domElement.parentElement;
    const width = box?.clientWidth || window.innerWidth;
    const height = box?.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    // Phones in portrait see less to the sides; widen the view to compensate.
    this.portraitFov = Math.max(0, Math.min(16, (1 - this.camera.aspect) * 26));
    this.camera.fov = TUNING.camera.baseFov + this.portraitFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}

/**
 * The sky backdrop: a vertical gradient, plus stars, a moon or a low sun
 * when the world asks for them. It is a screen-space backdrop, so they stay
 * put while the forest turns around you, like a painted theatre sky.
 */
function paintSky(canvas: HTMLCanvasElement, theme: WorldTheme): void {
  const g = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const gradient = g.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, theme.skyTop);
  gradient.addColorStop(0.55, theme.sky);
  gradient.addColorStop(1, theme.fog);
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);

  // Seeded, so the sky looks the same every time you enter the world.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  if (theme.stars) {
    for (let i = 0; i < 220; i++) {
      const y = Math.pow(rand(), 1.6) * h * 0.6;
      const r = rand() < 0.08 ? 1.6 : rand() * 0.9 + 0.3;
      g.globalAlpha = 0.35 + rand() * 0.65 * (1 - y / (h * 0.6));
      g.fillStyle = rand() < 0.15 ? '#ffe9b0' : '#ffffff';
      g.beginPath();
      g.arc(rand() * w, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  if (theme.moon) {
    const x = w * 0.74;
    const y = h * 0.16;
    const halo = g.createRadialGradient(x, y, 8, x, y, 70);
    halo.addColorStop(0, 'rgba(255, 248, 220, 0.45)');
    halo.addColorStop(1, 'rgba(255, 248, 220, 0)');
    g.fillStyle = halo;
    g.fillRect(x - 70, y - 70, 140, 140);
    g.fillStyle = '#fff6d6';
    g.beginPath();
    g.arc(x, y, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200, 190, 160, 0.45)';
    for (const [dx, dy, r] of [[-7, -5, 5], [6, 4, 4], [-2, 9, 3], [8, -9, 2.5]]) {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (theme.sunDisc) {
    // A big soft sun sitting low, just above the horizon haze.
    const x = w * 0.3;
    const y = h * 0.5;
    const glow = g.createRadialGradient(x, y, 10, x, y, 120);
    glow.addColorStop(0, theme.sunDisc);
    glow.addColorStop(0.35, `${theme.sunDisc}88`);
    glow.addColorStop(1, `${theme.sunDisc}00`);
    g.fillStyle = glow;
    g.fillRect(x - 120, y - 120, 240, 240);
    g.fillStyle = theme.sunDisc;
    g.beginPath();
    g.arc(x, y, 34, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * Weather: rain streaks, snowflakes, blossom petals or autumn leaves falling
 * in a box around the camera. Each particle wraps around when it leaves the
 * box, so a few hundred are enough to fill the view wherever you run.
 */
class Weather {
  private readonly count: number;
  private readonly size = new THREE.Vector3(26, 16, 34);
  private readonly pos: Float32Array;
  private readonly speed: Float32Array;
  private readonly object: THREE.Points | THREE.LineSegments;
  private readonly rain: boolean;
  private time = 0;

  constructor(private readonly kind: 'rain' | 'snow' | 'petals' | 'leaves') {
    this.rain = kind === 'rain';
    this.count = this.rain ? 600 : kind === 'snow' ? 500 : 220;
    this.pos = new Float32Array(this.count * 3);
    this.speed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.size.x;
      this.pos[i * 3 + 1] = Math.random() * this.size.y - 4;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.size.z;
      this.speed[i] = 0.7 + Math.random() * 0.6;
    }
    const geometry = new THREE.BufferGeometry();
    if (this.rain) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 6), 3));
      this.object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.45 }));
    } else {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
      const palette = kind === 'snow' ? ['#ffffff'] : kind === 'petals' ? ['#ffc2d6', '#ffd9e6', '#ffffff'] : ['#ff8a2a', '#ffb347', '#e0522b', '#ffd23f'];
      const colors = new Float32Array(this.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < this.count; i++) {
        c.set(palette[i % palette.length]);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.object = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ size: kind === 'snow' ? 0.18 : 0.26, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, map: roundSprite(), alphaTest: 0.3 }),
      );
    }
    this.object.frustumCulled = false;
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.object);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.object);
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }

  update(dt: number, camera: THREE.Vector3): void {
    this.time += dt;
    const fall = this.kind === 'rain' ? 24 : this.kind === 'snow' ? 1.6 : this.kind === 'petals' ? 1.3 : 1.9;
    const sway = this.kind === 'rain' ? 0 : this.kind === 'snow' ? 0.5 : 1.1;
    const out = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = out.array as Float32Array;
    const { x: W, y: H, z: D } = this.size;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.pos[k + 1] -= fall * this.speed[i] * dt;
      this.pos[k] += Math.sin(this.time * 1.3 + i) * sway * dt;
      this.pos[k + 2] += Math.cos(this.time * 1.1 + i * 0.7) * sway * 0.6 * dt;
      // Keep every particle in the box around the camera.
      if (this.pos[k + 1] < -6) this.pos[k + 1] += H;
      const wx = ((((this.pos[k] - camera.x + W / 2) % W) + W) % W) - W / 2;
      const wz = ((((this.pos[k + 2] - camera.z + D / 2) % D) + D) % D) - D / 2;
      const x = camera.x + wx;
      const y = camera.y + this.pos[k + 1] - 4;
      const z = camera.z + wz;
      if (this.rain) {
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + 0.05;
        arr[i * 6 + 4] = y + 0.7;
        arr[i * 6 + 5] = z;
      } else {
        arr[k] = x;
        arr[k + 1] = y;
        arr[k + 2] = z;
      }
    }
    out.needsUpdate = true;
  }
}

/** A soft round dot, so snowflakes and petals aren't little squares. */
let sprite: THREE.Texture | null = null;
function roundSprite(): THREE.Texture {
  if (sprite) return sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  sprite = new THREE.CanvasTexture(c);
  return sprite;
}
