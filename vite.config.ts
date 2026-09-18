import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game also works when opened from a subfolder
  // (e.g. GitHub Pages, itch.io, or a plain static host).
  base: './',
  server: {
    open: true,
    host: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
});
