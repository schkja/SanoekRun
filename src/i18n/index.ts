/**
 * Languages.
 *
 *   t('button.run')               → "Run" / "Los!" / "Бежать!" …
 *   t('title.best', { m: 420 })   → "Your best: 420 m"
 *
 * The language follows the player's choice in Settings, or — on "Auto" — the
 * first browser/phone language we support, falling back to English.
 */

import { LANGUAGE_NAMES, STRINGS, type Language, type StringKey } from './strings';

export { LANGUAGE_NAMES, type Language, type StringKey };
export const LANGUAGES = Object.keys(STRINGS) as Language[];

/** 'auto' or a specific language. */
export type LanguageChoice = Language | 'auto';

let current: Language = detectLanguage();

/** The first language the browser prefers that we have. */
export function detectLanguage(): Language {
  const preferred = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split('-')[0];
    if (base && base in STRINGS) return base as Language;
  }
  return 'en';
}

export function setLanguage(choice: LanguageChoice): void {
  current = choice === 'auto' ? detectLanguage() : choice;
  document.documentElement.lang = current;
}

export function language(): Language {
  return current;
}

export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  const text = STRINGS[current][key] ?? STRINGS.en[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) return `{${name}}`;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

/** Numbers with this language's thousands separators. */
export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString(current);
}
