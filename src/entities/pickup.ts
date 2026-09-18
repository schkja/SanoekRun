/**
 * Pickup: a floating collectable.
 *
 * Like the Enemy, this class holds no logic about what an item *does*. It
 * detects the touch and emits a 'collect' event; the effect handler in
 * content/registry.ts decides the consequence.
 */

import * as THREE from 'three';
import { Entity } from './entity';
import { makePlaceholder } from '../core/assets';
import { withinRange } from '../systems/physics';
import { itemEffects } from '../../content/registry';
import type { World } from '../systems/world';
import type { ItemDef } from '../core/types';

const PICKUP_RADIUS = 1.1;

export class Pickup extends Entity {
  readonly def: ItemDef;
  private readonly baseY: number;
  private readonly phase: number;
  private readonly glow: THREE.PointLight;

  constructor(world: World, def: ItemDef, position: THREE.Vector3) {
    super(world);
    this.def = def;
    this.object.position.copy(position);
    this.baseY = position.y;
    // Random phase so a row of coins bobs like a wave rather than in lockstep.
    this.phase = Math.random() * Math.PI * 2;

    const scale = def.scale ?? 1;
    this.half.set(0.4 * scale, 0.4 * scale, 0.4 * scale);
    this.setModel(makePlaceholder(def.shape ?? 'gem', def.color, scale));

    this.glow = new THREE.PointLight(new THREE.Color(def.color), 6, 4, 2);
    this.object.add(this.glow);

    if (def.model) {
      void world.assets.model(def.model).then((loaded) => {
        if (loaded && !this.dead) {
          if (scale !== 1) loaded.scale.multiplyScalar(scale);
          this.object.clear();
          this.object.add(loaded, this.glow);
        }
      });
    }
  }

  update(dt: number): void {
    // Bob and spin.
    this.object.rotation.y += dt * 2.2;
    this.object.position.y = this.baseY + Math.sin(performance.now() * 0.003 + this.phase) * 0.22;

    const player = this.world.player;
    if (!player) return;
    if (!withinRange(this.object.position, player.position, PICKUP_RADIUS)) return;

    this.collect();
  }

  private collect(): void {
    this.dead = true;
    this.world.audio.play(this.def.sound ?? 'coin');

    const effect = itemEffects[this.def.effect];
    if (effect) effect(this.def, this.world);
    else console.warn(`[pickup] Unknown effect "${this.def.effect}" on item "${this.def.id}".`);

    this.world.events.emit('collect', {
      itemId: this.def.id,
      label: this.def.label,
      points: this.def.effect === 'score' ? this.def.value : 0,
    });
  }
}
