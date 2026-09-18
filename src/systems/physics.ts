/**
 * Physics: gravity and axis-aligned box collision.
 *
 * Deliberately small and hand-written — no physics engine. Arcade platformers
 * want predictable, snappy movement more than accurate simulation, and this is
 * about 100 lines you can read and tune.
 *
 * If you later need ragdolls, slopes or stacking crates, swap this out for
 * Rapier (`npm i @dimforge/rapier3d-compat`). Nothing else in the game calls
 * into this file except the Player, so the change is contained.
 */

import * as THREE from 'three';

/** Tuning knobs for how the game feels. Change these first. */
export const PHYSICS = {
  gravity: 34,
  /** Cap on falling speed. */
  maxFallSpeed: 32,
  /** How fast the player reaches top speed on the ground. */
  groundAcceleration: 70,
  airAcceleration: 30,
  groundFriction: 12,
  airFriction: 1.5,
  /** Frames of grace after walking off an edge where a jump still works. */
  coyoteTime: 0.12,
  /** A jump pressed this long before landing still fires on touchdown. */
  jumpBuffer: 0.14,
  /** Releasing jump early cuts upward speed by this factor. */
  jumpCutoff: 0.45,
};

/** A solid box in the world. Platforms and the ground are these. */
export interface Collider {
  /** Centre of the box. */
  center: THREE.Vector3;
  /** Half-extents [w/2, h/2, d/2]. */
  half: THREE.Vector3;
  surface: 'normal' | 'ice' | 'bounce' | 'hurt';
  /** How far the collider moved this frame — riders get carried along. */
  velocity: THREE.Vector3;
}

/** What a body learned from the last collision resolve. */
export interface CollisionResult {
  grounded: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
  /** The collider the body is standing on, if any. */
  ground: Collider | null;
}

const EPSILON = 0.001;

/**
 * Move a box through the world one axis at a time, stopping on solids.
 *
 * Resolving axes separately is the classic trick that makes it possible to slide
 * along a wall instead of sticking to it, and to land on a ledge you clipped.
 */
export function moveAndCollide(
  position: THREE.Vector3,
  half: THREE.Vector3,
  velocity: THREE.Vector3,
  colliders: readonly Collider[],
  dt: number,
): CollisionResult {
  const result: CollisionResult = { grounded: false, hitCeiling: false, hitWall: false, ground: null };

  // --- Y first: landing and head-bonks decide the rest of the frame ---------
  position.y += velocity.y * dt;
  for (const c of colliders) {
    if (!overlaps(position, half, c)) continue;
    const penetration =
      velocity.y > 0
        ? c.center.y - c.half.y - (position.y + half.y) // moving up: push down
        : c.center.y + c.half.y - (position.y - half.y); // moving down: push up

    position.y += penetration;
    if (velocity.y > 0) {
      result.hitCeiling = true;
      velocity.y = 0;
    } else {
      result.grounded = true;
      result.ground = c;
      velocity.y = 0;
    }
  }

  // --- X ---------------------------------------------------------------------
  position.x += velocity.x * dt;
  for (const c of colliders) {
    if (!overlaps(position, half, c)) continue;
    position.x +=
      velocity.x > 0
        ? c.center.x - c.half.x - (position.x + half.x)
        : c.center.x + c.half.x - (position.x - half.x);
    velocity.x = 0;
    result.hitWall = true;
  }

  // --- Z ---------------------------------------------------------------------
  position.z += velocity.z * dt;
  for (const c of colliders) {
    if (!overlaps(position, half, c)) continue;
    position.z +=
      velocity.z > 0
        ? c.center.z - c.half.z - (position.z + half.z)
        : c.center.z + c.half.z - (position.z - half.z);
    velocity.z = 0;
    result.hitWall = true;
  }

  return result;
}

function overlaps(position: THREE.Vector3, half: THREE.Vector3, c: Collider): boolean {
  return (
    Math.abs(position.x - c.center.x) < half.x + c.half.x - EPSILON &&
    Math.abs(position.y - c.center.y) < half.y + c.half.y - EPSILON &&
    Math.abs(position.z - c.center.z) < half.z + c.half.z - EPSILON
  );
}

/** Cheap sphere-ish overlap test, used for "did the player touch this pickup". */
export function withinRange(a: THREE.Vector3, b: THREE.Vector3, radius: number): boolean {
  return a.distanceToSquared(b) < radius * radius;
}

/** Box-vs-box test between two entities (player vs enemy). */
export function boxesOverlap(
  aPos: THREE.Vector3,
  aHalf: THREE.Vector3,
  bPos: THREE.Vector3,
  bHalf: THREE.Vector3,
): boolean {
  return (
    Math.abs(aPos.x - bPos.x) < aHalf.x + bHalf.x &&
    Math.abs(aPos.y - bPos.y) < aHalf.y + bHalf.y &&
    Math.abs(aPos.z - bPos.z) < aHalf.z + bHalf.z
  );
}
