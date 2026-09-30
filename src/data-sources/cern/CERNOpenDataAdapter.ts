/**
 * Adapter: CERN Open Data → normalized datasets.
 *
 * Browser-friendly strategies, in order of preference:
 *  1. compact normalized JSON produced server-side (scripts/fetch-cern-dataset.ts);
 *  2. CMS outreach CSV files parsed here (header-driven, streamed, event-count capped);
 *  3. ROOT files read through JSROOT (see ../root/ROOTAdapter.ts).
 *
 * Recorded data: every event carries reconstructed objects only (truth = null). Lepton
 * masses are not in the CSVs; the PDG lepton mass is used for four-vectors (stated in the
 * processing notes). Column names are kept verbatim as object attributes.
 */
import { ELECTRON_MASS_GEV, MUON_MASS_GEV } from '../../physics/constants/physicalConstants';
import { EventValidationError } from '../../physics/events/EventLoader';
import { NORMALIZED_SCHEMA_ID, validateNormalizedSample, type NormalizedEvent, type NormalizedSample, type RecoObjectRecord } from '../NormalizedEvent';
import { fileUrl, recordNote, recordUrl, type CernDatasetDescriptor } from './DatasetRegistry';

/** Default cap on events converted from one file (keeps the browser responsive). */
export const DEFAULT_MAX_EVENTS = 2000;

/** Categorical CSV columns → numeric attributes. */
const CATEGORY_CODES: Record<string, Record<string, number>> = {
  type: { G: 1, T: 0, EB: 0, EE: 1 },
};
const CATEGORY_ATTR: Record<string, Record<string, string>> = {
  type: { G: 'isGlobalMuon', T: 'isGlobalMuon', EB: 'isEndcap', EE: 'isEndcap' },
};

export interface CsvConversion {
  readonly sample: NormalizedSample;
  readonly rowsRead: number;
  readonly truncated: boolean;
}

/** Parses a CMS outreach CSV (text may be a prefix of the file; a partial last line is dropped). */
export function parseCmsOutreachCsv(text: string, d: CernDatasetDescriptor, maxEvents = DEFAULT_MAX_EVENTS, complete = true): CsvConversion {
  const lines = text.split(/\r?\n/);
  if (!complete) lines.pop();
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim());
  const lc = header.map((h) => h.toLowerCase());
  const col = (name: string): number => lc.indexOf(name.toLowerCase());
  if (col('run') < 0 || col('event') < 0) throw new EventValidationError(`${d.fileName}: not a CMS outreach CSV (missing Run/Event)`);
  const suffixes = lc.filter((h) => /^pt\d*$/.test(h)).map((h) => h.slice(2));
  if (suffixes.length === 0) throw new EventValidationError(`${d.fileName}: no lepton pt column`);
  const mass = d.lepton === 'muon' ? MUON_MASS_GEV : ELECTRON_MASS_GEV;
  const metCol = col('MET'), metPhiCol = col('phiMET');
  const events: NormalizedEvent[] = [];
  let rows = 0;
  for (const line of lines) {
    if (events.length >= maxEvents) break;
    if (!line.trim()) continue;
    rows++;
    const f = line.split(',').map((x) => x.trim());
    if (f.length !== header.length) throw new EventValidationError(`${d.fileName} row ${rows}: ${f.length} fields, expected ${header.length}`);
    const n = (i: number): number => {
      const v = Number(f[i]);
      if (!Number.isFinite(v)) throw new EventValidationError(`${d.fileName} row ${rows}: column ${header[i]} is not numeric`);
      return v;
    };
    const objects: RecoObjectRecord[] = suffixes.map((s) => {
      const attrs: Record<string, number> = {};
      header.forEach((h, i) => {
        const base = lc[i]!;
        if (s ? !base.endsWith(s) : /\d$/.test(base)) return;
        const key = s ? base.slice(0, -s.length) : base;
        if (['pt', 'eta', 'phi', 'q', 'run', 'event', 'met', 'phimet', 'm'].includes(key)) return;
        if (key in CATEGORY_CODES) {
          const code = CATEGORY_CODES[key]![f[i]!];
          if (code !== undefined) attrs[CATEGORY_ATTR[key]![f[i]!]!] = code;
          return;
        }
        const v = Number(f[i]);
        if (Number.isFinite(v)) attrs[h.slice(0, h.length - s.length)] = v;
      });
      return { kind: d.lepton, pt: n(col(`pt${s}`)), eta: n(col(`eta${s}`)), phi: n(col(`phi${s}`)), m: mass, charge: n(col(`Q${s}`)), attrs };
    });
    events.push({
      eventNumber: n(col('event')),
      run: n(col('run')),
      lumiBlock: null,
      weights: [1],
      truth: null,
      reco: {
        objects,
        met: metCol >= 0 && metPhiCol >= 0 ? { met: n(metCol), phi: n(metPhiCol), sumEt: null } : null,
        primaryVertex: null,
        nPrimaryVertices: null,
      },
    });
  }
  if (events.length === 0) throw new EventValidationError(`${d.fileName}: no events`);
  const truncated = events.length >= maxEvents || !complete;
  return { sample: toSample(d, events, truncated), rowsRead: rows, truncated };
}

