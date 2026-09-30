/**
 * Unit conventions and explicit conversion utilities.
 *
 * Internal conventions (see docs/physics-model.md §Units):
 *   length       metre            [m]
 *   time         second           [s]   (ns only at presentation / animation boundaries)
 *   magnetic B   tesla            [T]
 *   temperature  kelvin           [K]
 *   charge       elementary units [e]   (a particle "charge" field of -1 means -1 e)
 *   energy, momentum, mass
 *                GeV, GeV/c, GeV/c² — natural units with c = 1 inside the particle-physics
 *                layer. Joules are available through the explicit conversions below.
 *
 * Energies are kept in GeV rather than joules because every quantity of interest
 * (rigidity, √s, invariant mass) is defined and quoted in GeV in the literature, and a
 * single conversion point avoids scattered 1.602e-10 factors.
 */
import { ELEMENTARY_CHARGE_C, SPEED_OF_LIGHT_M_PER_S } from '../physics/constants/physicalConstants';

// ---- Energy -------------------------------------------------------------------------

export const EV_PER_KEV = 1e3;
export const EV_PER_MEV = 1e6;
export const EV_PER_GEV = 1e9;
export const EV_PER_TEV = 1e12;
export const GEV_PER_TEV = 1e3;
export const GEV_PER_MEV = 1e-3;

export const eVToJoule = (eV: number): number => eV * ELEMENTARY_CHARGE_C;
export const jouleToEV = (J: number): number => J / ELEMENTARY_CHARGE_C;
export const gevToJoule = (GeV: number): number => eVToJoule(GeV * EV_PER_GEV);
export const jouleToGeV = (J: number): number => jouleToEV(J) / EV_PER_GEV;
export const tevToGeV = (TeV: number): number => TeV * GEV_PER_TEV;
export const gevToTeV = (GeV: number): number => GeV / GEV_PER_TEV;
export const mevToGeV = (MeV: number): number => MeV * GEV_PER_MEV;
export const gevToEV = (GeV: number): number => GeV * EV_PER_GEV;
export const eVToGeV = (eV: number): number => eV / EV_PER_GEV;

// ---- Momentum -----------------------------------------------------------------------

/** GeV/c → kg·m/s. */
export const gevPerCToSI = (p: number): number => gevToJoule(p) / SPEED_OF_LIGHT_M_PER_S;
/** kg·m/s → GeV/c. */
export const siToGevPerC = (p: number): number => jouleToGeV(p * SPEED_OF_LIGHT_M_PER_S);

// ---- Time ---------------------------------------------------------------------------

export const NS_PER_S = 1e9;
export const secondsToNs = (s: number): number => s * NS_PER_S;
export const nsToSeconds = (ns: number): number => ns / NS_PER_S;

// ---- Length -------------------------------------------------------------------------

export const M_PER_KM = 1e3;
export const M_PER_MM = 1e-3;
export const M_PER_UM = 1e-6;
export const M_PER_CM = 1e-2;
export const kmToM = (km: number): number => km * M_PER_KM;
export const mmToM = (mm: number): number => mm * M_PER_MM;

// ---- Magnetic field ------------------------------------------------------------------

export const GAUSS_PER_TESLA = 1e4;

// ---- Temperature ----------------------------------------------------------------------

export const ZERO_CELSIUS_K = 273.15;
export const celsiusToKelvin = (c: number): number => c + ZERO_CELSIUS_K;
export const kelvinToCelsius = (k: number): number => k - ZERO_CELSIUS_K;

// ---- Luminosity -----------------------------------------------------------------------
// Luminosity is quoted in cm⁻² s⁻¹ in accelerator literature; SI is m⁻² s⁻¹.

export const CM2_PER_M2 = 1e4;
export const lumiCm2ToM2 = (L_cm: number): number => L_cm * CM2_PER_M2;
export const lumiM2ToCm2 = (L_m: number): number => L_m / CM2_PER_M2;
/** 1 barn = 1e-24 cm². Integrated luminosity 1 fb⁻¹ = 1e39 cm⁻². */
export const CM2_PER_BARN = 1e-24;
export const INV_FB_IN_INV_CM2 = 1e39;

// ---- Formatting helpers (presentation only; never used for physics) -------------------

const SI_PREFIXES: ReadonlyArray<[number, string]> = [
  [1e15, 'P'],
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
];

/** Formats an energy given in GeV with an auto-selected eV prefix, e.g. 6.8e3 → "6.80 TeV". */
export function formatEnergyGeV(GeV: number, digits = 3): string {
  if (!Number.isFinite(GeV)) return String(GeV);
  return formatSI(gevToEV(GeV), 'eV', digits);
}

export function formatSI(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return `${value} ${unit}`;
  const a = Math.abs(value);
  if (a === 0) return `0 ${unit}`;
  for (const [scale, prefix] of SI_PREFIXES) {
    if (a >= scale) return `${(value / scale).toPrecision(digits)} ${prefix}${unit}`;
  }
  return `${value.toExponential(digits - 1)} ${unit}`;
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return String(value);
  const a = Math.abs(value);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return value.toExponential(digits - 1);
  return value.toPrecision(digits);
}
