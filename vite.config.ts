import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
