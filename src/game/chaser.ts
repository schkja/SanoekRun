/**
 * The chaser: whatever is hunting you in the current world.
 *
 * It lives a fixed gap behind you along the track (following you round every
 * corner). Normally that gap puts it behind the camera, out of sight. Stumble
 * and it lunges right up behind you; stumble again before it falls back and
 * it catches you.
 *
 *   monster  — the temple beast, a hulking thing with glowing eyes
 *   bear     — a grumpy brown bear on the forest boardwalk
 *   hawk     — swoops down out of the sky over the treetops
 *   snowball — a giant snowball rolling down the snowy branch
 *   lava     — a wave of molten rock
 */

import * as THREE from 'three';
import type { ChaserKind } from './worlds';
import { TUNING } from './tuning';
import { headingYaw, type Segment, type Track } from './track';
import { outline, toon } from './toon';

interface Body {
  root: THREE.Group;
  /** Called every frame with the running pace, to animate legs, wings or spin. */
  animate: (pace: number, time: number) => void;
}

export class Chaser {
  readonly root = new THREE.Group();
  /** Current distance behind the runner, along the track. */
  gap: number = TUNING.chaser.restGap;

  private kind: ChaserKind = 'monster';
  private readonly bodies: Record<ChaserKind, Body>;
  private readonly target = new THREE.Vector3();
  private yaw = 0;
  private time = 0;

  constructor() {
    this.bodies = {
      monster: buildBeast({ hide: '#5a1e2b', dark: '#2e0f16', eyes: '#ffd23f', horns: true }),
      bear: buildBeast({ hide: '#7a4a2a', dark: '#4a2a16', eyes: '#2b2b3d', horns: false }),
      hawk: buildHawk(),
      snowball: buildSnowball(),
      lava: buildLavaWave(),
    };
    for (const body of Object.values(this.bodies)) {
      outline(body.root);
      this.root.add(body.root);
    }
    this.setKind('monster');
  }

  setKind(kind: ChaserKind): void {
    this.kind = kind;
    for (const [name, body] of Object.entries(this.bodies)) body.root.visible = name === kind;
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

    // The hawk flies: higher when far, diving lower as it closes in.
    const hawk = this.bodies.hawk.root;
    // It glides from side to side above the path, like a bird circling,
    // and stays high enough that it never hides the runner.
    const sway = Math.sin(this.time * 0.9);
    // Never closer than ~3 m behind the runner, so it can't fill the camera.
    hawk.position.set(sway * 1.2, 4.0, -Math.max(0, this.gap - 3.2));
    hawk.rotation.z = -sway * 0.35;

    this.bodies[this.kind].animate(this.time * (6 + speed * 0.5), this.time);
  }
}

type PartFn = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number) => THREE.Mesh;

const part: PartFn = (geo, m, parent, x, y, z, sx, sy, sz) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};

const mat = (color: string) => toon(color);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(0.5, 14, 10);

/** The temple beast and the bear share one shape: hide colour, eyes, horns or round ears. */
function buildBeast(o: { hide: string; dark: string; eyes: string; horns: boolean }): Body {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  // Kept a little smaller than life so it never hides the runner.
  g.scale.setScalar(0.62);
  const hide = mat(o.hide);
  const dark = mat(o.dark);
  const eye = new THREE.MeshBasicMaterial({ color: o.eyes });

  part(BOX, hide, g, 0, 1.7, 0, 2.0, 1.7, 1.4);
  part(BOX, dark, g, 0, 0.55, 0, 1.4, 1.1, 1.0);
  const head = new THREE.Group();
  head.position.set(0, 2.85, -0.45);
  g.add(head);
  part(BOX, hide, head, 0, 0, 0, 1.25, 0.95, 1.05);
  part(BOX, eye, head, -0.3, 0.12, -0.53, 0.24, 0.16, 0.05).castShadow = false;
  part(BOX, eye, head, 0.3, 0.12, -0.53, 0.24, 0.16, 0.05).castShadow = false;
  if (o.horns) {
    part(BOX, dark, head, 0, -0.3, -0.53, 0.8, 0.12, 0.05);
    const cone = new THREE.ConeGeometry(0.16, 0.6, 5);
    const horn = mat('#e8dcc0');
    part(cone, horn, head, -0.45, 0.7, 0, 1, 1, 1).rotation.z = 0.4;
    part(cone, horn, head, 0.45, 0.7, 0, 1, 1, 1).rotation.z = -0.4;
  } else {
    // Round ears and a pale snout.
    part(SPHERE, hide, head, -0.5, 0.55, 0.1, 0.42, 0.42, 0.25);
    part(SPHERE, hide, head, 0.5, 0.55, 0.1, 0.42, 0.42, 0.25);
    part(BOX, mat('#d9b48a'), head, 0, -0.18, -0.6, 0.6, 0.4, 0.3);
    part(BOX, dark, head, 0, -0.06, -0.76, 0.24, 0.14, 0.05);
  }

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.25, 2.3, 0);
    g.add(pivot);
    part(BOX, hide, pivot, 0, -0.85, -0.1, 0.55, 1.7, 0.6);
    part(BOX, dark, pivot, 0, -1.8, -0.2, 0.7, 0.35, 0.8);
    arms.push(pivot);
  }
  return {
    root: outer,
    animate: (pace) => {
      g.position.y = Math.abs(Math.sin(pace)) * 0.18;
      arms[0].rotation.x = Math.sin(pace) * 1.1 - 0.4;
      arms[1].rotation.x = -Math.sin(pace) * 1.1 - 0.4;
    },
  };
}

