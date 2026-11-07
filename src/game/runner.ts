/**
 * The runner: movement along the track and the character's animation.
 *
 * The runner's position is stored in track terms — which segment, how far
 * along it (`s`) and how far right of centre (`x`) — rather than as a raw 3D
 * point. That's what makes corners easy: turning just moves you onto the next
 * segment. Gameplay rules (obstacles, coins, scoring) live in game.ts; this
 * file only knows how to run, jump, slide and fall.
 */

import * as THREE from 'three';
import { TUNING } from './tuning';
import { headingYaw, type Segment, type Track } from './track';
import { makeCharacterModel, type RunnerModel } from './visuals';
import type { Character } from './settings';

export class Runner {
  seg!: Segment;
  s = 0;
  x = 0;
  lane = 0;
  y = 0;
  vy = 0;
  speed: number = TUNING.startSpeed;
  grounded = true;
  /** True once the runner has dropped below the path — no saving it now. */
  falling = false;
  /** Stops all movement (used while being caught). */
  frozen = false;

  model: RunnerModel = makeCharacterModel('lumberjack');
  /** Logical position on the track. */
  readonly position = new THREE.Vector3();
  /** Where the model is drawn: the logical position, smoothed through turns. */
  readonly visual = new THREE.Vector3();
  yaw = 0;

  private slideTimer = 0;
  private slideQueued = false;
  private stumbleTimer = 0;
  private phase = 0;
  private readonly smoothing = new THREE.Vector3();
  private readonly before = new THREE.Vector3();

  /** Swap the character model. The caller puts the new `model.root` in the scene. */
  setCharacter(character: Character, outfit: string): void {
    this.model = makeCharacterModel(character, outfit);
  }

  get sliding(): boolean {
    return this.slideTimer > 0;
  }

  get stumbling(): boolean {
    return this.stumbleTimer > 0;
  }

  reset(track: Track, seg: Segment): void {
    this.seg = seg;
    this.s = 0;
    this.x = 0;
    this.lane = 0;
    this.y = 0;
    this.vy = 0;
    this.speed = TUNING.startSpeed;
    this.grounded = true;
    this.falling = false;
    this.frozen = false;
    this.slideTimer = 0;
    this.slideQueued = false;
    this.stumbleTimer = 0;
    this.smoothing.set(0, 0, 0);
    track.position(seg, this.s, this.x, this.position);
    this.visual.copy(this.position);
    this.yaw = headingYaw(seg.heading);
    this.model.root.position.copy(this.visual);
    this.model.root.rotation.y = this.yaw;
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
  }

  jump(): boolean {
    if (!this.grounded || this.falling) return false;
    this.vy = TUNING.jumpSpeed;
    this.grounded = false;
    this.slideTimer = 0;
    return true;
  }

  /** Slide on the ground; in the air, slam down and slide on landing. */
  slide(): boolean {
    if (this.falling) return false;
    if (this.grounded) {
      this.slideTimer = TUNING.slideTime;
      return true;
    }
    this.vy = Math.min(this.vy, -TUNING.fastFallSpeed);
    this.slideQueued = true;
    return true;
  }

  changeLane(dir: -1 | 1): boolean {
    const next = Math.max(-1, Math.min(1, this.lane + dir));
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  }

  stumble(): void {
    this.stumbleTimer = TUNING.stumbleTime;
  }

  /** Move onto the next segment after a successful turn. */
  turnOnto(track: Track, next: Segment): void {
    this.before.copy(this.position);
    const rel = this.position.clone().sub(next.start);
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    track.position(next, 1, 0, dir).sub(next.start);
    track.position(next, 0, 1, right).sub(next.start);

    this.seg = next;
    this.s = rel.dot(dir);
    const lateral = rel.dot(right);
    this.lane = Math.max(-1, Math.min(1, Math.round(lateral / TUNING.laneOffset)));
    this.x = Math.max(-TUNING.laneOffset, Math.min(TUNING.laneOffset, lateral));

    // Keep the model where it was and let it glide into the new lane,
    // so an early turn doesn't look like a teleport.
    track.position(this.seg, this.s, this.x, this.position);
    this.smoothing.add(this.before.sub(this.position));
  }

