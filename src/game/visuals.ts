/**
 * Visuals: everything you see, built from simple shapes.
 *
 * Every mesh here is a placeholder made of boxes, cylinders and spheres so the
 * game runs with zero asset files. Geometry and materials are shared and
 * reused, and repeated bits (railing posts) are instanced, which keeps it fast
 * on cheap phones.
 *
 * Each world's `decor` picks the scenery and obstacles, and `path.style` picks
 * the running surface:
 *
 *   decor:  jungle (temple) · lava · boardwalk (forest) · branch (treetops) · snow
 *   style:  stone · planks · bark · snow
 *
 * Swapping in real models later (Kenney, Quaternius, KayKit — all CC0) means
 * replacing one builder at a time. Nothing outside this file cares what the
 * meshes look like.
 */

import * as THREE from 'three';
import { TUNING } from './tuning';
import type { Segment } from './track';
import { headingYaw } from './track';
import type { DecorKind, PathStyle, WorldDef } from './worlds';
import { bake, outline, toon } from './toon';

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  trunk: new THREE.CylinderGeometry(0.32, 0.5, 1, 7),
  /** Unit cylinder lying along Z — the round underside of a branch. */
  log: new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2),
  canopy: new THREE.IcosahedronGeometry(1, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  rock: new THREE.DodecahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 7),
  spire: new THREE.ConeGeometry(1, 1, 5),
  crystal: new THREE.OctahedronGeometry(1, 0),
  coin: new THREE.CylinderGeometry(0.36, 0.36, 0.1, 18),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  portal: new THREE.TorusGeometry(2.9, 0.26, 10, 40),
  portalDisc: new THREE.CircleGeometry(2.75, 40),
  beam: new THREE.PlaneGeometry(1, 1),
  /** The top half of a sphere: a mushroom cap. */
  dome: new THREE.SphereGeometry(0.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
};

/** Soft shafts of sunlight slanting through the leaves. */
const SUNBEAM = new THREE.MeshBasicMaterial({
  color: '#fff6c8',
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: false,
});

type Mat = THREE.MeshToonMaterial;

/** Every solid surface uses the cel-shaded cartoon material. */
/** Shared colours for the forest trail's flowers, berries and stones (created on first use). */
const TRAIL = {
  get flowers(): Mat[] {
    return (this._flowers ??= ['#ff6fa3', '#ffd23f', '#ffffff', '#a98bff', '#ff8a3d'].map((c) => std(c)));
  },
  get berry(): Mat {
    return (this._berry ??= std('#e8423a', { flatShading: false }));
  },
  get stem(): Mat {
    return (this._stem ??= std('#3f9b3a'));
  },
  get centre(): Mat {
    return (this._centre ??= std('#ffb020'));
  },
  get stone(): Mat {
    return (this._stone ??= std('#b9c0c8'));
  },
  _flowers: undefined as Mat[] | undefined,
  _berry: undefined as Mat | undefined,
  _stem: undefined as Mat | undefined,
  _centre: undefined as Mat | undefined,
  _stone: undefined as Mat | undefined,
};

function std(color: string, extra: THREE.MeshStandardMaterialParameters = {}): Mat {
  return toon(color, {
    map: (extra.map as THREE.Texture | undefined) ?? undefined,
    emissive: extra.emissive as string | undefined,
    emissiveIntensity: extra.emissiveIntensity,
    transparent: extra.transparent,
    opacity: extra.opacity,
  });
}

// ---------------------------------------------------------------------------
// Collectibles
// ---------------------------------------------------------------------------

/** What you collect: gold coins for the lumberjack, acorns for the squirrel. */
export type Collectible = 'coin' | 'acorn';
let collectible: Collectible = 'coin';

export function setCollectible(kind: Collectible): void {
  collectible = kind;
}

const ACORN_NUT = toon('#d48a42', { emissive: '#6a3608', emissiveIntensity: 0.35 });
const ACORN_CAP = std('#6b4325', { roughness: 0.9 });
const COIN_MATERIAL = toon('#ffd23f', { emissive: '#c99a00', emissiveIntensity: 0.45 });

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

// ---------------------------------------------------------------------------
// Per-world materials ("kits")
// ---------------------------------------------------------------------------

interface Kit {
  decor: DecorKind;
  floorTop: Mat;
  floorBody: Mat;
  curb: Mat;
  leaves: [Mat, Mat, Mat];
  trunk: Mat;
  wood: Mat;
  woodDark: Mat;
  stone: Mat;
  rock: Mat;
  rockDark: Mat;
  hot: Mat;
  glow: THREE.MeshBasicMaterial;
  snow: Mat;
  ice: Mat;
  mushroom: Mat;
  gills: Mat;
  white: Mat;
  carrot: Mat;
  dark: Mat;
  woodEnd: Mat;
  steel: Mat;
  fungus: Mat;
  portal: Mat;
  portalDisc: THREE.MeshBasicMaterial;
}

const kits = new Map<string, Kit>();

function kitFor(world: WorldDef): Kit {
  const cached = kits.get(world.id);
  if (cached) return cached;
  const p = world.path;
  const accent = world.theme.accent;
  const kit: Kit = {
    decor: world.decor,
    floorTop: std('#ffffff', { map: makeFloorTexture(p.style, p.slab, p.grout), flatShading: false, roughness: 0.9 }),
    floorBody: std(p.body),
    curb: std(p.curb),
    leaves: world.palette.leaves.map((c) => std(c, { roughness: 0.7 })) as Kit['leaves'],
    trunk: std(world.palette.trunk),
    wood: std('#b07a45'),
    woodDark: std('#7a4e2c'),
    stone: std('#d9c08a'),
    rock: std('#3b2a30'),
    rockDark: std('#2a1c22'),
    hot: std('#ff7a2a', { emissive: '#ff4a10', emissiveIntensity: 1.2 }),
    glow: new THREE.MeshBasicMaterial({ color: world.decor === 'lava' ? '#ffc04a' : '#ffe066' }),
    snow: std('#ffffff', { roughness: 0.6 }),
    ice: std('#bfe8ff', { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9, flatShading: false }),
    mushroom: std('#ff4d4d', { flatShading: false, roughness: 0.5 }),
    gills: std('#ffe7c2', { flatShading: false }),
    white: std('#fff8f0', { flatShading: false }),
    carrot: std('#ff8a1e'),
    dark: std('#2b2b3d'),
    woodEnd: std('#f0cf96'),
    steel: std('#b9c6d6'),
    fungus: std('#f5b54a'),
    portal: std(accent, { emissive: accent, emissiveIntensity: 1.4, flatShading: false }),
    portalDisc: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  };
  kits.set(world.id, kit);
  return kit;
}

// ---------------------------------------------------------------------------
// Floor textures, drawn on a canvas — no image files needed
// ---------------------------------------------------------------------------

