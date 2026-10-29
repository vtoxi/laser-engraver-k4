import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Writes agent debug POSTs to workspace so Cursor can read NDJSON without cross-origin ingest. */
function agentDebugLogPlugin(): Plugin {
  return {
    name: 'agent-debug-log',
    configureServer(server) {
      server.middlewares.use('/__agent-debug-log', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const dir = path.join(process.cwd(), '.cursor');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, 'debug-e29c6c.log');
            const line = Buffer.concat(chunks).toString('utf8').trim();
            if (line) fs.appendFileSync(file, `${line}\n`);
            res.statusCode = 204;
            res.end();
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), agentDebugLogPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  optimizeDeps: {
    include: ['fabric'],
  },
});
