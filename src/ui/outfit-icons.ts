/**
 * Shop pictures for the outfits, drawn in the game's cartoon style (thick
 * dark outline, flat colours) so they match the 3D models instead of
 * looking like random emoji.
 */

const INK = '#1f2a44';
const S = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

function beanie(main: string, band: string): string {
  return `<path d="M12 42 Q12 14 32 14 Q52 14 52 42 Z" fill="${main}" ${S}/>
    <path d="M20 20 V40 M28 16 V40 M36 16 V40 M44 20 V40" stroke="${INK}" stroke-opacity="0.18" stroke-width="3"/>
    <rect x="9" y="38" width="46" height="12" rx="6" fill="${band}" ${S}/>
    <circle cx="32" cy="11" r="6" fill="#ffffff" ${S}/>`;
}

function scarf(main: string, stripe: string): string {
  return `<path d="M12 22 Q32 32 52 22 L52 32 Q32 42 12 32 Z" fill="${main}" ${S}/>
    <path d="M38 32 L44 54 L34 54 L30 34 Z" fill="${main}" ${S}/>
    <path d="M35 44 L42 44 M36.5 49 L43 49" stroke="${stripe}" stroke-width="3"/>
    <path d="M22 26 Q32 31 42 26" stroke="${stripe}" stroke-width="3" fill="none"/>`;
}

function crown(): string {
  return `<path d="M10 46 L14 20 L24 32 L32 14 L40 32 L50 20 L54 46 Z" fill="#ffc93c" ${S}/>
    <rect x="10" y="44" width="44" height="8" rx="3" fill="#f2a93b" ${S}/>
    <circle cx="32" cy="36" r="4" fill="#ff5c7a" ${S}/>
    <circle cx="20" cy="38" r="3" fill="#4fb8ff" stroke="${INK}" stroke-width="3"/>
    <circle cx="44" cy="38" r="3" fill="#4fd07a" stroke="${INK}" stroke-width="3"/>`;
}

const ICONS: Record<string, string> = {
  'beanie-orange': beanie('#ff8a2a', '#ffb25c'),
  'beanie-blue': beanie('#3d7bff', '#7fb0ff'),
  'cap-green': `<path d="M14 38 Q14 16 34 16 Q50 16 50 38 Z" fill="#3fae4f" ${S}/>
    <path d="M40 38 Q58 36 60 44 Q48 48 36 44 Z" fill="#2e8c3c" ${S}/>
    <rect x="12" y="36" width="40" height="8" rx="4" fill="#2e8c3c" ${S}/>
    <circle cx="32" cy="16" r="3" fill="#2e8c3c" ${S}/>`,
  viking: `<path d="M14 26 Q6 16 8 6 Q16 14 22 22 Z" fill="#fff4dc" ${S}/>
    <path d="M50 26 Q58 16 56 6 Q48 14 42 22 Z" fill="#fff4dc" ${S}/>
    <path d="M12 44 Q12 18 32 18 Q52 18 52 44 Z" fill="#a8b4c4" ${S}/>
    <path d="M32 18 V44" stroke="${INK}" stroke-width="4"/>
    <rect x="9" y="40" width="46" height="10" rx="4" fill="#c98a3e" ${S}/>
    <circle cx="18" cy="45" r="1.8" fill="${INK}"/><circle cx="32" cy="45" r="1.8" fill="${INK}"/><circle cx="46" cy="45" r="1.8" fill="${INK}"/>`,
  'crown-lumberjack': crown(),
  'scarf-teal': scarf('#2ec4b6', '#ffffff'),
  'scarf-red': scarf('#ff4d5e', '#ffd1d6'),
  sunglasses: `<path d="M6 24 H58" ${S}/>
    <path d="M8 24 H28 Q28 40 18 40 Q8 40 8 24 Z" fill="#26324f" ${S}/>
    <path d="M36 24 H56 Q56 40 46 40 Q36 40 36 24 Z" fill="#26324f" ${S}/>
    <path d="M13 28 L19 28 M41 28 L47 28" stroke="#ffffff" stroke-opacity="0.7" stroke-width="3"/>`,
  flower: `<g ${S}>
      <circle cx="32" cy="16" r="9" fill="#ff8fb1"/><circle cx="46" cy="28" r="9" fill="#ff8fb1"/>
      <circle cx="41" cy="45" r="9" fill="#ff8fb1"/><circle cx="23" cy="45" r="9" fill="#ff8fb1"/>
      <circle cx="18" cy="28" r="9" fill="#ff8fb1"/><circle cx="32" cy="32" r="8" fill="#ffc93c"/>
    </g>`,
  'crown-squirrel': crown(),
  tophat: `<path d="M8 46 Q32 54 56 46 L56 50 Q32 58 8 50 Z" fill="#24242e" ${S}/>
    <rect x="18" y="14" width="28" height="34" rx="3" fill="#24242e" ${S}/>
    <rect x="18" y="38" width="28" height="7" fill="#e8423a" ${S}/>`,
  pirate: `<path d="M6 40 Q32 8 58 40 Q32 50 6 40 Z" fill="#24242e" ${S}/>
    <circle cx="32" cy="30" r="5" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
    <path d="M10 44 Q32 52 54 44" stroke="#ffc93c" stroke-width="4" fill="none"/>`,
  headphones: `<path d="M14 38 Q14 12 32 12 Q50 12 50 38" fill="none" stroke="#2b2b3d" stroke-width="7" stroke-linecap="round"/>
    <rect x="6" y="32" width="14" height="20" rx="6" fill="#ff5c7a" ${S}/>
    <rect x="44" y="32" width="14" height="20" rx="6" fill="#ff5c7a" ${S}/>`,
  wizard: `<path d="M18 48 L32 6 L46 48 Z" fill="#5b4bd6" ${S}/>
    <ellipse cx="32" cy="48" rx="24" ry="6" fill="#5b4bd6" ${S}/>
    <path d="M30 24 L32 19 L34 24 L39 24 L35 27 L37 32 L32 29 L27 32 L29 27 L25 24 Z" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>`,
};

export function outfitIcon(id: string): string {
  const art = ICONS[id] ?? crown();
  return `<svg class="outfit-art" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${art}</svg>`;
}