/** One texture tile covers the full path width and the same distance along it. */
function makeFloorTexture(style: PathStyle, main: string, line: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const base = new THREE.Color(main);
  const shade = (spread: number) => `#${base.clone().offsetHSL(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * spread).getHexString()}`;

  if (style === 'planks') {
    // Boards laid across the path, with nails at both ends.
    g.fillStyle = line;
    g.fillRect(0, 0, size, size);
    const boards = 10;
    const h = size / boards;
    for (let i = 0; i < boards; i++) {
      g.fillStyle = shade(0.12);
      g.fillRect(0, i * h + 2, size, h - 4);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const y = i * h + 6 + Math.random() * (h - 12);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(size * 0.3, y + 2, size * 0.6, y - 2, size, y + 1);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,25,15,0.55)';
      for (const x of [14, size - 18]) g.fillRect(x, i * h + h / 2 - 2, 4, 4);
    }
  } else if (style === 'bark') {
    // Grooves running along the branch, with lighter ridges between.
    g.fillStyle = main;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * size;
      g.strokeStyle = Math.random() < 0.6 ? line : `#${base.clone().offsetHSL(0, 0, 0.08).getHexString()}`;
      g.lineWidth = 2 + Math.random() * 4;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= size; y += 32) g.lineTo(x + Math.sin(y * 0.05 + i) * 4, y);
      g.stroke();
    }
    // Patches of moss.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(110,190,80,0.35)';
      g.beginPath();
      g.ellipse(Math.random() * size, Math.random() * size, 10 + Math.random() * 18, 6 + Math.random() * 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 'trail') {
    // A sandy forest path: soft patches, pebbles and a few paw prints.
    g.fillStyle = main;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = Math.random() < 0.5 ? `${line}55` : 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.ellipse(20 + Math.random() * (size - 40), Math.random() * size, 12 + Math.random() * 26, 6 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,60,0.45)' : 'rgba(255,250,235,0.7)';
      g.beginPath();
      g.ellipse(14 + Math.random() * (size - 28), Math.random() * size, 2 + Math.random() * 3, 1.5 + Math.random() * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // No grass painted along the edges: at a corner the old path's floor
    // lies crosswise, and its edges would draw a stripe across the new path.
  } else if (style === 'snow') {
    // Fresh snow on a branch: bark peeks out at the edges.
    g.fillStyle = main;
    g.fillRect(0, 0, size, size);
    g.fillStyle = line;
    g.fillRect(0, 0, 10, size);
    g.fillRect(size - 10, 0, 10, size);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = Math.random() < 0.6 ? 'rgba(150,190,230,0.18)' : 'rgba(255,255,255,0.9)';
      g.fillRect(12 + Math.random() * (size - 24), Math.random() * size, 2 + Math.random() * 4, 2 + Math.random() * 3);
    }
  } else {
    // Stone slabs.
    g.fillStyle = line;
    g.fillRect(0, 0, size, size);
    const rows = 4;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (size / 4);
      for (let col = -1; col < 3; col++) {
        g.fillStyle = shade(0.1);
        g.fillRect(col * (size / 2) + offset + 4, r * rowH + 4, size / 2 - 8, rowH - 8);
      }
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
      g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
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

/**
 * Build everything visible on one segment. The group is placed at the segment
 * start and rotated to its heading, so inside it "forward" is always -Z and
 * "right" is +X: a point (x, y, s) on the track is local (x, y, -s).
 */
export function buildSegmentMesh(seg: Segment): THREE.Group {
  const kit = kitFor(seg.world);
  const style = seg.world.path.style;
  const W = TUNING.pathWidth;
  const group = new THREE.Group();
  group.position.copy(seg.start);
  group.rotation.y = headingYaw(seg.heading);

  const add: AddFn = (geo, mat, x, y, s, sx, sy, sz, shadow = false) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, -s);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const posts: THREE.Matrix4[] = [];
  const post = (x: number, y: number, s: number, sx: number, sy: number, sz: number) =>
    posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, -s), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));

  // --- Floor ----------------------------------------------------------------
  // The first stretch after a corner is covered by the previous segment's
  // floor, so visually each segment starts at the edge of the corner square.
  const visualStart = seg.index === 0 ? -16 : W / 2;
  const end = seg.length + W / 2;

  for (const [from, to] of seg.floor) {
    const a = Math.max(from, visualStart);
    const b = to;
    if (b - a <= 0.01) continue;
    const len = b - a;
    const mid = (a + b) / 2;

    const top = new THREE.PlaneGeometry(W, len);
    top.rotateX(-Math.PI / 2);
    const uv = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / W) + a / W);
    const topMesh = new THREE.Mesh(top, kit.floorTop);
    topMesh.position.set(0, 0, -mid);
    topMesh.receiveShadow = true;
    topMesh.userData.unique = true;
    group.add(topMesh);

    if (style === 'bark' || style === 'snow') {
      // A round branch under the walking surface.
      const r = W / 2 + 0.35;
      add(GEO.log, kit.floorBody, 0, -r + 0.02, mid, r, r * 0.8, len);
    } else if (style === 'trail') {
      // Packed earth, flush with the forest floor. No ink outline: on the
      // ground it would draw lines across the path where pieces meet.
      add(GEO.box, kit.floorBody, 0, -0.14, mid, W, 0.26, len).userData.noOutline = true;
    } else if (style === 'planks') {
      // A thin deck on beams, with posts reaching down to the forest floor.
      add(GEO.box, kit.floorBody, 0, -0.3, mid, W, 0.56, len);
      for (const side of [-1, 1]) add(GEO.box, kit.woodDark, side * (W / 2 - 0.2), -0.75, mid, 0.3, 0.5, len);
      for (let s = a + 3; s < b - 1; s += 9) {
        for (const side of [-1, 1]) add(GEO.cyl, kit.woodDark, side * (W / 2 - 0.3), -15.5, s, 0.45, 30, 0.45);
      }
    } else {
      add(GEO.box, kit.floorBody, 0, -0.75, mid, W, 1.48, len);
    }

    // Edges. At the corner the side the path turns towards stays open; the far
    // side and an end piece close the corner off so you can see the turn coming.
    for (const side of [-1, 1] as const) {
      const edgeEnd = b >= end - 0.01 && side === seg.turn ? seg.length - W / 2 : b;
      const run = edgeEnd - a;
      if (run <= 0.2) continue;
      const x = side * (W / 2 + 0.18);
      if (style === 'planks') {
        // A wooden railing: posts and a rail.
        add(GEO.box, kit.curb, x, 0.95, (a + edgeEnd) / 2, 0.16, 0.14, run);
        for (let s = a + 0.4; s < edgeEnd; s += 2.6) post(x, 0.48, s, 0.18, 0.96, 0.18);
      } else if (style === 'bark') {
        // A strip of moss along the edge; no ink outline, so the strips of
        // two branches meeting at a corner don't draw lines across the path.
        add(GEO.box, kit.curb, x - side * 0.1, 0.04, (a + edgeEnd) / 2, 0.36, 0.14, run).userData.noOutline = true;
      } else if (style === 'trail') {
        // No verge: the grass painted into the path's edges meets the forest
        // floor directly, so corners don't get stripes where verges cross.
      } else if (style === 'snow') {
        add(GEO.log, kit.curb, x - side * 0.1, 0.05, (a + edgeEnd) / 2, 0.3, 0.26, run).userData.noOutline = true;
      } else {
        add(GEO.box, kit.curb, x, 0.12, (a + edgeEnd) / 2, 0.36, 0.5, run);
      }
    }
    if (b >= end - 0.01) {
      if (style === 'planks') {
        add(GEO.box, kit.curb, 0, 0.95, end + 0.18, W + 0.5, 0.14, 0.16);
        for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 3) post(x, 0.48, end + 0.18, 0.18, 0.96, 0.18);
      } else if (style === 'trail') {
        // A thick hedge where the path turns, so the corner is easy to read.
        for (let i = 0; i < 4; i++) {
          add(GEO.blob, kit.leaves[i % 3], -W / 2 + 0.6 + i * (W / 3 - 0.2), 0.7, end + 0.9, 1.25, 1.1, 1.0, true);
        }
      } else if (style === 'bark' || style === 'snow') {
        add(GEO.blob, style === 'snow' ? kit.snow : kit.leaves[0], 0, 0.2, end + 0.4, W / 2 + 0.4, 0.7, 0.7, true);
      } else {
        add(GEO.box, kit.curb, 0, 0.12, end + 0.18, W + 0.72, 0.5, 0.36);
      }
    }
  }

  if (posts.length) {
    const inst = new THREE.InstancedMesh(GEO.box, kit.curb, posts.length);
    posts.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    inst.userData.unique = true;
    group.add(inst);
  }

  // --- Obstacles --------------------------------------------------------------
  for (const o of seg.obstacles) {
    if (o.kind === 'gap') continue;
    o.object = buildObstacle(o.kind, o.lanes, kit);
    o.object.position.set(0, 0, -(o.s0 + o.s1) / 2);
    group.add(o.object);
  }

  // --- Coins / acorns -------------------------------------------------------------
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
    item.userData.keep = true;
    group.add(item);
    c.object = item;
  }

  // --- Power-ups --------------------------------------------------------------------
  for (const p of seg.powerups) {
    const item = buildPowerup(p.kind);
    item.position.set(p.x, 1.1, -p.s);
    group.add(item);
    p.object = item;
  }

  // --- Portal ---------------------------------------------------------------------
  if (seg.portalAt !== null) {
    const ring = new THREE.Mesh(GEO.portal, kit.portal);
    ring.position.set(0, 2.2, -seg.portalAt);
    ring.userData.portal = true;
    ring.userData.keep = true;
    const disc = new THREE.Mesh(GEO.portalDisc, kit.portalDisc);
    disc.userData.keep = true;
    disc.position.copy(ring.position);
    group.add(ring, disc);
  }

  decorate(seg, kit, add);
  // Merge the still scenery into a few meshes, then ink everything else.
  topMeshes(group);
  bake(group);
  outline(group);
  return group;
}

