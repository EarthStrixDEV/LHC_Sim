/**
 * Full Phase 1 event pipeline:  Event (truth) → Propagation → Detector Response → Reconstruction.
 *
 * Pure and deterministic; runs in the physics worker (or directly in tests). The output is
 * structured-clone friendly (plain objects + typed arrays).
 */
import { createAtlasDetector } from '../detectors/atlas/ATLASDetector';
import { createCmsDetector } from '../detectors/cms/CMSDetector';
import type { DetectorModel, ExperimentDetectorId } from './detector/DetectorModel';
import { createAliceDetector } from '../detectors/alice/ALICEDetector';
import { createLhcbDetector } from '../detectors/lhcb/LHCbDetector';
import type { MagneticField } from './propagation/MagneticField';
import { createAliceFieldMap, createAtlasFieldMap, createCmsFieldMap, createLhcbFieldMap } from '../detector/fieldmaps/DetectorFieldMaps';
import { simulateResponse, type DetectorResponseResult } from './detector/DetectorResponse';
import type { TruthEvent } from './events/Event';
import type { CollisionSystem } from './events/EventSchema';
import { propagateEvent, type TrackRecord } from './propagation/EventPropagation';
import { configFor, reconstruct } from './reconstruction/ReconstructionEngine';
import type { ReconstructedEvent } from './reconstruction/ReconstructedObject';
import { emptyHits, processSourceReco } from './reconstruction/SourceRecoEvent';
import type { NormalizedDataset } from '../data-sources/NormalizedDataset';
import { TruthEvent as TruthEventClass } from './events/Event';
import { overlayPileUp, type PileUpConfig } from './pileup/PileUp';
import { buildL1Inputs, defaultMenu, evaluateTrigger, type TriggerDecision, type TriggerItem } from './trigger/Trigger';
import { Rng, seedFrom } from '../utils/math';
import { measurePid, type PidMeasurement } from '../detector/response/PID';
import { advancedReconstruction, DEFAULT_JET_CONFIG, type AdvancedReco, type JetConfig } from './reconstruction/AdvancedReconstruction';
import { applyResponseConfig, NOMINAL_RESPONSE, scenarioOf, type ResponseConfig } from '../detector/response/ResponseConfig';

export type DetectorId = ExperimentDetectorId;

/**
 * 'regional': Phase 1 piecewise analytic fields.
 * 'fieldmap': Phase 2 interpolated solenoid field maps with the analytic model as fallback.
 */
export type FieldModel = 'regional' | 'fieldmap';

const DETECTORS: Record<DetectorId, () => DetectorModel> = { atlas: createAtlasDetector, cms: createCmsDetector, alice: createAliceDetector, lhcb: createLhcbDetector };
const FIELD_MAPS: Record<DetectorId, () => MagneticField> = { atlas: createAtlasFieldMap, cms: createCmsFieldMap, alice: createAliceFieldMap, lhcb: createLhcbFieldMap };
export const DETECTOR_IDS: readonly DetectorId[] = ['atlas', 'cms', 'alice', 'lhcb'];
const cache = new Map<string, DetectorModel>();

export function getDetector(id: DetectorId, fieldModel: FieldModel = 'regional'): DetectorModel {
  const key = `${id}:${fieldModel}`;
  let d = cache.get(key);
  if (!d) {
    const base = DETECTORS[id]();
    d = fieldModel === 'regional' ? base : { ...base, field: FIELD_MAPS[id](), integrator: 'rk45' };
    cache.set(key, d);
  }
  return d;
}

export interface ProcessedEvent {
  readonly eventId: number;
  readonly detectorId: DetectorId;
  readonly tracks: readonly TrackRecord[];
  readonly response: Omit<DetectorResponseResult, 'impacts' | 'hitCounts' | 'muonStationCounts'>;
  readonly reco: ReconstructedEvent;
  readonly timings: { readonly propagationMs: number; readonly responseMs: number; readonly recoMs: number };
  /** 'truth': trajectories are propagated generator truth; 'reco': drawn from source reco objects. */
  readonly trajectorySource: 'truth' | 'reco';
  /** Who produced the reconstructed objects: the lhcsim educational reco, or the data source. */
  readonly recoProducer: 'lhcsim' | 'source';
  /** Number of overlaid pile-up interactions (null: pile-up not simulated for this event). */
  readonly pileUp: { readonly mu: number; readonly n: number } | null;
  /** Phase 2 reconstruction layer (fits, vertices, topo-clusters, generalized-kT jets); null when not run. */
  readonly advanced: AdvancedReco | null;
  /** Particle-identification measurements (detectors with PID systems: ALICE TPC/TOF, LHCb RICH). */
  readonly pid: readonly PidMeasurement[];
  /** Educational trigger decision; null for recorded data (already selected by the experiment). */
  readonly trigger: TriggerDecision | null;
}

