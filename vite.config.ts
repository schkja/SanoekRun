import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => ({
  // Relative base so the built game also works when opened from a subfolder
  // (e.g. GitHub Pages, itch.io, or a plain static host).
  base: './',
  // Shown on the Info screen.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  // `npm run build:single` packs the whole game into one HTML file — handy for
  // sharing a link to test on a phone.
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  server: {
    open: true,
    host: true,
    // In development, run `node server/index.mjs` too and the game talks to it.
    proxy: { '/api': 'http://localhost:8080' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    sourcemap: mode !== 'single',
    chunkSizeWarningLimit: 900,
  },
}));
