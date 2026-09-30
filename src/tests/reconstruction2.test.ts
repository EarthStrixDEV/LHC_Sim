import { describe, expect, it } from 'vitest';
import { fitTrack, pointAtRadius, ptFromRho, seedFromHits, type FitHit, type Perigee } from '../physics/fitting/KalmanTrackFit';
import { generalizedKt, type JetAlgorithmP } from '../physics/reconstruction/GeneralizedKt';
import { antiKt } from '../physics/reconstruction/JetModel';
import { FourVector } from '../physics/events/FourVector';
import { topoClusters } from '../physics/reconstruction/TopoCluster';
import { findPrimaryVertices, type VertexTrack } from '../physics/reconstruction/Vertexing';
import { propagate } from '../physics/propagation/TrackPropagator';
import { UniformField } from '../physics/propagation/UniformField';
import { RIGIDITY_GEV_PER_TM } from '../physics/constants/physicalConstants';
import { loadDataset } from '../data-sources/DataSourceRegistry';
import { processDatasetEvent } from '../physics/EventProcessor';
import { getDetector } from '../physics/EventProcessor';
import { Rng } from '../utils/math';
import type { CaloCell } from '../physics/detector/CalorimeterDeposit';

const RADII = [0.033, 0.05, 0.088, 0.122, 0.299, 0.371, 0.443, 0.514, 0.6, 0.7, 0.8, 0.9, 1.0];
const BZ = 2;

function hitsFor(truth: Perigee, sigma: number, rng: Rng, z0 = 0, cot = 0.5): FitHit[] {
  const out: FitHit[] = [];
  for (const r of RADII) {
    const q = pointAtRadius(truth, r);
    if (!q) break;
    const d = rng.gaussian(0, sigma);
    out.push({ x: q.x - (d * q.y) / r, y: q.y + (d * q.x) / r, z: z0 + q.s * cot, sigma });
  }
  return out;
}

