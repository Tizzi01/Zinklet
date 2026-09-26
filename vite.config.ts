import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: {
    // Shown in the app menu as "v0.1" etc. Bump the minor version on every release.
    __APP_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.')),
  },
  server: { port: 5173, host: true },
});
