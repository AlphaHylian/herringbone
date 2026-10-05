import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The first-person 3D game lives in its own page and bundle, separate from the 2D app that
// Capacitor packages.
export default defineConfig({
  root: resolve(import.meta.dirname, 'paver'),
  base: './',
  server: { host: true, port: 5174 },
  preview: { port: 4174 },
  build: {
    target: 'es2020',
    outDir: resolve(import.meta.dirname, 'dist-paver'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
