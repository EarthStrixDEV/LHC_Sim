/**
 * Collider-operation summary derived from the accelerator and beam models:
 * filling scheme → crossing rate → pile-up μ → per-process production rates.
 * Physics-owned; the UI only formats these numbers.
 */
import type { AcceleratorState } from '../accelerator/AcceleratorCore';
import type { BeamModelState } from '../beam/BeamModel';
import { bunchTiming, interactionProbability, lhcLikeScheme, meanInteractionsPerCrossing, type BunchTiming, type FillingScheme } from '../bunches/BunchStructure';
import { CM2_PER_PB, rateTable, REFERENCE_CROSS_SECTIONS, type RateRow } from './Luminosity';
import { poissonPmf } from '../pileup/PileUp';

export interface ColliderOperation {
  readonly luminosityCm2s: number;
  readonly scheme: FillingScheme;
  readonly timing: BunchTiming;
  /** μ: mean inelastic interactions per colliding-bunch crossing. */
  readonly mu: number;
  readonly interactionProbability: number;
  /** Inelastic interaction rate R = L σ_inel [Hz]. */
  readonly inelasticRateHz: number;
  readonly rates: readonly RateRow[];
  /** P(n; μ) for n = 0 … nMax. */
  readonly pileUpPmf: readonly number[];
}

export function computeColliderOperation(acc: AcceleratorState, beam: BeamModelState): ColliderOperation {
  const L = beam.luminosityCm2s;
  const scheme = lhcLikeScheme(beam.bunches.bunchesPerBeam);
  const timing = bunchTiming(acc.circumferenceM, acc.kinematics.beta, scheme);
  const sigmaInelCm2 = REFERENCE_CROSS_SECTIONS.inelastic!.value * CM2_PER_PB;
  const mu = meanInteractionsPerCrossing(L, sigmaInelCm2, scheme.filled, timing.revolutionFrequencyHz);
  const nMax = Math.max(10, Math.ceil(mu + 5 * Math.sqrt(mu) + 5));
  return {
    luminosityCm2s: L,
    scheme,
    timing,
    mu,
    interactionProbability: interactionProbability(mu),
    inelasticRateHz: L * sigmaInelCm2,
    rates: rateTable(L),
    pileUpPmf: Array.from({ length: nMax + 1 }, (_, n) => poissonPmf(n, mu)),
  };
}
