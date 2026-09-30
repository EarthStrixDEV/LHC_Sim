/**
 * Quench model V2 — simplified lumped thermal/electrical model of one superconducting magnet.
 * EDUCATIONAL: no 3D heat diffusion, no FEM, no detailed conductor or insulation model.
 *
 * Electrical (magnet with bypass diode, optional energy-extraction resistor):
 *   L dI/dt = −(R_nz(t) + R_dump) · I          E_mag = ½ L I²
 * Thermal, normal zone as one lumped volume V_nz = A·ℓ_nz with enthalpy U:
 *   dU/dt = P_Joule − P_cooling + u(T_op)·dV_nz/dt,    P_Joule = I² R_nz,   T_nz = u⁻¹(U/V_nz)
 *   R_nz = ρ_Cu(T_nz) · ℓ_nz / A_Cu
 * Hot spot (where the quench started, adiabatic):  C(T) dT/dt = ρ_Cu(T) J_Cu · J
 * Normal-zone growth: adiabatic longitudinal propagation (Wilson), two fronts,
 *   v = (J / C(T_s)) · √(L₀ T_s / (T_s − T_op))      (Wiedemann–Franz k = L₀T/ρ)
 * Critical surface (Nb-Ti): T_c(B) = T_c0 (1 − B/B_c20)^0.59; current-sharing temperature
 *   T_cs = T_op + (T_c(B) − T_op)(1 − I/I_c(B, T_op)).
 * Initiation: a disturbance ΔE deposited in a short conductor length raises its temperature;
 *   if it exceeds T_cs the zone becomes normal (otherwise it recovers — minimum quench energy).
 * Protection: detection when the resistive voltage exceeds a threshold for a validation time;
 *   the energy-extraction switch (if any) opens at detection, and quench heaters drive the whole
 *   coil normal after a delay.
 * Material properties: C(T) Debye-like interpolation of the cable metals plus an effective
 *   liquid-helium term at low temperature, ρ_Cu(T) with a
 *   residual term 1/RRR and a linear phonon term. All parameters are approximate (VERIFY).
 */
import { LHC } from '../constants/acceleratorConstants';

export interface QuenchV2Params {
  readonly inductanceH: number;
  readonly currentA: number;
  readonly fieldT: number;
  readonly operatingTemperatureK: number;
  /** I / I_c(B, T_op) at the operating point. */
  readonly loadLineFraction: number;
  /** Total conductor length in the coil [m]. */
  readonly conductorLengthM: number;
  /** Cable cross-section [m²] and copper fraction. */
  readonly cableAreaM2: number;
  readonly copperFraction: number;
  readonly rrr: number;
  /** Nb-Ti critical parameters. */
  readonly tc0K: number;
  readonly bc20T: number;
  /** Disturbance energy [J] deposited in `disturbanceLengthM` of conductor. */
  readonly disturbanceJ: number;
  readonly disturbanceLengthM: number;
  /** Cooling of the normal zone to the bath per metre of conductor per kelvin [W/(m·K)]. */
  readonly coolingWPerMK: number;
  readonly detectionThresholdV: number;
  readonly detectionValidationS: number;
  readonly heaterDelayS: number;
  /** Time for heaters to drive the full coil normal [s]. */
  readonly heaterSpreadS: number;
  /** Energy-extraction resistor across the magnet [Ω] (0 = none: energy absorbed by the coil). */
  readonly dumpResistanceOhm: number;
  readonly durationS: number;
}

/** LHC main dipole at nominal current (approximate, VERIFY). */
export const LHC_DIPOLE_QUENCH: QuenchV2Params = {
  inductanceH: LHC.dipoleInductance.value,
  currentA: LHC.dipoleNominalCurrent.value,
  fieldT: 8.33,
  operatingTemperatureK: 1.9,
  loadLineFraction: 0.86,
  conductorLengthM: 2300,
  cableAreaM2: 25e-6,
  copperFraction: 0.6,
  rrr: 150,
  tc0K: 9.2,
  bc20T: 14.5,
  disturbanceJ: 0.5,
  disturbanceLengthM: 0.01,
  coolingWPerMK: 0.05,
  detectionThresholdV: 0.1,
  detectionValidationS: 0.01,
  heaterDelayS: LHC.quenchHeaterDelay.value,
  heaterSpreadS: 0.02,
  dumpResistanceOhm: 0,
  durationS: 2.5,
};

