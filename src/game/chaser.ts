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
import { makeLumberjackModel } from './visuals';
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
      owl: buildHawk(OWL),
      snowball: buildSnowball(),
      bees: buildBees(),
      wolf: buildWolf(),
      lumberjack: buildLumberjack(),
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
    const hawk = this.bodies[this.kind === 'owl' ? 'owl' : 'hawk'].root;
    // It glides from side to side above the path, like a bird circling,
    // and stays high enough that it never hides the runner.
    const sway = Math.sin(this.time * 0.9);
    // High above and about 2 m behind the runner: the huge
    // wings loom over the top of the screen without covering the runner.
    hawk.position.set(sway * 0.9, 5.3, -Math.max(0, this.gap - 2.0));
    hawk.rotation.z = -sway * 0.25;

    // The bee swarm hums along behind, a little above head height.
    // The wolf runs a little closer than the bear, so its head and ears show
    // at the bottom of the screen instead of under the camera.
    if (this.kind === 'wolf') this.bodies.wolf.root.position.set(0, 0, -Math.min(1.4, Math.max(0, this.gap - 1.6)));
    // The lumberjack is as tall as the camera, so he runs a little further back.
    if (this.kind === 'lumberjack') this.bodies.lumberjack.root.position.set(0.9, 0, -1.6);
    if (this.kind === 'bees') this.bodies.bees.root.position.set(Math.sin(this.time * 1.3) * 0.5, 2.7, -Math.max(0, this.gap - 1.2));

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
 * The hawk: a big bird of prey swooping after the runner. It flies the same
 * way as the runner, above and behind, so from the camera you see what a
 * mouse sees: a huge dark shape with wings spread wide, fingered wing tips,
 * a barred tail fan, hooked beak and glaring eye in profile, talons out.
 * Its shadow sweeps over the path.
 */
interface BirdColours {
  back: string;
  covert: string;
  pale: string;
  bar: string;
  tip: string;
}

const HAWK: BirdColours = { back: '#4a2f1c', covert: '#7a5232', pale: '#e6d6b8', bar: '#8a6a4a', tip: '#2a1a10' };
/** The night hunter: a big grey-brown owl, same build as the hawk. */
const OWL: BirdColours = { back: '#5d5868', covert: '#8c8496', pale: '#efe8dc', bar: '#9a8f86', tip: '#2e2a36' };

