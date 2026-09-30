/**
 * Conversion of the PYTHIA backend's event record into the normalized HepMC-like model.
 *
 * Backend wire format ("lhcsim-pythia-record/1"): one entry per particle of `pythia.event`
 * (system entry 0 removed), with PYTHIA indices, status, mother list and production vertex
 * vProd in mm and mm/c. Mother lists are authoritative; children are derived from them so
 * that parent/child links are reciprocal by construction (PYTHIA daughter ranges are not
 * always reciprocal, e.g. for string systems).
 *
 * Status mapping: final (status > 0) → 1; |status| 11–19 incoming beams → 4;
 * |status| 21–29 hard process → 3; other decayed/fragmented entries → 2; documentation-only
 * entries without children → 3.
 * Vertices: particles sharing the same mother set share a production vertex placed at their
 * vProd; kinds as in the HepMC adapter (primary within 1 µm of the hard vertex, displaced when
 * a b/c hadron decays, otherwise secondary).
 */
import type { EventRecord, ParticleRecord, ParticleStatus, VertexKind, VertexRecord } from '../physics/events/EventSchema';
import { EventValidationError } from '../physics/events/EventLoader';
import { pdgCharge } from '../physics/particles/PdgCharge';
import { isHeavyFlavourHadron } from '../data-sources/hepmc/HepMCAdapter';
import { NORMALIZED_SCHEMA_ID, validateNormalizedSample, type NormalizedSample } from '../data-sources/NormalizedEvent';
import { PROCESS_LABEL, pythiaSettings, requestId, type GeneratorRequest } from './EventGenerator';

export const PYTHIA_RECORD_FORMAT = 'lhcsim-pythia-record/1';

export interface PythiaParticle {
  /** PYTHIA event-record index (≥ 1). */
  readonly i: number;
  readonly id: number;
  readonly status: number;
  readonly mothers: readonly number[];
  /** [px, py, pz, e] GeV. */
  readonly p: readonly [number, number, number, number];
  readonly m: number;
  /** Production vertex [x, y, z, t] in mm and mm/c. */
  readonly v: readonly [number, number, number, number];
}

export interface PythiaEvent {
  readonly index: number;
  readonly weight: number;
  readonly particles: readonly PythiaParticle[];
  /** Info block (e.g. code/name of the hard process). */
  readonly info?: Readonly<Record<string, number | string>>;
}

export interface PythiaResponse {
  readonly format: typeof PYTHIA_RECORD_FORMAT;
  readonly generator: { readonly name: string; readonly version: string };
  readonly settings: readonly string[];
  /** Estimated cross section of the run [mb] and its error, from pythia.info. */
  readonly sigmaGenMb: number | null;
  readonly sigmaErrMb: number | null;
  readonly events: readonly PythiaEvent[];
}

const C_MM_PER_NS = 299.792458;
const COINCIDENT_MM = 1e-3;

function mapStatus(s: number, hasChildren: boolean): ParticleStatus {
  if (s > 0) return hasChildren ? 2 : 1;
  const a = -s;
  if (a >= 11 && a <= 19) return 4;
  if (a >= 21 && a <= 29) return 3;
  return hasChildren ? 2 : 3;
}

export function pythiaEventToRecord(ev: PythiaEvent, process: string, seed: number): EventRecord {
  const ps = ev.particles;
  const byIdx = new Map(ps.map((p) => [p.i, p]));
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  for (const p of ps) {
    const ms = [...new Set(p.mothers.filter((m) => m !== p.i && byIdx.has(m)))].sort((a, b) => a - b);
    parents.set(p.i, ms);
    for (const m of ms) (children.get(m) ?? children.set(m, []).get(m)!).push(p.i);
  }
  // Hard vertex: production vertex of the first hard-process particle, else origin.
  const hard = ps.find((p) => Math.abs(p.status) >= 21 && Math.abs(p.status) <= 29);
  const pv = hard ? hard.v : ([0, 0, 0, 0] as const);

  const vertices: VertexRecord[] = [];
  const vertexOfMothers = new Map<string, number>();
  const addVertex = (key: string, v: readonly number[], incoming: readonly number[]): number => {
    let id = vertexOfMothers.get(key);
    if (id !== undefined) return id;
    const d = Math.hypot(v[0]! - pv[0], v[1]! - pv[1], v[2]! - pv[2]);
    const kind: VertexKind = d < COINCIDENT_MM ? 'primary' : incoming.some((m) => isHeavyFlavourHadron(byIdx.get(m)!.id)) ? 'displaced' : 'secondary';
    id = vertices.length;
    vertices.push({ id, kind, x: v[0]! * 1e-3, y: v[1]! * 1e-3, z: v[2]! * 1e-3, t: v[3]! / C_MM_PER_NS });
    vertexOfMothers.set(key, id);
    return id;
  };
  const primary = addVertex('beams', pv, []);
  const prodVtx = new Map<number, number>();
  for (const p of ps) {
    const ms = parents.get(p.i)!;
    prodVtx.set(p.i, ms.length === 0 ? primary : addVertex(ms.join(','), p.v, ms));
  }
  const particles: ParticleRecord[] = ps.map((p) => {
    const kids = children.get(p.i) ?? [];
    return {
      id: p.i,
      pdg: p.id,
      status: mapStatus(p.status, kids.length > 0),
      charge: pdgCharge(p.id),
      p: [p.p[3], p.p[0], p.p[1], p.p[2]],
      m: p.m,
      prodVtx: prodVtx.get(p.i)!,
      decayVtx: kids.length ? prodVtx.get(kids[0]!)! : null,
      parents: parents.get(p.i)!,
      children: kids,
    };
  });
  return { eventId: ev.index, process, seed, vertices, particles };
}

