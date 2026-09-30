// Copies the Basis (KTX2) transcoder shipped with three.js into public/ so the
// KTX2Loader can fetch it locally (no CDN dependency). Runs on `npm install`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/three/examples/jsm/libs/basis');
const dst = resolve(root, 'public/decoders/basis');

if (!existsSync(src)) {
  console.warn('[copy-decoders] three basis transcoder not found; skipping');
} else {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('[copy-decoders] basis transcoder copied to public/decoders/basis');
}
