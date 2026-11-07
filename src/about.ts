/**
 * Who made the game, how to reach them, and what changed between versions.
 * Shown on the Info screen. The legal page (imprint, privacy, licences) is a
 * plain HTML file, public/legal.html, so it can also be linked from forums.
 */

import changelog from '../content/changelog.json';

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

export const AUTHOR = {
  name: 'Sascha Belon',
  email: 'saschabelon@gmail.com',
  site: 'https://saschabelon.vercel.app/',
};

export const LEGAL_URL = './legal.html';

export interface ChangelogEntry {
  version: string;
  date: string;
  /** Notes per language; English is the fallback. */
  notes: Record<string, string[]>;
}

export const CHANGELOG = changelog as ChangelogEntry[];
