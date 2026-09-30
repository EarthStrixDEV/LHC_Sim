/**
 * Magnetic rigidity and relativistic kinematics for a circulating species.
 *
 * Core relation (valid for any charge; no proton assumption):
 *     p [GeV/c] = 0.299792458 · |q/e| · B[T] · ρ[m]
 *     Bρ [T·m]  = p[GeV/c] / (0.299792458 · |q/e|)
 *
 * All energies/momenta in GeV (c = 1).
 */
import { RIGIDITY_GEV_PER_TM } from '../constants/physicalConstants';

export interface Kinematics {
  readonly massGeV: number;
  readonly momentumGeV: number;
  readonly totalEnergyGeV: number;
  readonly kineticEnergyGeV: number;
  readonly gamma: number;
  readonly beta: number;
  readonly betaGamma: number;
  /** 1 − β computed without cancellation: m² / (E (E + p)). */
  readonly oneMinusBeta: number;
}

export function kinematicsFromMomentum(massGeV: number, momentumGeV: number): Kinematics {
  const p = Math.abs(momentumGeV);
  const E = Math.sqrt(p * p + massGeV * massGeV);
  return build(massGeV, p, E);
}

/** Total energy E must be ≥ m; values below m are clamped to rest (p = 0) and flagged by callers. */
export function kinematicsFromTotalEnergy(massGeV: number, totalEnergyGeV: number): Kinematics {
  const E = Math.max(totalEnergyGeV, massGeV);
  const p = Math.sqrt(Math.max(E * E - massGeV * massGeV, 0));
  return build(massGeV, p, E);
}

function build(m: number, p: number, E: number): Kinematics {
  // γ = E/m and β = p/E. For massless particles γ is infinite; β = 1.
  const gamma = m > 0 ? E / m : Number.POSITIVE_INFINITY;
  const beta = E > 0 ? p / E : 0;
  const betaGamma = m > 0 ? p / m : Number.POSITIVE_INFINITY;
  return {
    massGeV: m,
    momentumGeV: p,
    totalEnergyGeV: E,
    kineticEnergyGeV: E - m,
    gamma,
    beta,
    betaGamma,
    oneMinusBeta: E > 0 ? (m * m) / (E * (E + p)) : 1,
  };
}

/** Bρ [T·m] for momentum p [GeV/c] and charge q [e]. Infinite for neutral particles. */
export function magneticRigidityTm(momentumGeV: number, chargeE: number): number {
  const z = Math.abs(chargeE);
  if (z === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(momentumGeV) / (RIGIDITY_GEV_PER_TM * z);
}

/** Dipole field [T] needed to bend rigidity Bρ on radius ρ. */
export function requiredDipoleFieldT(rigidityTm: number, bendingRadiusM: number): number {
  return rigidityTm / bendingRadiusM;
}

/** Bending radius [m] of rigidity Bρ in field B. Infinite when B = 0. */
export function bendingRadiusM(rigidityTm: number, fieldT: number): number {
  const b = Math.abs(fieldT);
  return b === 0 ? Number.POSITIVE_INFINITY : rigidityTm / b;
}

/** Maximum momentum [GeV/c] a ring of radius ρ with field B can hold for charge q. */
export function maxMomentumGeV(fieldT: number, bendingRadiusM: number, chargeE: number): number {
  return RIGIDITY_GEV_PER_TM * Math.abs(chargeE) * Math.abs(fieldT) * bendingRadiusM;
}

/**
 * Signed curvature direction for a particle moving along +s in a field +B (vertical):
 * the Lorentz force q v × B points inward for q·B > 0 in a right-handed (s, x, y) frame.
 * Returns +1, −1 or 0 (neutral).
 */
export function bendingSign(chargeE: number, fieldT: number): number {
  return Math.sign(chargeE) * Math.sign(fieldT);
}