/** The walking surface is flat and seen from above; it gets no outline of its own. */
function topMeshes(group: THREE.Group): void {
  for (const child of group.children) if ((child as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) child.userData.noOutline = true;
}

export function disposeSegmentMesh(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.unique) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
    else mesh.geometry.dispose();
  });
}

// ---------------------------------------------------------------------------
// Scenery beside the path
// ---------------------------------------------------------------------------

function decorate(seg: Segment, kit: Kit, add: AddFn): void {
  const W = TUNING.pathWidth;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const leaf = () => kit.leaves[Math.floor(Math.random() * 3)];
  // Keep clear of where the next and previous paths run.
  const blocked = (side: number, s: number) =>
    (side === seg.turn && s > seg.length - W / 2 - 4) ||
    (seg.arrivedBy !== null && side === seg.arrivedBy && s < W / 2 + 4) ||
    s > seg.length + W / 2;

  // Forest trail: a giant old tree stands behind each corner (the squirrel's
  // home, with the hollow), rooted in the ground.
  if (kit.decor === 'trail') {
    const r = 2.6;
    const s = seg.length + W / 2 + r;
    const x = -seg.turn * (W / 2 + r * 0.6);
    add(GEO.trunk, kit.trunk, x, 8, s, r * 2, 16, r * 2, true);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      add(GEO.sphere, kit.trunk, x + Math.cos(a) * r * 0.95, 0.2, s + Math.sin(a) * r * 0.95, 1.4, 0.7, 1.4);
    }
    add(GEO.blob, kit.leaves[0], x, 17.5, s, 7, 5, 7, true);
    add(GEO.blob, kit.leaves[1], x - 3, 15, s + 2, 5, 4, 5);
    add(GEO.blob, kit.leaves[2], x + 3, 15.5, s - 1.5, 4.5, 3.5, 4.5);
  }

  // Branch worlds: the branch grows out of a giant trunk behind each corner.
  if (kit.decor === 'branch' || kit.decor === 'snow') {
    const r = 2.6;
    const s = seg.length + W / 2 + r;
    const x = -seg.turn * (W / 2 + r * 0.6);
    add(GEO.trunk, kit.trunk, x, -6, s, r * 2, 40, r * 2);
    if (kit.decor === 'snow') {
      for (let i = 0; i < 3; i++) add(GEO.cone, kit.leaves[0], x, 14 - i * 3.2, s, 5 - i * 1.1, 5, 5 - i * 1.1);
      add(GEO.cone, kit.snow, x, 16.4, s, 2.4, 2.2, 2.4);
    } else {
      add(GEO.blob, kit.leaves[0], x, 16, s, 7, 5, 7);
      add(GEO.blob, kit.leaves[1], x - 3, 13, s + 2, 5, 4, 5);
    }
  }

  if (kit.decor === 'boardwalk' || kit.decor === 'branch' || kit.decor === 'snow' || kit.decor === 'trail') forest(seg, kit, add, blocked);

  for (const side of [-1, 1]) {
    for (let s = seg.index === 0 ? -14 : W / 2 + 1; s < seg.length + W / 2; s += rand(4, 8.5)) {
      if (blocked(side, s)) continue;
      const out = (d: number) => side * (W / 2 + d);

      switch (kit.decor) {
        case 'boardwalk': {
          if (Math.random() < 0.3) {
            // A taller tree whose crown rises above the path.
            const h = rand(4, 7);
            const tx = out(rand(4, 8));
            add(GEO.trunk, kit.trunk, tx, (h - 20) / 2, s, 1.1, h + 20, 1.1);
            add(GEO.blob, leaf(), tx, h + 1.4, s, 2.6, 2.2, 2.6, true);
          }
          break;
        }
        case 'trail': {
          // Bushes, flowers, ferns and stones along the verge, trees behind.
          const bush = Math.random();
          if (bush < 0.7) {
            const bx = out(rand(0.9, 1.8));
            const r = rand(0.8, 1.25);
            add(GEO.blob, leaf(), bx, r * 0.55, s, r, r * 0.8, r * 0.95, true);
            if (Math.random() < 0.4) {
              for (let i = 0; i < 4; i++) add(GEO.sphere, TRAIL.berry, bx - side * r * 0.75, r * 0.55 + rand(-0.2, 0.3), s + rand(-0.5, 0.5), 0.16, 0.16, 0.16);
            }
          }
          if (Math.random() < 0.6) {
            // A little bunch of flowers on the verge.
            const petal = TRAIL.flowers[Math.floor(Math.random() * TRAIL.flowers.length)];
            for (let i = 0; i < 3; i++) {
              const fx = out(rand(0.25, 0.7));
              const fs = s + rand(-1.2, 1.2);
              const h = rand(0.25, 0.45);
              add(GEO.cyl, TRAIL.stem, fx, h / 2, fs, 0.04, h, 0.04);
              add(GEO.sphere, petal, fx, h + 0.04, fs, 0.22, 0.12, 0.22);
              add(GEO.sphere, TRAIL.centre, fx, h + 0.08, fs, 0.08, 0.06, 0.08);
            }
          }
          if (Math.random() < 0.3) {
            // A fern.
            const fx = out(rand(0.5, 1.2));
            for (let i = 0; i < 5; i++) {
              const frond = add(GEO.cone, kit.leaves[2], fx, 0.35, s, 0.22, 0.9, 0.06);
              frond.rotation.set(0, (i / 5) * Math.PI * 2, side * 0.6);
            }
          }
          if (Math.random() < 0.2) add(GEO.rock, TRAIL.stone, out(rand(0.4, 1.0)), 0.12, s + 1, 0.4, 0.28, 0.35);
          if (Math.random() < 0.18) {
            for (let i = 0; i < 3; i++) toadstool(add, kit, out(0.45 + i * 0.25), 0, s - 1 + i * 0.4, i === 0 ? 0.6 : 0.4, 0);
          }
          if (Math.random() < 0.45) {
            // A tree further back, rooted on the forest floor.
            const tx = out(rand(4.5, 11));
            const h = rand(5, 8);
            add(GEO.trunk, kit.trunk, tx, h / 2, s, 1.1, h, 1.1);
            add(GEO.canopy, leaf(), tx, h + 1.2, s, 2.8, 2.4, 2.8, true);
            add(GEO.canopy, leaf(), tx + 1, h + 0.2, s + 0.8, 2, 1.6, 2);
          }
          break;
        }
        case 'branch': {
          // Clouds of leaves along the branch, some hanging overhead.
          if (Math.random() < 0.25) add(GEO.blob, leaf(), out(rand(1.5, 4)), rand(5.5, 7.5), s, 2.6, 1.6, 2.4);
          if (Math.random() < 0.22) {
            // A little family of toadstools on the mossy shoulder of the branch.
            const n = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < n; i++) {
              const size = i === 0 ? 1 : rand(0.55, 0.8);
              toadstool(add, kit, side * (W / 2 + 0.05 + i * 0.22), -0.12, s + (i - 1) * 0.42, size * 0.55, -side * 0.25);
            }
          } else if (Math.random() < 0.15) {
            // A twig growing out of the side of the branch, with two leaves at its tip.
            const angle = 0.6;
            const len = 1.5;
            const baseX = side * (W / 2 - 0.15);
            const baseY = -0.45;
            const tipX = baseX + side * Math.cos(angle) * len;
            const tipY = baseY + Math.sin(angle) * len;
            const twig = add(GEO.cyl, kit.trunk, (baseX + tipX) / 2, (baseY + tipY) / 2, s, 0.16, len, 0.16);
            twig.rotation.z = -side * (Math.PI / 2 - angle);
            add(GEO.blob, leaf(), tipX, tipY + 0.12, s - 0.2, 0.42, 0.18, 0.3).rotation.y = 0.5;
            add(GEO.blob, leaf(), tipX + side * 0.15, tipY + 0.05, s + 0.25, 0.36, 0.16, 0.26).rotation.y = -0.4;
          }
          break;
        }
        case 'snow': {
          // Snowy pine trees rising from far below.
          const x = out(rand(3, 9));
          const h = rand(2, 6);
          add(GEO.trunk, kit.trunk, x, (h - 18) / 2, s, 0.9, h + 18, 0.9);
          for (let i = 0; i < 3; i++) {
            add(GEO.cone, kit.leaves[i === 2 ? 1 : 0], x, h - 1 + i * 1.4, s, 2.4 - i * 0.6, 2, 2.4 - i * 0.6, i === 0);
            add(GEO.cone, kit.snow, x, h - 0.4 + i * 1.4, s, 1.3 - i * 0.35, 0.8, 1.3 - i * 0.35);
          }
          if (Math.random() < 0.3) add(GEO.blob, kit.snow, out(rand(0.9, 1.3)), 0.05, s, 0.6, 0.3, 0.7);
          break;
        }
        case 'lava': {
          const h = rand(2, 8);
          const r = rand(0.8, 2);
          add(GEO.spire, Math.random() < 0.5 ? kit.rock : kit.rockDark, out(rand(2.4, 8)), (h - 12) / 2, s, r, h + 12, r);
          if (Math.random() < 0.35) add(GEO.crystal, kit.hot, out(rand(2.4, 8)), h + 0.6, s, 0.4, 0.7, 0.4);
          break;
        }
        default: {
          // Temple ruins: trees and broken columns.
          const x = out(rand(2.4, 8.4));
          if (Math.random() < 0.7) {
            const h = rand(3, 7);
            add(GEO.trunk, kit.trunk, x, (h - 14) / 2, s, 1, h + 14, 1);
            const r = rand(1.6, 3);
            add(GEO.canopy, leaf(), x, h + r * 0.4, s, r, r * 0.9, r, true);
          } else {
            const h = rand(1.5, 5);
            add(GEO.box, kit.stone, x, (h - 10) / 2, s, 1.1, h + 10, 1.1);
            add(GEO.box, kit.stone, x, h + 0.15, s, 1.4, 0.3, 1.4);
          }
          if (Math.random() < 0.2) {
            const h = rand(1.2, 3.4);
            add(GEO.box, kit.stone, out(0.85), h / 2 - 0.3, s, 0.7, h + 0.6, 0.7, true);
          }
        }
      }
    }
  }
}

