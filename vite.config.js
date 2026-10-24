import { defineConfig } from 'vite';

// Relative base so the build runs from any folder (zip, static host, claude.ai artifact).
export default defineConfig({
  base: './',
  appType: 'mpa', // optional asset manifests must return 404, not the index.html SPA fallback
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
});