function buildHawk(c: BirdColours = HAWK): Body {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  g.scale.setScalar(0.4);
  const back = mat(c.back);
  const covert = mat(c.covert);
  const pale = mat(c.pale);
  const bar = mat(c.bar);
  const tipDark = mat(c.tip);
  const beak = mat('#ffb21f');
  const claw = mat('#1f2a44');
  const eye = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  const pupil = new THREE.MeshBasicMaterial({ color: '#111111' });
  const brow = mat('#1f140c');

  // Body: long and streamlined, pale barred belly underneath.
  part(SPHERE, back, g, 0, 0, 0, 1.15, 0.95, 2.4);
  part(SPHERE, pale, g, 0, -0.2, -0.1, 0.95, 0.6, 1.9);
  for (const z of [-0.5, -0.1, 0.3]) part(BOX, bar, g, 0, -0.46, z, 0.6, 0.04, 0.08);

  // Head: forward, with a heavy brow ridge over each fierce eye.
  const head = new THREE.Group();
  head.position.set(0, 0.35, -1.25);
  g.add(head);
  part(SPHERE, back, head, 0, 0, 0, 0.85, 0.8, 0.95);
  part(SPHERE, pale, head, 0, -0.18, -0.2, 0.6, 0.45, 0.55);
  for (const side of [-1, 1]) {
    part(SPHERE, eye, head, side * 0.36, 0.08, -0.18, 0.12, 0.2, 0.24).castShadow = false;
    part(SPHERE, pupil, head, side * 0.41, 0.08, -0.2, 0.05, 0.12, 0.1).castShadow = false;
    const b = part(BOX, brow, head, side * 0.36, 0.24, -0.16, 0.12, 0.08, 0.36);
    b.rotation.x = 0.35;
  }
  // Big hooked beak.
  const upper = part(new THREE.ConeGeometry(0.17, 0.55, 6), beak, head, 0, -0.02, -0.6, 1, 1, 1);
  upper.rotation.x = -Math.PI / 2 - 0.55;
  part(SPHERE, beak, head, 0, 0.03, -0.42, 0.3, 0.24, 0.3);

  // Tail fan, barred, spread wide.
  for (const a of [-0.45, -0.15, 0.15, 0.45]) {
    const f = part(SPHERE, covert, g, Math.sin(a) * 0.5, 0.05, 1.75, 0.42, 0.08, 1.3);
    f.rotation.y = a;
    part(BOX, tipDark, g, Math.sin(a) * 0.95, 0.07, 2.25, 0.3, 0.05, 0.08).rotation.y = a;
  }

  // Talons thrown forward under the body, ready to grab.
  const talons: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.3, -0.5, -0.2);
    g.add(leg);
    part(BOX, beak, leg, 0, -0.25, -0.2, 0.13, 0.55, 0.13).rotation.x = -0.7;
    for (const dx of [-0.12, 0, 0.12]) {
      const c = part(new THREE.ConeGeometry(0.06, 0.32, 4), claw, leg, dx, -0.48, -0.55, 1, 1, 1);
      c.rotation.x = -1.9;
    }
    talons.push(leg);
  }

  // Huge wings in two parts (arm and hand) so the beat bends at the wrist.
  const shoulders: THREE.Group[] = [];
  const wrists: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.45, 0.2, -0.2);
    g.add(shoulder);
    part(SPHERE, back, shoulder, side * 1.05, 0.04, 0.1, 2.3, 0.22, 1.7);
    part(SPHERE, pale, shoulder, side * 1.05, -0.06, 0.15, 2.1, 0.12, 1.5);
    part(SPHERE, covert, shoulder, side * 1.0, 0.12, -0.25, 1.9, 0.12, 0.6);

    const wrist = new THREE.Group();
    wrist.position.set(side * 2.1, 0, 0);
    shoulder.add(wrist);
    part(SPHERE, back, wrist, side * 0.9, 0.02, 0.15, 2.0, 0.18, 1.4);
    part(SPHERE, pale, wrist, side * 0.85, -0.06, 0.2, 1.7, 0.1, 1.2);
    // Five long "finger" feathers, dark-tipped, fanned at the end.
    for (let k = 0; k < 5; k++) {
      const spread = -0.5 + k * 0.25;
      const f = part(SPHERE, k % 2 ? back : covert, wrist, side * (1.9 + Math.cos(spread) * 0.45), 0, 0.15 + Math.sin(spread) * 0.9, 1.4, 0.07, 0.3);
      f.rotation.y = -side * spread;
      const t = part(SPHERE, tipDark, wrist, side * (2.45 + Math.cos(spread) * 0.5), 0, 0.15 + Math.sin(spread) * 1.05, 0.5, 0.06, 0.24);
      t.rotation.y = -side * spread;
    }
    shoulders.push(shoulder);
    wrists.push(wrist);
  }

  return {
    root,
    animate: (_pace, time) => {
      // Slow, heavy beats: down-stroke bends at the wrist.
      const beat = Math.sin(time * 4.2);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        shoulders[i].rotation.z = side * (0.14 - beat * 0.38);
        wrists[i].rotation.z = side * (0.04 - beat * 0.3);
      }
      g.position.y = -beat * 0.18;
      // Nose down, diving at its prey: the camera sees the spread wings, not their edge.
      g.rotation.x = 0.4;
      head.rotation.y = Math.sin(time * 0.9) * 0.25;
      for (const leg of talons) leg.rotation.x = Math.sin(time * 2.5) * 0.12;
    },
  };
}

/**
 * An angry swarm of bees: a dozen striped little bees buzzing around a
 * moving centre, each on its own wobbly orbit, with blurred wings.
 */
/**
 * A big grey wolf on all fours: long snout, pointed ears, yellow eyes, bushy
 * tail, loping after the runner. A plain forest wolf, no clothes.
 */
