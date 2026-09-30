/**
 * Synchrotron radiation — educational estimate.
 *
 * Energy radiated per turn by one particle of charge Ze on an isomagnetic ring
 * (radiation only in dipoles, bending radius ρ):
 *
 *     U₀ = Z² e² β³ γ⁴ / (3 ε₀ ρ)                          [J]
 *
 * Since γ = E/m, this gives the familiar scaling U₀ ∝ Z² E⁴ / (m⁴ ρ).
 * Cross-checks: electron at 1 GeV on ρ = 1 m → 88.5 keV (C_γ = 8.846e-5 m/GeV³);
 * LHC proton at 7 TeV, ρ = 2804 m → ≈ 6.7 keV/turn [LHC-DR].
 *
 * Limitations (see docs/known-approximations.md): classical formula; ignores quantum
 * recoil (valid while critical photon energy ≪ E), radiation in quadrupoles/insertions,
 * and damping/equilibrium dynamics. When U₀ approaches E the formula has left its domain
 * of validity; callers flag that as non-physical rather than trusting the number.
 */
import {
  ELEMENTARY_CHARGE_C,
  SPEED_OF_LIGHT_M_PER_S,
  VACUUM_PERMITTIVITY_F_PER_M,
} from '../constants/physicalConstants';
import { jouleToGeV } from '../../utils/units';

/** ħc [GeV·m] for the critical photon energy. */
const HBAR_C_GEV_M = 1.973_269_804e-16;

export interface SynchrotronResult {
  /** Energy loss per particle per turn [GeV]. */
  readonly energyLossPerTurnGeV: number;
  /** U₀ / E — fractional loss per turn. */
  readonly fractionalLossPerTurn: number;
  /** Instantaneous radiated power per particle while in a dipole [W]. */
  readonly powerPerParticleW: number;
  /** Critical photon energy ε_c = (3/2) ħ c γ³ / ρ [GeV]. */
  readonly criticalPhotonEnergyGeV: number;
  /** Average radiated power per particle over a turn [W]: U₀ · f_rev. */
  readonly averagePowerPerParticleW: number;
}

export function synchrotronLoss(params: {
  chargeE: number;
  gamma: number;
  beta: number;
  totalEnergyGeV: number;
  bendingRadiusM: number;
  circumferenceM: number;
}): SynchrotronResult {
  const { chargeE, gamma, beta, totalEnergyGeV, bendingRadiusM, circumferenceM } = params;
  const Z2 = chargeE * chargeE;
  if (Z2 === 0 || !Number.isFinite(bendingRadiusM) || bendingRadiusM <= 0 || !Number.isFinite(gamma)) {
    return { energyLossPerTurnGeV: 0, fractionalLossPerTurn: 0, powerPerParticleW: 0, criticalPhotonEnergyGeV: 0, averagePowerPerParticleW: 0 };
  }
  const e2 = ELEMENTARY_CHARGE_C * ELEMENTARY_CHARGE_C;
  const g4 = gamma ** 4;
  const U0_J = (Z2 * e2 * beta ** 3 * g4) / (3 * VACUUM_PERMITTIVITY_F_PER_M * bendingRadiusM);
  const U0 = jouleToGeV(U0_J);

  // Instantaneous power in the dipole: P = Z² e² c β⁴ γ⁴ / (6π ε₀ ρ²).
  const P =
    (Z2 * e2 * SPEED_OF_LIGHT_M_PER_S * beta ** 4 * g4) /
    (6 * Math.PI * VACUUM_PERMITTIVITY_F_PER_M * bendingRadiusM * bendingRadiusM);

  const fRev = (beta * SPEED_OF_LIGHT_M_PER_S) / circumferenceM;
  return {
    energyLossPerTurnGeV: U0,
    fractionalLossPerTurn: totalEnergyGeV > 0 ? U0 / totalEnergyGeV : 0,
    powerPerParticleW: P,
    criticalPhotonEnergyGeV: (1.5 * HBAR_C_GEV_M * gamma ** 3) / bendingRadiusM,
    averagePowerPerParticleW: U0_J * fRev,
  };
}