const RHO_CU_293 = 1.72e-8;
/** Debye-like volumetric heat capacity of the cable metals [J/(m³·K)]. */
const C_MAX = 3.45e6;
const THETA_K = 76;
/**
 * Effective low-temperature heat capacity of the liquid helium permeating the cable
 * (superfluid He II at 1.9 K has a very large specific heat); it fades above ~4 K.
 * Order-of-magnitude educational value (VERIFY) — it controls the propagation velocity.
 */
const C_HELIUM_EFF = 2.0e4;
const LORENZ = 2.44e-8;

export function heatCapacity(T: number): number {
  const x = (T / THETA_K) ** 3;
  return C_MAX * (x / (1 + x)) + C_HELIUM_EFF / (1 + (T / 4.2) ** 6);
}

/** Volumetric enthalpy u(T) = ∫₀ᵀ C dT [J/m³] (tabulated). */
const U_TABLE = (() => {
  const dT = 0.05, n = Math.ceil(2000 / dT);
  const u = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) u[i] = u[i - 1]! + 0.5 * (heatCapacity((i - 1) * dT) + heatCapacity(i * dT)) * dT;
  return { dT, u };
})();

export function enthalpy(T: number): number {
  const f = Math.min(Math.max(T, 0), 2000) / U_TABLE.dT;
  const i = Math.min(Math.floor(f), U_TABLE.u.length - 2);
  return U_TABLE.u[i]! + (f - i) * (U_TABLE.u[i + 1]! - U_TABLE.u[i]!);
}

export function temperatureFromEnthalpy(u: number): number {
  const a = U_TABLE.u;
  if (u <= 0) return 0;
  let lo = 0, hi = a.length - 1;
  if (u >= a[hi]!) return hi * U_TABLE.dT;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (a[m]! <= u) lo = m;
    else hi = m;
  }
  return (lo + (u - a[lo]!) / (a[hi]! - a[lo]!)) * U_TABLE.dT;
}

export function copperResistivity(T: number, rrr: number): number {
  return RHO_CU_293 / rrr + RHO_CU_293 * Math.max(0, (T - 20) / 273);
}

export function criticalTemperature(p: QuenchV2Params): number {
  return p.tc0K * Math.pow(Math.max(0, 1 - p.fieldT / p.bc20T), 0.59);
}

export function currentSharingTemperature(p: QuenchV2Params, currentFraction = 1): number {
  const tc = criticalTemperature(p);
  return p.operatingTemperatureK + (tc - p.operatingTemperatureK) * (1 - p.loadLineFraction * currentFraction);
}

export function propagationVelocity(p: QuenchV2Params, I: number): number {
  const Ts = currentSharingTemperature(p, I / p.currentA);
  const J = I / p.cableAreaM2;
  return (J / heatCapacity(Ts)) * Math.sqrt((LORENZ * Ts) / Math.max(Ts - p.operatingTemperatureK, 1e-3));
}

/** Smallest disturbance energy that starts a quench (adiabatic, in the disturbance length). */
export function minimumQuenchEnergyJ(p: QuenchV2Params): number {
  const V = p.cableAreaM2 * p.disturbanceLengthM;
  return V * (enthalpy(currentSharingTemperature(p)) - enthalpy(p.operatingTemperatureK));
}

export type QuenchPhaseV2 = 'superconducting' | 'recovered' | 'resistive-transition' | 'local-heating' | 'current-decay' | 'energy-extraction' | 'cryogenic-recovery';

