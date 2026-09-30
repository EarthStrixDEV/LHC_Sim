/**
 * BeamModel — bunch population, beam current, stored energy, arc optics and a
 * luminosity estimate for the current accelerator state.
 *
 * Luminosity for round Gaussian beams colliding head-on (per IP):
 *     L = f_rev · n_b · N₁N₂ / (4π σ*²) · F,    σ*² = ε_geo · β*
 */
import type { AcceleratorState } from '../accelerator/AcceleratorCore';
import type { BunchParameters } from '../accelerator/MachinePreset';
import type { PhysicsWarning } from '../accelerator/MachineValidator';
import { ELEMENTARY_CHARGE_C } from '../constants/physicalConstants';
import { LHC } from '../constants/acceleratorConstants';
import { gevToJoule, lumiM2ToCm2 } from '../../utils/units';
import { computeEnvelope, type EnvelopeSamples } from './BeamEnvelope';
import { buildFodoCell, gradientForPhaseAdvance, type FodoCell } from './FODOLattice';

/** Heavy-ion bunch parameters (HL-LHC Pb baseline order of magnitude) — VERIFY. */
const ION_BUNCHES: BunchParameters = {
  bunchesPerBeam: 1240,
  particlesPerBunch: 1.8e8,
  geometricReductionFactor: 0.84,
  source: 'HL-TDR Pb–Pb baseline (VERIFY; light ions use the same placeholder)',
};

export interface BeamModelState {
  readonly bunches: BunchParameters;
  readonly particlesPerBeam: number;
  readonly beamCurrentA: number;
  readonly storedBeamEnergyJ: number;
  /** Synchrotron-radiation power of the whole beam [W] (U₀ · f_rev · N). */
  readonly synchrotronPowerW: number;
  readonly quadGradientTPerM: number;
  readonly gradientSource: 'design-phase-advance' | 'user';
  readonly gradientExceedsLimit: boolean;
  readonly cell: FodoCell;
  readonly envelope: EnvelopeSamples;
  readonly sigmaStarM: number;
  /** Estimated peak luminosity per high-luminosity IP [cm⁻²s⁻¹]; 0 if not meaningful. */
  readonly luminosityCm2s: number;
  readonly warnings: readonly PhysicsWarning[];
}

export function computeBeamModel(acc: AcceleratorState, quadGradientOverrideTPerM?: number): BeamModelState {
  const m = acc.machine;
  const bunches = acc.species.kind === 'ion' ? ION_BUNCHES : m.protonBunches;
  const particlesPerBeam = bunches.bunchesPerBeam * bunches.particlesPerBunch;
  const beamCurrentA = particlesPerBeam * Math.abs(acc.chargeE) * ELEMENTARY_CHARGE_C * acc.revolutionFrequencyHz;
  const storedBeamEnergyJ = particlesPerBeam * gevToJoule(acc.kinematics.totalEnergyGeV);

  const optics = m.arcOptics;
  const designGradient = gradientForPhaseAdvance(
    optics.cellLengthM,
    optics.quadMagneticLengthM,
    acc.rigidityTm,
    (optics.phaseAdvanceDeg * Math.PI) / 180,
  );
  const useOverride = acc.mode === 'sandbox' && quadGradientOverrideTPerM !== undefined;
  const gradient = useOverride ? quadGradientOverrideTPerM : designGradient;

  const cell = buildFodoCell({
    cellLengthM: optics.cellLengthM,
    quadLengthM: optics.quadMagneticLengthM,
    quadGradientTPerM: Number.isFinite(gradient) ? gradient : 0,
    rigidityTm: acc.rigidityTm,
    dipolesPerHalfCell: 3,
    dipoleLengthM: LHC.dipoleMagneticLength.value * (optics.cellLengthM / LHC.arcCellLength.value),
  });
  const envelope = computeEnvelope(cell, optics.normalizedEmittanceM, acc.kinematics.betaGamma);

  const warnings: PhysicsWarning[] = [];
  const gradientExceedsLimit = Number.isFinite(gradient) && gradient > optics.quadMaxGradientTPerM;
  if (gradientExceedsLimit) {
    warnings.push({
      code: 'QUAD_GRADIENT_LIMIT',
      severity: acc.mode === 'physics' ? 'error' : 'warning',
      title: 'QUADRUPOLE GRADIENT LIMIT',
      explanation: `Focusing this beam needs ${gradient.toFixed(0)} T/m but arc quadrupoles reach ${optics.quadMaxGradientTPerM} T/m. Quadrupole strength k = G/Bρ falls as rigidity grows.`,
    });
  }
  if (!envelope.stableX || !envelope.stableY) {
    warnings.push({
      code: 'OPTICS_UNSTABLE',
      severity: 'error',
      title: 'OPTICS UNSTABLE',
      explanation: `FODO cell has |Tr(M)/2| ≥ 1 in the ${!envelope.stableX ? 'horizontal' : 'vertical'} plane: no bounded betatron motion. Focusing is too strong (over-focusing) or absent for this rigidity.`,
    });
  }

  // Luminosity only when the configuration can actually hold a beam.
  const betaStar = m.interactionRegion.betaStarM;
  const sigmaStar = Math.sqrt(envelope.geometricEmittanceM * betaStar);
  let luminosityCm2s = 0;
  const beamCanExist = acc.feasibility === "FEASIBLE" || acc.feasibility === "MARGINAL";
  if (beamCanExist && sigmaStar > 0 && Number.isFinite(sigmaStar) && acc.chargeE !== 0) {
    const N = bunches.particlesPerBunch;
    const Lm2 = (acc.revolutionFrequencyHz * bunches.bunchesPerBeam * N * N) / (4 * Math.PI * sigmaStar * sigmaStar);
    luminosityCm2s = lumiM2ToCm2(Lm2 * bunches.geometricReductionFactor);
  }

  return {
    bunches,
    particlesPerBeam,
    beamCurrentA,
    storedBeamEnergyJ,
    synchrotronPowerW: acc.synchrotron.averagePowerPerParticleW * particlesPerBeam,
    quadGradientTPerM: gradient,
    gradientSource: useOverride ? 'user' : 'design-phase-advance',
    gradientExceedsLimit,
    cell,
    envelope,
    sigmaStarM: sigmaStar,
    luminosityCm2s,
    warnings,
  };
}
