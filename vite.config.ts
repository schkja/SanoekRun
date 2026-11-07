import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // Relative base so the built game also works when opened from a subfolder
  // (e.g. GitHub Pages, itch.io, or a plain static host).
  base: './',
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
