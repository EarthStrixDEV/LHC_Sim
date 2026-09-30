/**
 * Normalized event model ("lhcsim-normalized/1") — the single internal representation that
 * every external source (curated samples, PYTHIA, CERN Open Data, ROOT-converted files,
 * HepMC-like records) is converted into by an adapter before entering the event pipeline.
 *
 * Two independent, optional levels per event:
 *   truth — generator-level HepMC-like record (particles, vertices, parent/child links).
 *           NEVER present for recorded collision data, and never manufactured by adapters.
 *   reco  — reconstructed objects as provided by the source (e.g. an experiment's muons,
 *           electrons, jets, MET from an Open Data derived dataset).
 *
 * Provenance travels with the sample and is shown in the UI together with the data level:
 *   SIMULATED TRUTH · SIMULATED RECONSTRUCTION · RECORDED COLLISION DATA
 *
 * Units: GeV, metres, ns (as in the Phase 1 event schema).
 */
import type { CollisionSystem, EventRecord, SampleMetadata } from '../physics/events/EventSchema';
import { EventValidationError, validateEvent } from '../physics/events/EventLoader';

export const NORMALIZED_SCHEMA_ID = 'lhcsim-normalized/1';

export type SourceType = 'CURATED' | 'PYTHIA' | 'CERN_OPEN_DATA' | 'ROOT_CONVERTED' | 'HEPMC_LIKE';
export const SOURCE_TYPES: readonly SourceType[] = ['CURATED', 'PYTHIA', 'CERN_OPEN_DATA', 'ROOT_CONVERTED', 'HEPMC_LIKE'];

export type DataLevel = 'SIMULATED_TRUTH' | 'SIMULATED_RECONSTRUCTION' | 'RECORDED_COLLISION_DATA';

export const DATA_LEVEL_LABEL: Record<DataLevel, string> = {
  SIMULATED_TRUTH: 'SIMULATED TRUTH',
  SIMULATED_RECONSTRUCTION: 'SIMULATED RECONSTRUCTION',
  RECORDED_COLLISION_DATA: 'RECORDED COLLISION DATA',
};

export type ExperimentId = 'ATLAS' | 'CMS' | 'ALICE' | 'LHCb';

export interface GeneratorInfo {
  readonly name: string;
  readonly version: string | null;
  readonly tune: string | null;
  readonly process: string | null;
  /** Random seed of the whole run (per-event seeds live in the truth record). */
  readonly seed: number | null;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
}

export interface SourceReference {
  readonly name: string;
  readonly url: string | null;
  readonly doi: string | null;
  readonly license: string;
}

export interface Provenance {
  readonly sourceType: SourceType;
  /** false ⇒ recorded collision data: truth must be absent. */
  readonly isSimulation: boolean;
  readonly experiment: ExperimentId | null;
  readonly datasetId: string;
  readonly title: string;
  readonly year: number | null;
  readonly collisionSystem: CollisionSystem;
  /** √s (pp) or √s_NN [GeV]. */
  readonly sqrtSGeV: number;
  /** Integrated luminosity of the parent dataset [pb⁻¹], where applicable. */
  readonly integratedLuminosityInvPb: number | null;
  readonly generator: GeneratorInfo | null;
  readonly source: SourceReference;
  readonly processingNotes: readonly string[];
}

export type RecoObjectKind = 'muon' | 'electron' | 'photon' | 'jet' | 'track';

/** A reconstructed object as provided by the source (not produced by lhcsim). */
export interface RecoObjectRecord {
  readonly kind: RecoObjectKind;
  readonly pt: number;
  readonly eta: number;
  readonly phi: number;
  /** Object mass [GeV]; 0 when the source gives none (massless approximation stated in notes). */
  readonly m: number;
  readonly charge: number;
  /** Extra numeric attributes (isolation, b-tag, …) exactly as named by the source. */
  readonly attrs?: Readonly<Record<string, number>>;
}

export interface RecoLevelRecord {
  readonly objects: readonly RecoObjectRecord[];
  /** Missing transverse momentum, when the source provides it. */
  readonly met: { readonly met: number; readonly phi: number; readonly sumEt: number | null } | null;
  /** Reconstructed primary-vertex position [m], when provided. */
  readonly primaryVertex: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly nPrimaryVertices: number | null;
}

