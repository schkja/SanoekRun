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
  bear: `
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="52" r="40" fill="#ffe9a8"/>
  <ellipse cx="48" cy="80" rx="26" ry="18" fill="#8a5530" stroke="${INK}" stroke-width="3.5"/>
  <rect x="26" y="62" width="44" height="8" rx="4" fill="#3b82f6" stroke="${INK}" stroke-width="3"/>
  <circle cx="26" cy="26" r="10" fill="#8a5530" stroke="${INK}" stroke-width="3.5"/><circle cx="26" cy="26" r="4.5" fill="#e2b27a"/>
  <circle cx="70" cy="26" r="10" fill="#8a5530" stroke="${INK}" stroke-width="3.5"/><circle cx="70" cy="26" r="4.5" fill="#e2b27a"/>
  <circle cx="48" cy="44" r="24" fill="#8a5530" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="48" cy="54" rx="12" ry="9" fill="#e2b27a" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="48" cy="49" rx="5" ry="3.5" fill="${INK}"/>
  <path d="M52 56 Q58 62 55 66" stroke="#ffb21f" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="39" cy="40" r="3.5" fill="${INK}"/><circle cx="57" cy="40" r="3.5" fill="${INK}"/>
  <circle cx="40" cy="39" r="1.2" fill="#ffffff"/><circle cx="58" cy="39" r="1.2" fill="#ffffff"/>
  <g transform="translate(78 58)"><ellipse rx="5" ry="4" fill="#ffd23f" stroke="${INK}" stroke-width="2"/><path d="M-1 -4 V4 M2 -4 V4" stroke="${INK}" stroke-width="1.5"/><ellipse cx="-2" cy="-5" rx="3" ry="2" fill="#ffffff" opacity="0.8"/></g>
  <g transform="translate(14 62)"><ellipse rx="4" ry="3.2" fill="#ffd23f" stroke="${INK}" stroke-width="2"/><path d="M0 -3 V3" stroke="${INK}" stroke-width="1.5"/></g>
</svg>`,
  hare: `
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="52" r="40" fill="#e3f4ff"/>
  <path d="M34 34 C24 4 36 2 40 30 Z" fill="#a89a8a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M35 30 C30 12 35 10 38 28 Z" fill="#ffb3c1"/>
  <path d="M62 34 C72 4 60 2 56 30 Z" fill="#a89a8a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M61 30 C66 12 61 10 58 28 Z" fill="#ffb3c1"/>
  <ellipse cx="48" cy="80" rx="22" ry="18" fill="#a89a8a" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="48" cy="84" rx="12" ry="12" fill="#f7f3ec" stroke="${INK}" stroke-width="3"/>
  <circle cx="48" cy="50" r="21" fill="#a89a8a" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="48" cy="58" rx="11" ry="8" fill="#f7f3ec" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="48" cy="53" rx="3.5" ry="2.5" fill="#ff8fa3" stroke="${INK}" stroke-width="2"/>
  <rect x="45" y="60" width="6" height="6" rx="1" fill="#ffffff" stroke="${INK}" stroke-width="2"/>
  <circle cx="40" cy="46" r="3.5" fill="${INK}"/><circle cx="56" cy="46" r="3.5" fill="${INK}"/>
  <circle cx="41" cy="45" r="1.2" fill="#ffffff"/><circle cx="57" cy="45" r="1.2" fill="#ffffff"/>
  <path d="M58 32 L68 28 L66 38 Z M58 32 L52 26 L56 36 Z" fill="#e8423a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`,
  wolf: `
<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="52" r="40" fill="#e6f7d8"/>
  <ellipse cx="48" cy="82" rx="24" ry="17" fill="#8a93a3" stroke="${INK}" stroke-width="3.5"/>
  <path d="M28 34 L24 10 L42 26 Z M68 34 L72 10 L54 26 Z" fill="#8a93a3" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="48" cy="46" r="22" fill="#8a93a3" stroke="${INK}" stroke-width="3.5"/>
  <path d="M34 54 Q48 74 62 54 Q48 60 34 54 Z" fill="#e3e6ec" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="48" cy="57" rx="4.5" ry="3.5" fill="${INK}"/>
  <circle cx="39" cy="42" r="4" fill="#ffc23a" stroke="${INK}" stroke-width="2"/><circle cx="57" cy="42" r="4" fill="#ffc23a" stroke="${INK}" stroke-width="2"/>
  <circle cx="39" cy="42" r="1.6" fill="${INK}"/><circle cx="57" cy="42" r="1.6" fill="${INK}"/>
  <rect x="28" y="66" width="40" height="7" rx="3.5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
  <g transform="translate(78 74)"><ellipse rx="10" ry="6" fill="#f2b45a" stroke="${INK}" stroke-width="2.5"/><ellipse cy="-2" rx="6" ry="3" fill="#e09a3a"/><circle cy="-3" r="2" fill="#e8423a"/></g>
</svg>`,
};
