/**
 * The track: an endless chain of straight segments joined by 90° corners.
 *
 * Each segment starts at a corner (its `start` point, the centre of the corner
 * square), runs straight along its heading for `length` metres to the next
 * corner, and there the path turns left or right. Positions on the track are
 * described as (segment, s, x): `s` is metres along the segment, `x` metres to
 * the right of the centre line.
 *
 * Headings are limited to north, east and west — never back south — so the
 * path always makes progress and can never cross itself.
 *
 * Segments are generated just ahead of the runner and their meshes are thrown
 * away once they're behind, so the track is endless but memory stays flat.
 */

import * as THREE from 'three';
import { TUNING, difficultyAt, speedAt } from './tuning';
import { WORLDS, worldForDistance, type ObstacleKind, type WorldDef } from './worlds';
import { buildSegmentMesh, disposeSegmentMesh } from './visuals';

/** 0 = north (-Z), 1 = east (+X), 2 = south, 3 = west. */
export type Heading = 0 | 1 | 2 | 3;
export type TurnDir = -1 | 1;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function headingDir(h: Heading, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(DIRS[h][0], 0, DIRS[h][1]);
}

export function headingRight(h: Heading, out = new THREE.Vector3()): THREE.Vector3 {
  return headingDir(((h + 1) % 4) as Heading, out);
}

/** Rotation around Y that points a model built facing -Z along heading `h`. */
export function headingYaw(h: Heading): number {
  return (-h * Math.PI) / 2;
}

export function turned(h: Heading, turn: TurnDir): Heading {
  return ((h + (turn === 1 ? 1 : 3)) % 4) as Heading;
}

export interface Obstacle {
  kind: ObstacleKind;
  /** Start and end along the segment. */
  s0: number;
  s1: number;
  /** Which of the three lanes (left, centre, right) it blocks. */
  lanes: [boolean, boolean, boolean];
  hit: boolean;
  passed: boolean;
  /** Set when the player dodged at the last moment. */
  closeCall: boolean;
  /** For the first-run hints. */
  hinted: boolean;
  object: THREE.Object3D | null;
}

export interface Coin {
  s: number;
  x: number;
  y: number;
  taken: boolean;
  object: THREE.Object3D | null;
}

export type PowerupKind = 'magnet' | 'shield' | 'double';

export interface Powerup {
  kind: PowerupKind;
  s: number;
  x: number;
  taken: boolean;
  object: THREE.Object3D | null;
}

export interface Segment {
  index: number;
  /** Centre of the corner this segment starts from (y = 0, the running surface). */
  start: THREE.Vector3;
  heading: Heading;
  length: number;
  /** Which way the path turns at the end. */
  turn: TurnDir;
  /** Which way the previous segment turned to get here (null for the first). */
  arrivedBy: TurnDir | null;
  world: WorldDef;
  worldNumber: number;
  /** Track distance at the start of this segment. */
  startDistance: number;
  /** Stretches of solid floor, as [from, to] along s. Gaps are what's missing. */
  floor: Array<[number, number]>;
  obstacles: Obstacle[];
  coins: Coin[];
  powerups: Powerup[];
  /** Where the portal into this world stands, if this segment opens a new world. */
  portalAt: number | null;
  portalPassed: boolean;
  group: THREE.Group | null;
}

export class Track {
  readonly segments: Segment[] = [];
  readonly root = new THREE.Group();
  private readonly scratch = new THREE.Vector3();
  /** The worlds this run passes through, in order (the chosen character's route). */
  private worlds: WorldDef[] = WORLDS;
  /** Start the run part-way along the route — used by the `?world=` shortcut. */
  private worldOffset = 0;

  reset(worlds: WorldDef[] = this.worlds, worldOffset = 0): void {
    for (const seg of this.segments) this.dropMesh(seg);
    this.segments.length = 0;
    this.worlds = worlds;
    this.worldOffset = worldOffset;
    this.generate();
  }

  get first(): Segment {
    return this.segments[0];
  }

  /** The segment after `seg`, generating it if needed. */
  next(seg: Segment): Segment {
    while (this.segments.length <= seg.index + 1) this.generate();
    return this.segments[seg.index + 1];
  }

  /** Keep the track built ahead of the runner and drop what's far behind. */
  maintain(seg: Segment, s: number): void {
    let ahead = seg.length - s;
    let last = seg;
    while (ahead < TUNING.lookahead) {
      last = this.next(last);
      ahead += last.length;
    }
    for (let i = 0; i < seg.index - 2; i++) this.dropMesh(this.segments[i]);
  }

