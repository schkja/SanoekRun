/**
 * Platform: a solid box you can stand on.
 *
 * `position` in the level JSON is the centre of the TOP face, which is how you
 * naturally think when placing platforms ("this ledge is at height 4"). The box
 * hangs down from there.
 *
 * Surfaces:
 *   normal — ordinary ground
 *   ice    — low friction, you slide
 *   bounce — launches you upward on landing
 *   hurt   — damages the player on contact
 */

import * as THREE from 'three';
import { Entity } from './entity';
import type { World } from '../systems/world';
import type { PlatformDef } from '../core/types';
import type { Collider } from '../systems/physics';
import { makePlaceholder } from '../core/assets';

const SURFACE_COLORS: Record<string, string> = {
  normal: '#6b8f4e',
  ice: '#9fdcf0',
  bounce: '#e2739b',
  hurt: '#c0392b',
};

export class Platform extends Entity {
  readonly collider: Collider;
  private readonly origin = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly lastPosition = new THREE.Vector3();
  private readonly duration: number;
  private elapsed = 0;

  constructor(world: World, def: PlatformDef) {
    super(world);

    const [w, h, d] = def.size;
    const surface = def.surface ?? 'normal';
    const color = def.color ?? SURFACE_COLORS[surface] ?? SURFACE_COLORS.normal;

    this.half.set(w / 2, h / 2, d / 2);

    // JSON gives the top face; the collider centre sits half a height below it.
    this.origin.set(def.position[0], def.position[1] - h / 2, def.position[2]);
    this.object.position.copy(this.origin);
    this.lastPosition.copy(this.origin);

    this.offset.set(...(def.move?.offset ?? [0, 0, 0]));
    this.duration = def.move?.duration ?? 0;

    this.setModel(makePlaceholder('box', color, [w, h, d]));

    // A model, if given, replaces the placeholder once it has loaded.
    if (def.model) {
      void world.assets.model(def.model).then((model) => {
        if (model && !this.dead) this.setModel(model);
      });
    }

    this.collider = world.addCollider({
      center: this.object.position,
      half: this.half.clone(),
      surface,
      velocity: new THREE.Vector3(),
    });
  }

  update(dt: number): void {
    if (this.duration <= 0) return;

    this.elapsed += dt;
    // A cosine gives a smooth ease at each end of the trip.
    const t = 0.5 - 0.5 * Math.cos((this.elapsed / this.duration) * Math.PI * 2);
    this.object.position.copy(this.origin).addScaledVector(this.offset, t);

    // Record how far we moved so riders can be carried along.
    this.collider.velocity.subVectors(this.object.position, this.lastPosition).divideScalar(dt || 1);
    this.lastPosition.copy(this.object.position);
  }
}
