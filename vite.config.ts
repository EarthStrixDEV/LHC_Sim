import { defineConfig } from 'vitest/config';

/** Local PYTHIA 8 backend (server/pythia_server.py). Override with PYTHIA_BACKEND_URL. */
const PYTHIA_BACKEND = process.env.PYTHIA_BACKEND_URL ?? 'http://127.0.0.1:8765';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    format: 'es',
  },
  server: {
    proxy: {
      // opendata.cern.ch sends no CORS headers; the dev server relays user-initiated downloads.
      '/cern-opendata': { target: 'https://opendata.cern.ch', changeOrigin: true, rewrite: (p) => p.replace(/^\/cern-opendata/, '') },
      '/api/pythia': { target: PYTHIA_BACKEND, changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/pythia/, '') },
    },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
