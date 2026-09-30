import { describe, expect, it } from 'vitest';
import { NormalizedDataset } from '../data-sources/NormalizedDataset';
import { pythiaSettings, requestId, validateRequest, type GeneratorRequest } from '../generators/EventGenerator';
import { PythiaBackendClient } from '../generators/PythiaBackendClient';
import { PYTHIA_RECORD_FORMAT, pythiaEventToRecord, pythiaResponseToSample, type PythiaEvent, type PythiaResponse } from '../generators/PythiaRecord';
import { pythiaWasmStatus } from '../generators/PythiaWasmWorker';
import { validateEvent } from '../physics/events/EventLoader';
import { processDatasetEvent } from '../physics/EventProcessor';
import { selectPair } from '../physics/reconstruction/InvariantMass';

const REQ: GeneratorRequest = { system: 'pp', sqrtSGeV: 13600, process: 'drell-yan-z', nEvents: 1, seed: 12345, record: 'compact' };

/** Hand-written record in PYTHIA's layout (statuses, mother lists, vProd in mm). */
function fixtureEvent(shift = 0): PythiaEvent {
  const z = [0, 0, 5, 0] as const;
  return {
    index: 0,
    weight: 1,
    particles: [
      { i: 1, id: 2212, status: -12, mothers: [], p: [0, 0, 6800, 6800], m: 0.938, v: [0, 0, 0, 0] },
      { i: 2, id: 2212, status: -12, mothers: [], p: [0, 0, -6800, 6800], m: 0.938, v: [0, 0, 0, 0] },
      { i: 3, id: 2, status: -21, mothers: [1], p: [0, 0, 60, 60], m: 0, v: z },
      { i: 4, id: -2, status: -21, mothers: [2], p: [0, 0, -35, 35], m: 0, v: z },
      { i: 5, id: 23, status: -22, mothers: [3, 4], p: [0, 0, 25, 95.8], m: 91.2 + shift, v: z },
      { i: 6, id: 13, status: 1, mothers: [5], p: [40, 10, 30, 51.0], m: 0.1057, v: z },
      { i: 7, id: -13, status: 1, mothers: [5], p: [-40, -10, -5, 41.54], m: 0.1057, v: z },
      // Beam remnant string → B⁺ that decays 3 mm away, plus a prompt pion.
      { i: 8, id: 2101, status: -63, mothers: [1], p: [0, 0, 3000, 3000], m: 0.58, v: z },
      { i: 9, id: 521, status: -83, mothers: [8], p: [3, 0, 4, 7.1], m: 5.279, v: z },
      { i: 10, id: 211, status: 83, mothers: [8], p: [0.5, 0.2, 2, 2.1], m: 0.1396, v: z },
      { i: 11, id: -321, status: 91, mothers: [9], p: [1.5, 0, 2, 2.55], m: 0.4937, v: [3, 0, 9, 6] },
      { i: 12, id: 211, status: 91, mothers: [9], p: [1.5, 0, 2, 2.5], m: 0.1396, v: [3, 0, 9, 6] },
    ],
  };
}

function fixtureResponse(req: GeneratorRequest, events: PythiaEvent[] = [fixtureEvent()]): PythiaResponse {
  return { format: PYTHIA_RECORD_FORMAT, generator: { name: 'PYTHIA', version: '8.316' }, settings: pythiaSettings(req), sigmaGenMb: 1.9e-6, sigmaErrMb: 1e-8, events };
}

