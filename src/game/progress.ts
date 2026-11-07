/**
 * Progress: everything a player builds up over many runs, saved on their device.
 *
 *   - a coin bank: every coin or nut you collect is kept to spend in the shop
 *   - a level, raised by finishing three missions at a time
 *   - outfits you've bought, and which one each character wears
 *   - your leaderboard nickname and a random device id (never anything personal)
 */

import type { Character } from './settings';

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** What a mission counts. "run" stats are the best in a single run, "total" ones add up across runs. */
export type Stat =
  | 'runDistance'
  | 'runCoins'
  | 'runWorlds'
  | 'runNoHit'
  | 'jumps'
  | 'slides'
  | 'perfects'
  | 'closeCalls'
  | 'powerups'
  | 'runs';

const RUN_STATS = new Set<Stat>(['runDistance', 'runCoins', 'runWorlds', 'runNoHit']);

/** Targets by difficulty tier: tier 0 at level 1, rising to tier 4. */
const TARGETS: Record<Stat, number[]> = {
  runDistance: [300, 600, 1000, 1600, 2500],
  runCoins: [30, 60, 100, 160, 250],
  runWorlds: [2, 2, 3, 3, 4],
  runNoHit: [200, 400, 700, 1000, 1500],
  jumps: [15, 30, 60, 100, 200],
  slides: [10, 25, 50, 80, 150],
  perfects: [5, 12, 25, 40, 80],
  closeCalls: [3, 8, 15, 30, 50],
  powerups: [2, 5, 10, 20, 40],
  runs: [3, 5, 8, 12, 20],
};

export interface Mission {
  stat: Stat;
  target: number;
  progress: number;
  done: boolean;
}

export const missionReward = (level: number) => 50 * Math.min(5, level);
export const levelBonus = (level: number) => 100 * level;

// ---------------------------------------------------------------------------
// Outfits
// ---------------------------------------------------------------------------

export interface Outfit {
  id: string;
  character: Character;
  price: number;
  /** An emoji for the shop card. */
  icon: string;
}

export const OUTFITS: Outfit[] = [
  // Prices climb steeply: the first items come quickly, the crown takes a while.
  { id: 'beanie-orange', character: 'lumberjack', price: 0, icon: '🧡' },
  { id: 'beanie-blue', character: 'lumberjack', price: 600, icon: '💙' },
  { id: 'cap-green', character: 'lumberjack', price: 1500, icon: '🧢' },
  { id: 'viking', character: 'lumberjack', price: 4000, icon: '⚔️' },
  { id: 'tophat', character: 'lumberjack', price: 8000, icon: '🎩' },
  { id: 'pirate', character: 'lumberjack', price: 12000, icon: '🏴‍☠️' },
  { id: 'crown-lumberjack', character: 'lumberjack', price: 20000, icon: '👑' },
  { id: 'scarf-teal', character: 'squirrel', price: 0, icon: '🧣' },
  { id: 'scarf-red', character: 'squirrel', price: 600, icon: '❤️' },
  { id: 'sunglasses', character: 'squirrel', price: 1500, icon: '😎' },
  { id: 'flower', character: 'squirrel', price: 4000, icon: '🌼' },
  { id: 'headphones', character: 'squirrel', price: 8000, icon: '🎧' },
  { id: 'wizard', character: 'squirrel', price: 12000, icon: '🧙' },
  { id: 'crown-squirrel', character: 'squirrel', price: 20000, icon: '👑' },
];

// ---------------------------------------------------------------------------
// The saved profile
// ---------------------------------------------------------------------------

export interface Profile {
  bank: number;
  level: number;
  missions: Mission[];
  owned: string[];
  equipped: Record<Character, string>;
  totals: Partial<Record<Stat, number>>;
  /** The nickname last used on the leaderboard. */
  name: string;
  device: string;
  /** Worlds each hero has reached at least once: runs can start there. */
  reached: Record<Character, string[]>;
  /** Where each hero's next run starts (a world id), if not the first world. */
  startWorld: Partial<Record<Character, string>>;
}

const KEY = 'sanoekrun.profile';

function newMissions(level: number, previous: Stat[] = []): Mission[] {
  const tier = Math.min(4, level - 1);
  const pool = (Object.keys(TARGETS) as Stat[]).filter((s) => !previous.includes(s));
  const picked: Stat[] = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picked.map((stat) => ({ stat, target: TARGETS[stat][tier], progress: 0, done: false }));
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function load(): Profile {
  const fresh: Profile = {
    bank: 0,
    level: 1,
    missions: newMissions(1),
    owned: OUTFITS.filter((o) => o.price === 0).map((o) => o.id),
    equipped: { lumberjack: 'beanie-orange', squirrel: 'scarf-teal' },
    totals: {},
    name: '',
    device: randomId(),
    reached: { lumberjack: [], squirrel: [] },
    startWorld: {},
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Partial<Profile>;
    return {
      ...fresh,
      ...saved,
      equipped: { ...fresh.equipped, ...(saved.equipped ?? {}) },
      reached: { ...fresh.reached, ...(saved.reached ?? {}) },
      startWorld: { ...(saved.startWorld ?? {}) },
    };
  } catch {
    return fresh;
  }
}

export const profile: Profile = load();

export function saveProfile(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: progress lasts until the page closes.
  }
}

/**
 * Report progress. For "run" stats pass the value reached this run; for
 * totals pass how much to add. Returns the missions this just completed.
 */
export function report(stat: Stat, value: number): Mission[] {
  if (!RUN_STATS.has(stat)) profile.totals[stat] = (profile.totals[stat] ?? 0) + value;
  const finished: Mission[] = [];
  for (const m of profile.missions) {
    if (m.done || m.stat !== stat) continue;
    m.progress = RUN_STATS.has(stat) ? Math.max(m.progress, value) : m.progress + value;
    if (m.progress >= m.target) {
      m.progress = m.target;
      m.done = true;
      profile.bank += missionReward(profile.level);
      finished.push(m);
    }
  }
  return finished;
}

/** When all three missions are done: level up, pay the bonus, deal new missions. */
export function tryLevelUp(): number | null {
  if (!profile.missions.every((m) => m.done)) return null;
  profile.bank += levelBonus(profile.level);
  profile.level += 1;
  profile.missions = newMissions(profile.level, profile.missions.map((m) => m.stat));
  saveProfile();
  return profile.level;
}

export function outfitFor(character: Character): string {
  return profile.equipped[character];
}

export type BuyResult = 'equipped' | 'bought' | 'too-expensive';

export function buyOrEquip(outfit: Outfit): BuyResult {
  if (!profile.owned.includes(outfit.id)) {
    if (profile.bank < outfit.price) return 'too-expensive';
    profile.bank -= outfit.price;
    profile.owned.push(outfit.id);
    profile.equipped[outfit.character] = outfit.id;
    saveProfile();
    return 'bought';
  }
  profile.equipped[outfit.character] = outfit.id;
  saveProfile();
  return 'equipped';
}

/** Remember that a hero got to a world. Returns true the first time. */
export function markReached(character: Character, worldId: string): boolean {
  const list = profile.reached[character];
  if (list.includes(worldId)) return false;
  list.push(worldId);
  saveProfile();
  return true;
}
