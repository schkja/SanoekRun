/**
 * Engine: renderer, scene, lights and the third-person orbit camera.
 *
 * The camera is a standard RPG / action-game rig: it sits on a sphere around
 * the character, described by two angles and a distance.
 *
 *     yaw      — spin all the way around the character (no limit, wraps freely)
 *     pitch    — how high or low you are looking from (clamped, so it can't flip)
 *     distance — how far back you are (mouse wheel)
 *
 * It also pulls in automatically when a wall or platform would come between the
 * camera and the character, which is what stops you from seeing through the
 * level when you back into a corner.
 */

import * as THREE from 'three';
import type { Collider } from '../systems/physics';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  /** The object the camera follows. Set by the game when the player spawns. */
  target: THREE.Object3D | null = null;

  /**
   * Camera settings — this is the block to tune if the camera doesn't feel
   * right. Angles are in radians.
   */
  readonly cameraRig = {
    /** Rotation around the character. Driven by the mouse. */
    yaw: 0,
    /** Height angle. 0 is eye level, positive looks down from above. */
    pitch: 0.42,
    /** How far back the camera sits. Driven by the wheel. */
    distance: 11,
    minDistance: 2.5,
    maxDistance: 24,
    /** Stops the camera going under the floor or flipping over the top. */
    minPitch: -0.45,
    maxPitch: 1.3,
    /** 0 = snaps instantly, higher = lazier follow. */
    smoothing: 0.12,
    /** The camera aims at this height above the character's centre. */
    lookAtHeight: 1.1,
    /** How far in front of a wall the camera stops. */
    collisionPadding: 0.4,
    /** Closest the camera may get when squeezed against geometry. */
    collisionMinDistance: 1.2,
    /**
     * When a wall forces the camera closer than this to the character, the
     * character is hidden — otherwise you end up looking at the inside of your
     * own head. Standard third-person behaviour.
     */
    hideTargetBelow: 2.2,
  };

  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly focus = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly sunOffset = new THREE.Vector3(18, 30, 12);
  private readonly ray = new THREE.Ray();
  private readonly box = new THREE.Box3();
  private readonly hit = new THREE.Vector3();
  private shake = 0;
  /** Set by update() — the distance actually used after collision. */
  private clearDistance = 11;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.camera.position.set(0, 10, 14);

    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.fog = new THREE.Fog('#87ceeb', 30, 90);

    this.ambient = new THREE.HemisphereLight('#ffffff', '#4a4a6a', 1.6);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff6e0', 2.2);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    const shadowBox = 45;
    this.sun.shadow.camera.left = -shadowBox;
    this.sun.shadow.camera.right = shadowBox;
    this.sun.shadow.camera.top = shadowBox;
    this.sun.shadow.camera.bottom = -shadowBox;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Apply a level's colour theme. Called by the level loader. */
  applyTheme(theme: { sky?: string; fog?: string; fogDistance?: number; light?: string } = {}): void {
    const sky = theme.sky ?? '#87ceeb';
    const fogColor = theme.fog ?? sky;
    const distance = theme.fogDistance ?? 60;

    (this.scene.background as THREE.Color).set(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(fogColor);
    fog.near = distance * 0.4;
    fog.far = distance * 1.6;

    if (theme.light) this.sun.color.set(theme.light);
  }

  // -------------------------------------------------------------------------
  // Camera controls — called by the Game from whatever input is available.
  // -------------------------------------------------------------------------

  /**
   * Turn the camera. `dx` and `dy` are in radians; the Input layer has already
   * converted mouse pixels, touch drag or key presses into them.
   */
  orbit(dx: number, dy: number): void {
    const rig = this.cameraRig;
    rig.yaw -= dx;
    rig.pitch = clamp(rig.pitch + dy, rig.minPitch, rig.maxPitch);

    // Keep yaw in a sane range so it never loses precision on a long session.
    if (rig.yaw > Math.PI) rig.yaw -= Math.PI * 2;
    else if (rig.yaw < -Math.PI) rig.yaw += Math.PI * 2;
  }

  /** Move the camera in or out. Positive pulls back. */
  zoom(delta: number): void {
    const rig = this.cameraRig;
    rig.distance = clamp(rig.distance + delta, rig.minDistance, rig.maxDistance);
  }

  /** Point the camera at a fresh angle with no easing. Used when a level loads. */
  resetOrbit(yaw = 0, pitch = 0.42): void {
    this.cameraRig.yaw = yaw;
    this.cameraRig.pitch = pitch;
  }

  /** Nudge the camera — used on damage and stomps. */
  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 1);
  }

  /** Put the camera in place immediately, with no easing. */
  snapToTarget(colliders: readonly Collider[] = []): void {
    if (!this.target) return;
    this.computeDesiredPosition(colliders);
    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.focus);
  }

  update(dt: number, colliders: readonly Collider[]): void {
    if (this.target) {
      this.computeDesiredPosition(colliders);

      // Frame-rate independent easing towards the desired position.
      const t = 1 - Math.pow(this.cameraRig.smoothing, dt * 60);
      this.camera.position.lerp(this.desiredPosition, t);

      // Easing can lag behind when the camera is being squeezed against a wall,
      // which would let it drift inside geometry for a few frames. Re-clamping
      // the eased position to the clear distance keeps the view solid while
      // still looking smooth on the way back out.
      this.offset.subVectors(this.camera.position, this.focus);
      const length = this.offset.length();
      if (length > this.clearDistance && length > 0.0001) {
        this.camera.position
          .copy(this.focus)
          .addScaledVector(this.offset.divideScalar(length), this.clearDistance);
      }

      this.camera.lookAt(this.focus);

      // Don't render the character when the camera has been pushed inside it.
      this.target.visible =
        this.camera.position.distanceTo(this.target.position) > this.cameraRig.hideTargetBelow;

      // Keep the shadow frustum centred on the action.
      this.sun.target.position.copy(this.target.position);
      this.sun.position.copy(this.target.position).add(this.sunOffset);
    }

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const k = this.shake * 0.3;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Forward direction on the ground plane. Movement uses this so that "up" on
   * the stick always means "away from the camera", however you have it turned.
   */
  getCameraForward(out = new THREE.Vector3()): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) {
      // Looking straight down — fall back to the yaw angle so movement never
      // becomes undefined at the extremes of pitch.
      out.set(-Math.sin(this.cameraRig.yaw), 0, -Math.cos(this.cameraRig.yaw));
    }
    return out.normalize();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  /**
   * Work out where the camera wants to be: on a sphere around the character,
   * pulled in if the level is in the way.
   */
  private computeDesiredPosition(colliders: readonly Collider[]): void {
    if (!this.target) return;
    const rig = this.cameraRig;

    this.focus.copy(this.target.position);
    this.focus.y += rig.lookAtHeight;

    // Spherical coordinates → a direction pointing from the character to the camera.
    const cosPitch = Math.cos(rig.pitch);
    this.offset.set(
      Math.sin(rig.yaw) * cosPitch,
      Math.sin(rig.pitch),
      Math.cos(rig.yaw) * cosPitch,
    );

    this.clearDistance = this.findClearDistance(colliders, rig.distance);
    this.desiredPosition.copy(this.focus).addScaledVector(this.offset, this.clearDistance);
  }

  /**
   * Cast from the character out towards the camera and stop at the first solid
   * thing. Uses the same collider boxes as the physics, so the camera and the
   * player agree about what is solid.
   */
  private findClearDistance(colliders: readonly Collider[], wanted: number): number {
    if (colliders.length === 0) return wanted;

    this.ray.origin.copy(this.focus);
    this.ray.direction.copy(this.offset);

    let nearest = wanted;
    for (const collider of colliders) {
      this.box.setFromCenterAndSize(collider.center, this.boxSize(collider));
      // Grow the box a little so the near clip plane never pokes through a wall.
      this.box.expandByScalar(this.cameraRig.collisionPadding);

      if (!this.ray.intersectBox(this.box, this.hit)) continue;
      const distance = this.hit.distanceTo(this.focus);
      if (distance < nearest) nearest = distance;
    }

    return Math.max(nearest, this.cameraRig.collisionMinDistance);
  }

  private readonly sizeScratch = new THREE.Vector3();
  private boxSize(collider: Collider): THREE.Vector3 {
    return this.sizeScratch.copy(collider.half).multiplyScalar(2);
  }

  private resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
