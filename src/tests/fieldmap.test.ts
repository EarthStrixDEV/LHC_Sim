import { describe, expect, it } from 'vitest';
import { AxisymmetricFieldMap, CompositeField, GridFieldMap3D, sampleField } from '../detector/fieldmaps/FieldMap';
import { cel, FiniteSolenoidField } from '../detector/fieldmaps/FiniteSolenoid';
import { atlasSolenoidMap, cmsSolenoidMap, createAtlasFieldMap, CMS_SOLENOID } from '../detector/fieldmaps/DetectorFieldMaps';
import type { MagneticField } from '../physics/propagation/MagneticField';
import { UniformField } from '../physics/propagation/UniformField';
import { propagate, type PropagationInput } from '../physics/propagation/TrackPropagator';
import { RIGIDITY_GEV_PER_TM } from '../physics/constants/physicalConstants';
import { loadDataset } from '../data-sources/DataSourceRegistry';
import { processDatasetEvent } from '../physics/EventProcessor';

/** A linear field B = (a·y, b·z + c, d·x) — trilinear interpolation must reproduce it exactly. */
const linear: MagneticField = {
  id: 'lin', label: 'linear', description: '',
  fieldAt(x, y, z, o) { o[0] = 0.3 * y; o[1] = -0.2 * z + 1; o[2] = 0.5 * x; },
};

