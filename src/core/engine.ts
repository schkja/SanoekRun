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

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(TUNING.camera.baseFov, 1, 0.1, 300);

    this.scene.background = new THREE.Color('#8fd1b5');
    this.scene.fog = new THREE.Fog('#8fd1b5', 30, 110);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#3b5a40', 1.5);
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
  }

  applyTheme(theme: WorldTheme): void {
    (this.scene.background as THREE.Color).set(theme.sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(theme.fog);
    fog.near = theme.fogNear;
    fog.far = theme.fogFar;
    this.sun.color.set(theme.sun);
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.abyssMaterial.color.set(theme.abyss);
    // A glowing abyss shouldn't fade into the fog — lava stays bright.
    this.abyssMaterial.fog = !theme.abyssGlow;
    this.abyssMaterial.needsUpdate = true;
    this.abyss.position.y = theme.abyssGlow ? -9 : -22;
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
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    // Phones in portrait see less to the sides; widen the view to compensate.
    this.portraitFov = Math.max(0, Math.min(16, (1 - this.camera.aspect) * 26));
    this.camera.fov = TUNING.camera.baseFov + this.portraitFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
}
