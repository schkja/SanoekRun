/**
 * The base every entity extends.
 *
 * An entity is: an Object3D in the scene, an update() called once per frame,
 * and a dead flag. That is the whole contract. To invent a new kind of thing
 * (a moving hazard, a checkpoint, a breakable crate), extend this, add it in
 * the level loader, and it will be updated and cleaned up for free.
 */

import * as THREE from 'three';
import { disposeObject } from '../core/assets';
import type { World } from '../systems/world';

export abstract class Entity {
  /** Holds the visual model. Move this, not the mesh inside it. */
  readonly object = new THREE.Group();
  /** Half-extents of the collision box. */
  readonly half = new THREE.Vector3(0.5, 0.5, 0.5);
  /** Set to true and the world removes it at the end of the frame. */
  dead = false;

  constructor(protected readonly world: World) {}

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Called once per frame. dt is seconds since the last frame. */
  abstract update(dt: number): void;

  /** Attach the visual model, replacing whatever was there. */
  protected setModel(model: THREE.Object3D): void {
    this.object.clear();
    this.object.add(model);
  }

  /** Free GPU resources. Called automatically when removed from the world. */
  dispose(): void {
    disposeObject(this.object);
  }
}
