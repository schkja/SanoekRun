/**
 * Settings: everything a player can switch, plus the defaults you set at build time.
 *
 * Defaults come from environment variables (see `.env.example`), so you can
 * turn an effect off for everyone — for debugging, or if you decide you don't
 * like it — without touching code. Players can then change their own copy in
 * the in-game Settings screen; their choices are saved on their device.
 */

export const GAME_NAME = 'SanökRun';

/** The link printed on share cards. */
export const SHARE_URL: string = import.meta.env.VITE_SHARE_URL || 'https://sanoekrun.sascha.iodatalabs.dev';

export type Character = 'lumberjack' | 'squirrel';
export type MusicStyle = 'chase' | 'hop' | 'menu' | 'off';

export interface Effects {
  /** Sparkles burst out of every coin you collect. */
  coinSparkle: boolean;
  /** White streaks rushing past the edges of the screen at speed. */
  speedLines: boolean;
  /** Time slows down for a moment on a close call. */
  slowMotion: boolean;
  /** The camera leans into every corner. */
  turnTilt: boolean;
  /** The camera shakes when you get hit. */
  cameraShake: boolean;
  /** Red flash on a hit, white flash through a portal. */
  screenFlash: boolean;
  /** The view widens as you speed up and through portals. */
  speedZoom: boolean;
}

export interface Settings {
  character: Character;
  music: MusicStyle;
  sound: boolean;
  effects: Effects;
}

export const EFFECT_LABELS: Record<keyof Effects, string> = {
  coinSparkle: 'Coin sparkles',
  speedLines: 'Speed lines',
  slowMotion: 'Slow-mo close calls',
  turnTilt: 'Corner tilt',
  cameraShake: 'Camera shake',
  screenFlash: 'Screen flashes',
  speedZoom: 'Speed zoom',
};

export const CHARACTER_LABELS: Record<Character, string> = {
  lumberjack: 'Lumberjack',
  squirrel: 'Squirrel',
};

export const MUSIC_LABELS: Record<MusicStyle, string> = {
  chase: 'Chase',
  hop: 'Forest hop',
  menu: 'Menu chill',
  off: 'Off',
};

/** `VITE_FX_SPEED_LINES=false` → false. Unset → the fallback. `VITE_FX=off` turns every effect off. */
function envFlag(name: string, fallback: boolean): boolean {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_FX === 'off') return false;
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  return !['false', '0', 'off', 'no'].includes(value.toLowerCase());
}

function envChoice<T extends string>(name: string, options: readonly T[], fallback: T): T {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return options.includes(value as T) ? (value as T) : fallback;
}

export const DEFAULT_SETTINGS: Settings = {
  character: envChoice('VITE_CHARACTER', ['lumberjack', 'squirrel'] as const, 'lumberjack'),
  music: envChoice('VITE_MUSIC', ['chase', 'hop', 'menu', 'off'] as const, 'chase'),
  sound: envFlag('VITE_SOUND', true),
  effects: {
    coinSparkle: envFlag('VITE_FX_COIN_SPARKLE', true),
    speedLines: envFlag('VITE_FX_SPEED_LINES', true),
    slowMotion: envFlag('VITE_FX_SLOW_MOTION', true),
    turnTilt: envFlag('VITE_FX_TURN_TILT', true),
    cameraShake: envFlag('VITE_FX_CAMERA_SHAKE', true),
    screenFlash: envFlag('VITE_FX_SCREEN_FLASH', true),
    speedZoom: envFlag('VITE_FX_SPEED_ZOOM', true),
  },
};

const STORAGE_KEY = 'sanoekrun.settings';

/** The live settings. Read from anywhere; change through `updateSettings`. */
export const settings: Settings = load();

export function updateSettings(change: (s: Settings) => void): void {
  change(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode). The change still applies until reload.
  }
}

function load(): Settings {
  const base: Settings = structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // The explorer became the lumberjack.
    if ((saved.character as string) === 'explorer') saved.character = 'lumberjack';
    if (saved.character && !(saved.character in CHARACTER_LABELS)) delete saved.character;
    return {
      ...base,
      ...saved,
      effects: { ...base.effects, ...(saved.effects ?? {}) },
    };
  } catch {
    return base;
  }
}