export interface ProcessOptions {
  readonly pileUp?: PileUpConfig;
  readonly triggerMenu?: readonly TriggerItem[];
  /** Default 'fieldmap' for dataset processing (Phase 2). */
  readonly fieldModel?: FieldModel;
  /** Detector-response parameters and channel scenarios (default nominal). */
  readonly response?: ResponseConfig;
  /** Run the Phase 2 reconstruction layer (default true; bulk scans switch it off). */
  readonly advanced?: boolean;
  readonly jets?: JetConfig;
}

export function processEvent(event: TruthEvent, system: CollisionSystem, detectorId: DetectorId, fieldModel: FieldModel = 'regional', response: ResponseConfig = NOMINAL_RESPONSE, advanced: { jets: JetConfig } | null = null): ProcessedEvent {
  const det = applyResponseConfig(getDetector(detectorId, fieldModel), response);
  const t0 = now();
  const tracks = propagateEvent(event, det);
  const t1 = now();
  const resp = simulateResponse(event, det, tracks, scenarioOf(response));
  const t2 = now();
  const reco = reconstruct(event, det, tracks, resp, configFor(system));
  const adv = advanced ? advancedReconstruction(det, tracks, resp.hits, resp.ecal, resp.hcal, reco, event.seed, advanced.jets) : null;
  const t3 = now();
  return {
    eventId: event.eventId,
    detectorId,
    tracks,
    response: { hits: resp.hits, ecal: resp.ecal, hcal: resp.hcal, muonHits: resp.muonHits },
    reco,
    timings: { propagationMs: t1 - t0, responseMs: t2 - t1, recoMs: t3 - t2 },
    trajectorySource: 'truth',
    recoProducer: 'lhcsim',
    pileUp: null,
    advanced: adv,
    pid: measurePid(tracks, det, event.seed),
    trigger: evaluateTrigger(defaultMenu(), buildL1Inputs(resp.ecal, resp.hcal, reco), reco),
  };
}

const truthCache = new Map<string, TruthEvent | null>();
const TRUTH_CACHE_MAX = 32;

/**
 * Truth event of a dataset entry, with deterministic pile-up overlay when enabled
 * (seeded from dataset id, index and μ — identical on the main thread and in the worker).
 */
export function datasetTruth(ds: NormalizedDataset, index: number, pileUp?: PileUpConfig): { truth: TruthEvent | null; nPileUp: number | null } {
  const base = ds.truthEvent(index);
  if (!base || !pileUp?.enabled || pileUp.mu <= 0) return { truth: base, nPileUp: null };
  const i = ds.wrap(index);
  const key = `${ds.id}#${i}#${pileUp.mu}`;
  let t = truthCache.get(key);
  if (t === undefined) {
    const rec = ds.event(i).truth!;
    t = new TruthEventClass(overlayPileUp(rec, pileUp.mu, new Rng(seedFrom(ds.id, i, 'pileup', pileUp.mu))).event);
    if (truthCache.size >= TRUTH_CACHE_MAX) truthCache.delete(truthCache.keys().next().value!);
    truthCache.set(key, t);
  }
  return { truth: t, nPileUp: t ? (t.truthInfo.pileUpInteractions ?? 0) : null };
}

/**
 * Normalized-dataset entry point. Events with truth run the full simulation chain; events
 * with only source-level reconstruction are passed through without inventing truth, hits or
 * calorimeter deposits.
 */
export function processDatasetEvent(ds: NormalizedDataset, index: number, detectorId: DetectorId, opts: ProcessOptions = {}): ProcessedEvent {
  const { truth, nPileUp } = datasetTruth(ds, index, opts.pileUp);
  if (truth) {
    const pe = processEvent(truth, ds.meta.collisionSystem, detectorId, opts.fieldModel ?? 'fieldmap', opts.response ?? NOMINAL_RESPONSE, opts.advanced === false ? null : { jets: opts.jets ?? DEFAULT_JET_CONFIG });
    const menu = opts.triggerMenu ?? defaultMenu();
    return {
      ...pe,
      pileUp: nPileUp !== null ? { mu: opts.pileUp!.mu, n: nPileUp } : null,
      trigger: evaluateTrigger(menu, buildL1Inputs(pe.response.ecal, pe.response.hcal, pe.reco), pe.reco),
    };
  }
  const ev = ds.event(index);
  if (!ev.reco) throw new Error(`Dataset ${ds.id} event ${index}: no truth and no reconstructed objects`);
  const t0 = now();
  const { tracks, reco } = processSourceReco(ev.reco, getDetector(detectorId, opts.fieldModel ?? 'fieldmap'));
  return {
    eventId: ev.eventNumber,
    detectorId,
    tracks,
    response: { hits: emptyHits(), ecal: [], hcal: [], muonHits: [] },
    reco,
    timings: { propagationMs: now() - t0, responseMs: 0, recoMs: 0 },
    trajectorySource: 'reco',
    recoProducer: 'source',
    pileUp: null,
    advanced: null,
    pid: [],
    trigger: null,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
