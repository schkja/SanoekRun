/**
 * Goal: the portal that ends the level.
 *
 * It stays shut (dim and slowly turning) until the player has collected the
 * number of items the level asks for, then opens and can be entered.
 */

import * as THREE from 'three';
import { Entity } from './entity';
import { withinRange } from '../systems/physics';
import type { World } from '../systems/world';

const ENTER_RADIUS = 1.4;

export class Goal extends Entity {
  private open = false;
  private readonly ring: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private triggered = false;

  constructor(
    world: World,
    position: THREE.Vector3,
    /** How many items must be collected before it opens. */
    private readonly required: number,
  ) {
    super(world);
    this.object.position.copy(position);
    this.half.set(1, 1.5, 1);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.18, 16, 40),
      new THREE.MeshStandardMaterial({
        color: '#7a6fff',
        emissive: '#3a2fbf',
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    );
    this.ring.position.y = 1.4;
    this.ring.castShadow = true;

    this.core = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 40),
      new THREE.MeshBasicMaterial({
        color: '#b7b0ff',
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    this.core.position.y = 1.4;

    this.light = new THREE.PointLight('#8a7bff', 3, 9, 2);
    this.light.position.y = 1.4;

    this.object.add(this.ring, this.core, this.light);
  }

  /** Called by the Game whenever the collected count changes. */
  setCollected(count: number): void {
    const shouldOpen = count >= this.required;
    if (shouldOpen === this.open) return;
    this.open = shouldOpen;

    const ringMaterial = this.ring.material as THREE.MeshStandardMaterial;
    const coreMaterial = this.core.material as THREE.MeshBasicMaterial;
    if (this.open) {
      ringMaterial.color.set('#5ce1a0');
      ringMaterial.emissive.set('#27c47e');
      ringMaterial.emissiveIntensity = 1.4;
      coreMaterial.color.set('#9dffd2');
      coreMaterial.opacity = 0.55;
      this.light.color.set('#5ce1a0');
      this.light.intensity = 7;
    }
  }

  update(dt: number): void {
    this.ring.rotation.z += dt * (this.open ? 1.6 : 0.4);
    const pulse = 1 + Math.sin(performance.now() * 0.004) * (this.open ? 0.07 : 0.02);
    this.ring.scale.setScalar(pulse);

    if (!this.open || this.triggered) return;

    const player = this.world.player;
    if (!player) return;
    const portal = this.object.position.clone().setY(this.object.position.y + 1.4);
    if (!withinRange(portal, player.position, ENTER_RADIUS)) return;

    this.triggered = true;
    this.world.audio.play('goal');
    this.world.events.emit('goal', {});
  }
}