describe('Kalman-like track fit', () => {
  it('perigee geometry: a positive track in +Bz turns clockwise (ρ < 0), matching the propagator', () => {
    const s = propagate({ charge: 1, px: 3, py: 0, pz: 1, mass: 0.1396, x0: 0, y0: 0, z0: 0, t0: 0, field: new UniformField(BZ), limits: { maxRadiusM: 1.05, maxAbsZM: 5, maxPathM: 10, maxTurns: 1 }, importance: 2 });
    const hits: FitHit[] = [];
    for (let i = 1; i < s.count; i += Math.max(1, Math.floor(s.count / 12))) hits.push({ x: s.positions[3 * i]!, y: s.positions[3 * i + 1]!, z: s.positions[3 * i + 2]!, sigma: 1e-5 });
    const f = fitTrack(hits, { bz: BZ, xOverX0: 0 })!;
    expect(f.fitted.rho).toBeLessThan(0);
    expect(f.charge).toBe(1);
    expect(f.ptFit).toBeCloseTo(3, 2);
    expect(f.cotTheta).toBeCloseTo(1 / 3, 3);
    expect(Math.abs(f.fitted.d0)).toBeLessThan(1e-4);
  });

  it('seed (3-hit circle) reproduces an exact circle', () => {
    const truth: Perigee = { d0: 2e-3, phi0: 0.7, rho: -0.2 };
    const h = hitsFor(truth, 0, new Rng(1));
    const s = seedFromHits(h[1]!, h[5]!, h[10]!);
    expect(s.rho).toBeCloseTo(truth.rho, 9);
    expect(s.phi0).toBeCloseTo(truth.phi0, 9);
    expect(s.d0).toBeCloseTo(truth.d0, 9);
  });

  it('fitted pT improves over the 3-hit initial estimate and pulls have unit width', () => {
    const rng = new Rng(2024);
    let seedErr = 0, fitErr = 0;
    const pulls: number[] = [];
    for (let k = 0; k < 300; k++) {
      const pt = 2 + 48 * rng.next();
      const rho = -(RIGIDITY_GEV_PER_TM * BZ) / pt;
      const truth: Perigee = { d0: rng.gaussian(0, 2e-5), phi0: rng.uniform(-Math.PI, Math.PI), rho };
      const f = fitTrack(hitsFor(truth, 20e-6, rng), { bz: BZ, xOverX0: 0 })!;
      seedErr += Math.abs(f.ptSeed - pt) / pt;
      fitErr += Math.abs(f.ptFit - pt) / pt;
      pulls.push((f.fitted.rho - rho) / Math.sqrt(f.cov[8]));
    }
    expect(fitErr).toBeLessThan(0.6 * seedErr);
    const m = pulls.reduce((a, b) => a + b, 0) / pulls.length;
    const w = Math.sqrt(pulls.reduce((a, b) => a + (b - m) ** 2, 0) / pulls.length);
    expect(Math.abs(m)).toBeLessThan(0.2);
    expect(w).toBeGreaterThan(0.75);
    expect(w).toBeLessThan(1.3);
  });

  it('uncertainty shrinks as hits are added and grows with worse hit resolution', () => {
    const truth: Perigee = { d0: 0, phi0: 1, rho: -(RIGIDITY_GEV_PER_TM * BZ) / 10 };
    const good = fitTrack(hitsFor(truth, 10e-6, new Rng(5)), { bz: BZ, xOverX0: 0 })!;
    const bad = fitTrack(hitsFor(truth, 100e-6, new Rng(5)), { bz: BZ, xOverX0: 0 })!;
    const sig = good.steps.map((s) => s.relPtSigma);
    expect(sig[sig.length - 1]).toBeLessThan(sig[2]!);
    expect(bad.ptSigma).toBeGreaterThan(5 * good.ptSigma);
    expect(ptFromRho(truth.rho, BZ)).toBeCloseTo(10, 10);
    // χ²/ndf ≈ 1 for correctly specified errors (single track: loose bound).
    expect(good.chi2 / good.ndf).toBeLessThan(4);
  });

  it('process noise Q (multiple scattering) inflates the fitted uncertainty', () => {
    const truth: Perigee = { d0: 0, phi0: 1, rho: -(RIGIDITY_GEV_PER_TM * BZ) / 3 };
    const h = hitsFor(truth, 10e-6, new Rng(8));
    expect(fitTrack(h, { bz: BZ, xOverX0: 0.02 })!.ptSigma).toBeGreaterThan(2 * fitTrack(h, { bz: BZ, xOverX0: 0 })!.ptSigma);
  });

  it('pipeline pulls in a uniform solenoid are centred with near-unit coverage', async () => {
    const ds = await loadDataset('dijet');
    const pulls: number[] = [];
    for (let i = 0; i < 6; i++) for (const f of processDatasetEvent(ds, i, 'cms', { fieldModel: 'regional' }).advanced!.fits) pulls.push((f.fit.ptFit - f.truthPt) / f.fit.ptSigma);
    const sorted = [...pulls].sort((a, b) => a - b);
    expect(Math.abs(sorted[Math.floor(sorted.length / 2)]!)).toBeLessThan(0.5);
    expect(pulls.filter((p) => Math.abs(p) < 2).length / pulls.length).toBeGreaterThan(0.8);
  });

  it('fits run on real pipeline tracks and reproduce truth pT within a few σ', async () => {
    const ds = await loadDataset('zmumu');
    const pe = processDatasetEvent(ds, 0, 'cms', { fieldModel: 'regional' });
    const fits = pe.advanced!.fits;
    expect(fits.length).toBeGreaterThan(3);
    const muon = fits.reduce((a, b) => (b.truthPt > a.truthPt ? b : a));
    expect(Math.abs(muon.fit.ptFit - muon.truthPt) / muon.fit.ptSigma).toBeLessThan(5);
    expect(muon.fit.charge).toBe(muon.truthCharge);
  });
});

