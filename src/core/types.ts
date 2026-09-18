/**
 * Shared type definitions.
 *
 * These types describe the shape of everything in `content/` — the JSON files
 * you edit to add levels, items and enemies. If you add a field to a JSON file,
 * add it here too and TypeScript will tell you everywhere it needs handling.
 */

/** A position or size in 3D space, written as [x, y, z] in the JSON files. */
export type Vec3 = [number, number, number];

/** A hex colour like "#44d9e8". */
export type HexColor = string;

// ---------------------------------------------------------------------------
// Items  (content/items.json)
// ---------------------------------------------------------------------------

/**
 * What happens when the player touches an item.
 * To add a new one: add the name here, then register its handler in
 * `content/registry.ts` → `itemEffects`.
 */
export type ItemEffectName = 'score' | 'life' | 'speed' | 'jump' | 'time';

export interface ItemDef {
  /** Unique id, referenced from a level's `pickups` list. */
  id: string;
  /** Shown in the pickup toast when collected. */
  label: string;
  /** What it does. Handlers live in content/registry.ts. */
  effect: ItemEffectName;
  /** Effect strength: points for 'score', multiplier for 'speed'/'jump', seconds for 'time'. */
  value: number;
  /** For timed effects ('speed', 'jump'): how long it lasts, in seconds. */
  duration?: number;
  /** Colour of the placeholder shape, and of the glow. */
  color: HexColor;
  /** Placeholder shape used when no model is given. */
  shape?: 'sphere' | 'box' | 'gem' | 'ring';
  /** Optional .glb file in public/models/. Falls back to `shape` if missing. */
  model?: string;
  /** Size multiplier for the placeholder shape. Default 1. */
  scale?: number;
  /** Sound key played on pickup. See src/core/audio.ts. */
  sound?: string;
}

// ---------------------------------------------------------------------------
// Enemies  (content/enemies.json)
// ---------------------------------------------------------------------------

/**
 * How an enemy moves.
 * To add a new one: add the name here, then register it in
 * `content/registry.ts` → `enemyBehaviors`.
 */
export type EnemyBehaviorName = 'patrol' | 'chase' | 'hover' | 'spinner' | 'static';

export interface EnemyDef {
  /** Unique id, referenced from a level's `enemies` list. */
  id: string;
  label: string;
  behavior: EnemyBehaviorName;
  /** Movement speed in units per second. */
  speed: number;
  /** Hits it takes before dying. Stomping deals 1. */
  health: number;
  /** Points awarded for defeating it. */
  points: number;
  /** Collision box size [w, h, d]. */
  size: Vec3;
  color: HexColor;
  shape?: 'sphere' | 'box' | 'gem' | 'ring';
  model?: string;
  /** If true the player cannot stomp it and always takes damage. Default false. */
  spiky?: boolean;
  /** Behaviour-specific tuning, e.g. { "range": 8 } for 'chase'. */
  params?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Levels  (content/levels/*.json)
// ---------------------------------------------------------------------------

export interface PlatformDef {
  /** Centre of the top face. The platform hangs below this point. */
  position: Vec3;
  /** [width, height, depth]. */
  size: Vec3;
  color?: HexColor;
  model?: string;
  /** Makes the platform move back and forth between position and position+offset. */
  move?: {
    offset: Vec3;
    /** Seconds for one full round trip. */
    duration: number;
  };
  /** 'ice' = slippery, 'bounce' = trampoline, 'hurt' = damages on touch. */
  surface?: 'normal' | 'ice' | 'bounce' | 'hurt';
}

export interface PickupPlacement {
  /** An `id` from content/items.json. */
  item: string;
  position: Vec3;
  /** Place several copies in a line, evenly spaced towards `to`. */
  repeat?: { count: number; to: Vec3 };
}

export interface EnemyPlacement {
  /** An `id` from content/enemies.json. */
  enemy: string;
  /**
   * Where it stands. Like a platform's `position`, the y is the SURFACE it
   * rests on — use the same y as the platform underneath and the enemy sits
   * neatly on top. Flying enemies ('hover') bob around that height.
   */
  position: Vec3;
  /** For 'patrol': the far end of the patrol route. Same y convention. */
  patrolTo?: Vec3;
  /** Overrides for this one instance, e.g. { "speed": 6 }. */
  overrides?: Partial<EnemyDef>;
}

export interface LevelDef {
  /** Shown on the level-start card. */
  name: string;
  /** One line of flavour text, also on the start card. */
  subtitle?: string;
  /** Seconds on the clock. Reaching 0 costs a life. Omit for no timer. */
  timeLimit?: number;
  /** Where the player appears. */
  spawn: Vec3;
  /** Falling below this Y costs a life. Default -20. */
  killY?: number;
  /**
   * Which way the camera faces when the level starts, in radians.
   * 0 looks along -Z. Use this to point the player down the course.
   */
  cameraYaw?: number;
  theme?: {
    sky?: HexColor;
    fog?: HexColor;
    /** Higher = you can see further. Default 60. */
    fogDistance?: number;
    ground?: HexColor;
    /** Colour of the main directional light. */
    light?: HexColor;
  };
  platforms: PlatformDef[];
  pickups?: PickupPlacement[];
  enemies?: EnemyPlacement[];
  /** The portal you must reach to finish. */
  goal: {
    position: Vec3;
    /** Coins/items you must collect before the portal opens. Default 0. */
    requires?: number;
  };
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** The live, per-run numbers the HUD reads. */
export interface GameState {
  score: number;
  lives: number;
  coins: number;
  coinsRequired: number;
  timeLeft: number;
  levelIndex: number;
}

export type GamePhase = 'menu' | 'level-intro' | 'playing' | 'paused' | 'level-complete' | 'game-over' | 'won';
