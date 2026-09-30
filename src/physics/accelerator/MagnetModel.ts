/**
 * Superconducting magnet operating-margin model — EDUCATIONAL APPROXIMATION.
 *
 * This is not a conductor/FEM simulation. It captures one idea: a superconducting coil
 * can carry its field only below a temperature-dependent limit, and the distance to that
 * limit (the "margin") shrinks as field or temperature rise.
 *
 * 1. Upper critical field of the conductor (empirical form):
 *        Bc2(T) = Bc2(0) · (1 − (T/Tc0)^1.7)
 * 2. The magnet's short-sample (load-line) limit is assumed to scale like Bc2(T), anchored
 *    to one published operating point per magnet type:
 *        B_ss(T) = B_ss(T_ref) · Bc2(T) / Bc2(T_ref),   B_ss(T_ref) = B_ref / loadLineFraction
 * 3. Operating margin along the load line:  margin = 1 − B_op / B_ss(T).
 *
 * Coil current is taken proportional to field (iron saturation ignored).
 */
import { LHC } from '../constants/acceleratorConstants';

export type SuperconductorId = 'NbTi' | 'Nb3Sn';

export interface SuperconductorProperties {
  readonly id: SuperconductorId;
  readonly label: string;
  /** Critical temperature at zero field [K]. */
  readonly tc0K: number;
  /** Upper critical field at 0 K [T]. */
  readonly bc20T: number;
  readonly source: string;
}

export const SUPERCONDUCTORS: Record<SuperconductorId, SuperconductorProperties> = {
  NbTi: { id: 'NbTi', label: 'Nb-Ti', tc0K: 9.2, bc20T: 14.5, source: 'Bottura, IEEE TAS 10 (2000) 1054 (typical fit)' },
  Nb3Sn: { id: 'Nb3Sn', label: 'Nb₃Sn', tc0K: 18.0, bc20T: 28.0, source: 'Godeke, SuST 19 (2006) R68 (typical, VERIFY)' },
};

/** Exponent of the empirical Bc2(T) temperature dependence. */
const BC2_TEMPERATURE_EXPONENT = 1.7;

export interface MagnetSpec {
  readonly id: string;
  readonly label: string;
  readonly technology: SuperconductorId;
  /** Published operating (peak) field of the reference point [T]. */
  readonly referenceFieldT: number;
  readonly referenceTemperatureK: number;
  /** Fraction of the short-sample limit at the reference point (e.g. 0.86 ⇒ 14 % margin). */
  readonly referenceLoadLineFraction: number;
  readonly nominalCurrentA: number;
  readonly inductanceH: number;
  readonly source: string;
}

export const LHC_MAIN_DIPOLE: MagnetSpec = {
  id: 'lhc-mb',
  label: 'LHC main dipole (MB)',
  technology: 'NbTi',
  referenceFieldT: LHC.dipoleNominalField.value,
  referenceTemperatureK: LHC.nominalTemperature.value,
  referenceLoadLineFraction: 0.86,
  nominalCurrentA: LHC.dipoleNominalCurrent.value,
  inductanceH: LHC.dipoleInductance.value,
  source: 'LHC-DR (≈14 % load-line margin at 8.33 T, 1.9 K)',
};

export const FCC_HH_DIPOLE: MagnetSpec = {
  id: 'fcc-hh-mb',
  label: 'FCC-hh main dipole (concept)',
  technology: 'Nb3Sn',
  referenceFieldT: 14,
  referenceTemperatureK: 1.9,
  referenceLoadLineFraction: 0.86,
  nominalCurrentA: 11_000,
  inductanceH: 0.1,
  source: 'FCC-FS concept values — VERIFY',
};

/** Generic magnet used by Sandbox so that user fields are judged against a real conductor. */
export const SANDBOX_DIPOLE: MagnetSpec = { ...LHC_MAIN_DIPOLE, id: 'sandbox-mb', label: 'Sandbox dipole (LHC-class Nb-Ti)' };

export type MagnetState = 'STABLE' | 'LOW_MARGIN' | 'QUENCH_RISK' | 'QUENCHED';

/** Margin thresholds for state classification (educational choices). */
export const MARGIN_THRESHOLDS = {
  lowMargin: 0.1,
  quenchRisk: 0.03,
} as const;

export interface MagnetOperatingPoint {
  readonly spec: MagnetSpec;
  readonly operatingFieldT: number;
  readonly temperatureK: number;
  readonly nominalTemperatureK: number;
  readonly criticalFieldT: number;
  readonly shortSampleFieldT: number;
  /** 1 − B_op / B_ss(T); negative when beyond the limit. */
  readonly margin: number;
  readonly state: MagnetState;
  readonly currentA: number;
  readonly storedEnergyJ: number;
  readonly superconducting: boolean;
}

export function upperCriticalFieldT(sc: SuperconductorProperties, temperatureK: number): number {
  if (temperatureK >= sc.tc0K) return 0;
  return sc.bc20T * (1 - (Math.max(temperatureK, 0) / sc.tc0K) ** BC2_TEMPERATURE_EXPONENT);
}

export function shortSampleFieldT(spec: MagnetSpec, temperatureK: number): number {
  const sc = SUPERCONDUCTORS[spec.technology];
  const ref = upperCriticalFieldT(sc, spec.referenceTemperatureK);
  const now = upperCriticalFieldT(sc, temperatureK);
  const bssRef = spec.referenceFieldT / spec.referenceLoadLineFraction;
  return ref > 0 ? (bssRef * now) / ref : 0;
}

