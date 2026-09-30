/**
 * EventGenerator — source-agnostic interface for on-demand event generation.
 *
 * Generation is always asynchronous and off the render thread (backend process or worker);
 * callers await a NormalizedSample and register it. Identical requests (including the seed)
 * must yield identical events.
 */
import type { NormalizedSample } from '../data-sources/NormalizedEvent';

export type GenProcess = 'minbias' | 'drell-yan-z' | 'higgs-diphoton' | 'qcd-jets' | 'ttbar';

export interface GeneratorRequest {
  readonly system: 'pp';
  /** Centre-of-mass energy [GeV]. */
  readonly sqrtSGeV: number;
  readonly process: GenProcess;
  readonly nEvents: number;
  /** PYTHIA accepts seeds 1 … 900 000 000. */
  readonly seed: number;
  /** 'compact' keeps final state, hard process, beams and decayed hadrons (ancestry re-linked). */
  readonly record: 'compact' | 'full';
}

export interface GeneratorStatus {
  readonly available: boolean;
  readonly name: string;
  readonly version: string | null;
  readonly detail: string;
}

export interface GenerateOptions {
  readonly signal?: AbortSignal;
}

export interface EventGenerator {
  readonly id: string;
  readonly label: string;
  status(): Promise<GeneratorStatus>;
  generate(req: GeneratorRequest, opts?: GenerateOptions): Promise<NormalizedSample>;
}

export const MAX_EVENTS_PER_REQUEST = 500;
export const MAX_SEED = 900_000_000;

export const PROCESS_LABEL: Record<GenProcess, string> = {
  minbias: 'Minimum bias (inelastic soft QCD)',
  'drell-yan-z': 'Drell–Yan Z/γ* → μ⁺μ⁻ (60 < m̂ < 120 GeV)',
  'higgs-diphoton': 'gg → H → γγ',
  'qcd-jets': 'QCD 2→2 jets (p̂T > 50 GeV)',
  ttbar: 'tt̄ production',
};

/**
 * PYTHIA 8 settings per process — the single definition shared (by value) with
 * server/pythia_server.py, which receives them in the request and applies them verbatim.
 */
export function pythiaSettings(req: GeneratorRequest): string[] {
  const common = [
    'Beams:idA = 2212',
    'Beams:idB = 2212',
    `Beams:eCM = ${req.sqrtSGeV}`,
    'Random:setSeed = on',
    `Random:seed = ${req.seed}`,
    'Next:numberCount = 0',
  ];
  const proc: Record<GenProcess, string[]> = {
    minbias: ['SoftQCD:inelastic = on'],
    'drell-yan-z': ['WeakSingleBoson:ffbar2gmZ = on', 'PhaseSpace:mHatMin = 60.', 'PhaseSpace:mHatMax = 120.', '23:onMode = off', '23:onIfAny = 13'],
    'higgs-diphoton': ['HiggsSM:gg2H = on', '25:onMode = off', '25:onIfMatch = 22 22'],
    'qcd-jets': ['HardQCD:all = on', 'PhaseSpace:pTHatMin = 50.'],
    ttbar: ['Top:gg2ttbar = on', 'Top:qqbar2ttbar = on'],
  };
  return [...common, ...proc[req.process]];
}

export function validateRequest(req: GeneratorRequest): void {
  if (!Number.isInteger(req.seed) || req.seed < 1 || req.seed > MAX_SEED) throw new Error(`Seed must be an integer in 1…${MAX_SEED}`);
  if (!Number.isInteger(req.nEvents) || req.nEvents < 1 || req.nEvents > MAX_EVENTS_PER_REQUEST) throw new Error(`Event count must be 1…${MAX_EVENTS_PER_REQUEST}`);
  if (!(req.sqrtSGeV >= 100 && req.sqrtSGeV <= 100_000)) throw new Error('√s must be within 100 GeV … 100 TeV');
  if (!(req.process in PROCESS_LABEL)) throw new Error(`Unknown process ${req.process}`);
}

/** Stable dataset id: the same request always maps to the same id (and the same events). */
export function requestId(req: GeneratorRequest): string {
  return `pythia-${req.process}-${req.sqrtSGeV}-s${req.seed}-n${req.nEvents}-${req.record}`;
}
