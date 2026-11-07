/**
 * Visuals: everything you see, built from simple shapes.
 *
 * Every mesh here is a placeholder made of boxes, cylinders and spheres so the
 * game runs with zero asset files. Geometry and materials are shared and
 * reused, which keeps it fast on cheap phones.
 *
 * Swapping in real models later (Kenney, Quaternius, KayKit — all CC0) means
 * replacing the body of one builder at a time: `makeRunnerModel`, the obstacle
 * builders, or the decor builders. Nothing outside this file cares what the
 * meshes look like.
 */

import * as THREE from 'three';
import { TUNING } from './tuning';
import type { Segment } from './track';
import { headingYaw } from './track';
import type { WorldDef } from './worlds';

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  trunk: new THREE.CylinderGeometry(0.32, 0.5, 1, 6),
  canopy: new THREE.IcosahedronGeometry(1, 0),
  rock: new THREE.DodecahedronGeometry(1, 0),
  spire: new THREE.ConeGeometry(1, 1, 5),
  crystal: new THREE.OctahedronGeometry(1, 0),
  coin: new THREE.CylinderGeometry(0.36, 0.36, 0.1, 16),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  portal: new THREE.TorusGeometry(2.9, 0.26, 10, 40),
  portalDisc: new THREE.CircleGeometry(2.75, 40),
};

/** What you collect: gold coins for the explorer, acorns for the squirrel. */
export type Collectible = 'coin' | 'acorn';
let collectible: Collectible = 'coin';

export function setCollectible(kind: Collectible): void {
  collectible = kind;
}

const ACORN_NUT = new THREE.MeshStandardMaterial({ color: '#b0702e', roughness: 0.55, emissive: '#5a2e08', emissiveIntensity: 0.35 });
const ACORN_CAP = new THREE.MeshStandardMaterial({ color: '#5a3d24', roughness: 0.9, flatShading: true });

function makeAcorn(): THREE.Group {
  const g = new THREE.Group();
  const nut = new THREE.Mesh(GEO.sphere, ACORN_NUT);
  nut.scale.set(0.5, 0.62, 0.5);
  nut.position.y = -0.06;
  const cap = new THREE.Mesh(GEO.sphere, ACORN_CAP);
  cap.scale.set(0.58, 0.3, 0.58);
  cap.position.y = 0.17;
  const stalk = new THREE.Mesh(GEO.box, ACORN_CAP);
  stalk.scale.set(0.06, 0.16, 0.06);
  stalk.position.y = 0.33;
  g.add(nut, cap, stalk);
  return g;
}

const COIN_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffd23f',
  emissive: '#b88a00',
  emissiveIntensity: 0.55,
  metalness: 0.6,
  roughness: 0.3,
});

// ---------------------------------------------------------------------------
// Per-world materials ("kits")
// ---------------------------------------------------------------------------

interface Kit {
  floorTop: THREE.MeshStandardMaterial;
  floorBody: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  a: THREE.MeshStandardMaterial;
  b: THREE.MeshStandardMaterial;
  c: THREE.MeshStandardMaterial;
  d: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  portal: THREE.MeshStandardMaterial;
  portalDisc: THREE.MeshBasicMaterial;
}

const kits = new Map<string, Kit>();

function std(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
}

function kitFor(world: WorldDef): Kit {
  let kit = kits.get(world.id);
  if (kit) return kit;

  const texture = makeSlabTexture(world.path.slab, world.path.grout);
  const accent = world.theme.accent;
  if (world.decor === 'lava') {
    kit = {
      floorTop: std('#ffffff', { map: texture, flatShading: false }),
      floorBody: std(world.path.body),
      curb: std(world.path.curb),
      a: std('#3b2a30'), // rock
      b: std('#2a1c22'), // dark rock
      c: std('#ff7a2a', { emissive: '#ff4a10', emissiveIntensity: 1.2 }), // glowing
      d: std('#59434c'),
      glow: new THREE.MeshBasicMaterial({ color: '#ffc04a' }),
      portal: std(accent, { emissive: accent, emissiveIntensity: 1.4, flatShading: false }),
      portalDisc: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    };
  } else {
    kit = {
      floorTop: std('#ffffff', { map: texture, flatShading: false }),
      floorBody: std(world.path.body),
      curb: std(world.path.curb),
      a: std('#6b4a2b'), // wood / trunk
      b: std('#2f8f4e'), // leaves
      c: std('#3aa35a'), // leaves light
      d: std('#9c8a66'), // ruin stone
      glow: new THREE.MeshBasicMaterial({ color: '#ffd23f' }),
      portal: std(accent, { emissive: accent, emissiveIntensity: 1.4, flatShading: false }),
      portalDisc: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    };
  }
  kits.set(world.id, kit);
  return kit;
}