function toSample(d: CernDatasetDescriptor, events: NormalizedEvent[], truncated: boolean): NormalizedSample {
  const notes = [
    recordNote(d),
    `Selection: ${d.selection}`,
    'RECORDED COLLISION DATA: reconstructed leptons (and MET where present) only — no generator truth, hits or calorimeter cells exist in this file.',
    `Lepton four-vectors use pT, η, φ from the file and the PDG ${d.lepton} mass (the CSV gives no mass).`,
    'Drawn trajectories are helices computed from the reconstructed momenta in the lhcsim field model (display only).',
    truncated ? `Converted the first ${events.length} events of the file (user-selected cap).` : `All ${events.length} events of the file converted.`,
  ];
  return validateNormalizedSample({
    schema: NORMALIZED_SCHEMA_ID,
    provenance: {
      sourceType: 'CERN_OPEN_DATA',
      isSimulation: d.isSimulation,
      experiment: d.experiment,
      datasetId: d.id,
      title: d.title,
      year: d.year,
      collisionSystem: d.collisionSystem,
      sqrtSGeV: d.sqrtSGeV,
      integratedLuminosityInvPb: null,
      generator: null,
      source: { name: `CERN Open Data Portal, record ${d.recordId} (${d.fileName})`, url: recordUrl(d), doi: d.doi, license: d.license },
      processingNotes: notes,
    },
    meta: {
      id: d.id,
      title: d.title,
      process: d.title,
      collisionSystem: d.collisionSystem,
      sqrtSGeV: d.sqrtSGeV,
      synthetic: false,
      generator: 'none (recorded collision data)',
      description: d.selection,
      seed: 0,
      ...(d.intendedMassGeV !== undefined ? { intendedMassGeV: d.intendedMassGeV } : {}),
      ...(d.analysisPair ? { analysisPair: d.analysisPair } : {}),
      notes,
    },
    events,
  });
}

export interface FetchOptions {
  readonly maxEvents?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (bytes: number) => void;
  /** URL prefix that relays opendata.cern.ch (CORS). Default: the Vite dev proxy. */
  readonly proxyPrefix?: string;
}

/**
 * Downloads (user action only) and converts a CSV dataset, streaming and stopping as soon as
 * enough events are read. The portal sends no CORS headers, so the request goes through the
 * dev-server proxy; production deployments should use preprocessed JSON instead.
 */
export async function fetchCernCsv(d: CernDatasetDescriptor, opts: FetchOptions = {}): Promise<CsvConversion> {
  const max = opts.maxEvents ?? DEFAULT_MAX_EVENTS;
  const url = fileUrl(d).replace('https://opendata.cern.ch', opts.proxyPrefix ?? '/cern-opendata');
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) — the dev-server proxy is required, or import a preprocessed file`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  let bytes = 0;
  let lines = 0;
  let complete = true;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    const chunk = dec.decode(value, { stream: true });
    text += chunk;
    for (let i = 0; i < chunk.length; i++) if (chunk.charCodeAt(i) === 10) lines++;
    opts.onProgress?.(bytes);
    if (lines > max + 1) {
      complete = false;
      await reader.cancel();
      break;
    }
  }
  return parseCmsOutreachCsv(text, d, max, complete);
}