  /** World position of a point on the track. */
  position(seg: Segment, s: number, x: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(seg.start).addScaledVector(headingDir(seg.heading, this.scratch), s);
    return out.addScaledVector(headingRight(seg.heading, this.scratch), x);
  }

  /**
   * A point on the centre line `s` metres along `seg`, where s may run off
   * either end — it walks back (or forward) through neighbouring segments.
   * The chaser uses this to follow you round corners.
   */
  sample(seg: Segment, s: number, out: THREE.Vector3): Heading {
    let current = seg;
    let along = s;
    while (along < 0 && current.index > 0) {
      current = this.segments[current.index - 1];
      along += current.length;
    }
    while (along > current.length && this.segments[current.index + 1]) {
      along -= current.length;
      current = this.segments[current.index + 1];
    }
    this.position(current, Math.max(along, current.index === 0 ? -20 : 0), 0, out);
    return current.heading;
  }

  /** Is there solid floor under this point? */
  hasFloor(seg: Segment, s: number, x: number): boolean {
    if (Math.abs(x) > TUNING.pathWidth / 2 + 0.2) return false;
    for (const [a, b] of seg.floor) if (s >= a && s <= b) return true;
    return false;
  }

  private dropMesh(seg: Segment): void {
    if (!seg.group) return;
    this.root.remove(seg.group);
    disposeSegmentMesh(seg.group);
    seg.group = null;
    for (const o of seg.obstacles) o.object = null;
    for (const c of seg.coins) c.object = null;
    for (const p of seg.powerups) p.object = null;
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  private generate(): Segment {
    const T = TUNING;
    const prev = this.segments[this.segments.length - 1];
    const first = !prev;

    const start = prev
      ? this.position(prev, prev.length, 0, new THREE.Vector3())
      : new THREE.Vector3(0, 0, 0);
    const heading: Heading = prev ? turned(prev.heading, prev.turn) : 0;
    const startDistance = prev ? prev.startDistance + prev.length : 0;
    const length = first ? T.segment.startLength : rand(T.segment.minLength, T.segment.maxLength);

    // North can turn either way; east and west must turn back north.
    const turn: TurnDir = heading === 0 ? (Math.random() < 0.5 ? -1 : 1) : heading === 1 ? -1 : 1;

    const slot = worldForDistance(this.worlds, startDistance + this.worldOffset);
    const portalAt = prev && slot.number !== prev.worldNumber ? 7 : null;

    const seg: Segment = {
      index: this.segments.length,
      start,
      heading,
      length,
      turn,
      arrivedBy: prev ? prev.turn : null,
      world: slot.def,
      worldNumber: slot.number,
      startDistance,
      floor: [],
      obstacles: [],
      coins: [],
      powerups: [],
      portalAt,
      portalPassed: false,
      group: null,
    };

    this.placeObstacles(seg, first);
    this.buildFloor(seg, first);
    this.placeCoins(seg);
    this.placePowerup(seg);

    this.segments.push(seg);
    seg.group = buildSegmentMesh(seg);
    this.root.add(seg.group);
    return seg;
  }

  private placeObstacles(seg: Segment, first: boolean): void {
    const T = TUNING;
    const d = difficultyAt(seg.startDistance);
    // Spacing is measured in seconds of running, so it stays fair as speed rises.
    const speed = speedAt(seg.startDistance);
    const spacing = lerp(T.segment.spacingEasy, T.segment.spacingHard, d) * speed;
    const gapLength = lerp(T.segment.gapLengthEasy, T.segment.gapLengthHard, d);
    // After anything you jump, leave room to land and react before the next one.
    const jumpLength = ((2 * T.jumpSpeed) / T.gravity) * speed;
    const afterJump = jumpLength + speed * 0.4;

    let s = first ? 32 : Math.max(T.segment.clearAfterTurn, speed * 0.75) + (seg.portalAt !== null ? 12 : 0);
    const end = seg.length - T.pathWidth / 2 - T.segment.clearBeforeTurn;

    while (s < end) {
      const kind = pickWeighted(seg.world.obstacles);
      const depth = kind === 'gap' ? gapLength : kind === 'block' ? 1.3 : kind === 'low' ? 0.8 : 0.6;
      if (s + depth > end) break;

      let lanes: [boolean, boolean, boolean] = [true, true, true];
      if (kind === 'block') {
        // Block one or two lanes, always leaving a way through.
        const open = Math.floor(Math.random() * 3);
        const two = Math.random() < 0.35 + d * 0.4;
        lanes = [0, 1, 2].map((i) => (two ? i !== open : i === (open + 1) % 3)) as [boolean, boolean, boolean];
      }

      seg.obstacles.push({
        kind,
        s0: s,
        s1: s + depth,
        lanes,
        hit: false,
        passed: false,
        closeCall: false,
        hinted: false,
        object: null,
      });
      const room = spacing * rand(0.9, 1.4);
      s += depth + (kind === 'low' || kind === 'gap' ? Math.max(room, afterJump) : room);
    }
  }

  private buildFloor(seg: Segment, first: boolean): void {
    const W = TUNING.pathWidth;
    let from = first ? -16 : -W / 2;
    for (const o of seg.obstacles) {
      if (o.kind !== 'gap') continue;
      seg.floor.push([from, o.s0]);
      from = o.s1;
    }
    seg.floor.push([from, seg.length + W / 2]);
  }

  /** Now and then, a power-up in an open stretch between obstacles. */
  private placePowerup(seg: Segment): void {
    if (seg.index < 2 || Math.random() > TUNING.powerupChance) return;
    const stops = [T0(seg), ...seg.obstacles.map((o) => o.s1 + 3)];
    const ends = [...seg.obstacles.map((o) => o.s0 - 3), seg.length - TUNING.pathWidth / 2 - 4];
    const spots = stops.map((a, i) => [a, ends[i]] as const).filter(([a, b]) => b - a > 6);
    if (!spots.length) return;
    const [a, b] = spots[Math.floor(Math.random() * spots.length)];
    const s = (a + b) / 2;
    const x = (Math.floor(Math.random() * 3) - 1) * TUNING.laneOffset;
    // Don't bury it in a line of coins.
    seg.coins = seg.coins.filter((c) => !(Math.abs(c.s - s) < 2 && Math.abs(c.x - x) < 0.5));
    const kinds: PowerupKind[] = ['magnet', 'shield', 'double'];
    seg.powerups.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], s, x, taken: false, object: null });
  }

  private placeCoins(seg: Segment): void {
    const T = TUNING;
    const lane = (i: number) => (i - 1) * T.laneOffset;
    const runSpeed = speedAt(seg.startDistance);

    // Free stretches between obstacles: a line of coins in one lane. If the
    // next obstacle is a block, the coins sit in the open lane — they show the
    // way through.
    let cursor = seg.index === 0 ? 12 : T.segment.clearAfterTurn * 0.6;
    const stops = [...seg.obstacles, null];
    for (const next of stops) {
      const until = next ? next.s0 - 2.5 : seg.length - T.pathWidth / 2 - 3;
      if (until - cursor > 6 && Math.random() < 0.7) {
        let laneIndex = Math.floor(Math.random() * 3);
        if (next?.kind === 'block') {
          const open = next.lanes.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0);
          laneIndex = open[Math.floor(Math.random() * open.length)];
        }
        const count = Math.min(8, Math.floor((until - cursor) / 2));
        const startS = until - (count - 1) * 2;
        for (let i = 0; i < count; i++) {
          seg.coins.push({ s: startS + i * 2, x: lane(laneIndex), y: 1, taken: false, object: null });
        }
      }

      // Over jumps: an arc of coins that traces the jump.
      if (next && (next.kind === 'low' || next.kind === 'gap') && Math.random() < 0.55) {
        const air = (2 * T.jumpSpeed) / T.gravity;
        const span = runSpeed * air;
        const mid = (next.s0 + next.s1) / 2;
        const laneIndex = Math.floor(Math.random() * 3);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1)) * air;
          const height = T.jumpSpeed * t - 0.5 * T.gravity * t * t;
          seg.coins.push({ s: mid - span / 2 + (i / (n - 1)) * span, x: lane(laneIndex), y: 1 + height, taken: false, object: null });
        }
      }
      if (next) cursor = next.s1 + 3;
    }
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Where obstacles may start after a corner on this segment. */
function T0(seg: Segment): number {
  return seg.index === 0 ? 12 : TUNING.segment.clearAfterTurn;
}



function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pickWeighted<K extends string>(weights: Record<K, number>): K {
  const entries = Object.entries(weights) as Array<[K, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}
