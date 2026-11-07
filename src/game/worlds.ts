/**
 * Worlds: the themed stretches of track you run through.
 *
 * Every world is a block of plain data in `content/worlds.json` — colours,
 * which chaser hunts you, which scenery to draw and how often each obstacle
 * appears. Worlds play in order and then loop, getting faster each time.
 *
 * To add a world: add an entry to worlds.json. If it uses an existing `decor`
 * and `chaser` (jungle/lava, monster/lava) that's all. A brand-new look means
 * adding a case in `visuals.ts` (decor) or `chaser.ts` (chaser).
 */

import data from '../../content/worlds.json';

export type ObstacleKind = 'low' | 'high' | 'gap' | 'block';
export type ChaserKind = 'monster' | 'lava';
export type DecorKind = 'jungle' | 'lava';

export interface WorldTheme {
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  hemiSky: string;
  hemiGround: string;
  /** Colour of the void under the path. */
  abyss: string;
  /** True when the void glows (lava) instead of being dark. */
  abyssGlow: boolean;
  /** Portal and highlight colour. */
  accent: string;
}

export interface WorldDef {
  id: string;
  name: string;
  /** Metres of track before the portal to the next world. */
  length: number;
  chaser: ChaserKind;
  /** Title of the end screen when this world's chaser gets you. */
  caughtBy: string;
  decor: DecorKind;
  theme: WorldTheme;
  path: { slab: string; grout: string; body: string; curb: string };
  /** Relative weights: higher = appears more often. */
  obstacles: Record<ObstacleKind, number>;
}

export const WORLDS = data.worlds as WorldDef[];

export interface WorldSlot {
  /** 1 for the first world of a run, 2 for the next, and so on. */
  number: number;
  def: WorldDef;
}

/** Which world a given distance along the track belongs to. */
export function worldForDistance(distance: number): WorldSlot {
  let start = 0;
  let i = 0;
  for (;;) {
    const def = WORLDS[i % WORLDS.length];
    if (distance < start + def.length) return { number: i + 1, def };
    start += def.length;
    i++;
  }
}
