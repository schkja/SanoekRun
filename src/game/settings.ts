/**
 * Settings: everything a player can switch, plus the defaults you set at build time.
 *
 * Defaults come from environment variables (see `.env.example`), so you can
 * turn an effect off for everyone — for debugging, or if you decide you don't
 * like it — without touching code. Players can then change their own copy in
 * the in-game Settings screen; their choices are saved on their device.
 */

import { LANGUAGES, type LanguageChoice } from '../i18n';

export const GAME_NAME = 'SanökRun';

/** The link printed on share cards. */
export const SHARE_URL: string = import.meta.env.VITE_SHARE_URL || 'https://sanoekrun.sascha.iodatalabs.dev';

export type Character = 'lumberjack' | 'squirrel' | 'bear' | 'hare';
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
  /** Dark cartoon outlines around everything. */
  outlines: boolean;
}

export interface Settings {
  character: Character;
  /** 'auto' follows the phone or browser language. */
  language: LanguageChoice;
  music: MusicStyle;
  sound: boolean;
  /** Which world to run in; any hero can run in any world. */
  world: 'forest' | 'boardwalk' | 'honey';
  effects: Effects;
  /** Bumped when defaults change for everyone (2: slow motion off, 3: chase music). */
  revision?: number;
}

/** The options, in the order the Settings buttons cycle through them. Their names live in src/i18n. */
export const CHARACTERS: Character[] = ['squirrel', 'hare', 'bear', 'lumberjack'];
export const MUSIC_STYLES: MusicStyle[] = ['chase', 'hop', 'menu', 'off'];
export const EFFECT_KEYS: Array<keyof Effects> = [
  'coinSparkle',
  'speedLines',
  'slowMotion',
  'turnTilt',
  'cameraShake',
  'screenFlash',
  'speedZoom',
  'outlines',
];
export const LANGUAGE_CHOICES: LanguageChoice[] = ['auto', ...LANGUAGES];

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
  language: envChoice('VITE_LANGUAGE', LANGUAGE_CHOICES, 'auto'),
  character: envChoice('VITE_CHARACTER', ['lumberjack', 'squirrel', 'bear', 'hare'] as const, 'lumberjack'),
  music: envChoice('VITE_MUSIC', ['chase', 'hop', 'menu', 'off'] as const, 'chase'),
  sound: envFlag('VITE_SOUND', true),
  world: envChoice('VITE_WORLD', ['forest', 'boardwalk', 'honey'] as const, 'forest'),
  revision: 3,
  effects: {
    coinSparkle: envFlag('VITE_FX_COIN_SPARKLE', true),
    speedLines: envFlag('VITE_FX_SPEED_LINES', true),
    slowMotion: envFlag('VITE_FX_SLOW_MOTION', false),
    turnTilt: envFlag('VITE_FX_TURN_TILT', true),
    cameraShake: envFlag('VITE_FX_CAMERA_SHAKE', true),
    screenFlash: envFlag('VITE_FX_SCREEN_FLASH', true),
    speedZoom: envFlag('VITE_FX_SPEED_ZOOM', true),
    outlines: envFlag('VITE_FX_OUTLINES', true),
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
    if (saved.character && !CHARACTERS.includes(saved.character)) delete saved.character;
    if (saved.language && !LANGUAGE_CHOICES.includes(saved.language)) delete saved.language;
    if (saved.world && !['forest', 'boardwalk', 'honey'].includes(saved.world)) delete saved.world;
    const effects = { ...base.effects, ...(saved.effects ?? {}) };
    // Slow motion on close calls became opt-in; switch it off once for everyone.
    if ((saved.revision ?? 1) < 2) effects.slowMotion = base.effects.slowMotion;
    // The chase music became everyone's default once.
    if ((saved.revision ?? 1) < 3) saved.music = base.music;
    return { ...base, ...saved, effects, revision: base.revision };
  } catch {
    return base;
  }
}
