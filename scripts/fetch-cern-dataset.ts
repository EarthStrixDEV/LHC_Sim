/**
 * Server-side preprocessing for CERN Open Data (strategy 1: compact normalized JSON).
 *
 *   npm run fetch:cern -- <dataset-id> [--max N]
 *   npm run fetch:cern -- --list
 *
 * Downloads the file listed in src/data-sources/cern/DatasetRegistry.ts (sizes are printed
 * first; run only when you want the download), converts the first N events (default 5000)
 * and writes public/datasets/<id>.json plus public/datasets/index.json, which the app lists
 * under "Preprocessed datasets". Nothing is downloaded by `npm install` or by the app itself.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CERN_DATASETS, cernDataset, fileUrl } from '../src/data-sources/cern/DatasetRegistry';
import { fetchCernCsv } from '../src/data-sources/cern/CERNOpenDataAdapter';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/datasets');
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--list')) {
  for (const d of CERN_DATASETS) console.log(`${d.id.padEnd(20)} ${(d.sizeBytes / 1e6).toFixed(1).padStart(5)} MB  ${fileUrl(d)}`);
  process.exit(0);
}

const id = args.find((a) => !a.startsWith('--'))!;
const maxArg = args.indexOf('--max');
const max = maxArg >= 0 ? Number(args[maxArg + 1]) : 5000;
const d = cernDataset(id);
if (!d) {
  console.error(`Unknown dataset ${id}. Use --list.`);
  process.exit(1);
}
console.log(`Fetching ${fileUrl(d)} (${(d.sizeBytes / 1e6).toFixed(1)} MB max; stops after ${max} events)…`);
const conv = await fetchCernCsv(d, { maxEvents: max, proxyPrefix: 'https://opendata.cern.ch', onProgress: () => undefined });
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, `${d.id}.json`), JSON.stringify(conv.sample));
const indexPath = resolve(outDir, 'index.json');
const index: { id: string; title: string; file: string; events: number }[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
const entry = { id: d.id, title: d.title, file: `${d.id}.json`, events: conv.sample.events.length };
writeFileSync(indexPath, JSON.stringify([...index.filter((x) => x.id !== d.id), entry], null, 2));
console.log(`Wrote public/datasets/${d.id}.json (${conv.sample.events.length} events${conv.truncated ? ', truncated' : ''}).`);
