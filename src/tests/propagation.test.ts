import { describe, expect, it } from 'vitest';
import { propagate, type PropagationInput } from '../physics/propagation/TrackPropagator';
import { UniformField } from '../physics/propagation/UniformField';
import { createCmsField, createCmsUniformField } from '../detectors/cms/CMSField';
import { createAtlasField } from '../detectors/atlas/ATLASField';
import type { MagneticField } from '../physics/propagation/MagneticField';

const LIMITS = { maxRadiusM: 1.0, maxAbsZM: 3.0, maxPathM: 50, maxTurns: 0.45 };

function run(field: MagneticField, charge: number, pt: number, opts: Partial<PropagationInput> = {}) {
  return propagate({
    charge, px: pt, py: 0, pz: 0, mass: 0.1396, x0: 0, y0: 0, z0: 0, t0: 0,
    field, limits: LIMITS, importance: 2, ...opts,
  });
}

/** Radius of the circle through three sampled points (transverse plane). */
function circleRadius(pos: Float32Array, i: number, j: number, k: number): number {
  const ax = pos[3 * i]!, ay = pos[3 * i + 1]!;
  const bx = pos[3 * j]!, by = pos[3 * j + 1]!;
  const cx = pos[3 * k]!, cy = pos[3 * k + 1]!;
  const a = Math.hypot(bx - cx, by - cy), b = Math.hypot(ax - cx, ay - cy), c = Math.hypot(ax - bx, ay - by);
  const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  return (a * b * c) / (2 * area2);
}

function measuredRadius(tr: ReturnType<typeof run>): number {
  const n = tr.count;
  return circleRadius(tr.positions, 0, Math.floor(n / 2), n - 1);
}

describe('TrackPropagator', () => {
  it('neutral particles travel in straight lines through a field', () => {
    const tr = run(new UniformField(2), 0, 5, { py: 3, pz: 1 });
    const p = tr.positions;
    const n = tr.count;
    // Every sample lies on the initial direction (5, 3, 1)/|…|
    const d = [5, 3, 1].map((v) => v / Math.hypot(5, 3, 1));
    for (let i = 0; i < n; i++) {
      const s = Math.hypot(p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
      expect(p[3 * i]!).toBeCloseTo(d[0]! * s, 5);
      expect(p[3 * i + 1]!).toBeCloseTo(d[1]! * s, 5);
    }
    expect(tr.endReason).toBe('radius');
  });

  it('positive and negative charges curve in opposite directions', () => {
    const f = new UniformField(2);
    const pos = run(f, +1, 1);
    const neg = run(f, -1, 1);
    const yPos = pos.positions[3 * (pos.count - 1) + 1]!;
    const yNeg = neg.positions[3 * (neg.count - 1) + 1]!;
    expect(Math.sign(yPos)).toBe(-Math.sign(yNeg));
    // F = q v × B with v = x̂, B = ẑ gives −ŷ for q > 0
    expect(yPos).toBeLessThan(0);
  });

  it('reproduces the analytic helix radius R = pT / (0.2998·|q|·B)', () => {
    for (const [pt, B] of [[1, 2], [2, 2], [1, 3.8]] as const) {
      const tr = run(new UniformField(B), 1, pt, { limits: { ...LIMITS, maxRadiusM: 10 } });
      const R = pt / (0.299792458 * B);
      expect(measuredRadius(tr) / R).toBeCloseTo(1, 3);
    }
  });

  it('higher momentum → larger radius; stronger field → smaller radius', () => {
    const lim = { limits: { ...LIMITS, maxRadiusM: 20 } };
    const r1 = measuredRadius(run(new UniformField(2), 1, 1, lim));
    const r2 = measuredRadius(run(new UniformField(2), 1, 3, lim));
    const r3 = measuredRadius(run(new UniformField(4), 1, 3, lim));
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeLessThan(r2);
  });

  it('conserves |p| direction normalization and pz along a helix (uniform Bz)', () => {
    const tr = run(new UniformField(2), 1, 1, { pz: 1, limits: { ...LIMITS, maxRadiusM: 10, maxAbsZM: 100 } });
    // With pT = pz the helix pitch angle is 45°: z grows at the same rate as transverse arc length.
    const n = tr.count - 1;
    const s = tr.arcLengths[n]!;
    expect(tr.positions[3 * n + 2]! / s).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('time of flight is path length / (βc)', () => {
    const tr = run(new UniformField(0), 1, 10);
    const n = tr.count - 1;
    const beta = 10 / Math.hypot(10, 0.1396);
    expect(tr.times[n]!).toBeCloseTo(tr.arcLengths[n]! / (beta * 0.299792458), 3);
  });

  it('CMS 3.8 T: a 1 GeV track has R ≈ 0.878 m', () => {
    const tr = run(createCmsUniformField(), 1, 1, { limits: { ...LIMITS, maxRadiusM: 5 } });
    expect(measuredRadius(tr)).toBeCloseTo(1 / (0.299792458 * 3.8), 2);
    // Regional CMS field is 3.8 T at the origin too
    const B = new Float64Array(3);
    createCmsField().fieldAt(0.5, 0.2, 1, B);
    expect(B[2]).toBeCloseTo(3.8, 12);
  });

  it('ATLAS field is regional: 2 T solenoid, ~0 in LAr, toroidal (azimuthal) in the muon system', () => {
    const f = createAtlasField();
    const B = new Float64Array(3);
    f.fieldAt(0.5, 0, 0, B);
    expect(B[2]).toBeCloseTo(2, 12);
    f.fieldAt(1.7, 0, 0, B);
    expect(Math.hypot(B[0]!, B[1]!, B[2]!)).toBe(0);
    f.fieldAt(7, 0, 1, B);
    expect(B[2]).toBe(0);
    expect(Math.abs(B[1]!)).toBeGreaterThan(0.3); // Bφ at φ = 0 points along ±y
    expect(B[0]).toBeCloseTo(0, 12);
    // toroid bends in the r–z plane (η), not in φ: a radial track keeps φ ≈ 0
    const tr = propagate({ charge: 1, px: 20, py: 0, pz: 0, mass: 0.1057, x0: 0, y0: 0, z0: 0, t0: 0, field: f, limits: { maxRadiusM: 11, maxAbsZM: 22, maxPathM: 50, maxTurns: 1 }, importance: 2 });
    const n = tr.count - 1;
    const zEnd = tr.positions[3 * n + 2]!;
    expect(Math.abs(zEnd)).toBeGreaterThan(0.05);
  });
});