describe('Generalized kT jets', () => {
  const pj = (pt: number, eta: number, phi: number) => ({ p4: FourVector.fromPtEtaPhiM(pt, eta, phi, 0).toArray() as [number, number, number, number] });

  it('known configurations: merge within R, separate beyond R, for all p', () => {
    for (const p of [-1, 0, 1] as JetAlgorithmP[]) {
      const close = generalizedKt([pj(50, 0, 0), pj(30, 0.2, 0.1)], 0.4, p);
      expect(close).toHaveLength(1);
      expect([...close[0]!.constituents].sort()).toEqual([0, 1]);
      expect(close[0]!.pt).toBeCloseTo(Math.hypot(50 + 30 * Math.cos(0.1), 30 * Math.sin(0.1)), 6);
      expect(generalizedKt([pj(50, 0, 0), pj(30, 1, 0)], 0.4, p)).toHaveLength(2);
    }
  });

  it('anti-kT is hard-centred; kT merges the soft pair first', () => {
    // Hard particle at 0, soft pair between: anti-kT absorbs soft particles into the hard jet.
    const inputs = [pj(100, 0, 0), pj(2, 0.5, 0), pj(2, 0.85, 0)];
    const akt = generalizedKt(inputs, 0.6, -1);
    expect(akt[0]!.constituents).toContain(1);
    const kt = generalizedKt(inputs, 0.6, 1);
    const softJet = kt.find((j) => j.constituents.includes(2))!;
    expect(softJet.constituents).toContain(1);
  });

  it('deterministic and identical to the Phase 1 anti-kT implementation', () => {
    const rng = new Rng(11);
    const inputs = Array.from({ length: 300 }, () => pj(0.5 + 30 * rng.next() ** 3, rng.uniform(-2.5, 2.5), rng.uniform(-Math.PI, Math.PI)));
    const a = generalizedKt(inputs, 0.4, -1);
    const b = generalizedKt(inputs, 0.4, -1);
    expect(a).toEqual(b);
    const ref = antiKt(inputs.map((x, index) => ({ p4: FourVector.fromArray(x.p4), index })), 0.4);
    const key = (c: readonly number[]) => [...c].sort((x, y) => x - y).join(',');
    expect(new Set(a.map((j) => key(j.constituents)))).toEqual(new Set(ref.map((j) => key(j.constituents))));
  });
});

describe('Topo-clusters and vertices', () => {
  it('4-2-0 clustering: seed, growth, boundary, separate clusters', () => {
    const spec = getDetector('atlas').ecal; // threshold 0.05 → σ = 0.025, seed > 0.1, grow > 0.05
    const cell = (ieta: number, iphi: number, energy: number): CaloCell => ({ calo: 'ecal', ieta, iphi, eta: -3.2 + (ieta + 0.5) * spec.cellDEta, phi: -Math.PI + (iphi + 0.5) * spec.cellDPhi, energy, time: 0, contributors: [] });
    const cells = [cell(100, 50, 5), cell(101, 50, 0.08), cell(102, 50, 0.07), cell(103, 50, 0.03), cell(104, 50, 0.03), cell(130, 50, 2)];
    const cl = topoClusters(cells, spec);
    expect(cl).toHaveLength(2);
    const big = cl.find((c) => c.energy > 3)!;
    expect(big.nCells).toBe(4); // seed + 2 growth + 1 boundary; the far 0.03 cell is not attached
    expect(big.energy).toBeCloseTo(5 + 0.08 + 0.07 + 0.03, 9);
  });

  it('primary vertex = highest Σ pT²; pile-up vertices separated in z', () => {
    const t = (id: number, z0: number, pt: number): VertexTrack => ({ id, perigee: { d0: 1e-5, phi0: 0, rho: -0.1 }, d0Sigma: 2e-5, z0, cotTheta: 0, pt, charge: 1 });
    const vs = findPrimaryVertices([t(1, 0.0101, 40), t(2, 0.0102, 35), t(3, 0.0103, 1), t(4, -0.0302, 2), t(5, -0.0301, 1.5), t(6, 0.2, 1)]);
    expect(vs).toHaveLength(2);
    expect(vs[0]!.isPrimary).toBe(true);
    expect(vs[0]!.z).toBeCloseTo(0.0102, 6);
    expect(vs[1]!.nTracks).toBe(2);
  });

  it('with pile-up, reconstruction finds several vertices and identifies the hard scatter', async () => {
    const ds = await loadDataset('zmumu');
    const pe = processDatasetEvent(ds, 3, 'atlas', { pileUp: { enabled: true, mu: 30 } });
    const adv = pe.advanced!;
    expect(adv.vertices.length).toBeGreaterThan(1);
    const pv = adv.vertices.find((v) => v.isPrimary)!;
    const truePv = ds.event(3).truth!.vertices.find((v) => v.kind === 'primary')!;
    expect(Math.abs(pv.z - truePv.z)).toBeLessThan(2e-3);
    expect(adv.jets.every((j, i) => i === 0 || j.pt <= adv.jets[i - 1]!.pt)).toBe(true);
  });
});
