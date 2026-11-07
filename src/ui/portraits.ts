/**
 * Little cartoon portraits for the character cards on the title screen,
 * drawn in the same ink-outline style as the game.
 */

const INK = '#1f2a44';

export const PORTRAITS = {
  lumberjack: `
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="52" r="40" fill="#bfe9ff"/>
  <rect x="18" y="66" width="60" height="30" rx="12" fill="#d8342c" stroke="${INK}" stroke-width="3.5"/>
  <path d="M18 78 H78 M38 66 V96 M58 66 V96" stroke="#7a1d1a" stroke-width="3" opacity="0.6"/>
  <circle cx="48" cy="46" r="22" fill="#f6c99a" stroke="${INK}" stroke-width="3.5"/>
  <path d="M28 50 C30 74 66 74 68 50 C62 58 34 58 28 50 Z" fill="#8a4f22" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="48" cy="52" rx="5" ry="4" fill="#f0a878" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="40" cy="42" r="3" fill="${INK}"/><circle cx="56" cy="42" r="3" fill="${INK}"/>
  <path d="M26 36 C26 14 70 14 70 36 Z" fill="#ff9f1c" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <rect x="24" y="32" width="48" height="9" rx="4.5" fill="#ff9f1c" stroke="${INK}" stroke-width="3.5"/>
  <circle cx="48" cy="14" r="6" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
</svg>`,
  squirrel: `
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="52" r="40" fill="#d9f6c8"/>
  <path d="M66 92 C96 86 96 40 74 34 C64 31 58 42 66 50" fill="#e2823a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="46" cy="74" rx="20" ry="22" fill="#d06a2c" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="46" cy="78" rx="11" ry="14" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
  <path d="M30 34 L28 14 L42 28 Z M62 34 L64 14 L50 28 Z" fill="#d06a2c" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="46" cy="44" r="20" fill="#d06a2c" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="46" cy="52" rx="11" ry="8" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
  <circle cx="38" cy="40" r="3.5" fill="${INK}"/><circle cx="54" cy="40" r="3.5" fill="${INK}"/>
  <circle cx="39" cy="39" r="1.2" fill="#ffffff"/><circle cx="55" cy="39" r="1.2" fill="#ffffff"/>
  <ellipse cx="46" cy="49" rx="3.5" ry="2.5" fill="${INK}"/>
  <rect x="28" y="60" width="36" height="7" rx="3.5" fill="#3ac6b0" stroke="${INK}" stroke-width="3"/>
</svg>`,
};
