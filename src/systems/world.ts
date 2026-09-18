/**
 * The World holds everything that exists during a level: the entities, the
 * solid boxes the player collides with, and the shared services (scene, assets,
 * audio, events).
 *
 * Entities talk to the world; the world never reaches back into the Game. The
 * Game listens on `events` instead. That one-way flow is what keeps the code
 * easy to extend.
 */

import * as THREE from 'three';
import type { Assets } from '../core/assets';
import type { Audio } from '../core/audio';
import type { EventBus } from '../core/events';
import type { Entity } from '../entities/entity';
import type { Player } from '../entities/player';
import type { Collider } from './physics';

export class World {
  readonly entities: Entity[] = [];
  readonly colliders: Collider[] = [];
  player: Player | null = null;

  /** Y below which the player is considered to have fallen out of the level. */
  killY = -20;

  constructor(
    readonly scene: THREE.Scene,
    readonly assets: Assets,
    readonly audio: Audio,
    readonly events: EventBus,
  ) {}

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    this.scene.add(entity.object);
    return entity;
  }

  addCollider(collider: Collider): Collider {
    this.colliders.push(collider);
    return collider;
  }

  update(dt: number): void {
    this.tickTimers(dt);
    for (const entity of this.entities) {
      if (!entity.dead) entity.update(dt);
    }
    this.reap();
  }

  /**
   * Run `onEnd` after `seconds` of game time. Used by timed power-ups, so they
   * pause with the game instead of expiring behind the pause menu.
   */
  addTimer(key: string, seconds: number, onEnd: () => void): void {
    // Re-collecting the same power-up refreshes it rather than stacking it.
    this.timers.set(key, { remaining: seconds, onEnd });
  }

  private timers = new Map<string, { remaining: number; onEnd: () => void }>();

  private tickTimers(dt: number): void {
    for (const [key, timer] of this.timers) {
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        this.timers.delete(key);
        timer.onEnd();
      }
    }
  }

  /** Remove everything and free its GPU memory. Called between levels. */
  clear(): void {
    for (const entity of this.entities) {
      this.scene.remove(entity.object);
      entity.dispose();
    }
    this.entities.length = 0;
    this.colliders.length = 0;
    this.timers.clear();
    this.player = null;
  }

  private reap(): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      if (!entity.dead) continue;
      this.scene.remove(entity.object);
      entity.dispose();
      this.entities.splice(i, 1);
    }
  }
}
