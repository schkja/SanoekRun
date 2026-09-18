/**
 * The player.
 *
 * Everything about how the character feels lives here or in
 * `src/systems/physics.ts` → PHYSICS. Start with those numbers if the game
 * feels floaty, sluggish or slippery.
 *
 * Movement is camera-relative: pushing "up" always goes away from the camera,
 * whichever way you have orbited it.
 */

import * as THREE from 'three';
import { Entity } from './entity';
import { Enemy } from './enemy';
import { PHYSICS, moveAndCollide, boxesOverlap } from '../systems/physics';
import { makePlaceholder } from '../core/assets';
import type { World } from '../systems/world';
import type { Input } from '../core/input';

/** Base movement numbers, before power-ups multiply them. */
const BASE = {
  moveSpeed: 9,
  jumpSpeed: 15,
  bounceSpeed: 22,
  /** How fast the character model turns to face the way it is going. */
  turnSpeed: 14,
  /** Upward kick after stomping an enemy. */
  stompBounce: 11,
  invulnerableTime: 1.4,
};

export class Player extends Entity {
  readonly velocity = new THREE.Vector3();
  grounded = false;

  /** Multipliers set by power-ups. 1 = normal. */
  speedMultiplier = 1;
  jumpMultiplier = 1;

  /** Set by the Game each frame so movement follows the camera. */
  readonly cameraForward = new THREE.Vector3(0, 0, -1);

  private readonly spawnPoint = new THREE.Vector3();
  private readonly model: THREE.Group;
  private coyote = 0;
  private jumpBuffer = 0;
  private invulnerable = 0;
  private facing = 0;
  private squash = 0;
  private wasGrounded = false;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();

  constructor(world: World, spawn: THREE.Vector3) {
    super(world);
    this.half.set(0.45, 0.7, 0.45);
    this.spawnPoint.copy(spawn);
    this.object.position.copy(spawn);

    // A simple two-tone placeholder character. Replace with a .glb by calling
    // world.assets.model('hero.glb') and swapping it in, exactly as Platform does.
    // The model's origin is the centre of the collision box, so everything is
    // positioned relative to that: -0.7 is the feet, +0.7 is the shoulders.
    this.model = new THREE.Group();
    const body = makePlaceholder('box', '#f5a623', [0.9, 1.0, 0.9]);
    body.position.y = -0.2;
    const head = makePlaceholder('sphere', '#ffd9a0', 0.74);
    head.position.y = 0.62;
    const visor = makePlaceholder('box', '#2b2b3d', [0.52, 0.18, 0.1]);
    visor.position.set(0, 0.66, 0.34);
    // A pack on the back, so you can always tell which way you are facing.
    const pack = makePlaceholder('box', '#c4741a', [0.6, 0.55, 0.22]);
    pack.position.set(0, -0.1, -0.5);
    this.model.add(body, head, visor, pack);
    this.setModel(this.model);
  }