/**
 * The hawk: a fierce cartoon bird of prey. It hovers behind the runner,
 * turned towards the camera, so you see what's after you: angry brows,
 * glaring yellow eyes, a hooked beak, a spiky crest and open talons.
 * Scary for a game, not gory.
 */
function buildHawk(): Body {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  g.scale.setScalar(0.34);
  // Facing the camera (the track runs away from it).
  g.rotation.y = Math.PI;
  const feathers = mat('#5a3a22');
  const wingDark = mat('#3b2616');
  const band = mat('#c9a27a');
  const chest = mat('#e9dcc4');
  const beak = mat('#ffb21f');
  const claw = mat('#1f2a44');
  const eyeWhite = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  const pupil = new THREE.MeshBasicMaterial({ color: '#111111' });
  const brow = mat('#1f1610');

  // Body: lean and long, chest barred.
  part(SPHERE, feathers, g, 0, 0, 0.1, 1.3, 1.15, 2.0);
  part(SPHERE, chest, g, 0, -0.1, -0.45, 0.95, 0.95, 1.0);
  for (const y of [-0.05, -0.32]) part(BOX, band, g, 0, y, -0.93, 0.6, 0.06, 0.05);

  // Head: flat-topped with a spiky crest, glaring eyes under heavy brows.
  const head = new THREE.Group();
  head.position.set(0, 0.72, -0.8);
  g.add(head);
  part(SPHERE, feathers, head, 0, 0, 0, 1.0, 0.9, 1.0);
  const spike = new THREE.ConeGeometry(0.1, 0.5, 4);
  for (const [x, rz] of [[-0.18, 0.5], [0, 0], [0.18, -0.5]] as const) {
    // Swept back, so it reads as a crest and not as owl ears.
    const c = part(spike, wingDark, head, x * 0.6, 0.32, 0.38, 0.8, 1, 0.8);
    c.rotation.set(1.25, 0, rz * 0.4);
  }
  for (const side of [-1, 1]) {
    part(SPHERE, eyeWhite, head, side * 0.24, 0.06, -0.42, 0.3, 0.24, 0.12).castShadow = false;
    part(SPHERE, pupil, head, side * 0.22, 0.04, -0.49, 0.1, 0.16, 0.05).castShadow = false;
    // Brows slant down towards the beak: an angry glare.
    const b = part(BOX, brow, head, side * 0.24, 0.22, -0.46, 0.38, 0.09, 0.08);
    b.rotation.z = side * 0.45;
  }
  // Hooked beak, slightly open.
  const upper = part(new THREE.ConeGeometry(0.16, 0.5, 6), beak, head, 0, -0.08, -0.62, 1, 1, 1);
  upper.rotation.x = -Math.PI / 2 - 0.5;
  const lower = part(new THREE.ConeGeometry(0.11, 0.28, 6), beak, head, 0, -0.24, -0.52, 1, 1, 1);
  lower.rotation.x = -Math.PI / 2 + 0.35;

  // Talons stretched forward, ready to grab.
  const talons: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.3, -0.55, -0.2);
    g.add(leg);
    part(BOX, beak, leg, 0, -0.25, -0.15, 0.12, 0.5, 0.12).rotation.x = 0.6;
    for (const dx of [-0.1, 0, 0.1]) {
      const c = part(new THREE.ConeGeometry(0.05, 0.28, 4), claw, leg, dx, -0.5, -0.4, 1, 1, 1);
      c.rotation.x = -2.2;
    }
    talons.push(leg);
  }

  // Tail: barred fan.
  for (const a of [-0.4, 0, 0.4]) {
    const f = part(SPHERE, wingDark, g, Math.sin(a) * 0.4, 0.05, 1.2, 0.4, 0.1, 1.0);
    f.rotation.y = a;
  }

  // Wings: broad, with spread "finger" feathers at the tips.
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.55, 0.25, 0);
    g.add(pivot);
    part(SPHERE, feathers, pivot, side * 1.1, 0, 0, 2.3, 0.28, 1.5);
    part(BOX, band, pivot, side * 1.1, -0.06, 0.25, 1.8, 0.04, 0.12);
    for (let k = 0; k < 4; k++) {
      const f = part(BOX, wingDark, pivot, side * (2.25 + k * 0.08), 0, -0.3 + k * 0.22, 0.9, 0.06, 0.16);
      f.rotation.y = side * (0.25 - k * 0.18);
    }
    wings.push(pivot);
  }

  return {
    root,
    animate: (_pace, time) => {
      const flap = Math.sin(time * 6) * 0.55;
      // Wings held up in a V (so you see them, not their edge) and beating.
      wings[0].rotation.z = -0.5 + flap;
      wings[1].rotation.z = 0.5 - flap;
      g.position.y = Math.sin(time * 6) * 0.12;
      g.rotation.x = -0.15;
      head.rotation.z = Math.sin(time * 1.7) * 0.12;
      for (const leg of talons) leg.rotation.x = Math.sin(time * 3) * 0.15;
    },
  };
}

