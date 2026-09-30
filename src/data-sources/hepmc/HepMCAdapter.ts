/**
 * Adapter: HepMC3 ASCII event records → normalized truth events.
 *
 * Supported lines (HepMC3 "Asciiv3" format):
 *   E <event#> <nVertices> <nParticles> [@ x y z t]
 *   U <MEV|GEV> <MM|CM>
 *   W <w1> <w2> …
 *   V <id<0> <status> [<in1>,<in2>,…] [@ x y z t]
 *   P <id> <parent> <pdg> <px> <py> <pz> <e> <m> <status>
 *     parent < 0: production vertex id; parent > 0: single parent particle (implicit vertex);
 *     parent = 0: no production vertex (beam particle).
 * Attribute lines (A …), tool/run-info lines are ignored. HepMC2 (IO_GenEvent) is rejected.
 *
 * Mapping choices (documented, conservative — nothing is invented):
 *  - charge from the PDG code (HepMC carries none);
 *  - a vertex without position inherits its first incoming particle's production position
 *    (HepMC3 semantics); if still unknown it sits at the event origin;
 *  - beam particles are attached to the vertex they enter;
 *  - status 1/2/4 kept; 3 and 21–29 → hard-process documentation (3); other statuses →
 *    2 when the particle decays, otherwise 3 (documentation only);
 *  - vertex kind: primary if coincident (< 1 µm) with the hard-scatter vertex, displaced if
 *    a b/c hadron enters it, secondary otherwise. HepMC has no pile-up notion.
 * Lengths are converted to metres, times from c·t [length] to ns, momenta to GeV.
 */
import type { EventRecord, ParticleRecord, ParticleStatus, VertexKind, VertexRecord } from '../../physics/events/EventSchema';
import { EventValidationError } from '../../physics/events/EventLoader';
import { pdgCharge } from '../../physics/particles/PdgCharge';
import type { NormalizedEvent } from '../NormalizedEvent';

const C_M_PER_NS = 0.299792458;
const COINCIDENT_M = 1e-6;

interface RawParticle { id: number; parent: number; pdg: number; p: [number, number, number, number]; m: number; status: number }
interface RawVertex { key: string; status: number; incoming: number[]; pos: [number, number, number, number] | null }

export interface HepMCParseOptions {
  /** Process label copied into each truth record. */
  readonly process: string;
}

export function parseHepMC3(text: string, opts: HepMCParseOptions): NormalizedEvent[] {
  if (text.includes('IO_GenEvent-START_EVENT_LISTING')) throw new EventValidationError('HepMC2 (IO_GenEvent) is not supported — convert to HepMC3 ASCII');
  const events: NormalizedEvent[] = [];
  let energyScale = 1; // → GeV
  let lengthScale = 1e-3; // → m (default MM)
  let cur: { number: number; weights: number[]; particles: RawParticle[]; vertices: Map<string, RawVertex>; order: string[] } | null = null;

  const flush = (): void => {
    if (cur) events.push(buildEvent(cur, energyScale, lengthScale, opts.process));
    cur = null;
  };

  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!.trim();
    if (!line || line.startsWith('HepMC::')) continue;
    const tok = line.split(/\s+/);
    const tag = tok[0];
    try {
      if (tag === 'E') {
        flush();
        cur = { number: int(tok[1]), weights: [], particles: [], vertices: new Map(), order: [] };
      } else if (tag === 'U') {
        energyScale = tok[1] === 'MEV' ? 1e-3 : tok[1] === 'GEV' ? 1 : bad(`unknown energy unit ${tok[1]}`);
        lengthScale = tok[2] === 'MM' ? 1e-3 : tok[2] === 'CM' ? 1e-2 : bad(`unknown length unit ${tok[2]}`);
      } else if (!cur) {
        continue;
      } else if (tag === 'W') {
        cur.weights = tok.slice(1).map(num);
      } else if (tag === 'V') {
        const id = int(tok[1]);
        const status = int(tok[2]);
        const incoming = (tok[3] ?? '[]').replace(/[[\]]/g, '').split(',').filter(Boolean).map(int);
        const at = tok.indexOf('@');
        const pos = at > 0 ? ([num(tok[at + 1]), num(tok[at + 2]), num(tok[at + 3]), num(tok[at + 4])] as [number, number, number, number]) : null;
        const key = `v${id}`;
        cur.vertices.set(key, { key, status, incoming, pos });
        cur.order.push(key);
      } else if (tag === 'P') {
        cur.particles.push({
          id: int(tok[1]),
          parent: int(tok[2]),
          pdg: int(tok[3]),
          p: [num(tok[7]), num(tok[4]), num(tok[5]), num(tok[6])],
          m: num(tok[8]),
          status: int(tok[9]),
        });
      }
    } catch (e) {
      throw new EventValidationError(`HepMC line ${ln + 1}: ${(e as Error).message}`);
    }
  }
  flush();
  if (events.length === 0) throw new EventValidationError('No HepMC3 events found');
  return events;
}

