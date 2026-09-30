/**
 * Configurable, parameterized detector response (educational).
 *
 * Scales are applied to each detector's nominal parameters; scenarios add dead and noisy
 * channels. Everything is deterministic: dead channels depend only on the detector and the
 * dead fraction ("a bad run"), noise depends on the event seed.
 */
import type { DetectorModel } from '../../physics/detector/DetectorModel';

export interface ResponseConfig {
  /** Multiplies every tracker layer's hit efficiency (result clamped to [0, 1]). */
  readonly hitEfficiencyScale: number;
  /** Multiplies single-hit position resolutions. */
  readonly hitResolutionScale: number;
  /** Multiplies track and muon momentum resolutions (a and b terms). */
  readonly momentumResolutionScale: number;
  /** Multiplies calorimeter stochastic and constant terms (energy smearing). */
  readonly caloResolutionScale: number;
  /** Calorimeter energy scale (miscalibration); 1 = calibrated. */
  readonly caloEnergyScale: number;
  /** Tracking acceptance |η| limit; null = detector nominal. */
  readonly trackerEtaMax: number | null;
  /** Fraction of tracker modules and calorimeter cells that are dead (scenario). */
  readonly deadFraction: number;
  /** Mean number of noisy calorimeter cells per event and calorimeter (scenario). */
  readonly noisyCellsPerEvent: number;
  /** Mean energy of a noisy cell [GeV] (exponential). */
  readonly noiseMeanGeV: number;
}

export const NOMINAL_RESPONSE: ResponseConfig = {
  hitEfficiencyScale: 1,
  hitResolutionScale: 1,
  momentumResolutionScale: 1,
  caloResolutionScale: 1,
  caloEnergyScale: 1,
  trackerEtaMax: null,
  deadFraction: 0,
  noisyCellsPerEvent: 0,
  noiseMeanGeV: 0.5,
};

export const RESPONSE_PRESETS: Record<string, { label: string; config: ResponseConfig }> = {
  nominal: { label: 'Nominal', config: NOMINAL_RESPONSE },
  degradedTracker: { label: 'Degraded tracker (90 % efficiency, 2× hit resolution)', config: { ...NOMINAL_RESPONSE, hitEfficiencyScale: 0.9, hitResolutionScale: 2, momentumResolutionScale: 2 } },
  miscalibrated: { label: 'Miscalibrated calorimeter (−5 % scale, 2× smearing)', config: { ...NOMINAL_RESPONSE, caloEnergyScale: 0.95, caloResolutionScale: 2 } },
  deadNoisy: { label: 'Dead (5 %) and noisy channels', config: { ...NOMINAL_RESPONSE, deadFraction: 0.05, noisyCellsPerEvent: 40, noiseMeanGeV: 0.6 } },
};

export function isNominal(c: ResponseConfig): boolean {
  return (Object.keys(NOMINAL_RESPONSE) as (keyof ResponseConfig)[]).every((k) => c[k] === NOMINAL_RESPONSE[k]);
}

/** Detector with scaled response parameters (geometry and field untouched). */
export function applyResponseConfig(det: DetectorModel, c: ResponseConfig): DetectorModel {
  if (isNominal(c)) return det;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const m = c.momentumResolutionScale;
  return {
    ...det,
    trackerLayers: det.trackerLayers.map((l) => ({ ...l, efficiency: clamp01(l.efficiency * c.hitEfficiencyScale), resolutionM: l.resolutionM * c.hitResolutionScale })),
    trackerEtaMax: c.trackerEtaMax ?? det.trackerEtaMax,
    trackResolution: { a: det.trackResolution.a * m, b: det.trackResolution.b * m },
    muonResolution: { a: det.muonResolution.a * m, b: det.muonResolution.b * m },
    ecal: { ...det.ecal, stochastic: det.ecal.stochastic * c.caloResolutionScale, constant: det.ecal.constant * c.caloResolutionScale },
    hcal: { ...det.hcal, stochastic: det.hcal.stochastic * c.caloResolutionScale, constant: det.hcal.constant * c.caloResolutionScale },
  };
}

/** Scenario parameters consumed inside the detector-response simulation. */
export interface ChannelScenario {
  readonly deadFraction: number;
  readonly noisyCellsPerEvent: number;
  readonly noiseMeanGeV: number;
  readonly caloEnergyScale: number;
}

export function scenarioOf(c: ResponseConfig): ChannelScenario {
  return { deadFraction: c.deadFraction, noisyCellsPerEvent: c.noisyCellsPerEvent, noiseMeanGeV: c.noiseMeanGeV, caloEnergyScale: c.caloEnergyScale };
}

/** Deterministic pseudo-random number in [0, 1) for a channel key (dead-channel maps). */
export function channelHash(detId: string, key: number): number {
  let h = 2166136261 ^ key;
  for (let i = 0; i < detId.length; i++) h = Math.imul(h ^ detId.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
