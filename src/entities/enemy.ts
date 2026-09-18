/**
 * Enemy.
 *
 * An enemy is data (from content/enemies.json) plus a behaviour function
 * (from content/registry.ts). The class itself holds no AI at all — it just
 * runs whichever behaviour its definition names.
 *
 * So: a new enemy that moves in a new way = one entry in enemies.json + one
 * function in the registry. A new enemy that reuses an existing movement =
 * one entry in enemies.json and no code.
 */

import * as THREE from 'three';
import { Entity } from './entity';
import { makePlaceholder } from '../core/assets';
import { enemyBehaviors } from '../../content/registry';
import type { World } from '../systems/world';
import type { EnemyDef, EnemyPlacement } from '../core/types';

export class Enemy extends Entity {
  readonly def: EnemyDef;
  readonly label: string;
  readonly spiky: boolean;
  /** Free-form state for behaviours to use (patrol direction, timers, ...). */
  readonly memory: Record<string, number> = {};
  /** Where it started, and where it patrols to. Behaviours read these. */
  readonly home = new THREE.Vector3();
  readonly patrolTo = new THREE.Vector3();

  private health: number;
  private hitFlash = 0;
  private readonly model: THREE.Object3D;

  constructor(world: World, def: EnemyDef, placement: EnemyPlacement) {
    super(world);

    // Per-instance overrides let one enemy type be reused at different speeds.
    this.def = { ...def, ...placement.overrides };
    this.label = this.def.label;
    this.spiky = this.def.spiky ?? false;
    this.health = this.def.health;

    const [w, h, d] = this.def.size;
    this.half.set(w / 2, h / 2, d / 2);

    // `position` in the level JSON is the SURFACE the enemy stands on — the same
    // y you gave the platform underneath it. We lift it by half its height so it
    // rests on top instead of sinking in. Flying behaviours then oscillate
    // around that resting height.
    this.object.position.set(placement.position[0], placement.position[1] + h / 2, placement.position[2]);
    this.home.copy(this.object.position);

    const patrol = placement.patrolTo ?? placement.position;
    this.patrolTo.set(patrol[0], patrol[1] + h / 2, patrol[2]);

    this.model = makePlaceholder(this.def.shape ?? 'box', this.def.color, [w, h, d]);
    this.setModel(this.model);

    if (this.def.model) {
      void world.assets.model(this.def.model).then((loaded) => {
        if (loaded && !this.dead) this.setModel(loaded);
      });
    }
  }

  update(dt: number): void {
    const behavior = enemyBehaviors[this.def.behavior];
    if (behavior) behavior(this, dt);
    else console.warn(`[enemy] Unknown behavior "${this.def.behavior}" on "${this.def.id}".`);

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.model.visible = Math.floor(this.hitFlash * 20) % 2 === 0;
      if (this.hitFlash <= 0) this.model.visible = true;
    }
  }

  /** Where the player currently is — behaviours use this to chase. */
  get playerPosition(): THREE.Vector3 | null {
    return this.world.player?.position ?? null;
  }

  damage(amount: number): void {
    this.health -= amount;
    if (this.health > 0) {
      this.hitFlash = 0.4;
      return;
    }
    this.dead = true;
    this.world.events.emit('defeat', { enemyId: this.def.id, points: this.def.points });
  }
}