/** A stone-slab floor pattern drawn on a canvas — no image files needed. */
function makeSlabTexture(slab: string, grout: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = grout;
  g.fillRect(0, 0, size, size);

  const base = new THREE.Color(slab);
  const rows = 4;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (size / 4);
    for (let col = -1; col < 3; col++) {
      const x = col * (size / 2) + offset;
      const shade = base.clone().offsetHSL(0, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.1);
      g.fillStyle = `#${shade.getHexString()}`;
      g.fillRect(x + 4, r * rowH + 4, size / 2 - 8, rowH - 8);
    }
  }
  // Speckles so the floor reads as stone and shows speed.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';
    g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------------------------
// Segment mesh
// ---------------------------------------------------------------------------

/**
 * Build everything visible on one segment. The group is placed at the segment
 * start and rotated to its heading, so inside it "forward" is always -Z and
 * "right" is +X: a point (x, y, s) on the track is local (x, y, -s).
 */
export function buildSegmentMesh(seg: Segment): THREE.Group {
  const kit = kitFor(seg.world);
  const W = TUNING.pathWidth;
  const group = new THREE.Group();
  group.position.copy(seg.start);
  group.rotation.y = headingYaw(seg.heading);

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    s: number,
    sx: number,
    sy: number,
    sz: number,
    shadow = false,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, -s);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // --- Floor ----------------------------------------------------------------
  // The first stretch after a corner is covered by the previous segment's
  // floor, so visually each segment starts at the edge of the corner square.
  const visualStart = seg.index === 0 ? -16 : W / 2;
  const end = seg.length + W / 2;
  const sides: Array<-1 | 1> = [-1, 1];

  for (const [from, to] of seg.floor) {
    const a = Math.max(from, visualStart);
    const b = to;
    if (b - a <= 0.01) continue;
    const len = b - a;

    const top = new THREE.PlaneGeometry(W, len);
    top.rotateX(-Math.PI / 2);
    const uv = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / W) + a / W);
    const topMesh = new THREE.Mesh(top, kit.floorTop);
    topMesh.position.set(0, 0, -(a + b) / 2);
    topMesh.receiveShadow = true;
    topMesh.userData.unique = true;
    group.add(topMesh);

    add(GEO.box, kit.floorBody, 0, -0.75, (a + b) / 2, W, 1.48, len);

    // Curbs along both edges. At the corner, the side the path turns towards
    // stays open; the far side and an end wall close the corner off.
    for (const side of sides) {
      const curbEnd = b >= end - 0.01 && side === seg.turn ? seg.length - W / 2 : b;
      if (curbEnd - a > 0.2) {
        add(GEO.box, kit.curb, side * (W / 2 + 0.18), 0.12, (a + curbEnd) / 2, 0.36, 0.5, curbEnd - a);
      }
    }
    if (b >= end - 0.01) add(GEO.box, kit.curb, 0, 0.12, end + 0.18, W + 0.72, 0.5, 0.36);
  }

  // --- Obstacles --------------------------------------------------------------
  for (const o of seg.obstacles) {
    if (o.kind === 'gap') continue;
    o.object = buildObstacle(o.kind, o.lanes, seg.world, kit);
    o.object.position.set(0, 0, -(o.s0 + o.s1) / 2);
    group.add(o.object);
  }

  // --- Coins --------------------------------------------------------------------
  for (const c of seg.coins) {
    let item: THREE.Object3D;
    if (collectible === 'acorn') {
      item = makeAcorn();
      item.userData.spin = 'y';
    } else {
      item = new THREE.Mesh(GEO.coin, COIN_MATERIAL);
      item.rotation.x = Math.PI / 2;
      item.userData.spin = 'z';
    }
    item.position.set(c.x, c.y, -c.s);
    item.userData.coin = true;
    group.add(item);
    c.object = item;
  }

  // --- Portal ---------------------------------------------------------------------
  if (seg.portalAt !== null) {
    const ring = new THREE.Mesh(GEO.portal, kit.portal);
    ring.position.set(0, 2.2, -seg.portalAt);
    ring.userData.portal = true;
    const disc = new THREE.Mesh(GEO.portalDisc, kit.portalDisc);
    disc.position.copy(ring.position);
    group.add(ring, disc);
  }

  decorate(seg, kit, add);
  return group;
}

