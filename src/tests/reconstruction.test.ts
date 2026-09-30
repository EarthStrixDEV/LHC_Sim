import { describe, expect, it } from 'vitest';
import { loadSample, type LoadedSample } from '../physics/events/EventLoader';
import { sampleById } from '../physics/events/EventDatabase';
import { processEvent } from '../physics/EventProcessor';
import { selectPair } from '../physics/reconstruction/InvariantMass';
import { Histogram1D } from '../physics/reconstruction/Histogram';
import { antiKt } from '../physics/reconstruction/JetModel';
import { FourVector } from '../physics/events/FourVector';
import { Z_MASS_GEV, HIGGS_MASS_GEV } from '../physics/constants/physicalConstants';

async function sample(id: string): Promise<LoadedSample> {
  return loadSample(sampleById(id)!.source);
}

function massPeak(s: LoadedSample, kind: 'muon' | 'electron' | 'photon', n: number) {
  const h = new Histogram1D('m', 'mass', 60, 60, 180, 'GeV');
  let found = 0;
  for (let i = 0; i < n; i++) {
    const pe = processEvent(s.event(i), s.meta.collisionSystem, 'atlas');
    const pair = selectPair(pe.reco, kind);
    if (pair) {
      h.fill(pair.mass);
      found++;
    }
  }
  return { h, found };
}

describe('reconstruction and invariant mass', () => {
  it('Z → μμ reconstructs near the Z mass', async () => {
    const s = await sample('zmumu');
    const { h, found } = massPeak(s, 'muon', 60);
    expect(found).toBeGreaterThan(35); // acceptance × efficiency
    expect(Math.abs(h.mean() - Z_MASS_GEV)).toBeLessThan(2.5);
    expect(h.rms()).toBeLessThan(8);
  });

  it('H → γγ reconstructs near the intended 125 GeV Higgs-like mass', async () => {
    const s = await sample('hgg');
    const { h, found } = massPeak(s, 'photon', 60);
    expect(found).toBeGreaterThan(30);
    expect(Math.abs(h.mean() - HIGGS_MASS_GEV)).toBeLessThan(2.5);
    expect(h.rms()).toBeLessThan(6);
  });

  it('Z → ee reconstructs electrons near the Z mass', async () => {
    const s = await sample('zee');
    const { h, found } = massPeak(s, 'electron', 40);
    expect(found).toBeGreaterThan(20);
    expect(Math.abs(h.mean() - Z_MASS_GEV)).toBeLessThan(3);
  });

  it('muons are only built from tracks with muon-system hits; neutral particles leave no tracker hits', async () => {
    const s = await sample('zmumu');
    const ev = s.event(3);
    const pe = processEvent(ev, 'pp', 'atlas');
    for (const m of pe.reco.muons) expect(Math.abs(ev.particle(m.truthParticleId!)!.pdgId)).toBe(13);
    const neutralIds = new Set(pe.tracks.filter((t) => t.kind !== 'charged').map((t) => t.particleId));
    for (let i = 0; i < pe.response.hits.count; i++) expect(neutralIds.has(pe.response.hits.particleIds[i]!)).toBe(false);
  });

  it('jet events produce high-pT anti-kT jets', async () => {
    const s = await sample('dijet');
    const pe = processEvent(s.event(0), 'pp', 'atlas');
    expect(pe.reco.jets.length).toBeGreaterThanOrEqual(2);
    expect(pe.reco.jets[0]!.pt).toBeGreaterThan(40);
  });

  it('ttbar μ+jets events have sizeable MET from the neutrino', async () => {
    const s = await sample('ttbar');
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += processEvent(s.event(i), 'pp', 'atlas').reco.met.met;
    expect(sum / 10).toBeGreaterThan(20);
  });

  it('heavy-ion event is processed and stays deterministic', async () => {
    const s = await sample('pbpb');
    const a = processEvent(s.event(0), 'PbPb', 'atlas');
    const b = processEvent(s.event(0), 'PbPb', 'atlas');
    expect(a.tracks.length).toBeGreaterThan(1500);
    expect(a.response.hits.count).toBe(b.response.hits.count);
    expect(a.reco.jets.map((j) => j.pt)).toEqual(b.reco.jets.map((j) => j.pt));
  });

  it('CMS field model bends tracks more strongly than ATLAS inner field (3.8 T vs 2 T)', async () => {
    const s = await sample('zmumu');
    const ev = s.event(1);
    const atlas = processEvent(ev, 'pp', 'atlas');
    const cms = processEvent(ev, 'pp', 'cms');
    // Same truth muon: sagitta-like measure — azimuthal deflection at r = 1 m is larger in CMS.
    const mu = ev.particles.find((p) => Math.abs(p.pdgId) === 13 && p.isFinal)!;
    const phiAt1m = (pe: typeof atlas) => {
      const tr = pe.tracks.find((t) => t.particleId === mu.id)!;
      const p = tr.samples.positions;
      for (let i = 0; i < tr.samples.count; i++) {
        if (Math.hypot(p[3 * i]!, p[3 * i + 1]!) > 1) return Math.abs(Math.atan2(p[3 * i + 1]!, p[3 * i]!) - mu.phi);
      }
      return NaN;
    };
    const dA = phiAt1m(atlas);
    const dC = phiAt1m(cms);
    expect(dC / dA).toBeGreaterThan(1.5);
  });
});

describe('anti-kT', () => {
  it('clusters two well-separated sprays into two jets and is IR safe', () => {
    const jetA = [FourVector.fromPtEtaPhiM(50, 0.1, 0.2, 0), FourVector.fromPtEtaPhiM(20, 0.2, 0.3, 0)];
    const jetB = [FourVector.fromPtEtaPhiM(40, -1.0, 3.0, 0), FourVector.fromPtEtaPhiM(10, -1.1, 2.95, 0)];
    const soft = FourVector.fromPtEtaPhiM(1e-6, 0.15, 0.25, 0);
    const base = antiKt([...jetA, ...jetB].map((p4, index) => ({ p4, index })), 0.4);
    const withSoft = antiKt([...jetA, ...jetB, soft].map((p4, index) => ({ p4, index })), 0.4);
    expect(base.length).toBe(2);
    expect(base[0]!.p4.pt()).toBeCloseTo(withSoft[0]!.p4.pt(), 4);
    expect([...base[0]!.constituents].sort()).toEqual([0, 1]);
  });
});

describe('histogram', () => {
  it('accumulates, reports mean and resets; exports a TH1-like object', () => {
    const h = new Histogram1D('h', 't', 10, 0, 10, 'x');
    [1, 2, 3, 12, -1].forEach((x) => h.fill(x));
    expect(h.entries).toBe(5);
    expect(h.mean()).toBeCloseTo(2, 12);
    expect(h.overflow).toBe(1);
    expect(h.underflow).toBe(1);
    expect((h.toJSON() as { _typename: string })._typename).toBe('TH1D');
    h.reset();
    expect(h.entries).toBe(0);
  });
});
