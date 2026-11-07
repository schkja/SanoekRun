/**
 * Renders the app icon (src/ui/logo.ts, ICON_SVG) to the PNG sizes phones and
 * browsers ask for, into public/icons/. Run after changing the logo:
 *
 *   node scripts/make-icons.mjs
 *
 * Needs Playwright with Chromium (npx playwright install chromium).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../src/ui/logo.ts', import.meta.url), 'utf8');
const svg = source.match(/ICON_SVG = `([\s\S]*?)`;/)[1].replaceAll('${INK}', '#1f2a44');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon.svg', out), svg);

// Maskable: Android crops icons to its own shape, so keep the art in the middle 80%.
const square = svg.replace('rx="112"', 'rx="0"');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#4fb8ff"/><g transform="translate(51 51) scale(0.8)">${square.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;

const jobs = [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, square],
  ['favicon-32.png', 32, svg],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, art] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
  writeFileSync(new URL(name, out), await page.screenshot({ omitBackground: true }));
}
await browser.close();
console.log('icons written to public/icons/');
