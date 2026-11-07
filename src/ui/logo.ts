/**
 * The SanökRun logo: a fat yellow "S" and an acorn on a sky-blue tile, and
 * the word mark, where the two dots over the ö are tiny acorns.
 *
 * The same drawing is used for the app icon (scripts/make-icons.mjs renders
 * it to PNG), the title screen and the share picture.
 */

const INK = '#1f2a44';

/** The two-dot "umlaut" acorn, as used over the ö. */
export const ACORN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24"><ellipse cx="10" cy="14.5" rx="7" ry="8" fill="#d48a42" stroke="${INK}" stroke-width="3"/><path d="M1.5 9 Q10 -1 18.5 9 Z" fill="#6b4325" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M10 2 V0" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`;

export const ACORN_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ACORN_SVG)}`;

/**
 * The app icon. The "S" is drawn as a path, not text, so it looks the same
 * everywhere without the font.
 */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#4fb8ff"/>
  <circle cx="110" cy="450" r="120" fill="#4fd07a" stroke="${INK}" stroke-width="16"/>
  <circle cx="400" cy="470" r="110" fill="#3fae4f" stroke="${INK}" stroke-width="16"/>
  <path d="M332 150 C314 112 276 92 230 92 C162 92 118 130 118 184 C118 296 300 262 300 334 C300 364 272 384 236 384 C196 384 168 362 156 326 L96 352 C116 418 170 452 238 452 C322 452 376 406 376 336 C376 222 194 252 194 182 C194 156 214 140 240 140 C266 140 284 152 294 174 Z"
    fill="#ffc93c" stroke="${INK}" stroke-width="20" stroke-linejoin="round" paint-order="stroke"/>
  <g transform="translate(388 150) rotate(16)">
    <ellipse cx="0" cy="22" rx="50" ry="60" fill="#d48a42" stroke="${INK}" stroke-width="16"/>
    <path d="M-64 -6 Q0 -76 64 -6 Z" fill="#6b4325" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>
    <path d="M0 -48 V-74" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="-18" cy="10" rx="10" ry="18" fill="#ffffff" opacity="0.45"/>
  </g>
</svg>`;

export const ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}`;

/** Load an SVG string as an image, for drawing onto a canvas. */
export function svgImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