export interface QuenchV2Result {
  readonly params: QuenchV2Params;
  readonly quenched: boolean;
  readonly mqeJ: number;
  readonly tcsK: number;
  readonly initialVelocityMps: number;
  readonly detectionTimeS: number | null;
  readonly heaterTimeS: number | null;
  readonly t: Float64Array;
  readonly current: Float64Array;
  readonly resistance: Float64Array;
  readonly normalFraction: Float64Array;
  readonly hotSpotK: Float64Array;
  readonly normalZoneK: Float64Array;
  readonly voltage: Float64Array;
  readonly energyMagnet: Float64Array;
  readonly energyCoil: Float64Array;
  readonly energyDump: Float64Array;
  readonly energyCooling: Float64Array;
  readonly maxHotSpotK: number;
  /** |E_mag(0) − (E_mag + E_coil + E_dump)| / E_mag(0) at the end — integration check. */
  readonly energyBalanceError: number;
}

export function simulateQuenchV2(p: QuenchV2Params, dt = 2e-5, samples = 600): QuenchV2Result {
  const A = p.cableAreaM2, ACu = A * p.copperFraction;
  const E0 = 0.5 * p.inductanceH * p.currentA ** 2;
  const tcs = currentSharingTemperature(p);
  const mqe = minimumQuenchEnergyJ(p);
  const uOp = enthalpy(p.operatingTemperatureK);
  // Disturbance: adiabatic temperature of the disturbed length.
  const Vd = A * p.disturbanceLengthM;
  const Td = temperatureFromEnthalpy(uOp + p.disturbanceJ / Vd);
  const quenched = Td > tcs;

  const out = {
    t: new Float64Array(samples), current: new Float64Array(samples), resistance: new Float64Array(samples), normalFraction: new Float64Array(samples),
    hotSpotK: new Float64Array(samples), normalZoneK: new Float64Array(samples), voltage: new Float64Array(samples),
    energyMagnet: new Float64Array(samples), energyCoil: new Float64Array(samples), energyDump: new Float64Array(samples), energyCooling: new Float64Array(samples),
  };
  let I = p.currentA;
  let len = quenched ? p.disturbanceLengthM : 0;
  let U = quenched ? (uOp + p.disturbanceJ / Vd) * A * len : 0; // enthalpy of the normal zone [J]
  let Th = quenched ? Td : p.operatingTemperatureK;
  let eCoil = 0, eDump = 0, eCool = 0;
  let overSince: number | null = null;
  let tDet: number | null = null, tHeat: number | null = null;
  let maxTh = Th;
  const nSteps = Math.ceil(p.durationS / dt);
  const every = Math.max(1, Math.floor(nSteps / (samples - 1)));
  let k = 0;
  const record = (t: number, R: number, Tnz: number) => {
    if (k >= samples) return;
    out.t[k] = t; out.current[k] = I; out.resistance[k] = R; out.normalFraction[k] = len / p.conductorLengthM;
    out.hotSpotK[k] = Th; out.normalZoneK[k] = Tnz; out.voltage[k] = I * R;
    out.energyMagnet[k] = 0.5 * p.inductanceH * I * I; out.energyCoil[k] = eCoil; out.energyDump[k] = eDump; out.energyCooling[k] = eCool;
    k++;
  };
  for (let s = 0; s <= nSteps; s++) {
    const t = s * dt;
    const V = A * len;
    const Tnz = V > 0 ? temperatureFromEnthalpy(U / V) : p.operatingTemperatureK;
    const R = len > 0 ? (copperResistivity(Tnz, p.rrr) * len) / ACu : 0;
    if (s % every === 0) record(t, R, Tnz);
    if (!quenched) continue;
    // Detection and protection.
    if (tDet === null) {
      if (I * R > p.detectionThresholdV) {
        overSince ??= t;
        if (t - overSince >= p.detectionValidationS) tDet = t;
      } else overSince = null;
    }
    if (tDet !== null && tHeat === null && t >= tDet + p.heaterDelayS) tHeat = t;
    // Normal-zone growth: propagation fronts, then heater-induced spreading.
    let dLen = I > 0.01 * p.currentA ? 2 * propagationVelocity(p, I) * dt : 0;
    if (tHeat !== null) dLen = Math.max(dLen, (p.conductorLengthM / p.heaterSpreadS) * dt);
    dLen = Math.min(dLen, p.conductorLengthM - len);
    // Electrical (explicit, stable for dt ≪ L/R).
    // The extraction switch opens when the quench is detected.
    const Rd = tDet !== null ? p.dumpResistanceOhm : 0;
    const Rtot = R + Rd;
    const pCool = p.coolingWPerMK * len * Math.max(Tnz - p.operatingTemperatureK, 0);
    // Exact exponential update for the current over dt with frozen resistance.
    const decay = Math.exp((-Rtot * dt) / p.inductanceH);
    const Inew = I * decay;
    const dE = 0.5 * p.inductanceH * (I * I - Inew * Inew);
    const fCoil = Rtot > 0 ? R / Rtot : 0;
    eCoil += dE * fCoil;
    eDump += dE * (1 - fCoil);
    eCool += pCool * dt;
    U += dE * fCoil - pCool * dt + uOp * A * dLen;
    len += dLen;
    // Hot spot: adiabatic (J in copper × J over cable).
    const J = I / A, JCu = I / ACu;
    Th += (copperResistivity(Th, p.rrr) * JCu * J * dt) / heatCapacity(Th);
    maxTh = Math.max(maxTh, Th);
    I = Inew;
  }
  const n = k;
  const slice = <T extends Float64Array>(a: T) => a.subarray(0, n) as T;
  const Eend = out.energyMagnet[n - 1]! + out.energyCoil[n - 1]! + out.energyDump[n - 1]!;
  return {
    params: p,
    quenched,
    mqeJ: mqe,
    tcsK: tcs,
    initialVelocityMps: propagationVelocity(p, p.currentA),
    detectionTimeS: tDet,
    heaterTimeS: tHeat,
    t: slice(out.t), current: slice(out.current), resistance: slice(out.resistance), normalFraction: slice(out.normalFraction),
    hotSpotK: slice(out.hotSpotK), normalZoneK: slice(out.normalZoneK), voltage: slice(out.voltage),
    energyMagnet: slice(out.energyMagnet), energyCoil: slice(out.energyCoil), energyDump: slice(out.energyDump), energyCooling: slice(out.energyCooling),
    maxHotSpotK: maxTh,
    energyBalanceError: Math.abs(E0 - Eend) / E0,
  };
}

