/**
 * Routes user-supplied files to the right adapter. Every path ends in a validated
 * NormalizedSample; the caller registers it.
 *
 * Whether a file is recorded data or simulation cannot be inferred reliably from HepMC or
 * ROOT content, so the user states it (`declared`) and it is recorded in the provenance.
 */
import { EVENT_SCHEMA_ID, type CollisionSystem, type EventSampleFile } from '../physics/events/EventSchema';
import { EventValidationError } from '../physics/events/EventLoader';
import { CERN_DATASETS } from './cern/DatasetRegistry';
import { parseCmsOutreachCsv } from './cern/CERNOpenDataAdapter';
import { curatedToNormalized } from './curated/CuratedAdapter';
import { parseHepMC3 } from './hepmc/HepMCAdapter';
import { NORMALIZED_SCHEMA_ID, validateNormalizedSample, type ExperimentId, type NormalizedSample, type Provenance } from './NormalizedEvent';
import { ROOT_COLUMNS_FORMAT, ROOT_SCHEMAS, rootColumnsToSample, type RootColumnsFile, type RootSchemaId } from './root/ROOTAdapter';

export interface DeclaredOrigin {
  readonly isSimulation: boolean;
  readonly experiment: ExperimentId | null;
  readonly collisionSystem: CollisionSystem;
  readonly sqrtSGeV: number;
  readonly year: number | null;
  readonly license: string;
}

export interface ImportOptions {
  readonly maxEvents: number;
  readonly declared: DeclaredOrigin;
}

export type ImportKind = 'normalized-json' | 'root-columns-json' | 'curated-json' | 'cms-csv' | 'hepmc3' | 'root';

export function importKindOf(fileName: string): ImportKind | null {
  const n = fileName.toLowerCase();
  if (n.endsWith('.csv')) return 'cms-csv';
  if (n.endsWith('.hepmc') || n.endsWith('.hepmc3')) return 'hepmc3';
  if (n.endsWith('.root')) return 'root';
  if (n.endsWith('.json')) return 'normalized-json';
  return null;
}

/** Whether the user must declare the origin (data vs simulation) for this file kind. */
export function needsDeclaration(kind: ImportKind): boolean {
  return kind === 'hepmc3' || kind === 'root';
}

let importCounter = 0;
function importId(base: string): string {
  return `import-${base.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${++importCounter}`;
}

export function importJsonText(text: string, fileName: string, maxEvents: number): NormalizedSample {
  const data = JSON.parse(text) as { schema?: string; format?: string };
  if (data.schema === NORMALIZED_SCHEMA_ID) {
    const s = data as NormalizedSample;
    return validateNormalizedSample({ ...s, events: s.events.slice(0, maxEvents) });
  }
  if (data.format === ROOT_COLUMNS_FORMAT) {
    const f = data as RootColumnsFile;
    return rootColumnsToSample({ ...f, entries: f.entries.slice(0, maxEvents) });
  }
  if (data.schema === EVENT_SCHEMA_ID) {
    const f = data as EventSampleFile;
    const id = importId(f.sample.id);
    return curatedToNormalized({ ...f, sample: { ...f.sample, id }, events: f.events.slice(0, maxEvents) });
  }
  throw new EventValidationError(`${fileName}: unrecognized JSON (expected ${NORMALIZED_SCHEMA_ID}, ${ROOT_COLUMNS_FORMAT} or ${EVENT_SCHEMA_ID})`);
}

export function importCsvText(text: string, fileName: string, maxEvents: number): NormalizedSample {
  const d = CERN_DATASETS.find((x) => x.fileName.toLowerCase() === fileName.toLowerCase());
  if (!d) throw new EventValidationError(`${fileName}: unknown CSV. Supported CMS outreach files: ${CERN_DATASETS.map((x) => x.fileName).join(', ')}`);
  return parseCmsOutreachCsv(text, d, maxEvents).sample;
}