/**
 * The forest itself, for the tree worlds: a carpet of treetops below, giant
 * trunks right beside the path, a roof of leaves overhead and sunbeams.
 * This is what makes it feel like running through the trees, not over a lake.
 */
/** A small decorative toadstool, tilted by `lean` (radians around z). */
function toadstool(add: AddFn, kit: Kit, x: number, y: number, s: number, size: number, lean: number): void {
  const stemH = 0.9 * size;
  const stem = add(GEO.trunk, kit.white, x, y + stemH / 2, s, 0.45 * size, stemH, 0.45 * size);
  stem.rotation.z = lean;
  const top = y + stemH;
  const dx = -Math.sin(lean) * stemH;
  add(GEO.cyl, kit.gills, x + dx, top + 0.02, s, 1.05 * size, 0.06 * size, 1.05 * size).rotation.z = lean;
  add(GEO.dome, kit.mushroom, x + dx, top, s, 1.2 * size, 0.95 * size, 1.2 * size).rotation.z = lean;
  add(GEO.sphere, kit.white, x + dx, top + 0.42 * size, s + 0.12 * size, 0.22 * size, 0.1 * size, 0.22 * size);
  add(GEO.sphere, kit.white, x + dx + 0.28 * size, top + 0.25 * size, s + 0.2 * size, 0.16 * size, 0.08 * size, 0.16 * size);
}

