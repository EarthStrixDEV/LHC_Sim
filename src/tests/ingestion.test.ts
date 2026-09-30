import { describe, expect, it } from 'vitest';
import { curatedToNormalized } from '../data-sources/curated/CuratedAdapter';
import { datasetEntry, loadDataset, registerSample } from '../data-sources/DataSourceRegistry';
import { parseHepMC3 } from '../data-sources/hepmc/HepMCAdapter';
import { NormalizedDataset } from '../data-sources/NormalizedDataset';
import { dataLevelsOf, NORMALIZED_SCHEMA_ID, primaryDataLevel, validateNormalizedSample, type NormalizedSample, type Provenance } from '../data-sources/NormalizedEvent';
import { sampleById } from '../physics/events/EventDatabase';
import { EventValidationError, validateEvent } from '../physics/events/EventLoader';
import { processDatasetEvent, processEvent } from '../physics/EventProcessor';
import { pdgCharge } from '../physics/particles/PdgCharge';
import { selectPair } from '../physics/reconstruction/InvariantMass';

/** Test fixture: hand-written reconstructed-level events (NOT real data), labelled as recorded. */
function recoFixture(overrides: Partial<Provenance> = {}): NormalizedSample {
  const provenance: Provenance = {
    sourceType: 'CERN_OPEN_DATA',
    isSimulation: false,
    experiment: 'CMS',
    datasetId: 'test-fixture-dimuon',
    title: 'Unit-test fixture (not real data)',
    year: 2011,
    collisionSystem: 'pp',
    sqrtSGeV: 7000,
    integratedLuminosityInvPb: null,
    generator: null,
    source: { name: 'unit test', url: null, doi: null, license: 'test' },
    processingNotes: ['fixture'],
    ...overrides,
  };
  return {
    schema: NORMALIZED_SCHEMA_ID,
    provenance,
    meta: {
      id: provenance.datasetId,
      title: provenance.title,
      process: 'dimuon',
      collisionSystem: 'pp',
      sqrtSGeV: 7000,
      synthetic: false,
      generator: 'n/a',
      description: '',
      seed: 0,
      analysisPair: 'muon',
      notes: [],
    },
    events: [
      {
        eventNumber: 42,
        run: 165000,
        lumiBlock: 7,
        weights: [1],
        truth: null,
        reco: {
          objects: [
            { kind: 'muon', pt: 45, eta: 0.3, phi: 0.1, m: 0.1057, charge: 1 },
            { kind: 'muon', pt: 44, eta: -0.2, phi: 0.1 + Math.PI, m: 0.1057, charge: -1 },
            { kind: 'jet', pt: 30, eta: 1.2, phi: 2, m: 5, charge: 0, attrs: { R: 0.5 } },
          ],
          met: null,
          primaryVertex: null,
          nPrimaryVertices: 3,
        },
      },
    ],
  };
}

describe('Normalized schema consistency', () => {
  it('curated samples convert losslessly and reproduce the Phase 1 pipeline exactly', async () => {
    const file = await sampleById('zmumu')!.source.load();
    const ns = curatedToNormalized(file);
    expect(ns.schema).toBe(NORMALIZED_SCHEMA_ID);
    expect(ns.events).toHaveLength(file.events.length);
    expect(ns.events[0]!.truth).toBe(file.events[0]);
    const ds = new NormalizedDataset(ns);
    const a = processDatasetEvent(ds, 3, 'atlas', { fieldModel: 'regional' });
    const b = processEvent(ds.truthEvent(3)!, 'pp', 'atlas');
    expect(a.trajectorySource).toBe('truth');
    expect(a.recoProducer).toBe('lhcsim');
    expect(a.tracks.length).toBe(b.tracks.length);
    expect(a.reco.muons.map((m) => m.pt)).toEqual(b.reco.muons.map((m) => m.pt));
    expect(a.response.hits.count).toBe(b.response.hits.count);
  });

  it('bundled datasets resolve through the registry with CURATED provenance', async () => {
    const ds = await loadDataset('hgg');
    expect(datasetEntry('hgg')!.sourceType).toBe('CURATED');
    expect(ds.provenance.isSimulation).toBe(true);
    expect(ds.provenance.generator?.name).toContain('toy');
    expect(primaryDataLevel(ds.provenance, ds.event(0))).toBe('SIMULATED_TRUTH');
  });

  it('rejects structurally invalid normalized events', () => {
    const s = recoFixture();
    expect(() => validateNormalizedSample({ ...s, events: [{ ...s.events[0]!, reco: null }] })).toThrow(EventValidationError);
    expect(() => validateNormalizedSample({ ...s, events: [{ ...s.events[0]!, weights: [] }] })).toThrow(EventValidationError);
    expect(() => validateNormalizedSample({ ...s, meta: { ...s.meta, collisionSystem: 'PbPb' } })).toThrow(EventValidationError);
  });
});

describe('Missing truth information', () => {
  it('reconstruction-level events are processed without inventing truth, hits or deposits', () => {
    const ds = new NormalizedDataset(validateNormalizedSample(recoFixture()));
    expect(ds.truthEvent(0)).toBeNull();
    const pe = processDatasetEvent(ds, 0, 'cms');
    expect(pe.trajectorySource).toBe('reco');
    expect(pe.recoProducer).toBe('source');
    expect(pe.response.hits.count).toBe(0);
    expect(pe.response.ecal).toHaveLength(0);
    expect(pe.tracks).toHaveLength(2); // two muons; jets are not trajectories
    expect(pe.tracks.every((t) => t.particleId < 0 && t.recoId)).toBe(true);
    expect(pe.reco.muons.every((m) => m.truthParticleId === null)).toBe(true);
    expect(pe.reco.jets[0]!.radius).toBe(0.5);
    expect(pe.reco.met.unavailable).toBe(true);
    // Dimuon mass from the source objects: m² ≈ 2 pT1 pT2 (cosh Δη − cos Δφ) (muon mass negligible).
    const pair = selectPair(pe.reco, 'muon')!;
    const expected = Math.sqrt(2 * 45 * 44 * (Math.cosh(0.5) - Math.cos(Math.PI)));
    expect(pair.mass).toBeCloseTo(expected, 2);
  });
});

