/**
 * IR optics for the current machine state: emittance from the machine preset (ε = ε_n/βγ at
 * the current energy), bunch length and crossing-angle defaults per machine (VERIFY).
 */
import type { AcceleratorState } from '../accelerator/AcceleratorCore';
import type { MachineId } from '../accelerator/MachinePreset';
import { computeIROptics, type IROptics } from './InteractionRegionOptics';
import { geometricEmittance } from './Twiss';

/** rms bunch length [m]: LHC design 7.55 cm (LHC-DR); others use the same value (VERIFY). */
export const BUNCH_LENGTH_M = 0.0755;

/** Default full crossing angle [µrad] at the high-luminosity IPs (order of magnitude, VERIFY). */
export const DEFAULT_CROSSING_URAD: Record<MachineId, number> = {
  lhc: 320,
  'hl-lhc': 500,
  'fcc-hh': 200,
  sandbox: 320,
};

export interface IRSettings {
  readonly betaStarM: number;
  readonly fullCrossingAngleUrad: number;
  /** IP1 (ATLAS) crosses vertically, IP5 (CMS) horizontally in Run 3. */
  readonly ip: 'IP1' | 'IP5';
}

export function defaultIRSettings(acc: AcceleratorState): IRSettings {
  return { betaStarM: acc.machine.interactionRegion.betaStarM, fullCrossingAngleUrad: DEFAULT_CROSSING_URAD[acc.machine.id], ip: 'IP1' };
}

export function irOpticsFor(acc: AcceleratorState, s: IRSettings): IROptics {
  return computeIROptics({
    betaStarM: s.betaStarM,
    geometricEmittanceM: geometricEmittance(acc.machine.arcOptics.normalizedEmittanceM, acc.kinematics.betaGamma),
    fullCrossingAngleRad: s.fullCrossingAngleUrad * 1e-6,
    crossingPlane: s.ip === 'IP1' ? 'y' : 'x',
    sigmaZM: BUNCH_LENGTH_M,
    bunchSpacingNs: 25,
  });
}