export function pythiaResponseToSample(res: PythiaResponse, req: GeneratorRequest): NormalizedSample {
  if (res.format !== PYTHIA_RECORD_FORMAT) throw new EventValidationError(`Unexpected backend format ${res.format}`);
  const expected = pythiaSettings(req);
  if (res.settings.length !== expected.length || res.settings.some((s, i) => s !== expected[i])) {
    throw new EventValidationError('Backend applied settings that differ from the request');
  }
  const id = requestId(req);
  const label = PROCESS_LABEL[req.process];
  const notes = [
    `Generated on request by ${res.generator.name} ${res.generator.version} (backend process, not in the browser).`,
    `Settings: ${res.settings.join('; ')}`,
    res.sigmaGenMb !== null ? `Estimated σ of the generated process: ${(res.sigmaGenMb * 1e9).toPrecision(4)} pb ± ${((res.sigmaErrMb ?? 0) * 1e9).toPrecision(2)} pb (PYTHIA info.sigmaGen).` : 'Cross section not reported.',
    req.record === 'compact' ? 'Compact record: final state, beams, hard process and decayed hadrons/resonances kept; intermediate shower/string entries removed and ancestry re-linked to the nearest kept ancestor.' : 'Full PYTHIA event record.',
    'Default PYTHIA 8 tune and PDFs; no pile-up, no beam-spot smearing (added by the collider-operation modules).',
  ];
  const analysisPair = req.process === 'drell-yan-z' ? ('muon' as const) : req.process === 'higgs-diphoton' ? ('photon' as const) : undefined;
  return validateNormalizedSample({
    schema: NORMALIZED_SCHEMA_ID,
    provenance: {
      sourceType: 'PYTHIA',
      isSimulation: true,
      experiment: null,
      datasetId: id,
      title: `PYTHIA 8 · ${label} · √s = ${(req.sqrtSGeV / 1000).toFixed(1)} TeV · seed ${req.seed}`,
      year: null,
      collisionSystem: 'pp',
      sqrtSGeV: req.sqrtSGeV,
      integratedLuminosityInvPb: null,
      generator: { name: res.generator.name, version: res.generator.version, tune: 'default (Monash 2013)', process: label, seed: req.seed, settings: Object.fromEntries(res.settings.map((s) => s.split('=').map((x) => x.trim()) as [string, string])) },
      source: { name: 'Local PYTHIA 8 backend (server/pythia_server.py)', url: 'https://pythia.org', doi: null, license: 'Generated events; PYTHIA 8 is GPL-2.0-or-later' },
      processingNotes: notes,
    },
    meta: {
      id,
      title: `PYTHIA 8: ${label}`,
      process: label,
      collisionSystem: 'pp',
      sqrtSGeV: req.sqrtSGeV,
      synthetic: true,
      generator: `${res.generator.name} ${res.generator.version}`,
      description: label,
      seed: req.seed,
      ...(analysisPair ? { analysisPair } : {}),
      ...(req.process === 'drell-yan-z' ? { intendedMassGeV: 91.19 } : req.process === 'higgs-diphoton' ? { intendedMassGeV: 125 } : {}),
      notes,
    },
    events: res.events.map((e) => ({ eventNumber: e.index, run: null, lumiBlock: null, weights: [e.weight], truth: pythiaEventToRecord(e, label, req.seed), reco: null })),
  });
}