function buildSnowball(): Body {
  const root = new THREE.Group();
  const ball = new THREE.Group();
  ball.position.y = 1.6;
  root.add(ball);
  const snow = toon('#ffffff');
  const sticks = mat('#6b4a35');
  part(new THREE.IcosahedronGeometry(1, 1), snow, ball, 0, 0, 0, 1.75, 1.7, 1.75);
  // Twigs and pine needles caught in the snow, so you can see it roll.
  for (const [x, y, z] of [[0.9, 0.9, 0.6], [-1.1, 0.2, -0.9], [0.3, -1.2, 0.9], [-0.5, 1.3, -0.4]]) {
    part(BOX, sticks, ball, x, y, z, 0.12, 0.12, 0.8).lookAt(0, 0, 0);
  }
  return {
    root,
    animate: (_pace, time) => {
      ball.rotation.x = -time * 6;
    },
  };
}

function buildLavaWave(): Body {
  const g = new THREE.Group();
  const width = TUNING.pathWidth + 2.5;
  const hot = new THREE.MeshBasicMaterial({ color: '#ff6a2a' });
  const bright = new THREE.MeshBasicMaterial({ color: '#ffc04a' });
  const crust = toon('#7a1e0a');

  // A low rolling wave rather than a tall wall, so you can still see yourself.
  const front = new THREE.Mesh(new THREE.BoxGeometry(width, 3.4, 1.4), hot);
  front.position.set(0, 0.1, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 4.2, 2.4), crust);
  back.position.set(0, 0.2, 1.8);
  g.add(front, back);

  const blobs: THREE.Mesh[] = [];
  const sphere = new THREE.SphereGeometry(0.8, 10, 8);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(sphere, i % 2 ? hot : bright);
    b.position.set(-width / 2 + 0.8 + i * ((width - 1.6) / 4), 1.9, 0);
    b.scale.setScalar(0.8 + (i % 3) * 0.25);
    g.add(b);
    blobs.push(b);
  }
  const light = new THREE.PointLight('#ff6a2a', 40, 16, 1.6);
  light.position.set(0, 2.2, -1);
  g.add(light);
  return {
    root: g,
    animate: (_pace, time) => {
      blobs.forEach((b, i) => (b.position.y = 1.9 + Math.sin(time * 5 + i * 1.7) * 0.35));
      light.intensity = 36 + Math.sin(time * 13) * 8;
    },
  };
}