describe('Provenance preservation', () => {
  it('recorded collision data can never carry generator truth', async () => {
    const zmumu = curatedToNormalized(await sampleById('zmumu')!.source.load());
    const s = recoFixture();
    const bad = { ...s, events: [{ ...s.events[0]!, truth: zmumu.events[0]!.truth }] };
    expect(() => validateNormalizedSample(bad)).toThrow(/cannot carry generator truth/);
  });

  it('data levels follow provenance', () => {
    const s = recoFixture();
    expect(dataLevelsOf(s.provenance, s.events[0]!)).toEqual(['RECORDED_COLLISION_DATA']);
    const sim = recoFixture({ isSimulation: true, datasetId: 'x' });
    expect(dataLevelsOf(sim.provenance, sim.events[0]!)).toEqual(['SIMULATED_RECONSTRUCTION']);
  });

  it('registration and structured cloning keep provenance intact', async () => {
    const s = recoFixture({ datasetId: 'test-fixture-registered' });
    const sample = { ...s, meta: { ...s.meta, id: 'test-fixture-registered' } };
    const id = registerSample(structuredClone(sample));
    const ds = await loadDataset(id);
    expect(ds.provenance).toEqual(sample.provenance);
    expect(ds.event(0).run).toBe(165000);
    expect(() => registerSample({ ...sample, provenance: { ...sample.provenance, datasetId: 'zmumu' }, meta: { ...sample.meta, id: 'zmumu' } })).toThrow(/reserved/);
  });
});

describe('HepMC3 adapter', () => {
  // Hand-written record: pp → Z → μ⁺μ⁻ plus a B⁺ that decays 2 mm away. Units MEV / CM.
  const HEPMC = `HepMC::Version 3.02.06
HepMC::Asciiv3-START_EVENT_LISTING
E 7 3 8
U MEV CM
W 2.5
P 1 0 2212 0 0 6.8e6 6.8e6 938.272 4
P 2 0 2212 0 0 -6.8e6 6.8e6 938.272 4
V -1 0 [1,2]
P 3 -1 23 0 0 1e4 91742.3 91187.6 22
P 4 -1 521 3000 0 4000 7118.4 5279.3 2
P 5 3 -13 40000 10000 5000 41533.5 105.66 1
P 6 3 13 -40000 -10000 5000 41533.5 105.66 1
V -2 0 [4] @ 0.12 0 0.16 0.2
P 7 -2 -321 1500 0 2000 2547.1 493.68 1
P 8 -2 211 1500 0 2000 2503.9 139.57 1
HepMC::Asciiv3-END_EVENT_LISTING
`;

  it('builds a consistent HepMC-like truth record with units converted to GeV/m/ns', () => {
    const [ev] = parseHepMC3(HEPMC, { process: 'test' });
    const t = ev!.truth!;
    expect(() => validateEvent(t)).not.toThrow();
    expect(ev!.weights).toEqual([2.5]);
    expect(ev!.eventNumber).toBe(7);
    const byId = new Map(t.particles.map((p) => [p.id, p]));
    expect(byId.get(5)!.p[0]).toBeCloseTo(41.5335, 6);
    expect(byId.get(5)!.charge).toBe(1);
    expect(byId.get(7)!.charge).toBe(-1);
    expect(byId.get(4)!.charge).toBe(1);
    expect(byId.get(3)!.status).toBe(3);
    expect(byId.get(3)!.children).toEqual([5, 6]);
    expect(byId.get(5)!.parents).toEqual([3]);
    // Beams are attached to the vertex they enter.
    expect(byId.get(1)!.decayVtx).toBe(byId.get(3)!.prodVtx);
    const bVtx = t.vertices[byId.get(7)!.prodVtx]!;
    expect(bVtx.kind).toBe('displaced');
    expect(bVtx.x).toBeCloseTo(1.2e-3, 12);
    expect(bVtx.t).toBeCloseTo((0.2e-2 / 0.299792458), 9);
    // The implicit Z decay vertex inherits the primary position.
    expect(t.vertices[byId.get(5)!.prodVtx]!.kind).toBe('primary');
  });

  it('rejects HepMC2 and malformed numbers', () => {
    expect(() => parseHepMC3('HepMC::IO_GenEvent-START_EVENT_LISTING\nE 1', { process: '' })).toThrow(/HepMC2/);
    expect(() => parseHepMC3('E 1 0 1\nP 1 0 abc 0 0 0 0 0 1', { process: '' })).toThrow(/line 2/);
  });
});

describe('PDG charge', () => {
  it.each([
    [211, 1], [-211, -1], [321, 1], [311, 0], [130, 0], [411, 1], [521, 1], [511, 0], [431, 1],
    [2212, 1], [-2212, -1], [2112, 0], [3122, 0], [3222, 1], [3312, -1], [4122, 1], [5122, 0],
    [11, -1], [-13, 1], [24, 1], [-24, -1], [22, 0], [2101, 1 / 3], [1000822080, 82],
  ])('pdg %i → charge %d', (pdg, q) => {
    expect(pdgCharge(pdg)).toBeCloseTo(q, 12);
  });
});
