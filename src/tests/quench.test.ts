import { describe, expect, it } from 'vitest';
import { copperResistivity, currentSharingTemperature, enthalpy, heatCapacity, LHC_DIPOLE_QUENCH, minimumQuenchEnergyJ, propagationVelocity, quenchV2Snapshot, simulateQuenchV2, temperatureFromEnthalpy, type QuenchV2Params } from '../physics/accelerator/QuenchModelV2';
import { quenchParamsFor, DEFAULT_QUENCH_CONTROLS } from '../physics/accelerator/QuenchScenario';
import { computeAccelerator } from '../physics/accelerator/AcceleratorCore';
import { machineById } from '../machines';
import { beamSpeciesById } from '../physics/particles/ParticleDatabase';

const P = LHC_DIPOLE_QUENCH;

function trapz(t: Float64Array, y: (i: number) => number): number {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += 0.5 * (y(i) + y(i - 1)) * (t[i]! - t[i - 1]!);
  return s;
}

describe('Quench V2 — material functions', () => {
  it('enthalpy is the integral of C(T) and inverts', () => {
    expect((enthalpy(50) - enthalpy(49)) / heatCapacity(49.5)).toBeCloseTo(1, 3);
    for (const T of [1.9, 5, 30, 150, 290]) expect(temperatureFromEnthalpy(enthalpy(T))).toBeCloseTo(T, 3);
    expect(copperResistivity(293, 150)).toBeCloseTo(1.72e-8 * (1 / 150 + 273 / 273), 12);
    expect(copperResistivity(4, 150)).toBeCloseTo(1.72e-8 / 150, 14);
  });

  it('stability: T_cs between T_op and T_c(B); MQE and propagation velocity are physical', () => {
    const tcs = currentSharingTemperature(P);
    expect(tcs).toBeGreaterThan(P.operatingTemperatureK);
    expect(tcs).toBeLessThan(P.tc0K);
    expect(minimumQuenchEnergyJ(P)).toBeGreaterThan(1e-5);
    expect(minimumQuenchEnergyJ(P)).toBeLessThan(0.1);
    const v = propagationVelocity(P, P.currentA);
    expect(v).toBeGreaterThan(2);
    expect(v).toBeLessThan(50); // LHC dipoles: O(10 m/s)
    expect(propagationVelocity(P, 0.5 * P.currentA)).toBeLessThan(v);
  });
});

describe('Quench V2 — Joule heating', () => {
  it('normal-zone energy gain equals ∫ I² R dt (minus cooling) and the voltage is I·R', () => {
    const r = simulateQuenchV2(P);
    expect(r.quenched).toBe(true);
    const joule = trapz(r.t, (i) => r.current[i]! ** 2 * r.resistance[i]!);
    const coil = r.energyCoil[r.energyCoil.length - 1]!;
    expect(Math.abs(joule - coil) / coil).toBeLessThan(0.03);
    for (let i = 0; i < r.t.length; i += 50) expect(r.voltage[i]).toBeCloseTo(r.current[i]! * r.resistance[i]!, 6);
  });

  it('a disturbance below the minimum quench energy recovers; above it quenches', () => {
    const mqe = minimumQuenchEnergyJ(P);
    expect(simulateQuenchV2({ ...P, disturbanceJ: 0.5 * mqe }).quenched).toBe(false);
    expect(simulateQuenchV2({ ...P, disturbanceJ: 2 * mqe }).quenched).toBe(true);
  });
});

describe('Quench V2 — energy decay', () => {
  it('extraction resistor ≫ coil resistance: I(t) = I₀ e^{−R(t−t_d)/L}, E_dump = ½LI₀²(1 − e^{−2R(t−t_d)/L})', () => {
    // Heaters off: the coil resistance stays ≪ R_dump for the first ~0.3 s after detection.
    const p: QuenchV2Params = { ...P, heaterDelayS: 1e9, dumpResistanceOhm: 0.4, durationS: 0.3 };
    const r = simulateQuenchV2(p, 1e-5);
    const td = r.detectionTimeS!;
    const tau = p.inductanceH / p.dumpResistanceOhm;
    const E0 = 0.5 * p.inductanceH * p.currentA ** 2;
    let checked = 0;
    for (let i = 0; i < r.t.length; i++) {
      const dt = r.t[i]! - td;
      if (dt < 0.01 || i % 20) continue;
      expect(r.resistance[i]!).toBeLessThan(1e-2 * p.dumpResistanceOhm);
      expect(r.current[i]! / p.currentA).toBeCloseTo(Math.exp(-dt / tau), 2);
      expect(r.energyDump[i]! / E0).toBeCloseTo(1 - Math.exp((-2 * dt) / tau), 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('stored energy ½LI² decays monotonically and is conserved into coil + resistor', () => {
    const r = simulateQuenchV2({ ...P, dumpResistanceOhm: 0.2 });
    const E0 = 0.5 * P.inductanceH * P.currentA ** 2;
    expect(r.energyMagnet[0]).toBeCloseTo(E0, 0);
    for (let i = 1; i < r.t.length; i++) expect(r.energyMagnet[i]!).toBeLessThanOrEqual(r.energyMagnet[i - 1]! + 1e-6);
    expect(r.energyBalanceError).toBeLessThan(1e-9);
    expect(r.energyMagnet[r.energyMagnet.length - 1]! / E0).toBeLessThan(0.01);
  });
});

describe('Quench V2 — temperature response', () => {
  it('hot spot rises monotonically while current flows and stays below 300 K with protection', () => {
    const r = simulateQuenchV2(P);
    for (let i = 1; i < r.t.length; i++) expect(r.hotSpotK[i]!).toBeGreaterThanOrEqual(r.hotSpotK[i - 1]! - 1e-9);
    expect(r.maxHotSpotK).toBeGreaterThan(50);
    expect(r.maxHotSpotK).toBeLessThan(300);
    expect(r.detectionTimeS).not.toBeNull();
    expect(r.heaterTimeS!).toBeGreaterThan(r.detectionTimeS!);
  });

  it('protection matters: no heaters → hotter hot spot; energy extraction → cooler hot spot', () => {
    const base = simulateQuenchV2(P).maxHotSpotK;
    const noHeaters = simulateQuenchV2({ ...P, heaterDelayS: 1e9, durationS: 5 }, 5e-5).maxHotSpotK;
    const withDump = simulateQuenchV2({ ...P, dumpResistanceOhm: 0.5 }).maxHotSpotK;
    expect(noHeaters).toBeGreaterThan(base);
    expect(withDump).toBeLessThan(base);
  });

  it('snapshots follow the phases and the scenario reflects the machine state', () => {
    const r = simulateQuenchV2(P);
    expect(quenchV2Snapshot(r, 0.001).phase).toBe('resistive-transition');
    expect(quenchV2Snapshot(r, 0.2).phase).toBe('current-decay');
    expect(quenchV2Snapshot(r, 2).phase).toBe('cryogenic-recovery');
    const acc = computeAccelerator({ machine: machineById('lhc'), species: beamSpeciesById('proton')!, mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 6800 } });
    const p = quenchParamsFor(acc, DEFAULT_QUENCH_CONTROLS);
    expect(p.currentA).toBeCloseTo(acc.magnet.currentA, 6);
    expect(0.5 * p.inductanceH * p.currentA ** 2).toBeCloseTo(acc.magnet.storedEnergyJ, 0);
  });
});