describe('PYTHIA record → normalized events', () => {
  it('produces a valid, reciprocal HepMC-like truth record', () => {
    const rec = pythiaEventToRecord(fixtureEvent(), 'DY', 1);
    expect(() => validateEvent(rec)).not.toThrow();
    const by = new Map(rec.particles.map((p) => [p.id, p]));
    expect(by.get(1)!.status).toBe(4);
    expect(by.get(5)!.status).toBe(3);
    expect(by.get(5)!.children).toEqual([6, 7]);
    expect(by.get(6)!.status).toBe(1);
    expect(by.get(9)!.status).toBe(2);
    expect(by.get(11)!.charge).toBe(-1);
    const bDecay = rec.vertices[by.get(11)!.prodVtx]!;
    expect(bDecay.kind).toBe('displaced');
    expect(bDecay.x).toBeCloseTo(3e-3, 12);
    expect(bDecay.t).toBeCloseTo(6 / 299.792458, 12);
    expect(rec.vertices[by.get(6)!.prodVtx]!.kind).toBe('primary');
  });

  it('builds a PYTHIA-provenance sample that the pipeline processes', () => {
    const s = pythiaResponseToSample(fixtureResponse(REQ), REQ);
    expect(s.provenance.sourceType).toBe('PYTHIA');
    expect(s.provenance.isSimulation).toBe(true);
    expect(s.provenance.generator).toMatchObject({ name: 'PYTHIA', version: '8.316', seed: 12345 });
    expect(s.provenance.generator!.settings['Random:seed']).toBe('12345');
    expect(s.meta.analysisPair).toBe('muon');
    const pe = processDatasetEvent(new NormalizedDataset(s), 0, 'atlas');
    expect(pe.trajectorySource).toBe('truth');
    expect(pe.reco.muons.length).toBeGreaterThanOrEqual(1);
    const pair = selectPair(pe.reco, 'muon');
    if (pair) expect(pair.mass).toBeGreaterThan(60);
  });

  it('rejects a backend response whose settings differ from the request', () => {
    const res = fixtureResponse({ ...REQ, seed: 999 });
    expect(() => pythiaResponseToSample(res, REQ)).toThrow(/settings/);
  });
});

describe('PYTHIA deterministic seed behaviour', () => {
  it('request → settings and dataset id are pure functions of the request', () => {
    expect(pythiaSettings(REQ)).toEqual(pythiaSettings({ ...REQ }));
    expect(pythiaSettings(REQ)).toContain('Random:seed = 12345');
    expect(pythiaSettings(REQ)).toContain('Random:setSeed = on');
    expect(requestId(REQ)).toBe(requestId({ ...REQ }));
    expect(requestId({ ...REQ, seed: 2 })).not.toBe(requestId(REQ));
  });

  it('the client sends identical requests for identical configs and converts identically', async () => {
    const bodies: string[] = [];
    const fakeFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
      bodies.push(String(init!.body));
      const req = JSON.parse(String(init!.body)) as { settings: string[] };
      const seed = Number(req.settings.find((x) => x.startsWith('Random:seed'))!.split('=')[1]);
      // A deterministic stand-in for PYTHIA: output depends only on the seed.
      return new Response(JSON.stringify(fixtureResponse({ ...REQ, seed }, [fixtureEvent(seed % 7)])), { status: 200 });
    };
    const client = new PythiaBackendClient('/api/pythia', fakeFetch);
    const a = await client.generate(REQ);
    const b = await client.generate({ ...REQ });
    expect(bodies[0]).toBe(bodies[1]);
    expect(a).toEqual(b);
    const c = await client.generate({ ...REQ, seed: 12346 });
    expect(c.events[0]!.truth).not.toEqual(a.events[0]!.truth);
  });

  it('validates request bounds and reports an unreachable backend without throwing', async () => {
    expect(() => validateRequest({ ...REQ, seed: 0 })).toThrow();
    expect(() => validateRequest({ ...REQ, nEvents: 10_000 })).toThrow();
    expect(() => validateRequest({ ...REQ, sqrtSGeV: 10 })).toThrow();
    const down = new PythiaBackendClient('/api/pythia', async () => {
      throw new Error('ECONNREFUSED');
    });
    const st = await down.status();
    expect(st.available).toBe(false);
    expect(st.detail).toContain('pythia_server.py');
    expect(pythiaWasmStatus().available).toBe(false);
  });
});
