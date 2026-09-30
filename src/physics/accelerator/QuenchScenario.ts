/**
 * Builds Quench V2 parameters from the current accelerator state: operating current and field,
 * temperature, load-line fraction (1 − margin), superconductor critical parameters, and the
 * inductance implied by the magnet's stored energy (L = 2E/I²). Conductor geometry uses the
 * LHC main-dipole values for every machine (educational simplification).
 */
import type { AcceleratorState } from './AcceleratorCore';
import { SUPERCONDUCTORS } from './MagnetModel';
import { LHC_DIPOLE_QUENCH, type QuenchV2Params } from './QuenchModelV2';

export interface QuenchControls {
  /** Disturbance energy deposited locally [J] (e.g. beam loss, conductor motion). */
  readonly disturbanceJ: number;
  /** Energy-extraction resistor across the magnet [Ω]. */
  readonly dumpResistanceOhm: number;
  readonly heatersEnabled: boolean;
}

export const DEFAULT_QUENCH_CONTROLS: QuenchControls = { disturbanceJ: 0.5, dumpResistanceOhm: 0, heatersEnabled: true };

export function quenchParamsFor(acc: AcceleratorState, c: QuenchControls): QuenchV2Params {
  const m = acc.magnet;
  const sc = SUPERCONDUCTORS[m.spec.technology];
  const I = Math.max(m.currentA, 1);
  return {
    ...LHC_DIPOLE_QUENCH,
    currentA: I,
    fieldT: m.operatingFieldT,
    operatingTemperatureK: m.temperatureK,
    loadLineFraction: Math.min(0.999, Math.max(0.01, 1 - m.margin)),
    inductanceH: m.storedEnergyJ > 0 ? (2 * m.storedEnergyJ) / (I * I) : LHC_DIPOLE_QUENCH.inductanceH,
    tc0K: sc.tc0K,
    bc20T: sc.bc20T,
    disturbanceJ: c.disturbanceJ,
    dumpResistanceOhm: c.dumpResistanceOhm,
    // Without heaters the coil still becomes normal, but only by propagation (much slower).
    heaterDelayS: c.heatersEnabled ? LHC_DIPOLE_QUENCH.heaterDelayS : 1e9,
    durationS: c.heatersEnabled ? LHC_DIPOLE_QUENCH.durationS : 20,
  };
}