  /** True while the player is flashing after a hit and cannot be hurt again. */
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }

  update(dt: number): void {
    // Timers
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    this.applyGravity(dt);

    const result = moveAndCollide(this.position, this.half, this.velocity, this.world.colliders, dt);
    this.grounded = result.grounded;

    if (this.grounded) {
      this.coyote = PHYSICS.coyoteTime;

      // Ride moving platforms.
      const ground = result.ground;
      if (ground && ground.velocity.lengthSq() > 0) {
        this.position.addScaledVector(ground.velocity, dt);
      }
      if (ground?.surface === 'bounce') {
        this.velocity.y = BASE.bounceSpeed;
        this.grounded = false;
        this.squash = -0.5;
        this.world.audio.play('jump');
      } else if (ground?.surface === 'hurt') {
        this.takeHit('spikes');
      }

      // Landing squash.
      if (!this.wasGrounded) this.squash = 0.45;
    }
    this.wasGrounded = this.grounded;

    // A buffered jump fires the moment we are allowed to jump.
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.performJump();
    }

    this.checkEnemies();
    this.checkFellOut();
    this.animate(dt);
  }

  /** Read input and turn it into velocity. Called by the Game before update(). */
  handleInput(input: Input, dt: number): void {
    // Build a camera-relative movement direction on the ground plane.
    this.forward.copy(this.cameraForward).setY(0).normalize();
    this.right.set(this.forward.z, 0, -this.forward.x);

    this.wish
      .set(0, 0, 0)
      .addScaledVector(this.forward, input.move.y)
      .addScaledVector(this.right, -input.move.x);

    const onIce = this.grounded && this.currentSurface() === 'ice';
    const acceleration = this.grounded
      ? onIce
        ? PHYSICS.groundAcceleration * 0.22
        : PHYSICS.groundAcceleration
      : PHYSICS.airAcceleration;
    const friction = this.grounded
      ? onIce
        ? PHYSICS.groundFriction * 0.12
        : PHYSICS.groundFriction
      : PHYSICS.airFriction;

    const topSpeed = BASE.moveSpeed * this.speedMultiplier;

    if (this.wish.lengthSq() > 0.0001) {
      this.velocity.x += this.wish.x * acceleration * dt;
      this.velocity.z += this.wish.z * acceleration * dt;
      this.facing = Math.atan2(this.wish.x, this.wish.z);
    } else {
      // No input: bleed off horizontal speed.
      const decay = Math.max(0, 1 - friction * dt);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
    }

    // Clamp horizontal speed without touching the vertical component.
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal > topSpeed) {
      const scale = topSpeed / horizontal;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    if (input.jumpPressed) this.jumpBuffer = PHYSICS.jumpBuffer;

    // Releasing the button early gives a shorter hop.
    if (!input.jump && this.velocity.y > 0) {
      this.velocity.y *= PHYSICS.jumpCutoff;
    }
  }

  takeHit(cause: string): void {
    if (this.invulnerable > 0) return;
    this.invulnerable = BASE.invulnerableTime;
    this.velocity.y = Math.max(this.velocity.y, 8);
    this.world.audio.play('hurt');
    this.world.events.emit('hurt', { cause });
  }

  /** Put the player back at the level's spawn point. */
  respawn(): void {
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.invulnerable = BASE.invulnerableTime;
    this.speedMultiplier = 1;
    this.jumpMultiplier = 1;
  }

  private performJump(): void {
    this.velocity.y = BASE.jumpSpeed * this.jumpMultiplier;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.grounded = false;
    this.squash = -0.35;
    this.world.audio.play('jump');
  }

  private applyGravity(dt: number): void {
    this.velocity.y -= PHYSICS.gravity * dt;
    if (this.velocity.y < -PHYSICS.maxFallSpeed) this.velocity.y = -PHYSICS.maxFallSpeed;
  }

  private currentSurface(): string {
    // Find the collider directly beneath our feet.
    for (const c of this.world.colliders) {
      const withinX = Math.abs(this.position.x - c.center.x) < this.half.x + c.half.x;
      const withinZ = Math.abs(this.position.z - c.center.z) < this.half.z + c.half.z;
      const feet = this.position.y - this.half.y;
      const top = c.center.y + c.half.y;
      if (withinX && withinZ && Math.abs(feet - top) < 0.12) return c.surface;
    }
    return 'normal';
  }

  /**
   * Enemy contact. Landing on top defeats the enemy; touching it any other way
   * hurts. `stompWindow` is the forgiving band that makes stomps feel fair.
   */
  private checkEnemies(): void {
    for (const entity of this.world.entities) {
      if (!(entity instanceof Enemy) || entity.dead) continue;
      if (!boxesOverlap(this.position, this.half, entity.position, entity.half)) continue;

      const feet = this.position.y - this.half.y;
      const enemyTop = entity.position.y + entity.half.y;
      const fallingOnto = this.velocity.y < 0 && feet > enemyTop - 0.5;

      if (fallingOnto && !entity.spiky) {
        entity.damage(1);
        this.velocity.y = BASE.stompBounce;
        this.squash = 0.5;
        this.world.audio.play('stomp');
      } else {
        this.takeHit(entity.label);
        // Knock back away from the enemy.
        const push = this.position.clone().sub(entity.position).setY(0).normalize();
        this.velocity.addScaledVector(push, 9);
      }
    }
  }

  private checkFellOut(): void {
    if (this.position.y < this.world.killY) {
      this.invulnerable = 0; // a fall always costs a life
      this.takeHit('fall');
    }
  }

  /** Squash-and-stretch and the damage flash. Purely cosmetic. */
  private animate(dt: number): void {
    // Ease the current facing towards the target angle, the short way round.
    let delta = this.facing - this.model.rotation.y;
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.model.rotation.y += delta * Math.min(1, BASE.turnSpeed * dt);

    this.squash += (0 - this.squash) * Math.min(1, 9 * dt);
    this.model.scale.set(1 + this.squash * 0.35, 1 - this.squash * 0.45, 1 + this.squash * 0.35);

    const flashing = this.invulnerable > 0 && Math.floor(this.invulnerable * 14) % 2 === 0;
    this.model.visible = !flashing;
  }
}