describe('FieldMap interpolation', () => {
  const ax = { min: -1, max: 1, n: 5 };
  const map = GridFieldMap3D.fromField(linear, ax, ax, ax);

  it('trilinear interpolation reproduces a linear field exactly between nodes', () => {
    for (const p of [{ x: 0.13, y: -0.71, z: 0.44 }, { x: -0.99, y: 0.5, z: 0.01 }, { x: 0, y: 0, z: 0 }]) {
      const b = map.sample(p);
      expect(b[0]).toBeCloseTo(0.3 * p.y, 6);
      expect(b[1]).toBeCloseTo(-0.2 * p.z + 1, 6);
      expect(b[2]).toBeCloseTo(0.5 * p.x, 6);
    }
  });

  it('axisymmetric map reproduces the analytic solenoid inside the grid within 0.2 % of B_c', () => {
    const sol = new FiniteSolenoidField(CMS_SOLENOID.radiusM, CMS_SOLENOID.lengthM, CMS_SOLENOID.centralT);
    const m = cmsSolenoidMap();
    let worst = 0;
    for (const [x, y, z] of [[0.3, 0.2, 1.1], [1.7, -1.1, -4.2], [2.5, 0.4, 5.9], [0.01, 0.02, -0.3], [1.0, 1.0, 6.2]] as const) {
      const a = sampleField(sol, { x, y, z }), b = m.sample({ x, y, z });
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    expect(worst / CMS_SOLENOID.centralT).toBeLessThan(2e-3);
  });
});

describe('FieldMap boundary behaviour', () => {
  const ax = { min: -1, max: 1, n: 3 };
  const outside = { x: 2, y: 0, z: 0 };
  it('zero / clamp / fallback policies', () => {
    expect(GridFieldMap3D.fromField(linear, ax, ax, ax, { kind: 'zero' }).sample(outside)).toEqual([0, 0, 0]);
    const clamped = GridFieldMap3D.fromField(linear, ax, ax, ax, { kind: 'clamp' }).sample(outside);
    expect(clamped[2]).toBeCloseTo(0.5 * 1, 6); // edge value at x = 1
    const fb = GridFieldMap3D.fromField(linear, ax, ax, ax, { kind: 'fallback', field: new UniformField(4) }).sample(outside);
    expect(fb).toEqual([0, 0, 4]);
  });

  it('every node of the detector maps is finite (sheet-edge singularity avoided)', () => {
    for (const m of [atlasSolenoidMap(), cmsSolenoidMap()]) expect(Array.from(m.data).every(Number.isFinite)).toBe(true);
  });

  it('values on the grid edge are the node values; z-mirroring flips Br and keeps Bz', () => {
    const m = atlasSolenoidMap();
    const up = m.sample({ x: 1.0, y: 0, z: 2.0 }), down = m.sample({ x: 1.0, y: 0, z: -2.0 });
    expect(down[0]).toBeCloseTo(-up[0], 6);
    expect(down[2]).toBeCloseTo(up[2], 6);
    expect(m.contains(0, 0, 3.4)).toBe(true);
    expect(m.contains(0, 0, 3.41)).toBe(false);
  });

  it('composite field hands over to the analytic fallback outside the mapped volume', () => {
    const f = new CompositeField('c', 'c', '', [{ within: (r) => r < 1, field: new UniformField(2) }], new UniformField(-1));
    expect(sampleField(f, { x: 0.5, y: 0, z: 0 })[2]).toBe(2);
    expect(sampleField(f, { x: 1.5, y: 0, z: 0 })[2]).toBe(-1);
    // ATLAS: inside the solenoid map ~2 T, in the barrel toroid Bφ, Bz = 0.
    const atlas = createAtlasFieldMap();
    expect(sampleField(atlas, { x: 0, y: 0, z: 0 })[2]).toBeCloseTo(2, 3);
    const tor = sampleField(atlas, { x: 6, y: 0, z: 0 });
    expect(Math.abs(tor[1])).toBeGreaterThan(0.3);
    expect(tor[2]).toBe(0);
  });
});

describe('Finite solenoid physics', () => {
  const sol = new FiniteSolenoidField(1.23, 5.3, 2.0);
  it('Bulirsch cel: C(1,1,1,1) = π/2 and complete elliptic K(k=0.5)', () => {
    expect(cel(1, 1, 1, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(cel(Math.sqrt(1 - 0.25), 1, 1, 1)).toBeCloseTo(1.685750354812596, 10);
  });

  it('matches the analytic on-axis field and shows the end fall-off to ≈ ½ B_c', () => {
    for (const z of [0, 1, 2, 2.65, 3.5, 6]) expect(sol.cylindrical(0, z)[1]).toBeCloseTo(sol.onAxis(z), 9);
    expect(sol.cylindrical(0, 0)[1]).toBeCloseTo(2, 10);
    expect(sol.onAxis(2.65) / 2).toBeGreaterThan(0.45);
    expect(sol.onAxis(2.65) / 2).toBeLessThan(0.55);
  });

  it('is divergence-free: ∂(ρ Bρ)/(ρ ∂ρ) + ∂Bz/∂z ≈ 0', () => {
    const d = 1e-4;
    for (const [rho, z] of [[0.5, 1.0], [0.9, 2.4], [1.8, 0.7], [0.4, 3.5]] as const) {
      const div = ((rho + d) * sol.cylindrical(rho + d, z)[0] - (rho - d) * sol.cylindrical(rho - d, z)[0]) / (2 * d * rho) + (sol.cylindrical(rho, z + d)[1] - sol.cylindrical(rho, z - d)[1]) / (2 * d);
      expect(Math.abs(div)).toBeLessThan(1e-5);
    }
  });
});

describe('Numerical propagation in field maps', () => {
  const base = (field: MagneticField, charge: number, integrator: 'rk4' | 'rk45'): PropagationInput => ({
    charge, px: 1.5, py: 0, pz: 0.4, mass: 0.1396, x0: 0, y0: 0, z0: 0, t0: 0, field,
    limits: { maxRadiusM: 5, maxAbsZM: 10, maxPathM: Number.POSITIVE_INFINITY, maxTurns: 1 }, importance: 2, integrator,
  });

  it('charge sign: opposite charges bend in opposite directions; +q in +Bz bends toward −y', () => {
    const map = GridFieldMap3D.fromField(new UniformField(2), { min: -3, max: 3, n: 3 }, { min: -3, max: 3, n: 3 }, { min: -3, max: 3, n: 3 });
    const pos = propagate(base(map, +1, 'rk45'));
    const neg = propagate(base(map, -1, 'rk45'));
    const yAt = (s: typeof pos, i: number) => s.positions[3 * i + 1]!;
    expect(yAt(pos, 5)).toBeLessThan(0);
    expect(yAt(neg, 5)).toBeGreaterThan(0);
    expect(yAt(neg, 5)).toBeCloseTo(-yAt(pos, 5), 6);
  });

  it('RK45 in a uniform field map reproduces the analytic helix radius R = pT/(κ|q|B)', () => {
    const map = AxisymmetricFieldMap.fromField(new UniformField(3.8), { min: 0, max: 5, n: 6 }, { min: 0, max: 10, n: 6 }, true);
    const s = propagate({ ...base(map, 1, 'rk45'), limits: { maxRadiusM: 50, maxAbsZM: 50, maxPathM: Number.POSITIVE_INFINITY, maxTurns: 0.9 } });
    const R = 1.5 / (RIGIDITY_GEV_PER_TM * 3.8);
    // Helix centre for +q moving along +x in +Bz is at (0, −R).
    let worst = 0;
    for (let i = 0; i < s.count; i++) worst = Math.max(worst, Math.abs(Math.hypot(s.positions[3 * i]!, s.positions[3 * i + 1]! + R) - R));
    expect(worst / R).toBeLessThan(1e-6);
  });

  it('RK4 and RK45 agree in the non-uniform CMS solenoid map (end region) within 50 µm', () => {
    const m = cmsSolenoidMap();
    const inp = { ...base(m, 1, 'rk4'), px: 0.8, pz: 2.5, limits: { maxRadiusM: 2.9, maxAbsZM: 6.4, maxPathM: 20, maxTurns: 2 } };
    const a = propagate(inp), b = propagate({ ...inp, integrator: 'rk45', tolerance: 1e-9 });
    const end = (s: typeof a) => [s.positions[3 * (s.count - 1)]!, s.positions[3 * (s.count - 1) + 1]!, s.positions[3 * (s.count - 1) + 2]!];
    const ea = end(a), eb = end(b);
    expect(Math.hypot(ea[0]! - eb[0]!, ea[1]! - eb[1]!, ea[2]! - eb[2]!)).toBeLessThan(5e-5);
    expect(Math.hypot(...b.endDirection)).toBeCloseTo(1, 12); // |p| conserved
  });

  it('field maps drive the full event pipeline', async () => {
    const ds = await loadDataset('zmumu');
    const map = processDatasetEvent(ds, 1, 'cms', { fieldModel: 'fieldmap' });
    const reg = processDatasetEvent(ds, 1, 'cms', { fieldModel: 'regional' });
    expect(map.tracks.length).toBe(reg.tracks.length);
    // Same event, different field representation → different trajectories.
    const pid = map.tracks.find((t) => Math.abs(t.pdgId) === 13)!.particleId;
    const tm = map.tracks.find((t) => t.particleId === pid)!, tr = reg.tracks.find((t) => t.particleId === pid)!;
    expect(tm.samples.pathLengthM).not.toBe(tr.samples.pathLengthM);
  });
});