export interface QuenchV2Snapshot {
  readonly phase: QuenchPhaseV2;
  readonly timeS: number;
  readonly currentA: number;
  readonly currentFraction: number;
  readonly normalZoneFraction: number;
  readonly hotspotTemperatureK: number;
  readonly normalZoneTemperatureK: number;
  readonly resistanceOhm: number;
  readonly voltageV: number;
  readonly energyMagnetJ: number;
  readonly energyCoilJ: number;
  readonly energyDumpJ: number;
  readonly energyDissipatedFraction: number;
}

export function quenchV2Snapshot(r: QuenchV2Result, t: number): QuenchV2Snapshot {
  const n = r.t.length;
  let i = 0;
  while (i + 1 < n && r.t[i + 1]! <= t) i++;
  const E0 = r.energyMagnet[0]!;
  let phase: QuenchPhaseV2;
  if (!r.quenched) phase = t < 0.001 ? 'superconducting' : 'recovered';
  else if (r.detectionTimeS === null || t < r.detectionTimeS) phase = 'resistive-transition';
  else if (r.heaterTimeS === null || t < r.heaterTimeS) phase = 'local-heating';
  else if (r.current[i]! / r.params.currentA > 0.05) phase = r.params.dumpResistanceOhm > 0 ? 'energy-extraction' : 'current-decay';
  else phase = 'cryogenic-recovery';
  return {
    phase,
    timeS: t,
    currentA: r.current[i]!,
    currentFraction: r.current[i]! / r.params.currentA,
    normalZoneFraction: r.normalFraction[i]!,
    hotspotTemperatureK: r.hotSpotK[i]!,
    normalZoneTemperatureK: r.normalZoneK[i]!,
    resistanceOhm: r.resistance[i]!,
    voltageV: r.voltage[i]!,
    energyMagnetJ: r.energyMagnet[i]!,
    energyCoilJ: r.energyCoil[i]!,
    energyDumpJ: r.energyDump[i]!,
    energyDissipatedFraction: 1 - r.energyMagnet[i]! / E0,
  };
}