export function disposeSegmentMesh(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.unique) mesh.geometry.dispose();
  });
}

type AddFn = (
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  s: number,
  sx: number,
  sy: number,
  sz: number,
  shadow?: boolean,
) => THREE.Mesh;

/** Scenery beside the path. Kept clear of where the next and previous paths run. */
function decorate(seg: Segment, kit: Kit, add: AddFn): void {
  const W = TUNING.pathWidth;
  const blocked = (side: number, s: number) =>
    (side === seg.turn && s > seg.length - W / 2 - 4) ||
    (seg.arrivedBy !== null && side === seg.arrivedBy && s < W / 2 + 4) ||
    s > seg.length + W / 2;

  for (const side of [-1, 1]) {
    for (let s = seg.index === 0 ? -14 : W / 2 + 1; s < seg.length + W / 2; s += 4 + Math.random() * 5) {
      if (blocked(side, s)) continue;
      const out = side * (W / 2 + 2.4 + Math.random() * 6);

      if (seg.world.decor === 'jungle') {
        if (Math.random() < 0.72) {
          // A tree growing up out of the abyss.
          const h = 3 + Math.random() * 4;
          add(GEO.trunk, kit.a, out, (h - 14) / 2, s, 1, h + 14, 1);
          const r = 1.6 + Math.random() * 1.4;
          add(GEO.canopy, Math.random() < 0.5 ? kit.b : kit.c, out, h + r * 0.4, s, r, r * 0.9, r, true);
        } else {
          // A broken ruin column.
          const h = 1.5 + Math.random() * 3.5;
          add(GEO.box, kit.d, out, (h - 10) / 2, s, 1.1, h + 10, 1.1);
          add(GEO.box, kit.d, out, h + 0.15, s, 1.4, 0.3, 1.4);
        }
      } else {
        // Rock spires, some tipped with glowing crystals.
        const h = 2 + Math.random() * 6;
        const r = 0.8 + Math.random() * 1.2;
        add(GEO.spire, Math.random() < 0.5 ? kit.a : kit.b, out, (h - 12) / 2, s, r, h + 12, r);
        if (Math.random() < 0.35) add(GEO.crystal, kit.c, out, h + 0.6, s, 0.4, 0.7, 0.4);
      }

      // Every so often, a ruin pillar right on the edge of the path.
      if (Math.random() < 0.22) {
        const edge = side * (W / 2 + 0.85);
        const h = 1.2 + Math.random() * 2.2;
        add(GEO.box, kit.d, edge, h / 2 - 0.3, s, 0.7, h + 0.6, 0.7, true);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

function buildObstacle(kind: string, lanes: [boolean, boolean, boolean], world: WorldDef, kit: Kit): THREE.Object3D {
  const W = TUNING.pathWidth;
  const g = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const lava = world.decor === 'lava';

  if (kind === 'low') {
    if (lava) {
      // A ridge of rock with a glowing seam: jump it.
      part(GEO.box, kit.b, 0, 0.4, 0, W + 0.4, 0.8, 0.8);
      part(GEO.box, kit.c, 0, 0.82, 0, W + 0.2, 0.06, 0.5);
    } else {
      // A fallen log: jump it.
      const log = part(GEO.cyl, kit.a, 0, 0.42, 0, 0.84, W + 0.6, 0.84);
      log.rotation.z = Math.PI / 2;
    }
  } else if (kind === 'high') {
    if (lava) {
      // A fire jet between two posts: slide under it.
      part(GEO.box, kit.b, -W / 2 - 0.25, 1.1, 0, 0.5, 2.6, 0.5);
      part(GEO.box, kit.b, W / 2 + 0.25, 1.1, 0, 0.5, 2.6, 0.5);
      const jet = part(GEO.box, kit.c, 0, 1.55, 0, W, 0.34, 0.34);
      jet.castShadow = false;
      jet.userData.flicker = true;
      const core = part(GEO.box, kit.glow, 0, 1.55, 0, W, 0.14, 0.4);
      core.castShadow = false;
    } else {
      // A low branch hung with leaves: slide under it.
      const branch = part(GEO.cyl, kit.a, 0, 1.6, 0, 0.4, W + 1.6, 0.4);
      branch.rotation.z = Math.PI / 2 + 0.04;
      for (let i = 0; i < 4; i++) {
        part(GEO.canopy, i % 2 ? kit.b : kit.c, -W / 2 + 0.6 + i * 1.15, 1.85, 0, 0.55, 0.4, 0.5);
      }
    }
  } else if (kind === 'block') {
    // Lane blockers: change lanes around them.
    for (let i = 0; i < 3; i++) {
      if (!lanes[i]) continue;
      const x = (i - 1) * TUNING.laneOffset;
      if (lava) {
        part(GEO.rock, kit.a, x, 1.0, 0, 0.75, 1.15, 0.7);
        part(GEO.crystal, kit.c, x, 2.15, 0, 0.3, 0.55, 0.3);
      } else {
        part(GEO.box, kit.d, x, 1.1, 0, 1.25, 2.2, 1.2);
        part(GEO.box, kit.curb, x, 2.32, 0, 1.4, 0.25, 1.35);
        // Glowing eyes on the statue, just for character.
        part(GEO.box, kit.glow, x - 0.25, 1.65, 0.61, 0.16, 0.1, 0.04).castShadow = false;
        part(GEO.box, kit.glow, x + 0.25, 1.65, 0.61, 0.16, 0.1, 0.04).castShadow = false;
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

export interface RunnerModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** The squirrel's tail, which sways as it runs. */
  tail?: THREE.Group;
}

export function makeCharacterModel(character: 'explorer' | 'squirrel'): RunnerModel {
  return character === 'squirrel' ? makeSquirrelModel() : makeRunnerModel();
}

/** Sanök the squirrel: red fur, white legs and belly, big bushy tail. Faces -Z, origin at the feet. */
export function makeSquirrelModel(): RunnerModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mat = (c: string) => std(c, { flatShading: false, roughness: 0.75 });
  const fur = mat('#c8642a');
  const tailFur = mat('#d9772f');
  const white = mat('#ffffff');
  const dark = mat('#2b2b3d');
  const scarf = mat('#3ac6b0');

  const part = (m: THREE.Material, parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const limb = (x: number, y: number, z = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    body.add(pivot);
    return pivot;
  };

  // White legs and feet.
  const legL = limb(-0.17, 0.46);
  const legR = limb(0.17, 0.46);
  for (const leg of [legL, legR]) {
    part(white, leg, GEO.box, 0, -0.22, 0, 0.18, 0.44, 0.2);
    part(white, leg, GEO.box, 0, -0.44, -0.08, 0.2, 0.08, 0.32);
  }

  part(fur, body, GEO.sphere, 0, 0.86, 0.02, 0.72, 0.8, 0.78);
  part(white, body, GEO.sphere, 0, 0.84, -0.22, 0.46, 0.58, 0.36);
  part(scarf, body, GEO.cyl, 0, 1.2, 0, 0.62, 0.1, 0.6);

  part(fur, body, GEO.sphere, 0, 1.46, -0.08, 0.6, 0.56, 0.58);
  part(white, body, GEO.sphere, 0, 1.38, -0.32, 0.3, 0.22, 0.24);
  part(dark, body, GEO.sphere, 0, 1.42, -0.44, 0.08, 0.07, 0.07);
  part(dark, body, GEO.sphere, -0.14, 1.54, -0.3, 0.09, 0.1, 0.06);
  part(dark, body, GEO.sphere, 0.14, 1.54, -0.3, 0.09, 0.1, 0.06);
  const ear = new THREE.ConeGeometry(0.09, 0.26, 5);
  part(fur, body, ear, -0.16, 1.78, -0.02, 1, 1, 1);
  part(fur, body, ear, 0.16, 1.78, -0.02, 1, 1, 1);

  // Little white forepaws.
  const armL = limb(-0.26, 1.04, -0.12);
  const armR = limb(0.26, 1.04, -0.12);
  part(white, armL, GEO.box, 0, -0.16, 0, 0.12, 0.32, 0.14);
  part(white, armR, GEO.box, 0, -0.16, 0, 0.12, 0.32, 0.14);

  // The tail curls up behind and a little to the side, so it never hides the path.
  const tail = new THREE.Group();
  tail.position.set(0.18, 0.6, 0.36);
  tail.rotation.z = -0.3;
  body.add(tail);
  // [x, y, z, radius] — a plume sweeping up and out to the right.
  const puffs: Array<[number, number, number, number]> = [
    [0.05, 0.05, 0.1, 0.2],
    [0.2, 0.32, 0.26, 0.24],
    [0.36, 0.62, 0.3, 0.26],
    [0.46, 0.9, 0.2, 0.24],
    [0.48, 1.1, 0.04, 0.18],
  ];
  for (const [x, y, z, r] of puffs) part(tailFur, tail, GEO.sphere, x, y, z, r * 2, r * 2, r * 1.5);

  return { root, body, legL, legR, armL, armR, tail };
}

/** A little explorer built from boxes, facing -Z. Origin is at the feet. */
export function makeRunnerModel(): RunnerModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mat = (c: string) => std(c, { flatShading: false, roughness: 0.7 });
  const shirt = mat('#f5a623');
  const pants = mat('#4b4f8f');
  const skin = mat('#ffd9a0');
  const hat = mat('#8a5a2b');
  const pack = mat('#c4741a');
  const dark = mat('#2b2b3d');

  const box = (m: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, geo: THREE.BufferGeometry = GEO.box) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const limb = (x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    return pivot;
  };

  const legL = limb(-0.17, 0.74);
  const legR = limb(0.17, 0.74);
  box(pants, legL, 0, -0.36, 0, 0.26, 0.72, 0.28);
  box(pants, legR, 0, -0.36, 0, 0.26, 0.72, 0.28);
  box(dark, legL, 0, -0.7, -0.06, 0.28, 0.12, 0.38);
  box(dark, legR, 0, -0.7, -0.06, 0.28, 0.12, 0.38);

  box(shirt, body, 0, 1.06, 0, 0.66, 0.66, 0.42);
  box(pack, body, 0, 1.1, 0.3, 0.5, 0.52, 0.2);
  box(skin, body, 0, 1.62, 0, 0.62, 0.62, 0.62, GEO.sphere);
  box(dark, body, 0, 1.64, -0.27, 0.4, 0.12, 0.08);
  box(hat, body, 0, 1.88, 0, 0.86, 0.06, 0.86, GEO.cyl);
  box(hat, body, 0, 1.98, 0, 0.5, 0.22, 0.5, GEO.cyl);

  const armL = limb(-0.42, 1.34);
  const armR = limb(0.42, 1.34);
  box(shirt, armL, 0, -0.28, 0, 0.18, 0.6, 0.2);
  box(shirt, armR, 0, -0.28, 0, 0.18, 0.6, 0.2);
  box(skin, armL, 0, -0.62, 0, 0.18, 0.14, 0.18);
  box(skin, armR, 0, -0.62, 0, 0.18, 0.14, 0.18);

  return { root, body, legL, legR, armL, armR };
}

/** Spin coins and flicker fire jets. Called once per frame with the visible segments. */
export function animateSegment(group: THREE.Group, time: number): void {
  for (const child of group.children) {
    if (child.userData.coin) {
      if (child.userData.spin === 'y') child.rotation.y = time * 3;
      else child.rotation.z = time * 4;
    }
    else if (child.userData.portal) child.rotation.z = time * 1.5;
    else if (child.children.length) {
      for (const part of child.children) {
        if (part.userData.flicker) part.scale.y = 0.34 * (0.8 + Math.sin(time * 30 + part.id) * 0.25);
      }
    }
  }
}