function declaredProvenance(fileName: string, sourceType: Provenance['sourceType'], o: DeclaredOrigin, notes: string[], generator: Provenance['generator']): Provenance {
  return {
    sourceType,
    isSimulation: o.isSimulation,
    experiment: o.experiment,
    datasetId: importId(fileName),
    title: fileName,
    year: o.year,
    collisionSystem: o.collisionSystem,
    sqrtSGeV: o.sqrtSGeV,
    integratedLuminosityInvPb: null,
    generator,
    source: { name: `Local file ${fileName}`, url: null, doi: null, license: o.license },
    processingNotes: [`Origin (${o.isSimulation ? 'simulation' : 'recorded data'}), collision system and √s declared by the user at import.`, ...notes],
  };
}

export function importHepMCText(text: string, fileName: string, opts: ImportOptions): NormalizedSample {
  if (!opts.declared.isSimulation) throw new EventValidationError('HepMC records are generator truth; they cannot be imported as recorded collision data');
  const events = parseHepMC3(text, { process: fileName }).slice(0, opts.maxEvents);
  const prov = declaredProvenance(fileName, 'HEPMC_LIKE', opts.declared, ['HepMC3 ASCII converted by HepMCAdapter (charges from PDG codes; vertex kinds from displacement).'], {
    name: 'unknown (HepMC3 import)',
    version: null,
    tune: null,
    process: null,
    seed: null,
    settings: {},
  });
  return validateNormalizedSample({
    schema: NORMALIZED_SCHEMA_ID,
    provenance: prov,
    meta: {
      id: prov.datasetId,
      title: fileName,
      process: fileName,
      collisionSystem: prov.collisionSystem,
      sqrtSGeV: prov.sqrtSGeV,
      synthetic: false,
      generator: 'HepMC3 import',
      description: fileName,
      seed: 0,
      notes: prov.processingNotes,
    },
    events,
  });
}

/** ROOT via JSROOT: picks the column schema from the tree's branches. */
export async function importRootFile(file: File, opts: ImportOptions): Promise<NormalizedSample> {
  const { openRootFile, readTreeEntries } = await import('./root/JSROOTBridge');
  const h = await openRootFile(file);
  const candidates: [string, RootSchemaId][] = [['Events', 'cms-nanoaod'], ['mini', 'atlas-opendata-13tev']];
  const hit = candidates.find(([t]) => h.trees.includes(t));
  if (!hit) throw new EventValidationError(`${file.name}: no supported tree (found: ${h.trees.join(', ') || 'none'}; expected Events [CMS NanoAOD] or mini [ATLAS Open Data 13 TeV])`);
  const [tree, schema] = hit;
  const res = await readTreeEntries(h, tree, ROOT_SCHEMAS[schema].branches, opts.maxEvents);
  const prov = declaredProvenance(file.name, 'ROOT_CONVERTED', opts.declared, [
    `Read ${res.entries.length} of ${res.totalEntries} entries of tree "${tree}" with JSROOT.`,
    res.branchesMissing.length ? `Branches absent from the file (objects not available): ${res.branchesMissing.join(', ')}` : 'All schema branches present.',
  ], null);
  return rootColumnsToSample({ format: ROOT_COLUMNS_FORMAT, schema, provenance: prov, entries: res.entries });
}

export async function importFile(file: File, opts: ImportOptions): Promise<NormalizedSample> {
  const kind = importKindOf(file.name);
  if (!kind) throw new EventValidationError(`${file.name}: unsupported file type (.json, .csv, .hepmc/.hepmc3, .root)`);
  if (kind === 'root') return importRootFile(file, opts);
  const text = await file.text();
  if (kind === 'cms-csv') return importCsvText(text, file.name, opts.maxEvents);
  if (kind === 'hepmc3') return importHepMCText(text, file.name, opts);
  return importJsonText(text, file.name, opts.maxEvents);
}
