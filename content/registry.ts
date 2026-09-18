/**
 * ============================================================================
 *  THE REGISTRY — the one code file you edit to add new *behaviour*.
 * ============================================================================
 *
 * Everything else in content/ is plain JSON data. This file holds the two
 * lookup tables that turn a name in that JSON into something that happens:
 *
 *   itemEffects     "what does this pickup do when touched?"
 *   enemyBehaviors  "how does this enemy move?"
 *
 * To add a new one:
 *   1. Add its name to the union type in src/core/types.ts
 *      (ItemEffectName or EnemyBehaviorName).
 *   2. Add the matching entry below.
 *   3. Reference it from items.json / enemies.json.
 *
 * TypeScript will fail the build if you do step 1 and forget step 2, so you
 * cannot ship a level that references an effect nothing implements.
 */

import * as THREE from 'three';
import type { ItemDef, ItemEffectName, EnemyBehaviorName } from '../src/core/types';
import type { World } from '../src/systems/world';
import type { Enemy } from '../src/entities/enemy';

// ---------------------------------------------------------------------------
// Item effects
// ---------------------------------------------------------------------------

export type ItemEffect = (def: ItemDef, world: World) => void;

export const itemEffects: Record<ItemEffectName, ItemEffect> = {
  /** Plain points. The classic coin. */
  score: (def, world) => {
    world.events.emit('score', { amount: def.value, reason: def.id });
  },

  /** An extra life. */
  life: (def, world) => {
    world.events.emit('life', { amount: def.value });
  },

  /** Adds seconds back onto the level clock. */
  time: (def, world) => {
    world.events.emit('time', { seconds: def.value });
  },

  /** Temporary speed boost. `value` is the multiplier, `duration` the seconds. */
  speed: (def, world) => {
    const player = world.player;
    if (!player) return;
    player.speedMultiplier = def.value;
    const duration = def.duration ?? 5;
    world.events.emit('effect', { name: def.label, active: true, duration });
    world.addTimer('speed', duration, () => {
      player.speedMultiplier = 1;
      world.events.emit('effect', { name: def.label, active: false, duration: 0 });
    });
  },

  /** Temporary higher jump. Same shape as `speed`. */
  jump: (def, world) => {
    const player = world.player;
    if (!player) return;
    player.jumpMultiplier = def.value;
    const duration = def.duration ?? 5;
    world.events.emit('effect', { name: def.label, active: true, duration });
    world.addTimer('jump', duration, () => {
      player.jumpMultiplier = 1;
      world.events.emit('effect', { name: def.label, active: false, duration: 0 });
    });
  },
};

// ---------------------------------------------------------------------------
// Enemy behaviours
// ---------------------------------------------------------------------------

export type EnemyBehavior = (enemy: Enemy, dt: number) => void;

const scratch = new THREE.Vector3();

export const enemyBehaviors: Record<EnemyBehaviorName, EnemyBehavior> = {
  /** Walks between `position` and `patrolTo` from the level JSON. */
  patrol: (enemy, dt) => {
    const from = enemy.home;
    const to = enemy.patrolTo;
    if (from.distanceToSquared(to) < 0.01) return; // no route given

    // memory.t walks 0 → 1 → 0 along the route.
    enemy.memory.t ??= 0;
    enemy.memory.dir ??= 1;

    const routeLength = from.distanceTo(to);
    enemy.memory.t += (enemy.memory.dir * enemy.def.speed * dt) / routeLength;

    if (enemy.memory.t >= 1) {
      enemy.memory.t = 1;
      enemy.memory.dir = -1;
    } else if (enemy.memory.t <= 0) {
      enemy.memory.t = 0;
      enemy.memory.dir = 1;
    }

    scratch.lerpVectors(from, to, enemy.memory.t);
    enemy.position.copy(scratch);

    // Face the way we are walking.
    const dx = (to.x - from.x) * enemy.memory.dir;
    const dz = (to.z - from.z) * enemy.memory.dir;
    enemy.object.rotation.y = Math.atan2(dx, dz);
  },

  /**
   * Sits still until the player comes within `params.range`, then follows.
   * Returns home when the player leaves.
   */
  chase: (enemy, dt) => {
    const target = enemy.playerPosition;
    const range = enemy.def.params?.range ?? 10;
    const destination = target && enemy.position.distanceTo(target) < range ? target : enemy.home;

    scratch.subVectors(destination, enemy.position).setY(0);
    const distance = scratch.length();
    if (distance < 0.15) return;

    scratch.normalize();
    enemy.position.addScaledVector(scratch, Math.min(enemy.def.speed * dt, distance));
    enemy.object.rotation.y = Math.atan2(scratch.x, scratch.z);
  },

  /** Floats up and down on the spot. Good for mid-air obstacles. */
  hover: (enemy, dt) => {
    enemy.memory.t = (enemy.memory.t ?? 0) + dt * enemy.def.speed;
    const height = enemy.def.params?.height ?? 1.5;
    enemy.position.y = enemy.home.y + Math.sin(enemy.memory.t) * height;
    enemy.object.rotation.y += dt * 0.8;
  },

  /** Orbits its home position. `params.radius` sets how wide. */
  spinner: (enemy, dt) => {
    enemy.memory.t = (enemy.memory.t ?? 0) + dt * enemy.def.speed * 0.5;
    const radius = enemy.def.params?.radius ?? 3;
    enemy.position.set(
      enemy.home.x + Math.cos(enemy.memory.t) * radius,
      enemy.home.y,
      enemy.home.z + Math.sin(enemy.memory.t) * radius,
    );
    enemy.object.rotation.y = -enemy.memory.t;
  },

  /** Does nothing. A hazard you have to jump over or around. */
  static: (enemy, dt) => {
    enemy.object.rotation.y += dt * 0.5;
  },
};
