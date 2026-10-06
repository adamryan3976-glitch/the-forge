import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves this repo at https://<user>.github.io/the-forge/, so the
// built files live under /the-forge/. If you later point a custom domain at it
// (e.g. math.winchesterps.ca), set VITE_BASE to "/" in the deploy workflow.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 },
});