  update(dt: number, targetSpeed: number, track: Track): void {
    if (this.frozen) return;

    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    this.slideTimer = Math.max(0, this.slideTimer - dt);

    const wanted = targetSpeed * (this.stumbling ? TUNING.stumbleSlowdown : 1) * (this.falling ? 0.6 : 1);
    this.speed += (wanted - this.speed) * Math.min(1, dt * 4);
    this.s += this.speed * dt;

    if (!this.falling) {
      const laneX = this.lane * TUNING.laneOffset;
      this.x += (laneX - this.x) * Math.min(1, dt * TUNING.laneChangeRate);
    }

    const wasAbove = this.y >= -0.01;
    this.vy -= TUNING.gravity * dt;
    this.y += this.vy * dt;

    if (this.y <= 0) {
      // Land if we came down onto floor this step (or are only just below it).
      const floor = !this.falling && (wasAbove || this.y > -0.45) && track.hasFloor(this.seg, this.s, this.x);
      if (floor) {
        if (!this.grounded && this.slideQueued) this.slideTimer = TUNING.slideTime;
        this.slideQueued = false;
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        if (this.y < -0.45) this.falling = true;
      }
    } else {
      this.grounded = false;
    }

    track.position(this.seg, this.s, this.x, this.position);
    this.position.y = this.y;
  }

  /**
   * Title screen: the hero stands facing the camera and is alive: breathing,
   * looking around, the lumberjack waving, the tails wagging.
   */
  idle(dt: number): void {
    this.phase += dt * 2.2;
    const p = this.phase;
    const m = this.model;
    m.root.position.copy(this.visual);
    m.root.rotation.set(0, this.yaw, 0);
    m.body.position.y = Math.sin(p * 1.2) * 0.03;
    m.body.rotation.set(0, 0, 0);
    if (m.gait === 'quad') {
      for (const leg of [m.legL, m.legR, m.armL, m.armR]) leg.rotation.x = 0;
      if (m.joints) for (const j of Object.values(m.joints)) j.rotation.x = 0;
      // Sit up a little now and then to look at you.
      const peek = Math.max(0, Math.sin(p * 0.45)) ** 3;
      m.body.rotation.x = peek * 0.35;
      m.armL.rotation.x = m.armR.rotation.x = peek * 0.9;
      if (m.head) m.head.rotation.set(-peek * 0.25, Math.sin(p * 0.7) * 0.45, Math.sin(p * 0.9) * 0.12);
      if (m.tail) {
        m.tail.rotation.x = Math.sin(p * 1.6) * 0.15;
        m.tail.rotation.z = Math.sin(p * 2.3) * 0.25;
      }
    } else {
      // The lumberjack waves hello.
      m.legL.rotation.x = m.legR.rotation.x = 0;
      m.armL.rotation.x = Math.sin(p) * 0.08;
      m.armR.rotation.x = -2.7 + Math.sin(p * 3) * 0.05;
      m.armR.rotation.z = -0.35 + Math.sin(p * 4) * 0.35;
    }
  }

  /** Draw the character: smoothing, facing and limb animation. Purely cosmetic. */
  animate(dt: number): void {
    this.smoothing.multiplyScalar(Math.max(0, 1 - dt * 10));
    this.visual.copy(this.position).add(this.smoothing);
    const m = this.model;
    // Undo the title-screen poses.
    m.armR.rotation.z = 0;
    if (m.head) m.head.rotation.y = m.head.rotation.z = 0;
    m.root.position.copy(this.visual);

    let delta = headingYaw(this.seg.heading) - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * Math.min(1, dt * 14);
    // Lean into lane changes.
    const lean = (this.lane * TUNING.laneOffset - this.x) * -0.18;
    m.root.rotation.set(0, this.yaw, 0);

    if (this.frozen) return;
    this.phase += dt * (6 + this.speed * 0.55);
    const swing = Math.sin(this.phase);

    let bodyTilt = 0;
    let bodyY = 0;
    if (m.gait === 'quad') {
      [bodyTilt, bodyY] = this.animateQuad(m);
    } else if (this.sliding) {
      bodyTilt = 1.2;
      bodyY = 0.05;
      m.legL.rotation.x = m.legR.rotation.x = -1.2;
      m.armL.rotation.x = m.armR.rotation.x = -2.6;
    } else if (!this.grounded) {
      m.legL.rotation.x = 0.9;
      m.legR.rotation.x = -0.4;
      m.armL.rotation.x = m.armR.rotation.x = -2.8;
      bodyTilt = this.falling ? -0.6 : -0.15;
    } else {
      m.legL.rotation.x = swing * 0.95;
      m.legR.rotation.x = -swing * 0.95;
      m.armL.rotation.x = -swing * 0.9;
      m.armR.rotation.x = swing * 0.9;
      bodyY = Math.abs(swing) * 0.08;
      bodyTilt = this.stumbling ? -0.5 : -0.18;
    }
    m.body.position.y += (bodyY - m.body.position.y) * Math.min(1, dt * 20);
    m.body.rotation.x += (bodyTilt - m.body.rotation.x) * Math.min(1, dt * 18);
    m.body.rotation.z = lean;
    if (m.tail) {
      // The tail flows a beat behind the stride; flat out behind in a slide.
      const wave = m.gait === 'quad' ? Math.sin(this.phase * 0.9 - 1.3) * 0.22 : Math.sin(this.phase * 0.5) * 0.18;
      // (The squirrel's tail already streams back, so in a slide it just lies flat.)
      const pose = this.sliding ? (m.gait === 'quad' ? -0.15 : 0.9) : this.grounded ? 0 : -0.3;
      m.tail.rotation.x += (wave + pose - m.tail.rotation.x) * Math.min(1, dt * 14);
      m.tail.rotation.z = Math.sin(this.phase * 0.5 + 1) * 0.1;
    }
  }