function forest(seg: Segment, kit: Kit, add: AddFn, blocked: (side: number, s: number) => boolean): void {
  const W = TUNING.pathWidth;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const leaf = () => kit.leaves[Math.floor(Math.random() * 3)];
  const from = seg.index === 0 ? -14 : W / 2;
  const to = seg.length + W / 2;
  const snow = kit.decor === 'snow';

  // 1. The carpet of treetops below, reaching to the horizon (not on the forest floor).
  for (let s = from; s < (kit.decor === 'trail' ? from : to); s += 3.2) {
    for (const side of [-1, 1]) {
      if (blocked(side, s)) continue;
      const x = side * (W / 2 + rand(2, 11));
      const y = rand(-6.5, -3);
      if (snow) {
        const r = rand(1.6, 2.6);
        add(GEO.cone, kit.leaves[0], x, y, s, r, r * 1.8, r);
        add(GEO.cone, kit.snow, x, y + r * 0.75, s, r * 0.55, r * 0.6, r * 0.55);
      } else {
        const r = rand(2.2, 3.6);
        add(GEO.canopy, leaf(), x, y, s, r, r * 0.8, r);
      }
      if (Math.random() < 0.3) {
        const r = rand(4, 7);
        add(GEO.canopy, leaf(), side * (W / 2 + rand(14, 28)), rand(-7, -2), s, r, r * 0.7, r);
      }
    }
  }

  // 2. Giant trunks right beside the path, rising past you.
  let side = Math.random() < 0.5 ? -1 : 1;
  for (let s = from + rand(2, 6); s < to; s += rand(7, 12)) {
    side = -side;
    if (blocked(side, s)) continue;
    const r = rand(0.8, 1.3);
    // Pines spread wide low down, so they stand further from the path.
    const x = side * (W / 2 + (snow ? rand(2.8, 4.2) : rand(1.6, 3)));
    // Every trunk ends in a proper crown you can see, never a bare pole.
    const top = rand(8.5, 11.5);
    add(GEO.trunk, kit.trunk, x, (top - 30) / 2, s, r * 2, top + 30, r * 2, true);
    if (snow) {
      for (let i = 0; i < 4; i++) {
        // Branch layers start above camera height and stay narrow enough
        // that they never sweep across the screen as you run past.
        const y = top - 3 + i * 2;
        const w = 2.6 - i * 0.5;
        add(GEO.cone, kit.leaves[i % 2], x, y, s, w, 3, w, i === 0);
        add(GEO.cone, kit.snow, x, y + 0.9, s, w * 0.55, 1.1, w * 0.55);
      }
      add(GEO.blob, kit.snow, x, 1.2, s, r * 1.2, 0.25, r * 1.2);
    } else {
      add(GEO.canopy, leaf(), x, top + 1.5, s, 3.6, 2.6, 3.6, true);
      add(GEO.canopy, leaf(), x + side * 1.8, top + 0.4, s + 1.2, 2.6, 2, 2.6);
      add(GEO.canopy, leaf(), x - side * 1.2, top + 2.6, s - 1, 2.4, 1.8, 2.4);
      if (Math.random() < 0.6) {
        // A side branch with a clump of leaves reaching out over the path.
        const arm = add(GEO.cyl, kit.trunk, x - side * 1.4, top - 3.5, s, 0.35, 3.2, 0.35);
        arm.rotation.z = side * 1.05;
        add(GEO.blob, leaf(), x - side * 2.8, top - 2.4, s, 2.2, 1.4, 2);
      }
    }
  }

  // 2b. The story in the scenery.
  if (kit.decor === 'boardwalk') lumberjackCamp(seg, kit, add, blocked);
  if (kit.decor === 'branch' || kit.decor === 'trail') squirrelHome(seg, kit, add);

  // 3. A roof of leaves (or snowy pine tops) overhead.
  for (let s = from; s < to; s += rand(6, 10)) {
    const r = rand(3, 5);
    if (snow) add(GEO.cone, kit.leaves[0], rand(-6, 6), rand(11, 14), s, r, r * 1.2, r);
    else add(GEO.canopy, leaf(), rand(-6, 6), rand(10.5, 13.5), s, r, r * 0.55, r);
  }

  // 4. Sunbeams slanting down through the gaps.
  for (let s = from + rand(4, 12); s < to; s += rand(16, 26)) {
    const sideBeam = Math.random() < 0.5 ? -1 : 1;
    const beam = add(GEO.beam, SUNBEAM, sideBeam * rand(0.5, 4), 6, s, rand(1.2, 2.4), 18, 1);
    beam.rotation.z = sideBeam * 0.32;
    beam.rotation.y = rand(-0.4, 0.4);
    beam.receiveShadow = false;
  }
}

/**
 * The lumberjack's forest: little side platforms along the boardwalk with his
 * work lying about. Stumps with an axe in them, piles of cut logs, a saw.
 */
function lumberjackCamp(seg: Segment, kit: Kit, add: AddFn, blocked: (side: number, s: number) => boolean): void {
  const W = TUNING.pathWidth;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  for (let s = (seg.index === 0 ? 10 : W / 2 + 8) + rand(0, 8); s < seg.length - 6; s += rand(18, 30)) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (blocked(side, s)) continue;
    const x = side * (W / 2 + 2.1);
    // The platform, propped on a post.
    add(GEO.box, kit.floorBody, x, -0.25, s, 3.4, 0.5, 3.6, true);
    add(GEO.cyl, kit.woodDark, x, -15.5, s, 0.4, 30, 0.4);
    if (Math.random() < 0.55) {
      // A stump with the axe still in it.
      add(GEO.cyl, kit.trunk, x, 0.35, s, 1.1, 0.7, 1.1, true);
      add(GEO.cyl, kit.woodEnd, x, 0.71, s, 0.95, 0.04, 0.95);
      const handle = add(GEO.box, kit.wood, x + 0.25, 1.1, s, 0.1, 0.95, 0.1, true);
      handle.rotation.z = -side * 0.5;
      add(GEO.box, kit.steel, x - side * 0.05, 0.8, s, 0.42, 0.26, 0.08, true);
    } else {
      // A pile of cut logs, ends facing the path.
      for (const [dx, dy] of [[-0.45, 0.32], [0.45, 0.32], [0, 0.88]]) {
        add(GEO.log, kit.trunk, x + dx, dy, s, 0.34, 0.34, 2.2, true);
        add(GEO.log, kit.woodEnd, x + dx, dy, s - 1.11, 0.3, 0.3, 0.02);
      }
    }
    if (Math.random() < 0.4) {
      // A warning sign: a bear paw.
      add(GEO.box, kit.woodDark, x + side * 1.2, 0.8, s + 1.2, 0.12, 1.6, 0.12);
      add(GEO.box, kit.wood, x + side * 1.2, 1.55, s + 1.2, 0.9, 0.7, 0.1, true);
      add(GEO.sphere, kit.woodDark, x + side * 1.2, 1.5, s + 1.14, 0.32, 0.26, 0.04);
    }
  }
}

