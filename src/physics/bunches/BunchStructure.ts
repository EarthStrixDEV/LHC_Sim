/**
 * Bunch structure and crossing timing.
 *
 * The LHC RF system (400.8 MHz, harmonic h = 35 640) defines 2.5 ns buckets; bunches are
 * placed every 10th bucket → 3 564 slots of 24.95 ns per turn. A filling scheme fills slots
 * in trains separated by gaps (injection-kicker rise times) plus the ~3 µs abort gap.
 *
 * Educational filling scheme: trains of `trainLength` bunches, `trainGap` empty slots
 * between trains, and an abort gap at the end of the turn. Both beams share the pattern,
 * so every filled slot collides at the IP (real schemes differ per IP — VERIFY for IP8).
 */
import { SPEED_OF_LIGHT_M_PER_S } from '../constants/physicalConstants';

export const LHC_HARMONIC = 35_640;
export const LHC_SLOTS_PER_TURN = 3_564;
/** Abort-gap length in 25 ns slots (≈ 3 µs). */
export const LHC_ABORT_GAP_SLOTS = 119;

export interface FillingSchemeSpec {
  readonly slots: number;
  readonly bunches: number;
  readonly trainLength: number;
  readonly trainGap: number;
  readonly abortGap: number;
}

export interface FillingScheme {
  readonly spec: FillingSchemeSpec;
  /** 1 = filled slot, 0 = empty. */
  readonly pattern: Uint8Array;
  readonly filled: number;
  readonly trains: number;
}

export function buildFillingScheme(spec: FillingSchemeSpec): FillingScheme {
  const pattern = new Uint8Array(spec.slots);
  const usable = spec.slots - spec.abortGap;
  let slot = 0, filled = 0, trains = 0;
  while (filled < spec.bunches && slot < usable) {
    const n = Math.min(spec.trainLength, spec.bunches - filled, usable - slot);
    if (n <= 0) break;
    pattern.fill(1, slot, slot + n);
    filled += n;
    trains++;
    slot += n + spec.trainGap;
  }
  return { spec, pattern, filled, trains };
}

export interface BunchTiming {
  readonly revolutionFrequencyHz: number;
  /** Slot (bucket-group) spacing [ns]. */
  readonly slotSpacingNs: number;
  /** Mean crossing rate at an IP (filled slots × f_rev) [Hz]. */
  readonly meanCrossingRateHz: number;
  /** Rate if every slot were filled (the "40 MHz" clock) [Hz]. */
  readonly slotRateHz: number;
}

export function bunchTiming(circumferenceM: number, beta: number, scheme: FillingScheme): BunchTiming {
  const fRev = (beta * SPEED_OF_LIGHT_M_PER_S) / circumferenceM;
  const slotSpacingNs = 1e9 / (fRev * scheme.spec.slots);
  return { revolutionFrequencyHz: fRev, slotSpacingNs, meanCrossingRateHz: scheme.filled * fRev, slotRateHz: scheme.spec.slots * fRev };
}

/** Times [ns] of the next `count` bunch crossings at the IP, starting at slot 0 of turn 0. */
export function crossingTimesNs(scheme: FillingScheme, timing: BunchTiming, count: number): number[] {
  const out: number[] = [];
  const turnNs = 1e9 / timing.revolutionFrequencyHz;
  for (let turn = 0; out.length < count; turn++) {
    for (let s = 0; s < scheme.pattern.length && out.length < count; s++) {
      if (scheme.pattern[s]) out.push(turn * turnNs + s * timing.slotSpacingNs);
    }
    if (scheme.filled === 0) break;
  }
  return out;
}

/**
 * Mean number of inelastic interactions per crossing:
 *   μ = L σ_inel / (n_b f_rev)
 */
export function meanInteractionsPerCrossing(luminosityCm2s: number, sigmaInelCm2: number, collidingBunches: number, revolutionFrequencyHz: number): number {
  if (collidingBunches <= 0) return 0;
  return (luminosityCm2s * sigmaInelCm2) / (collidingBunches * revolutionFrequencyHz);
}

/** Probability that a crossing contains at least one inelastic interaction: 1 − e^{−μ}. */
export function interactionProbability(mu: number): number {
  return 1 - Math.exp(-mu);
}

/** Educational LHC-like scheme for a requested number of bunches (trains of 48, 7-slot gaps). */
export function lhcLikeScheme(bunches: number): FillingScheme {
  return buildFillingScheme({ slots: LHC_SLOTS_PER_TURN, bunches, trainLength: 48, trainGap: 7, abortGap: LHC_ABORT_GAP_SLOTS });
}
