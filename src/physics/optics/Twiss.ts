/**
 * Twiss parameters and beam size.
 *
 *   γ = (1 + α²) / β,     σ = √(ε β),     ε = ε_n / (β_rel γ_rel)
 *
 * ε is the geometric (un-normalized) rms emittance; ε_n is invariant under acceleration.
 * All conversions go through these two functions so normalized/geometric are never mixed.
 */
import type { Mat2, Twiss } from '../beam/BeamOptics';
import { propagateTwiss } from '../beam/BeamOptics';

export type { Twiss };

export function twiss(beta: number, alpha: number): Twiss {
  if (!(beta > 0)) throw new RangeError('β must be positive');
  return { beta, alpha, gamma: (1 + alpha * alpha) / beta };
}

/** Courant–Snyder invariant check: βγ − α² = 1. */
export function twissInvariant(t: Twiss): number {
  return t.beta * t.gamma - t.alpha * t.alpha;
}

export function geometricEmittance(normalizedM: number, betaGamma: number): number {
  return normalizedM / betaGamma;
}

export function normalizedEmittance(geometricM: number, betaGamma: number): number {
  return geometricM * betaGamma;
}

/** rms beam size σ = √(ε β). */
export function beamSize(geometricEmittanceM: number, betaM: number): number {
  return Math.sqrt(geometricEmittanceM * betaM);
}

/** Drift from a waist (α* = 0): β(s) = β* + s²/β*, α(s) = −s/β*. */
export function driftFromWaist(betaStarM: number, s: number): Twiss {
  return twiss(betaStarM + (s * s) / betaStarM, -s / betaStarM);
}

export { propagateTwiss };
export type { Mat2 };