/** The squirrel's forest: a hollow in the big trunk at each corner, and nests. */
function squirrelHome(seg: Segment, kit: Kit, add: AddFn): void {
  const W = TUNING.pathWidth;
  const r = 2.6;
  const s = seg.length + W / 2 + r;
  const x = -seg.turn * (W / 2 + r * 0.6);
  // The hollow faces the runner as they come up to the corner, set into the
  // bark of the giant trunk (thicker at this height on the forest floor).
  const bark = kit.decor === 'trail' ? r * 0.92 : r * 0.74;
  add(GEO.sphere, kit.dark, x, 3.2, s - bark, 1.6, 2.2, 0.5);
  add(GEO.sphere, kit.woodEnd, x, 2.05, s - bark - 0.05, 1.8, 0.35, 0.55);
  if (Math.random() < 0.5) {
    // A nest of twigs with two eggs, on a stub of branch.
    const nx = x - Math.sign(x) * 0.2;
    add(GEO.cyl, kit.trunk, nx, 6.4, s - r * 0.8, 1.6, 0.5, 1.4, true);
    add(GEO.sphere, kit.white, nx - 0.25, 6.75, s - r * 0.8, 0.36, 0.44, 0.36);
    add(GEO.sphere, kit.white, nx + 0.25, 6.75, s - r * 0.8 + 0.1, 0.34, 0.42, 0.34);
  }
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

function buildObstacle(kind: string, lanes: [boolean, boolean, boolean], kit: Kit): THREE.Object3D {
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
  const laneXs = [0, 1, 2].filter((i) => lanes[i]).map((i) => (i - 1) * TUNING.laneOffset);
  const d = kit.decor;

  if (kind === 'low') {
    // Something across the path to jump.
    if (d === 'lava') {
      part(GEO.box, kit.rockDark, 0, 0.4, 0, W + 0.4, 0.8, 0.8);
      part(GEO.box, kit.hot, 0, 0.82, 0, W + 0.2, 0.06, 0.5);
    } else if (d === 'snow') {
      part(GEO.blob, kit.snow, 0, 0.18, 0, W / 2 + 0.3, 0.62, 0.7);
    } else if (d === 'branch') {
      // A knobbly twig lying across the branch.
      part(GEO.cyl, kit.trunk, 0, 0.36, 0, 0.6, W + 0.4, 0.6).rotation.z = Math.PI / 2;
      part(GEO.blob, kit.leaves[1], -W / 2 + 0.3, 0.7, 0, 0.5, 0.4, 0.5);
      part(GEO.blob, kit.leaves[0], W / 2 - 0.5, 0.65, 0.1, 0.45, 0.35, 0.45);
    } else {
      // A fallen log.
      part(GEO.cyl, d === 'boardwalk' || d === 'trail' ? kit.trunk : kit.woodDark, 0, 0.42, 0, 0.84, W + 0.6, 0.84).rotation.z = Math.PI / 2;
      part(GEO.cyl, kit.wood, W / 2 + 0.3, 0.42, 0, 0.7, 0.05, 0.7).rotation.z = Math.PI / 2;
    }
  } else if (kind === 'high') {
    // Something overhead to slide under.
    if (d === 'lava') {
      part(GEO.box, kit.rockDark, -W / 2 - 0.25, 1.1, 0, 0.5, 2.6, 0.5);
      part(GEO.box, kit.rockDark, W / 2 + 0.25, 1.1, 0, 0.5, 2.6, 0.5);
      const jet = part(GEO.box, kit.hot, 0, 1.55, 0, W, 0.34, 0.34);
      jet.castShadow = false;
      jet.userData.flicker = true;
      part(GEO.box, kit.glow, 0, 1.55, 0, W, 0.14, 0.4).castShadow = false;
    } else if (d === 'boardwalk') {
      // A low wooden beam with a warning sign.
      part(GEO.box, kit.woodDark, -W / 2 - 0.2, 1.1, 0, 0.3, 2.4, 0.3);
      part(GEO.box, kit.woodDark, W / 2 + 0.2, 1.1, 0, 0.3, 2.4, 0.3);
      part(GEO.box, kit.wood, 0, 1.6, 0, W + 0.6, 0.36, 0.36);
      part(GEO.box, kit.glow, 0, 1.6, 0.19, 1.1, 0.24, 0.02).castShadow = false;
    } else if (d === 'snow') {
      // An icy branch dripping icicles.
      part(GEO.cyl, kit.trunk, 0, 1.75, 0, 0.36, W + 1.6, 0.36).rotation.z = Math.PI / 2;
      part(GEO.box, kit.snow, 0, 1.95, 0, W + 1.2, 0.14, 0.4);
      for (let i = 0; i < 7; i++) {
        const icicle = part(GEO.cone, kit.ice, -W / 2 + 0.35 + i * ((W - 0.7) / 6), 1.38, 0, 0.12, 0.55, 0.12);
        icicle.rotation.x = Math.PI;
      }
    } else {
      // A low branch hung with leaves.
      part(GEO.cyl, kit.trunk, 0, 1.6, 0, 0.4, W + 1.6, 0.4).rotation.z = Math.PI / 2 + 0.04;
      for (let i = 0; i < 5; i++) part(GEO.blob, kit.leaves[i % 3], -W / 2 + 0.4 + i * 0.95, 1.85, 0, 0.55, 0.4, 0.5);
    }
  } else if (kind === 'block') {
    // Lane blockers: change lanes around them.
    for (const x of laneXs) {
      if (d === 'lava') {
        part(GEO.rock, kit.rock, x, 1.0, 0, 0.75, 1.15, 0.7);
        part(GEO.crystal, kit.hot, x, 2.15, 0, 0.3, 0.55, 0.3);
      } else if (d === 'boardwalk') {
        // A stack of freshly cut logs, ends towards you.
        for (const [dx, dy] of [[-0.32, 0.32], [0.32, 0.32], [0, 0.88], [-0.32, 1.44], [0.32, 1.44], [0, 2.0]]) {
          part(GEO.log, kit.trunk, x + dx, dy, 0, 0.3, 0.3, 1.2);
          const end = part(GEO.log, kit.woodEnd, x + dx, dy, 0.61, 0.26, 0.26, 0.02);
          end.castShadow = false;
        }
      } else if (d === 'branch' || d === 'trail') {
        // A big spotty toadstool: chubby stem, round red cap, cream rim, white spots.
        part(GEO.trunk, kit.white, x, 0.65, 0, 0.85, 1.3, 0.85);
        part(GEO.cyl, kit.gills, x, 1.24, 0, 1.5, 0.1, 1.5);
        const cap = part(GEO.dome, kit.mushroom, x, 1.2, 0, 1.75, 1.45, 1.75);
        cap.castShadow = true;
        const a = 0.875;
        const h = 0.725;
        for (const [phi, theta, r] of [[0, 0, 0.3], [0.85, 1.57, 0.26], [0.95, 0.6, 0.22], [0.95, 2.55, 0.22], [0.55, 2.0, 0.18], [0.55, 1.1, 0.18], [1.2, 1.9, 0.16], [1.2, 1.2, 0.16]]) {
          const spot = part(GEO.sphere, kit.white, x + a * Math.sin(phi) * Math.cos(theta), 1.2 + h * Math.cos(phi), a * Math.sin(phi) * Math.sin(theta), r, r * 0.45, r);
          spot.rotation.set(Math.sin(phi) * Math.sin(theta) * 0.9, 0, -Math.sin(phi) * Math.cos(theta) * 0.9);
        }
      } else if (d === 'snow') {
        // A snowman.
        part(GEO.sphere, kit.snow, x, 0.5, 0, 1.15, 1.05, 1.15);
        part(GEO.sphere, kit.snow, x, 1.3, 0, 0.85, 0.8, 0.85);
        part(GEO.sphere, kit.snow, x, 1.95, 0, 0.62, 0.6, 0.62);
        part(GEO.cone, kit.carrot, x, 1.95, 0.42, 0.08, 0.36, 0.08).rotation.x = Math.PI / 2;
        part(GEO.sphere, kit.dark, x - 0.12, 2.05, 0.27, 0.08, 0.08, 0.06);
        part(GEO.sphere, kit.dark, x + 0.12, 2.05, 0.27, 0.08, 0.08, 0.06);
        part(GEO.cyl, kit.dark, x, 2.32, 0, 0.5, 0.06, 0.5);
        part(GEO.cyl, kit.dark, x, 2.48, 0, 0.32, 0.32, 0.32);
      } else {
        // A temple statue with glowing eyes.
        part(GEO.box, kit.stone, x, 1.1, 0, 1.25, 2.2, 1.2);
        part(GEO.box, kit.curb, x, 2.32, 0, 1.4, 0.25, 1.35);
        part(GEO.box, kit.glow, x - 0.25, 1.65, 0.61, 0.16, 0.1, 0.04).castShadow = false;
        part(GEO.box, kit.glow, x + 0.25, 1.65, 0.61, 0.16, 0.1, 0.04).castShadow = false;
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Characters
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
  /** Knees and elbows (the lower half of each leg), for legs that bend. */
  joints?: { legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group };
  /** The squirrel's head, which bobs as it gallops. */
  head?: THREE.Group;
  /** How it runs: 'run' (on two legs, like a person) or 'quad' (on all fours, galloping). */
  gait?: 'run' | 'quad';
}

export function makeCharacterModel(character: 'lumberjack' | 'squirrel', outfit = ''): RunnerModel {
  const model = character === 'squirrel' ? makeSquirrelModel(outfit) : makeLumberjackModel(outfit);
  outline(model.root);
  return model;
}

type PartFn = (m: THREE.Material, parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number) => THREE.Mesh;

function characterKit(): { root: THREE.Group; body: THREE.Group; part: PartFn; limb: (x: number, y: number, z?: number) => THREE.Group } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const part: PartFn = (m, parent, geo, x, y, z, sx, sy, sz) => {
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
  return { root, body, part, limb };
}

/** A red-and-black check pattern for the lumberjack's shirt. */
function plaidTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#d8342c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(30,20,30,0.55)';
  g.fillRect(0, 0, 64, 22);
  g.fillRect(0, 0, 22, 64);
  g.fillStyle = 'rgba(30,20,30,0.35)';
  g.fillRect(40, 0, 6, 64);
  g.fillRect(0, 40, 64, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** The lumberjack: check shirt, braces, beanie and a big beard. Faces -Z, origin at the feet. */
export function makeLumberjackModel(outfit = 'beanie-orange'): RunnerModel {
  const { root, body, part, limb } = characterKit();
  const mat = (c: string, extra: THREE.MeshStandardMaterialParameters = {}) => std(c, { flatShading: false, roughness: 0.75, ...extra });
  const shirt = mat('#ffffff', { map: plaidTexture() });
  const jeans = mat('#3d5a9e');
  const boots = mat('#5a3a22');
  const skin = mat('#f6c99a');
  const beard = mat('#8a4f22');
  const beanie = mat(outfit === 'beanie-blue' ? '#3b82f6' : '#ff9f1c');
  const braces = mat('#2b2b3d');
  const roll = mat('#3fa66a');

  const legL = limb(-0.18, 0.74);
  const legR = limb(0.18, 0.74);
  for (const leg of [legL, legR]) {
    part(jeans, leg, GEO.box, 0, -0.34, 0, 0.28, 0.7, 0.3);
    part(boots, leg, GEO.box, 0, -0.7, -0.06, 0.32, 0.16, 0.42);
  }

  part(shirt, body, GEO.box, 0, 1.08, 0, 0.74, 0.7, 0.46);
  part(jeans, body, GEO.box, 0, 0.78, 0, 0.72, 0.14, 0.44);
  for (const x of [-0.18, 0.18]) {
    part(braces, body, GEO.box, x, 1.1, -0.235, 0.07, 0.62, 0.02);
    part(braces, body, GEO.box, x, 1.1, 0.235, 0.07, 0.62, 0.02);
  }
  // A rolled sleeping mat on his back, so you can tell which way he faces.
  part(roll, body, GEO.cyl, 0, 1.3, 0.32, 0.26, 0.62, 0.26).rotation.z = Math.PI / 2;

  part(skin, body, GEO.sphere, 0, 1.66, 0, 0.6, 0.6, 0.6);
  part(beard, body, GEO.sphere, 0, 1.52, -0.14, 0.5, 0.44, 0.4);
  part(skin, body, GEO.sphere, 0, 1.68, -0.29, 0.12, 0.1, 0.1);
  part(braces, body, GEO.sphere, -0.12, 1.76, -0.26, 0.07, 0.07, 0.05);
  part(braces, body, GEO.sphere, 0.12, 1.76, -0.26, 0.07, 0.07, 0.05);
  hat(outfit, body, part, mat, beanie);
  part(mat('#ffffff'), body, GEO.sphere, 0, 2.06, 0, 0.16, 0.16, 0.16);

  const armL = limb(-0.46, 1.36);
  const armR = limb(0.46, 1.36);
  for (const arm of [armL, armR]) {
    part(shirt, arm, GEO.box, 0, -0.28, 0, 0.2, 0.6, 0.22);
    part(skin, arm, GEO.box, 0, -0.62, 0, 0.19, 0.15, 0.19);
  }

  return { root, body, legL, legR, armL, armR };
}

type ModelPart = (m: THREE.Material, parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number) => THREE.Mesh;
type MatFn = (c: string) => THREE.Material;

/** The lumberjack's headwear: beanie (two colours), cap, viking helmet or crown. */
function hat(outfit: string, body: THREE.Group, part: ModelPart, mat: MatFn, beanie: THREE.Material): void {
  if (outfit === 'cap-green') {
    const green = mat('#2fa84f');
    part(green, body, GEO.sphere, 0, 1.86, 0, 0.62, 0.34, 0.62);
    part(green, body, GEO.box, 0, 1.84, -0.36, 0.5, 0.05, 0.3);
  } else if (outfit === 'viking') {
    const steel = mat('#b9c6d6');
    const horn = mat('#fff3d6');
    part(steel, body, GEO.sphere, 0, 1.86, 0, 0.66, 0.44, 0.66);
    for (const side of [-1, 1]) part(horn, body, GEO.cone, side * 0.38, 2.04, 0, 0.1, 0.36, 0.1).rotation.z = -side * 0.7;
  } else if (outfit === 'crown-lumberjack') {
    part(beanie, body, GEO.sphere, 0, 1.84, 0, 0.6, 0.3, 0.6);
    crown(body, part, mat, 1.96, 0.4);
  } else {
    part(beanie, body, GEO.sphere, 0, 1.86, 0, 0.62, 0.38, 0.62);
    part(beanie, body, GEO.cyl, 0, 1.82, 0, 0.64, 0.12, 0.64);
  }
}

function crown(body: THREE.Group, part: ModelPart, mat: MatFn, y: number, r: number): void {
  const gold = mat('#ffc93c');
  part(gold, body, GEO.cyl, 0, y, 0, r * 2, 0.16, r * 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(gold, body, GEO.cone, Math.cos(a) * r * 0.85, y + 0.16, Math.sin(a) * r * 0.85, 0.08, 0.2, 0.08);
  }
}

/** A unit capsule (radius 1, length 1 along Y) for rounded legs. */
const LIMB = new THREE.CapsuleGeometry(1, 1, 4, 10);

const TAIL_MATERIAL = std('#d9692a', { flatShading: false, roughness: 0.8 });
let tailGeometry: THREE.BufferGeometry | null = null;

/**
 * The squirrel's tail as one smooth tube along an S-curve, fat in the middle,
 * with a ruffled edge for fur.
 */
function squirrelTailGeometry(): THREE.BufferGeometry {
  if (tailGeometry) return tailGeometry;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.3, 0.32),
    new THREE.Vector3(0, 0.78, 0.5),
    new THREE.Vector3(0, 1.25, 0.38),
    new THREE.Vector3(0, 1.58, 0.06),
    new THREE.Vector3(0, 1.62, -0.28),
    new THREE.Vector3(0, 1.45, -0.42),
  ]);
  const tubular = 40;
  const radial = 14;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, centre);
    // Thin at the root, fat through the middle, a rounded tuft at the end.
    const r = 0.1 + 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.04)), 0.6);
    for (let k = 0; k <= radial; k++) {
      const j = i * (radial + 1) + k;
      const fluff = 1 + 0.12 * Math.sin(k * 2.7 + i * 1.3) * Math.min(1, t * 4);
      v.fromBufferAttribute(pos, j).sub(centre).multiplyScalar(r * fluff).add(centre);
      pos.setXYZ(j, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  tailGeometry = geo;
  return geo;
}

/**
 * Sanök the squirrel, on all fours: a long low body, big haunches, white legs
 * and belly, a head held up on a short neck with tufted ears, and a bushy S
 * tail. Faces -Z, origin at the feet. Runs with a gallop (see runner.ts).
 */
export function makeSquirrelModel(outfit = 'scarf-teal'): RunnerModel {
  const { root, body, part } = characterKit();
  const mat = (c: string) => std(c, { flatShading: false, roughness: 0.75 });
  const fur = mat('#c8561f');
  const tailTip = mat('#ffe2b8');
  const white = mat('#ffffff');
  const dark = mat('#2b2b3d');
  const tuft = mat('#7a3414');
  const pink = mat('#ff9aa8');
  const scarf = mat(outfit === 'scarf-red' ? '#e8423a' : '#3ac6b0');

  // Long, low body with a pale belly.
  part(fur, body, GEO.sphere, 0, 0.78, 0.02, 0.74, 0.62, 1.3);
  part(white, body, GEO.sphere, 0, 0.64, -0.28, 0.5, 0.42, 0.78);

  // Legs. Each pivots at the hip or shoulder; the runner swings them.
  const pivot = (x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    body.add(g);
    return g;
  };
  // Legs with real joints, so they bend instead of swinging like sticks.
  // Hind: furry haunch on the hip, then a knee with a slim shin and a long
  // foot. Front: upper leg, then an elbow with the forearm and a round paw.
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const legL = pivot(-0.24, 0.82, 0.36);
  const legR = pivot(0.24, 0.82, 0.36);
  const knees: THREE.Group[] = [];
  for (const leg of [legL, legR]) {
    part(fur, leg, GEO.sphere, 0, -0.1, 0.02, 0.34, 0.5, 0.52);
    const knee = joint(leg, 0, -0.3, -0.1);
    // Shin slants back from the knee to the heel; the long foot runs forward from the heel.
    part(white, knee, LIMB, 0, -0.2, 0.1, 0.07, 0.3, 0.07).rotation.x = -0.35;
    part(white, knee, LIMB, 0, -0.44, -0.02, 0.066, 0.26, 0.066).rotation.x = Math.PI / 2;
    knees.push(knee);
  }
  const armL = pivot(-0.2, 0.72, -0.48);
  const armR = pivot(0.2, 0.72, -0.48);
  const elbows: THREE.Group[] = [];
  for (const arm of [armL, armR]) {
    part(white, arm, LIMB, 0, -0.17, 0, 0.068, 0.3, 0.068);
    const elbow = joint(arm, 0, -0.34, 0);
    part(white, elbow, LIMB, 0, -0.15, 0, 0.062, 0.24, 0.062);
    part(white, elbow, GEO.sphere, 0, -0.33, -0.05, 0.16, 0.09, 0.22);
    elbows.push(elbow);
  }

  // Head up on a short neck, so it shows over the back from behind.
  const head = pivot(0, 1.06, -0.62);
  part(fur, head, GEO.sphere, 0, 0.02, 0.12, 0.42, 0.44, 0.5);
  part(scarf, head, GEO.cyl, 0, -0.08, 0.14, 0.5, 0.12, 0.5);
  part(fur, head, GEO.sphere, 0, 0.26, -0.08, 0.56, 0.5, 0.58);
  part(white, head, GEO.sphere, -0.13, 0.17, -0.3, 0.22, 0.18, 0.2);
  part(white, head, GEO.sphere, 0.13, 0.17, -0.3, 0.22, 0.18, 0.2);
  part(pink, head, GEO.sphere, 0, 0.22, -0.39, 0.08, 0.07, 0.07);
  part(dark, head, GEO.sphere, -0.17, 0.33, -0.27, 0.1, 0.12, 0.08);
  part(dark, head, GEO.sphere, 0.17, 0.33, -0.27, 0.1, 0.12, 0.08);
  // Rounded ears with the dark tufts squirrels have.
  for (const side of [-1, 1]) {
    part(fur, head, GEO.sphere, side * 0.16, 0.54, -0.02, 0.15, 0.24, 0.1);
    const t = part(tuft, head, new THREE.ConeGeometry(0.06, 0.2, 5), side * 0.18, 0.71, -0.02, 1, 1, 1);
    t.rotation.z = -side * 0.25;
  }

  // The bushy S tail rises from the rump and leans out to the right, so the
  // head stays visible from behind. Compact: about head height.
  const tail = pivot(0.12, 0.86, 0.66);
  const plume = new THREE.Group();
  plume.rotation.set(0.25, 0, -0.62);
  plume.scale.set(0.8, 0.66, 0.8);
  tail.add(plume);
  part(TAIL_MATERIAL, plume, squirrelTailGeometry(), 0, 0, 0, 1, 1, 1);
  part(tailTip, plume, GEO.sphere, 0, 1.47, -0.42, 0.36, 0.34, 0.36);
  part(tailTip, plume, GEO.sphere, 0.02, 1.6, -0.25, 0.3, 0.26, 0.3);

  // Accessories from the shop sit on the head.
  if (outfit === 'sunglasses') {
    for (const x of [-0.15, 0.15]) part(dark, head, GEO.box, x, 0.33, -0.31, 0.2, 0.12, 0.04);
    part(dark, head, GEO.box, 0, 0.35, -0.31, 0.12, 0.03, 0.03);
  } else if (outfit === 'flower') {
    const petal = mat('#ffffff');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(petal, head, GEO.sphere, 0.2 + Math.cos(a) * 0.1, 0.52 + Math.sin(a) * 0.1, -0.14, 0.12, 0.12, 0.06);
    }
    part(mat('#ffd23f'), head, GEO.sphere, 0.2, 0.52, -0.17, 0.1, 0.1, 0.06);
  } else if (outfit === 'crown-squirrel') {
    crown(head, part, mat, 0.52, 0.32);
  }

  return { root, body, legL, legR, armL, armR, tail, head, gait: 'quad', joints: { legL: knees[0], legR: knees[1], armL: elbows[0], armR: elbows[1] } };
}