export function classifyMargin(margin: number): MagnetState {
  if (margin <= 0) return 'QUENCHED';
  if (margin < MARGIN_THRESHOLDS.quenchRisk) return 'QUENCH_RISK';
  if (margin < MARGIN_THRESHOLDS.lowMargin) return 'LOW_MARGIN';
  return 'STABLE';
}

export function evaluateMagnet(spec: MagnetSpec, operatingFieldT: number, temperatureK: number): MagnetOperatingPoint {
  const sc = SUPERCONDUCTORS[spec.technology];
  const bOp = Math.abs(operatingFieldT);
  const bss = shortSampleFieldT(spec, temperatureK);
  const margin = bss > 0 ? 1 - bOp / bss : -1;
  const superconducting = temperatureK < sc.tc0K && margin > 0;
  const currentA = (spec.nominalCurrentA * bOp) / spec.referenceFieldT;
  return {
    spec,
    operatingFieldT: bOp,
    temperatureK,
    nominalTemperatureK: spec.referenceTemperatureK,
    criticalFieldT: upperCriticalFieldT(sc, temperatureK),
    shortSampleFieldT: bss,
    margin,
    state: classifyMargin(margin),
    currentA,
    storedEnergyJ: 0.5 * spec.inductanceH * currentA * currentA,
    superconducting,
  };
}

// ---- Quench sequence -----------------------------------------------------------------------

export type QuenchPhase =
  | 'superconducting'
  | 'resistive-transition'
  | 'local-heating'
  | 'current-decay'
  | 'energy-extraction'
  | 'cryogenic-recovery';

export interface QuenchTimeline {
  /** Detection threshold + validation window before protection fires [s]. */
  readonly detectionDelayS: number;
  /** Quench-heater firing delay after detection [s]. */
  readonly heaterDelayS: number;
  /** Current decay constant in the quenched magnet (bypass diode) [s]. */
  readonly magnetCurrentTauS: number;
  /** Circuit energy-extraction time constant (dump resistor) [s]. */
  readonly circuitExtractionTauS: number;
  /** Educational peak hot-spot temperature [K] — design keeps it well below ~300 K. */
  readonly peakHotspotK: number;
}

export const LHC_QUENCH_TIMELINE: QuenchTimeline = {
  detectionDelayS: 0.01,
  heaterDelayS: LHC.quenchHeaterDelay.value,
  magnetCurrentTauS: LHC.quenchedMagnetCurrentDecayTau.value,
  circuitExtractionTauS: LHC.dipoleCircuitExtractionTau.value,
  peakHotspotK: 250,
};

export interface QuenchSnapshot {
  readonly phase: QuenchPhase;
  readonly timeS: number;
  /** Magnet current relative to the value at quench onset. */
  readonly currentFraction: number;
  /** Fraction of coil volume that is resistive. */
  readonly normalZoneFraction: number;
  readonly hotspotTemperatureK: number;
  /** Fraction of the magnet's stored energy dissipated so far. */
  readonly energyDissipatedFraction: number;
  readonly description: string;
}

const PHASE_TEXT: Record<QuenchPhase, string> = {
  'superconducting': 'Coil superconducting: zero resistance, current flows without dissipation.',
  'resistive-transition': 'A small coil region exceeded its critical surface and became resistive (normal zone).',
  'local-heating': 'Ohmic heating in the normal zone; quench heaters fire to spread the normal zone and avoid a hot spot.',
  'current-decay': 'Magnet current is diverted through its bypass diode and decays; stored energy is dissipated in the coil.',
  'energy-extraction': 'Circuit protection opens switches; remaining circuit energy is extracted into dump resistors.',
  'cryogenic-recovery': 'Current is off; the cryogenic system re-cools the magnet to 1.9 K (hours).',
};

/**
 * Educational quench timeline evaluated at time t after quench onset. A quench is a
 * controlled, protected transition — not an explosion. Helium venting is a separate
 * scenario flag in the visualization layer.
 */
export function quenchSnapshot(timeline: QuenchTimeline, t: number, baseTemperatureK: number): QuenchSnapshot {
  if (t < 0) {
    return { phase: 'superconducting', timeS: t, currentFraction: 1, normalZoneFraction: 0, hotspotTemperatureK: baseTemperatureK, energyDissipatedFraction: 0, description: PHASE_TEXT['superconducting'] };
  }
  const tHeaters = timeline.detectionDelayS + timeline.heaterDelayS;
  const tau = timeline.magnetCurrentTauS;
  // Current is essentially constant until protection acts, then decays exponentially.
  const decayT = Math.max(t - tHeaters, 0);
  const currentFraction = Math.exp(-decayT / tau);
  const energyDissipatedFraction = 1 - currentFraction * currentFraction;
  // Normal zone grows slowly by propagation, then rapidly when heaters fire.
  const normalZoneFraction =
    t < tHeaters ? 0.02 * (t / tHeaters) : Math.min(1, 0.02 + 0.98 * (1 - Math.exp(-(t - tHeaters) / (0.3 * tau))));
  const hotspotTemperatureK = baseTemperatureK + (timeline.peakHotspotK - baseTemperatureK) * energyDissipatedFraction;

  let phase: QuenchPhase;
  if (t < timeline.detectionDelayS) phase = 'resistive-transition';
  else if (t < tHeaters) phase = 'local-heating';
  else if (currentFraction > 0.05) phase = 'current-decay';
  else if (t < 5 * tau + tHeaters + 2) phase = 'energy-extraction';
  else phase = 'cryogenic-recovery';

  return { phase, timeS: t, currentFraction, normalZoneFraction, hotspotTemperatureK, energyDissipatedFraction, description: PHASE_TEXT[phase] };
}