  /**
   * Four-legged animation (the squirrel). Returns [body pitch, body height].
   *
   * Running: legs alternate left and right, in diagonal pairs (left hind with
   * right front), so you clearly see it run rather than hop. Each leg swings
   * from the hip or shoulder; while a paw travels forward it lifts by bending
   * at the knee or elbow, and it straightens again to push on the ground.
   * The body bobs twice per stride and the head counters it.
   * Jumping stretches out like a flying squirrel; sliding flattens the belly
   * to the ground with the legs splayed, so nothing sinks below the path.
   */
  private animateQuad(m: RunnerModel): [number, number] {
    const p = this.phase;
    const head = m.head;
    const j = m.joints;
    const bend = (lowerL: number, lowerR: number, armL: number, armR: number) => {
      if (!j) return;
      j.legL.rotation.x = lowerL;
      j.legR.rotation.x = lowerR;
      j.armL.rotation.x = armL;
      j.armR.rotation.x = armR;
    };
    if (this.sliding) {
      m.armL.rotation.x = m.armR.rotation.x = 1.45;
      m.legL.rotation.x = m.legR.rotation.x = -1.45;
      bend(0, 0, 0, 0);
      if (head) head.rotation.x = 0.25;
      return [0, -0.3];
    }
    if (!this.grounded) {
      const fall = this.falling;
      m.armL.rotation.x = m.armR.rotation.x = fall ? 1.8 : 0.9;
      m.legL.rotation.x = m.legR.rotation.x = fall ? -0.4 : -0.8;
      bend(fall ? -0.5 : 0.1, fall ? -0.5 : 0.1, -0.2, -0.2);
      if (head) head.rotation.x = -0.2;
      return [fall ? -0.5 : this.vy > 0 ? 0.2 : -0.1, 0];
    }
    // One leg: swing from the hip, and fold the lower half while the paw
    // comes forward (the swing's rising half), straight while it pushes.
    const step = (upper: THREE.Group, phase: number, reach: number, fold: number): number => {
      upper.rotation.x = Math.sin(phase) * reach;
      return -Math.max(0, Math.cos(phase)) * fold;
    };
    // Small, quick steps with the paws staying under the body.
    const hindL = step(m.legL, p, 0.5, 0.9);
    const hindR = step(m.legR, p + Math.PI, 0.5, 0.9);
    const frontL = step(m.armL, p + Math.PI + 0.25, 0.55, 1.1);
    const frontR = step(m.armR, p + 0.25, 0.55, 1.1);
    bend(hindL, hindR, frontL, frontR);
    // Two bobs per stride (one per diagonal pair); the head stays level.
    const bob = (1 - Math.cos(p * 2)) * 0.03;
    const pitch = Math.sin(p * 2) * 0.035;
    if (head) head.rotation.x = -pitch - Math.sin(p * 2 + 0.6) * 0.05;
    return [(this.stumbling ? 0.35 : 0) + pitch, bob];
  }
}
