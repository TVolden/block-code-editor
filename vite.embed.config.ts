/**
 * vite.embed.config.ts
 *
 * Vite config for building the self-contained embeddable bundle.
 *
 * Run:  npm run build:embed
 * Output: dist-embed/block-editor.iife.js  (~500 KB, includes React)
 *
 * The IIFE format means the script registers the <block-editor> element
 * immediately when loaded — no module system required on the host page.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    lib: {
      entry: 'src/embed.ts',
      name: 'BlockEditor',       // global variable name (unused for IIFE side-effects-only)
      fileName: 'block-editor',
      formats: ['iife'],
    },
    rollupOptions: {
      // Bundle everything — React included — so the output is fully standalone
      external: [],
    },
  },
});