function buildWolf(): Body {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  g.scale.setScalar(0.75);
  const fur = mat('#7d8696');
  const dark = mat('#4f5664');
  const pale = mat('#d6dae2');
  const eye = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  const ink = mat('#1f2a44');
  part(SPHERE, fur, g, 0, 1.1, 0.1, 1.2, 1.0, 2.2);
  part(SPHERE, pale, g, 0, 0.92, -0.45, 0.85, 0.7, 1.0);
  const head = new THREE.Group();
  head.position.set(0, 1.55, -1.2);
  g.add(head);
  part(SPHERE, fur, head, 0, 0, 0, 0.9, 0.8, 0.9);
  part(SPHERE, pale, head, 0, -0.15, -0.5, 0.48, 0.38, 0.7);
  part(SPHERE, ink, head, 0, -0.05, -0.85, 0.18, 0.14, 0.12);
  for (const side of [-1, 1]) {
    part(SPHERE, eye, head, side * 0.24, 0.16, -0.36, 0.16, 0.12, 0.08).castShadow = false;
    part(new THREE.ConeGeometry(0.16, 0.42, 4), fur, head, side * 0.28, 0.5, 0.05, 1, 1, 0.6).rotation.z = -side * 0.2;
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.35, -0.55], [0.35, -0.55], [-0.35, 0.65], [0.35, 0.65]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.95, z);
    g.add(leg);
    part(SPHERE, fur, leg, 0, -0.35, 0, 0.32, 0.8, 0.34);
    part(SPHERE, dark, leg, 0, -0.82, -0.08, 0.28, 0.16, 0.4);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.3, 1.15);
  g.add(tail);
  part(SPHERE, fur, tail, 0, 0.1, 0.45, 0.42, 0.42, 1.1);
  part(SPHERE, pale, tail, 0, 0.12, 0.95, 0.3, 0.3, 0.4);
  return {
    root,
    animate: (pace) => {
      const s = Math.sin(pace);
      legs[0].rotation.x = s * 0.8;
      legs[1].rotation.x = Math.sin(pace + 0.4) * 0.8;
      legs[2].rotation.x = -s * 0.8;
      legs[3].rotation.x = -Math.sin(pace + 0.4) * 0.8;
      g.position.y = Math.abs(Math.cos(pace)) * 0.15;
      g.rotation.x = Math.sin(pace) * 0.05;
      tail.rotation.x = -0.3 + Math.sin(pace * 0.5) * 0.15;
      head.rotation.x = Math.sin(pace) * 0.06;
    },
  };
}

/**
 * The lumberjack chasing the wolf that raided his cabbage patch: running on
 * two legs and waving both arms in the air. No weapon, just very cross.
 */
function buildLumberjack(): Body {
  const model = makeLumberjackModel('beanie-orange');
  const g = new THREE.Group();
  g.scale.setScalar(0.72);
  g.add(model.root);
  return {
    root: g,
    animate: (pace) => {
      const s = Math.sin(pace);
      model.legL.rotation.x = s * 0.9;
      model.legR.rotation.x = -s * 0.9;
      model.armL.rotation.x = -2.6 + Math.sin(pace * 1.5) * 0.4;
      model.armR.rotation.x = -2.6 - Math.sin(pace * 1.5) * 0.4;
      model.armL.rotation.z = 0.3;
      model.armR.rotation.z = -0.3;
      model.body.position.y = Math.abs(Math.cos(pace)) * 0.08;
      model.body.rotation.x = -0.15;
    },
  };
}

function buildBees(): Body {
  const root = new THREE.Group();
  const yellow = mat('#ffd23f');
  const black = mat('#1f2a44');
  const wing = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
  const bees: Array<{ g: THREE.Group; wings: THREE.Mesh[]; r: number; speed: number; phase: number; tilt: number }> = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    g.scale.setScalar(0.24);
    part(SPHERE, yellow, g, 0, 0, 0, 0.7, 0.6, 1.0);
    part(BOX, black, g, 0, 0, 0.1, 0.72, 0.62, 0.14);
    part(BOX, black, g, 0, 0, 0.32, 0.6, 0.5, 0.12);
    part(SPHERE, black, g, 0, 0.05, -0.5, 0.45, 0.45, 0.4);
    part(new THREE.ConeGeometry(0.06, 0.25, 4), black, g, 0, 0, 0.62, 1, 1, 1).rotation.x = Math.PI / 2;
    const wings: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(SPHERE, wing);
      w.scale.set(0.5, 0.06, 0.32);
      w.position.set(side * 0.35, 0.35, -0.05);
      g.add(w);
      wings.push(w);
    }
    root.add(g);
    bees.push({ g, wings, r: 0.3 + Math.random() * 0.7, speed: 2 + Math.random() * 2.5, phase: Math.random() * Math.PI * 2, tilt: Math.random() * 0.8 });
  }
  return {
    root,
    animate: (_pace, time) => {
      for (const b of bees) {
        const a = time * b.speed + b.phase;
        b.g.position.set(Math.cos(a) * b.r, Math.sin(a * 1.7) * 0.4 + Math.sin(a) * b.tilt * 0.4, Math.sin(a) * b.r * 0.7);
        b.g.rotation.y = -a;
        const flap = Math.sin(time * 60 + b.phase) * 0.6;
        b.wings[0].rotation.z = flap;
        b.wings[1].rotation.z = -flap;
      }
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