function buildEvent(
  raw: { number: number; weights: number[]; particles: RawParticle[]; vertices: Map<string, RawVertex>; order: string[] },
  eScale: number,
  lScale: number,
  process: string,
): NormalizedEvent {
  const byId = new Map(raw.particles.map((p) => [p.id, p]));
  // Implicit single-parent vertices.
  for (const p of raw.particles) {
    if (p.parent > 0) {
      const key = `p${p.parent}`;
      if (!raw.vertices.has(key)) {
        raw.vertices.set(key, { key, status: 0, incoming: [p.parent], pos: null });
        raw.order.push(key);
      }
    }
  }
  const prodKey = (p: RawParticle): string | null => (p.parent < 0 ? `v${p.parent}` : p.parent > 0 ? `p${p.parent}` : null);
  const endKey = new Map<number, string>();
  for (const v of raw.vertices.values()) for (const i of v.incoming) endKey.set(i, v.key);

  // Resolve positions (inherit from incoming particle's production vertex).
  const resolved = new Map<string, [number, number, number, number]>();
  const resolve = (key: string, depth = 0): [number, number, number, number] => {
    const hit = resolved.get(key);
    if (hit) return hit;
    const v = raw.vertices.get(key);
    let pos: [number, number, number, number] = [0, 0, 0, 0];
    if (v?.pos) pos = v.pos;
    else if (v && depth < 64) {
      for (const i of v.incoming) {
        const par = byId.get(i);
        const pk = par ? prodKey(par) : null;
        if (pk && raw.vertices.has(pk)) {
          pos = resolve(pk, depth + 1);
          break;
        }
      }
    }
    resolved.set(key, pos);
    return pos;
  };

  // Hard-scatter vertex: the one beams enter, else the first listed.
  const beams = raw.particles.filter((p) => p.status === 4 || p.parent === 0);
  const pvKey = beams.map((b) => endKey.get(b.id)).find((k) => k !== undefined) ?? raw.order[0];
  if (!pvKey) throw new EventValidationError(`HepMC event ${raw.number}: no vertices`);
  const pvPos = resolve(pvKey);

  const vIndex = new Map<string, number>();
  const vertices: VertexRecord[] = [];
  for (const key of raw.order) {
    const pos = resolve(key);
    const d = Math.hypot(pos[0] - pvPos[0], pos[1] - pvPos[1], pos[2] - pvPos[2]) * lScale;
    const incoming = raw.vertices.get(key)!.incoming.map((i) => byId.get(i)).filter((p): p is RawParticle => !!p);
    const kind: VertexKind = key === pvKey || d < COINCIDENT_M ? 'primary' : incoming.some((p) => isHeavyFlavourHadron(p.pdg)) ? 'displaced' : 'secondary';
    vIndex.set(key, vertices.length);
    vertices.push({ id: vertices.length, kind, x: pos[0] * lScale, y: pos[1] * lScale, z: pos[2] * lScale, t: (pos[3] * lScale) / C_M_PER_NS });
  }

  const outgoing = new Map<string, number[]>();
  for (const p of raw.particles) {
    const k = prodKey(p);
    if (k) (outgoing.get(k) ?? outgoing.set(k, []).get(k)!).push(p.id);
  }
  const particles: ParticleRecord[] = raw.particles.map((p) => {
    const pk = prodKey(p);
    const ek = endKey.get(p.id) ?? null;
    const prodVtx = pk ? vIndex.get(pk)! : ek ? vIndex.get(ek)! : vIndex.get(pvKey)!;
    const parents = pk ? raw.vertices.get(pk)!.incoming.filter((i) => byId.has(i)) : [];
    const children = ek ? (outgoing.get(ek) ?? []) : [];
    return {
      id: p.id,
      pdg: p.pdg,
      status: mapStatus(p.status, children.length > 0),
      charge: pdgCharge(p.pdg),
      p: [p.p[0] * eScale, p.p[1] * eScale, p.p[2] * eScale, p.p[3] * eScale],
      m: p.m * eScale,
      prodVtx,
      decayVtx: ek ? vIndex.get(ek)! : null,
      parents,
      children,
    };
  });

  const truth: EventRecord = { eventId: raw.number, process, seed: raw.number, vertices, particles };
  return { eventNumber: raw.number, run: null, lumiBlock: null, weights: raw.weights.length ? raw.weights : [1], truth, reco: null };
}

function mapStatus(s: number, hasChildren: boolean): ParticleStatus {
  if (s === 1) return hasChildren ? 2 : 1;
  if (s === 2 || s === 4) return s;
  if (s === 3 || (s >= 21 && s <= 29)) return 3;
  return hasChildren ? 2 : 3;
}

/** b- or c-flavoured hadron (mesons 4xx/5xx, baryons 4xxx/5xxx). */
export function isHeavyFlavourHadron(pdg: number): boolean {
  const n = Math.abs(pdg) % 10_000;
  const q1 = Math.floor(n / 1000) % 10;
  const q2 = Math.floor(n / 100) % 10;
  return n >= 100 && (q1 === 4 || q1 === 5 || (q1 === 0 && (q2 === 4 || q2 === 5)));
}

function num(s: string | undefined): number {
  const v = Number(s);
  if (s === undefined || !Number.isFinite(v)) throw new Error(`expected number, got "${s}"`);
  return v;
}
function int(s: string | undefined): number {
  const v = num(s);
  if (!Number.isInteger(v)) throw new Error(`expected integer, got "${s}"`);
  return v;
}
function bad(msg: string): never {
  throw new Error(msg);
}
