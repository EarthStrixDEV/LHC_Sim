import { describe, expect, it } from 'vitest';
import { cherenkovAngle, cherenkovThreshold, dEdxMean, measurePid, SPECIES_MASS } from '../detector/response/PID';
import { loadDataset } from '../data-sources/DataSourceRegistry';
import { DETECTOR_IDS, getDetector, processDatasetEvent } from '../physics/EventProcessor';
import { propagate } from '../physics/propagation/TrackPropagator';
import type { TrackRecord } from '../physics/propagation/EventPropagation';
import { dipoleIntegralTm } from '../physics/propagation/DipoleField';
import { createLhcbField } from '../detectors/lhcb/LHCbDetector';

describe('Experiment models', () => {
  it('every detector declares a fidelity level and processes a representative event', async () => {
    const pp = await loadDataset('zmumu');
    const pbpb = await loadDataset('pbpb');
    for (const id of DETECTOR_IDS) {
      const d = getDetector(id);
      expect(d.fidelity.summary.length).toBeGreaterThan(20);
      const ds = id === 'alice' ? pbpb : pp;
      const pe = processDatasetEvent(ds, 0, id);
      expect(pe.detectorId).toBe(id);
      expect(pe.tracks.length).toBeGreaterThan(0);
      expect(pe.response.hits.count).toBeGreaterThan(0);
    }
    const levels = new Set(DETECTOR_IDS.map((id) => getDetector(id).fidelity.level));
    expect(levels.size).toBeGreaterThan(1); // fidelity is not claimed to be equal
  });

  it('trajectories stay finite in every detector field map', async () => {
    const ds = await loadDataset('ttbar');
    for (const id of DETECTOR_IDS) {
      for (let i = 0; i < 3; i++) {
        const pe = processDatasetEvent(ds, i, id, { advanced: false });
        for (const t of pe.tracks) expect(t.samples.positions.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('CMS model contains all major systems and the 3.8 T solenoid', () => {
    const cms = getDetector('cms', 'fieldmap');
    const names = cms.geometry.map((g) => g.name).join(' | ');
    for (const s of ['Pixel', 'Strip', 'ECAL', 'HCAL', 'Solenoid (3.8 T)', 'yoke', 'Muon']) expect(names).toContain(s);
    const b = new Float64Array(3);
    cms.field.fieldAt(0, 0, 0, b);
    expect(b[2]).toBeCloseTo(3.8, 3);
  });

  it('LHCb is forward-only: hits and calorimeter cells only inside its acceptance', async () => {
    const ds = await loadDataset('dijet');
    const pe = processDatasetEvent(ds, 0, 'lhcb');
    const h = pe.response.hits;
    for (let i = 0; i < h.count; i++) {
      const z = h.positions[3 * i + 2]!;
      if (h.subsystems[i] !== 0) expect(z).toBeGreaterThan(2);
      else expect(z).toBeGreaterThan(-0.3);
    }
    for (const c of [...pe.response.ecal, ...pe.response.hcal]) {
      expect(c.eta).toBeGreaterThan(1.9);
      expect(c.eta).toBeLessThan(5.1);
    }
    expect(pe.response.muonHits.every((m) => m.z > 0)).toBe(true);
    expect(dipoleIntegralTm(createLhcbField().spec)).toBeCloseTo(4.2, 1);
  });

  it('LHCb dipole bends opposite charges in opposite horizontal directions', () => {
    const f = getDetector('lhcb').field;
    const end = (q: number) => {
      const s = propagate({ charge: q, px: 0, py: 0.3, pz: 10, mass: 0.1396, x0: 0, y0: 0, z0: 0, t0: 0, field: f, limits: { maxRadiusM: 6, maxAbsZM: 9.4, maxPathM: 50, maxTurns: 1 }, importance: 2 });
      return s.positions[3 * (s.count - 1)]!;
    };
    expect(Math.sign(end(1))).toBe(-Math.sign(end(-1)));
    expect(Math.abs(end(1))).toBeGreaterThan(0.1);
  });

  it('ALICE: no hadronic calorimeter, TPC hits, muon arm only at negative z', async () => {
    const ds = await loadDataset('pbpb');
    const pe = processDatasetEvent(ds, 0, 'alice');
    expect(pe.response.hcal).toHaveLength(0);
    let tpc = 0;
    for (let i = 0; i < pe.response.hits.count; i++) if (pe.response.hits.subsystems[i] === 3) tpc++;
    expect(tpc).toBeGreaterThan(100);
    expect(pe.response.muonHits.every((m) => m.z < 0)).toBe(true);
    expect(pe.pid.length).toBeGreaterThan(10);
  });
});

describe('Particle identification physics', () => {
  it('Cherenkov thresholds and angles', () => {
    expect(cherenkovThreshold(SPECIES_MASS.pi, 1.0014)).toBeCloseTo(2.64, 1);
    expect(cherenkovThreshold(SPECIES_MASS.K, 1.0014)).toBeCloseTo(9.33, 1);
    expect(cherenkovAngle(2, SPECIES_MASS.pi, 1.0014)).toBeNull();
    // Saturated angle cos θ = 1/n for β → 1.
    expect(cherenkovAngle(1e5, SPECIES_MASS.pi, 1.0014)!).toBeCloseTo(Math.acos(1 / 1.0014), 5);
  });

  it('dE/dx: minimum ≈ 1 near βγ ≈ 3–4, 1/β² rise at low momentum, slow relativistic rise', () => {
    const m = SPECIES_MASS.pi;
    const bgMin = [...Array(400).keys()].map((i) => 10 ** (-0.5 + i / 100)).reduce((a, b) => (dEdxMean(b * m, m) < dEdxMean(a * m, m) ? b : a));
    expect(bgMin).toBeGreaterThan(2);
    expect(bgMin).toBeLessThan(6);
    expect(dEdxMean(bgMin * m, m)).toBeCloseTo(1, 2);
    expect(dEdxMean(0.4, SPECIES_MASS.p)).toBeGreaterThan(3);
    expect(dEdxMean(100, m)).toBeGreaterThan(1.1);
    expect(dEdxMean(100, m)).toBeLessThan(2);
  });

  it('TOF separates K from π at 1 GeV; RICH separates π from K at 20 GeV', () => {
    const mk = (pdg: number, p: number, id: number, dz: 1 | 0): TrackRecord => {
      const alice = getDetector('alice');
      const lhcb = getDetector('lhcb');
      const det = dz ? lhcb : alice;
      const mass = Math.abs(pdg) === 321 ? SPECIES_MASS.K : SPECIES_MASS.pi;
      const [px, py, pz] = dz ? [0.05 * p, 0, p] : [p, 0, 0];
      const samples = propagate({ charge: 1, px, py, pz, mass, x0: 0, y0: 0, z0: 0, t0: 0, field: det.field, limits: { maxRadiusM: dz ? 6 : 4.2, maxAbsZM: dz ? 12.4 : 6, maxPathM: 50, maxTurns: 1 }, importance: 2 });
      const pt = Math.hypot(px, py);
      return { particleId: id, pdgId: pdg, charge: 1, kind: 'charged', pt, eta: Math.asinh(pz / pt), phi: 0, energy: Math.hypot(p, mass), origin: 'primary', importance: 2, fromHardProcess: false, stopSurface: 'calorimeter', samples };
    };
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      const tr = [mk(211, 1, 2 * i, 0), mk(321, 1, 2 * i + 1, 0)];
      const pid = measurePid(tr, getDetector('alice'), i);
      // π/μ/e are not separable by TOF at 1 GeV (Δt < σ_t): score the K/π decision only.
      ok += pid.filter((m) => (m.hypothesis === 'K') === (m.trueSpecies === 'K')).length;
    }
    expect(ok / 80).toBeGreaterThan(0.9);
    let okR = 0;
    for (let i = 0; i < 40; i++) {
      const pid = measurePid([mk(211, 20, 2 * i, 1), mk(321, 20, 2 * i + 1, 1)], getDetector('lhcb'), i);
      okR += pid.filter((m) => (m.hypothesis === 'K') === (m.trueSpecies === 'K')).length;
    }
    expect(okR / 80).toBeGreaterThan(0.9);
  });
});
