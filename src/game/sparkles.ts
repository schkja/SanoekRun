/**
 * Sparkles: little bursts of glowing bits, e.g. when you grab a coin.
 * A fixed pool of tiny meshes is reused, so bursts never allocate memory.
 */

import * as THREE from 'three';

interface Bit {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class Sparkles {
  readonly root = new THREE.Group();
  private readonly bits: Bit[] = [];
  private cursor = 0;

  constructor(count = 80) {
    const geometry = new THREE.OctahedronGeometry(0.09, 0);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.root.add(mesh);
      this.bits.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
  }

  burst(at: THREE.Vector3, color: string, count = 9): void {
    for (let i = 0; i < count; i++) {
      const bit = this.bits[this.cursor];
      this.cursor = (this.cursor + 1) % this.bits.length;
      bit.mesh.position.copy(at);
      bit.velocity.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 3);
      bit.life = 0.45 + Math.random() * 0.2;
      (bit.mesh.material as THREE.MeshBasicMaterial).color.set(i % 3 === 0 ? '#ffffff' : color);
      bit.mesh.visible = true;
    }
  }

  update(dt: number): void {
    for (const bit of this.bits) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      if (bit.life <= 0) {
        bit.mesh.visible = false;
        continue;
      }
      bit.velocity.y -= 9 * dt;
      bit.mesh.position.addScaledVector(bit.velocity, dt);
      bit.mesh.rotation.x += dt * 8;
      bit.mesh.scale.setScalar(Math.min(1, bit.life * 2.2));
      (bit.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, bit.life * 2.5);
    }
  }

  clear(): void {
    for (const bit of this.bits) {
      bit.life = 0;
      bit.mesh.visible = false;
    }
  }
}
