import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => path.join(here, 'src', p);

/**
 * Two builds from the same screens:
 *  - normal (npm run build): the Firebase web version for GitHub Pages.
 *    The site is served at the custom domain root, so VITE_BASE is "/".
 *  - "gas" (npm run build:gas): the Apps Script version. One self-contained
 *    page (dist/gas/forge-app.html) that talks to apps-script-web/Code.gs
 *    instead of Firebase. The Apps Script downloads it and serves it itself.
 */
export default defineConfig(({ mode }) => {
  if (mode !== 'gas') {
    return {
      base: process.env.VITE_BASE || '/',
      plugins: [react(), tailwindcss()],
      build: { chunkSizeWarningLimit: 1200 },
    };
  }
  // Swap the three Firebase files for their Apps Script versions.
  const swap = {
    [src('lib/data.js')]: src('backends/gas/data.js'),
    [src('hooks/useAuth.js')]: src('backends/gas/useAuth.js'),
    [src('firebase.js')]: src('backends/gas/firebase.js'),
  };
  return {
    base: './',
    define: { 'import.meta.env.VITE_BACKEND': JSON.stringify('gas') },
    plugins: [
      {
        name: 'forge-swap-backend',
        enforce: 'pre',
        async resolveId(source, importer, options) {
          if (!importer || source.startsWith('\0')) return null;
          const r = await this.resolve(source, importer, { ...options, skipSelf: true });
          return r && swap[r.id] ? swap[r.id] : null;
        },
      },
      react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true }),
    ],
    build: {
      outDir: 'dist-gas',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      rollupOptions: { input: path.join(here, 'gas.html') },
    },
  };
});