export interface NormalizedEvent {
  readonly eventNumber: number;
  readonly run: number | null;
  readonly lumiBlock: number | null;
  /** Event weights (generator or analysis); [1] when unweighted. */
  readonly weights: readonly number[];
  readonly truth: EventRecord | null;
  readonly reco: RecoLevelRecord | null;
}

export interface NormalizedSample {
  readonly schema: typeof NORMALIZED_SCHEMA_ID;
  readonly provenance: Provenance;
  /** Pipeline metadata (collision system, analysis pair, notes) — consistent with provenance. */
  readonly meta: SampleMetadata;
  readonly events: readonly NormalizedEvent[];
}

// ---- Data levels -----------------------------------------------------------------------------

/** The data level of the primary content of an event. */
export function primaryDataLevel(prov: Provenance, ev: NormalizedEvent): DataLevel {
  if (!prov.isSimulation) return 'RECORDED_COLLISION_DATA';
  return ev.truth ? 'SIMULATED_TRUTH' : 'SIMULATED_RECONSTRUCTION';
}

/** Level of reconstructed objects (whoever reconstructed them). */
export function recoDataLevel(prov: Provenance): DataLevel {
  return prov.isSimulation ? 'SIMULATED_RECONSTRUCTION' : 'RECORDED_COLLISION_DATA';
}

/** Every level present in an event (truth and/or reconstruction). */
export function dataLevelsOf(prov: Provenance, ev: NormalizedEvent): DataLevel[] {
  const out: DataLevel[] = [];
  if (ev.truth && prov.isSimulation) out.push('SIMULATED_TRUTH');
  if (ev.reco || ev.truth) out.push(recoDataLevel(prov));
  return out;
}

// ---- Validation ------------------------------------------------------------------------------

export function validateNormalizedSample(s: NormalizedSample): NormalizedSample {
  if (!s || s.schema !== NORMALIZED_SCHEMA_ID) throw new EventValidationError(`Unsupported normalized schema: ${(s as { schema?: string })?.schema}`);
  const p = s.provenance;
  if (!p) throw new EventValidationError('Missing provenance');
  if (!SOURCE_TYPES.includes(p.sourceType)) throw new EventValidationError(`Unknown source type ${p.sourceType}`);
  if (!p.datasetId || !p.title) throw new EventValidationError('Provenance needs datasetId and title');
  if (!p.source?.name || !p.source.license) throw new EventValidationError(`Dataset ${p.datasetId}: source name and license are required`);
  if (!(p.sqrtSGeV > 0)) throw new EventValidationError(`Dataset ${p.datasetId}: invalid √s`);
  if (s.meta.collisionSystem !== p.collisionSystem) throw new EventValidationError(`Dataset ${p.datasetId}: meta/provenance collision system mismatch`);
  if (s.meta.id !== p.datasetId) throw new EventValidationError(`Dataset ${p.datasetId}: meta id mismatch`);
  if (s.events.length === 0) throw new EventValidationError(`Dataset ${p.datasetId}: no events`);
  s.events.forEach((ev, i) => validateNormalizedEvent(p, ev, i));
  return s;
}

export function validateNormalizedEvent(p: Provenance, ev: NormalizedEvent, index: number): void {
  const where = `Dataset ${p.datasetId}, event #${index}`;
  if (!ev.truth && !ev.reco) throw new EventValidationError(`${where}: neither truth nor reconstructed content`);
  if (ev.truth && !p.isSimulation) throw new EventValidationError(`${where}: recorded collision data cannot carry generator truth`);
  if (!Array.isArray(ev.weights) || ev.weights.length === 0 || !ev.weights.every(Number.isFinite)) throw new EventValidationError(`${where}: invalid weights`);
  if (ev.truth) validateEvent(ev.truth);
  if (ev.reco) {
    for (const o of ev.reco.objects) {
      if (!(o.pt >= 0) || !Number.isFinite(o.eta) || !Number.isFinite(o.phi) || !(o.m >= 0)) throw new EventValidationError(`${where}: invalid ${o.kind} kinematics`);
      if (!Number.isFinite(o.charge)) throw new EventValidationError(`${where}: invalid ${o.kind} charge`);
    }
    if (ev.reco.met && !(ev.reco.met.met >= 0 && Number.isFinite(ev.reco.met.phi))) throw new EventValidationError(`${where}: invalid MET`);
  }
}
