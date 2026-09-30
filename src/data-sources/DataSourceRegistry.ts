/**
 * Registry of every dataset the pipeline can process, independent of where it came from.
 *
 *  - static entries: bundled curated samples (lazy, code-split JSON)
 *  - dynamic entries: datasets produced at runtime (PYTHIA backend, imported CERN Open Data,
 *    ROOT-converted or HepMC files). They are registered as already-normalized samples.
 *
 * The physics worker has its own module instance; SimulationController forwards dynamic
 * registrations to it, so both threads resolve the same dataset ids.
 */
import { curatedToNormalized } from './curated/CuratedAdapter';
import { EVENT_SAMPLES } from '../physics/events/EventDatabase';
import { validateNormalizedSample, type NormalizedSample, type SourceType } from './NormalizedEvent';
import { NormalizedDataset } from './NormalizedDataset';

export interface DatasetEntry {
  readonly id: string;
  readonly label: string;
  readonly sourceType: SourceType;
  readonly load: () => Promise<NormalizedSample>;
}

const STATIC: readonly DatasetEntry[] = EVENT_SAMPLES.map((s) => ({
  id: s.id,
  label: s.label,
  sourceType: 'CURATED' as const,
  load: async () => curatedToNormalized(await s.source.load()),
}));

const dynamic = new Map<string, DatasetEntry>();
const loaded = new Map<string, Promise<NormalizedDataset>>();
const listeners = new Set<() => void>();

export function listDatasets(): DatasetEntry[] {
  return [...STATIC, ...dynamic.values()];
}

export function datasetEntry(id: string): DatasetEntry | undefined {
  return dynamic.get(id) ?? STATIC.find((e) => e.id === id);
}

/** Adds (or replaces) a runtime dataset. Returns its id. */
export function registerSample(sample: NormalizedSample, label = sample.provenance.title): string {
  validateNormalizedSample(sample);
  const id = sample.provenance.datasetId;
  if (STATIC.some((e) => e.id === id)) throw new Error(`Dataset id ${id} is reserved by a bundled sample`);
  dynamic.set(id, { id, label, sourceType: sample.provenance.sourceType, load: async () => sample });
  loaded.delete(id);
  for (const l of listeners) l();
  return id;
}

export function onRegistryChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function loadDataset(id: string): Promise<NormalizedDataset> {
  let d = loaded.get(id);
  if (!d) {
    const entry = datasetEntry(id);
    if (!entry) return Promise.reject(new Error(`Unknown dataset ${id}`));
    d = entry.load().then((s) => new NormalizedDataset(s));
    d.catch(() => loaded.delete(id));
    loaded.set(id, d);
  }
  return d;
}
