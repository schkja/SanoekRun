/**
 * Worlds: the themed stretches of track you run through.
 *
 * Every world is a block of plain data in `content/worlds.json` — colours,
 * which chaser hunts you, which scenery to draw, the path style and how often
 * each obstacle appears. Each character has its own route: a list of world ids
 * played in order, then looped (faster each time).
 *
 *   lumberjack: wooden boardwalks over the forest, the temple, the lava cave
 *   squirrel:   along the branches of giant trees, then the snowy pines
 *
 * To add a world: add it to `worlds` and put its id in a route. Reusing an
 * existing `decor`, `chaser` and `path.style` needs no code.
 */

import data from '../../content/worlds.json';
import type { Character } from './settings';

export type ObstacleKind = 'low' | 'high' | 'gap' | 'block';
export type ChaserKind = 'monster' | 'lava' | 'bear' | 'hawk' | 'owl' | 'snowball' | 'bees';
export type DecorKind = 'jungle' | 'lava' | 'boardwalk' | 'branch' | 'snow' | 'trail' | 'brook';
export type PathStyle = 'stone' | 'planks' | 'bark' | 'snow' | 'trail';

export interface WorldTheme {
  /** Sky colour at the top of the screen and at the horizon. */
  skyTop: string;
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  /** Colour of what lies far below the path (forest floor, lava…). */
  abyss: string;
  /** True when the depths glow (lava) instead of fading into haze. */
  abyssGlow: boolean;
  /** Portal and highlight colour. */
  accent: string;
  /** True for worlds on the forest floor: the `abyss` colour becomes grass right under the path. */
  ground?: boolean;
  /** Height of the plane far below (default −22); a brook puts its water at about −1.2. */
  abyssY?: number;
  /** Night: fireflies and glowing mushrooms in the scenery. */
  night?: boolean;
  /** Painted into the sky: stars, a moon, or a low sun (its colour) for sunset and sunrise. */
  stars?: boolean;
  moon?: boolean;
  sunDisc?: string;
  /** Something falling from the sky around you. */
  weather?: 'rain' | 'snow' | 'petals' | 'leaves';
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
  path: { style: PathStyle; slab: string; grout: string; body: string; curb: string };
  /** Scenery colours: leaves (three shades) and tree trunks. */
  palette: { leaves: [string, string, string]; trunk: string };
  /** Relative weights: higher = appears more often. */
  obstacles: Record<ObstacleKind, number>;
}

export const WORLDS = data.worlds as WorldDef[];
const BY_ID = new Map(WORLDS.map((w) => [w.id, w]));

/** The three worlds you can pick, each a route through several areas. */
export type RouteId = 'forest' | 'boardwalk' | 'honey';
export const ROUTES: RouteId[] = ['forest', 'boardwalk', 'honey'];

export function route(id: RouteId): WorldDef[] {
  const ids = (data.routes as Record<string, string[]>)[id] ?? data.routes.forest;
  return ids.map((wid) => {
    const world = BY_ID.get(wid);
    if (!world) throw new Error(`[worlds] Route "${id}" names unknown world "${wid}".`);
    return world;
  });
}

/**
 * Who chases you: the hero's own enemy (the bear after the lumberjack, the
 * hawk after the squirrel, or the owl at night, the bees after the bear),
 * except where the place itself is the danger: the temple beast, the lava
 * flood and the snowball keep chasing whoever runs there.
 */
export function chaserFor(world: WorldDef, character: Character): ChaserKind {
  if (world.chaser === 'monster' || world.chaser === 'lava' || world.chaser === 'snowball') return world.chaser;
  if (character === 'lumberjack') return 'bear';
  if (character === 'bear') return 'bees';
  return world.theme.night ? 'owl' : 'hawk';
}

export interface WorldSlot {
  /** 1 for the first world of a run, 2 for the next, and so on. */
  number: number;
  def: WorldDef;
}

/** Which world of a route a given distance along the track belongs to. */
export function worldForDistance(worlds: WorldDef[], distance: number): WorldSlot {
  let start = 0;
  let i = 0;
  for (;;) {
    const def = worlds[i % worlds.length];
    if (distance < start + def.length) return { number: i + 1, def };
    start += def.length;
    i++;
  }
}

/** Where a world first starts on a route, for the `?world=` debug shortcut. */
export function distanceOfWorld(worlds: WorldDef[], id: string): number {
  let start = 0;
  for (const w of worlds) {
    if (w.id === id) return start;
    start += w.length;
  }
  return 0;
}
