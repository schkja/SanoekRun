/**
 * The chaser: whatever is hunting you in the current world.
 *
 * It lives a fixed gap behind you along the track (following you round every
 * corner). Normally that gap puts it behind the camera, out of sight. Stumble
 * and it lunges right up behind you; stumble again before it falls back and
 * it catches you.
 *
 *   monster — the jungle beast, a hulking thing with glowing eyes
 *   lava    — a wall of molten rock rolling down the path
 */

import * as THREE from 'three';
import type { ChaserKind } from './worlds';
import { TUNING } from './tuning';
import { headingYaw, type Segment, type Track } from './track';

export class Chaser {
  readonly root = new THREE.Group();
  /** Current distance behind the runner, along the track. */
  gap: number = TUNING.chaser.restGap;

  private kind: ChaserKind = 'monster';
  private readonly monster: THREE.Group;
  private readonly lava: THREE.Group;
  private readonly light: THREE.PointLight;
  private readonly blobs: THREE.Mesh[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly target = new THREE.Vector3();
  private yaw = 0;
  private time = 0;

  constructor() {
    this.monster = buildMonster(this.arms);
    this.lava = buildLavaWall(this.blobs);
    this.light = new THREE.PointLight('#ff6a2a', 40, 16, 1.6);
    this.light.position.set(0, 2.2, -1);
    // Kept a little smaller than life so it never hides the runner.
    this.monster.scale.setScalar(0.62);
    this.root.add(this.monster, this.lava, this.light);
    this.setKind('monster');
  }

  setKind(kind: ChaserKind): void {
    this.kind = kind;
    this.monster.visible = kind === 'monster';
    this.lava.visible = kind === 'lava';
    this.light.visible = kind === 'lava';
  }

  /** Snap into place behind the runner, e.g. at the start of a run. */
  place(track: Track, seg: Segment, s: number): void {
    const heading = track.sample(seg, s - this.gap, this.target);
    this.root.position.copy(this.target);
    this.yaw = headingYaw(heading);
    this.root.rotation.y = this.yaw;
  }

  update(dt: number, track: Track, seg: Segment, s: number, speed: number): void {
    this.time += dt;
    const heading = track.sample(seg, s - this.gap, this.target);

    // Ease along the track rather than jumping, so corners look smooth.
    this.root.position.lerp(this.target, Math.min(1, dt * 14));
    let delta = headingYaw(heading) - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.yaw += delta * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;

    // Out of sight when it's far behind the camera.
    this.root.visible = this.gap < TUNING.camera.distance + 4;

    const pace = this.time * (6 + speed * 0.5);
    if (this.kind === 'monster') {
      this.monster.position.y = Math.abs(Math.sin(pace)) * 0.18;
      this.arms[0].rotation.x = Math.sin(pace) * 1.1 - 0.4;
      this.arms[1].rotation.x = -Math.sin(pace) * 1.1 - 0.4;
    } else {
      this.blobs.forEach((b, i) => {
        b.position.y = 1.9 + Math.sin(this.time * 5 + i * 1.7) * 0.35;
      });
      this.light.intensity = 36 + Math.sin(this.time * 13) * 8;
    }
  }
}

function buildMonster(arms: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: '#5a1e2b', roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#2e0f16', roughness: 0.9, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  const horn = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.6, flatShading: true });
  const box = new THREE.BoxGeometry(1, 1, 1);

  const part = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  part(box, hide, g, 0, 1.7, 0, 2.0, 1.7, 1.4);
  part(box, dark, g, 0, 0.55, 0, 1.4, 1.1, 1.0);
  const head = new THREE.Group();
  head.position.set(0, 2.85, -0.45);
  g.add(head);
  part(box, hide, head, 0, 0, 0, 1.25, 0.95, 1.05);
  part(box, eye, head, -0.3, 0.12, -0.53, 0.24, 0.16, 0.05).castShadow = false;
  part(box, eye, head, 0.3, 0.12, -0.53, 0.24, 0.16, 0.05).castShadow = false;
  part(box, dark, head, 0, -0.3, -0.53, 0.8, 0.12, 0.05);
  const cone = new THREE.ConeGeometry(0.16, 0.6, 5);
  part(cone, horn, head, -0.45, 0.7, 0, 1, 1, 1).rotation.z = 0.4;
  part(cone, horn, head, 0.45, 0.7, 0, 1, 1, 1).rotation.z = -0.4;

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.25, 2.3, 0);
    g.add(pivot);
    part(box, hide, pivot, 0, -0.85, -0.1, 0.55, 1.7, 0.6);
    part(box, dark, pivot, 0, -1.8, -0.2, 0.7, 0.35, 0.8);
    arms.push(pivot);
  }
  return g;
}

function buildLavaWall(blobs: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  const width = TUNING.pathWidth + 2.5;
  const hot = new THREE.MeshBasicMaterial({ color: '#ff6a2a' });
  const bright = new THREE.MeshBasicMaterial({ color: '#ffc04a' });
  const crust = new THREE.MeshStandardMaterial({ color: '#7a1e0a', roughness: 1, flatShading: true });

  // A low rolling wave rather than a tall wall, so you can still see yourself.
  const front = new THREE.Mesh(new THREE.BoxGeometry(width, 3.4, 1.4), hot);
  front.position.set(0, 0.1, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 4.2, 2.4), crust);
  back.position.set(0, 0.2, 1.8);
  g.add(front, back);

  const sphere = new THREE.SphereGeometry(0.8, 10, 8);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(sphere, i % 2 ? hot : bright);
    b.position.set(-width / 2 + 0.8 + i * ((width - 1.6) / 4), 1.9, 0);
    b.scale.setScalar(0.8 + (i % 3) * 0.25);
    g.add(b);
    blobs.push(b);
  }
  return g;
}
