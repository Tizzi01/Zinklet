import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: {
    // Shown in the app menu as "v0.1" etc. Bump the minor version on every release.
    __APP_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.')),
  },
  server: {
    port: 5173,
    host: true,
    // Big media files get copied in while the server runs; watching them can crash on Windows (EBUSY).
    watch: { ignored: ['**/public/landing-media/**'] },
  },
  build: {
    rollupOptions: {
      // "/" is the landing page, "/app/" is the Zinklet app.
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
});
