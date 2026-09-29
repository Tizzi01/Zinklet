import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { relative, resolve, sep } from 'node:path';
import pkg from './package.json' with { type: 'json' };

const ROOT = import.meta.dirname;
const WATCHED_DIRS = ['src', 'app', 'public'];
const WATCHED_FILES = ['index.html', 'package.json', 'vite.config.ts', 'tsconfig.json'];

function isWatched(file: string) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return true;
  if (rel.startsWith('public/landing-media')) return false;
  const [top, ...rest] = rel.split('/');
  return rest.length ? WATCHED_DIRS.includes(top) : WATCHED_DIRS.includes(top) || WATCHED_FILES.includes(top);
}

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Dev-only helpers for public/landing-media:
 * - serves it straight from disk, so files dropped in while the server runs show up without a restart
 *   (the folder isn't watched, see isWatched);
 * - POST /__save-media saves a re-encoded clip from tools/compress-clips.html (the untouched original is
 *   backed up to media-originals/, which is git-ignored). Localhost requests only.
 */
function mediaPlugin(): Plugin {
  return {
    name: 'zinklet-landing-media',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/landing-media', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const type = MEDIA_TYPES[name.split('.').pop()?.toLowerCase() ?? ''];
        const file = resolve(ROOT, 'public/landing-media', name);
        if (!type || name.includes('..') || !existsSync(file)) {
          if (type) {
            res.statusCode = 404;
            res.end();
            return;
          }
          next();
          return;
        }
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Length', statSync(file).size);
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(file).pipe(res);
      });
      server.middlewares.use('/__save-media', async (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !local || !/^[\w.-]+\.(mp4|webm)$/.test(name)) {
          res.statusCode = 400;
          res.end('no');
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const target = resolve(ROOT, 'public/landing-media', name);
        const backupDir = resolve(ROOT, 'media-originals');
        mkdirSync(backupDir, { recursive: true });
        if (existsSync(target) && !existsSync(resolve(backupDir, name))) copyFileSync(target, resolve(backupDir, name));
        writeFileSync(target, Buffer.concat(chunks));
        res.end('ok');
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediaPlugin()],
  define: {
    // Shown in the app menu as "v0.1" etc. Bump the minor version on every release.
    __APP_VERSION__: JSON.stringify(pkg.version.split('.').slice(0, 2).join('.')),
  },
  server: {
    port: 5173,
    host: true,
    // Only watch what the site is built from. On Windows, watching big media or temp files that other apps
    // are still writing crashes the server (EBUSY).
    watch: { ignored: (file: string) => !isWatched(file) },
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