const BUBBLE = new THREE.MeshBasicMaterial({ color: '#d9f3ff', transparent: true, opacity: 0.35, depthWrite: false });
const POWER = {
  red: toon('#ef4444', { emissive: '#7a1010', emissiveIntensity: 0.4 }),
  steel: toon('#e5edf5'),
  blue: toon('#3b82f6', { emissive: '#10307a', emissiveIntensity: 0.4 }),
  gold: COIN_MATERIAL,
  white: toon('#ffffff'),
};
const HALF_TORUS = new THREE.TorusGeometry(0.26, 0.09, 8, 16, Math.PI);

/** A power-up floating in a soap bubble: magnet, shield or double coins. */
function buildPowerup(kind: 'magnet' | 'shield' | 'double'): THREE.Group {
  const g = new THREE.Group();
  g.userData.powerup = true;
  g.userData.keep = true;
  const icon = new THREE.Group();
  g.add(icon);
  const piece = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    icon.add(mesh);
    return mesh;
  };
  if (kind === 'magnet') {
    piece(HALF_TORUS, POWER.red, 0, 0.05, 0, 1, 1, 1).rotation.z = Math.PI;
    for (const x of [-0.26, 0.26]) piece(GEO.box, POWER.steel, x, 0.14, 0, 0.18, 0.16, 0.18);
  } else if (kind === 'shield') {
    piece(GEO.cyl, POWER.blue, 0, 0, 0, 0.62, 0.1, 0.62).rotation.x = Math.PI / 2;
    piece(GEO.box, POWER.white, 0, 0, 0.06, 0.08, 0.34, 0.02);
    piece(GEO.box, POWER.white, 0, 0.04, 0.06, 0.26, 0.08, 0.02);
  } else {
    for (const [x, y] of [[-0.1, -0.05], [0.12, 0.08]]) piece(GEO.coin, POWER.gold, x, y, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  }
  outline(icon);
  const bubble = new THREE.Mesh(GEO.sphere, BUBBLE);
  bubble.scale.setScalar(1.15);
  g.add(bubble);
  return g;
}

/** Spin coins and flicker fire jets. Called once per frame with the visible segments. */
export function animateSegment(group: THREE.Group, time: number): void {
  for (const child of group.children) {
    if (child.userData.coin) {
      if (child.userData.spin === 'y') child.rotation.y = time * 3;
      else child.rotation.z = time * 4;
    } else if (child.userData.portal) child.rotation.z = time * 1.5;
    else if (child.userData.powerup) {
      child.children[0].rotation.y = time * 2.5;
      child.position.y = 1.1 + Math.sin(time * 3 + child.id) * 0.12;
    }
    else if (child.children.length) {
      for (const part of child.children) {
        if (part.userData.flicker) part.scale.y = 0.34 * (0.8 + Math.sin(time * 30 + part.id) * 0.25);
      }
    }
  }
}
