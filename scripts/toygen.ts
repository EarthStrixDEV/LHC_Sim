/**
 * lhcsim toy event generator — OFFLINE, EDUCATIONAL.
 *
 * Produces kinematically consistent but physically simplified events:
 *  - resonances sampled from Breit–Wigner line shapes, decayed isotropically in their
 *    rest frame (spin correlations ignored);
 *  - partons "fragmented" by a toy longitudinal-fraction + Gaussian-kT model that conserves
 *    the parton 3-momentum and (approximately) charge — NOT a Lund string model;
 *  - soft underlying event and pile-up drawn from simple pT/η distributions.
 *
 * This is not PYTHIA and does not produce physics-accurate cross sections or spectra.
 */
import { FourVector } from '../src/physics/events/FourVector';
import type { ParticleRecord, ParticleStatus, VertexKind, VertexRecord } from '../src/physics/events/EventSchema';
import { ParticleDatabase } from '../src/physics/particles/ParticleDatabase';
import {
  CTAU_B_MESON_M,
  CTAU_K0S_M,
  CTAU_LAMBDA_M,
  KAON_CHARGED_MASS_GEV,
  PION_CHARGED_MASS_GEV,
} from '../src/physics/constants/physicalConstants';
import { Rng, TWO_PI } from '../src/utils/math';

const C_M_PER_NS = 0.299_792_458;

/** Radius beyond which long-lived neutral hadrons are left undecayed (outside the tracker). */
const TRACKER_DECAY_RADIUS_M = 1.0;

interface MutableParticle {
  id: number;
  pdg: number;
  status: ParticleStatus;
  charge: number;
  p4: FourVector;
  m: number;
  prodVtx: number;
  decayVtx: number | null;
  parents: number[];
  children: number[];
}

export class EventBuilder {
  readonly vertices: VertexRecord[] = [];
  readonly particles: MutableParticle[] = [];

  addVertex(kind: VertexKind, x: number, y: number, z: number, t: number): number {
    const id = this.vertices.length;
    this.vertices.push({ id, kind, x, y, z, t });
    return id;
  }

  vertex(id: number): VertexRecord {
    return this.vertices[id]!;
  }

  add(pdg: number, status: ParticleStatus, p4: FourVector, m: number, prodVtx: number, parents: number[] = []): number {
    const id = this.particles.length;
    const charge = ParticleDatabase.lookup(pdg).charge;
    this.particles.push({ id, pdg, status, charge, p4, m, prodVtx, decayVtx: null, parents: [...parents], children: [] });
    for (const par of parents) {
      const pp = this.particles[par]!;
      pp.children.push(id);
      if (pp.status === 1) pp.status = 2;
    }
    return id;
  }

  get(id: number): MutableParticle {
    return this.particles[id]!;
  }

  /** Links an existing particle as an additional child of `parent` (e.g. partons from a vertex). */
  link(parent: number, child: number): void {
    this.get(parent).children.push(child);
    this.get(child).parents.push(parent);
  }

  /** Marks `id` as decayed at `vtx`. */
  decayAt(id: number, vtx: number): void {
    const p = this.get(id);
    p.decayVtx = vtx;
    if (p.status === 1) p.status = 2;
  }

  toRecords(): { vertices: VertexRecord[]; particles: ParticleRecord[] } {
    return {
      vertices: this.vertices.map((v) => ({ ...v, x: r(v.x, 6), y: r(v.y, 6), z: r(v.z, 6), t: r(v.t, 5) })),
      particles: this.particles.map((p) => ({
        id: p.id,
        pdg: p.pdg,
        status: p.status,
        charge: r(p.charge, 6),
        p: [r(p.p4.e, 6), r(p.p4.px, 6), r(p.p4.py, 6), r(p.p4.pz, 6)],
        m: r(p.m, 7),
        prodVtx: p.prodVtx,
        decayVtx: p.decayVtx,
        parents: p.parents,
        children: p.children,
      })),
    };
  }
}

/** Rounds to n significant digits (keeps JSON compact and deterministic). */
export function r(x: number, n: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(n));
}

// ---- Kinematics ------------------------------------------------------------------------------

/** Isotropic unit vector. */
export function isotropic(rng: Rng): [number, number, number] {
  const cosT = rng.uniform(-1, 1);
  const sinT = Math.sqrt(1 - cosT * cosT);
  const phi = rng.uniform(0, TWO_PI);
  return [sinT * Math.cos(phi), sinT * Math.sin(phi), cosT];
}

/** Two-body decay of `parent` into masses m1, m2, isotropic in the parent rest frame. */
export function twoBody(parent: FourVector, m1: number, m2: number, rng: Rng): [FourVector, FourVector] {
  const M = parent.mass();
  if (M < m1 + m2) throw new Error(`twoBody: M=${M} < m1+m2=${m1 + m2}`);
  const pStar = Math.sqrt((M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2)) / (2 * M);
  const [ux, uy, uz] = isotropic(rng);
  const d1 = FourVector.fromMassMomentum(m1, pStar * ux, pStar * uy, pStar * uz);
  const d2 = FourVector.fromMassMomentum(m2, -pStar * ux, -pStar * uy, -pStar * uz);
  const [bx, by, bz] = parent.betaVector();
  return [d1.boost(bx, by, bz), d2.boost(bx, by, bz)];
}

/**
 * Sequential n-body decay (recursive two-body with uniformly sampled intermediate masses).
 * Conserves four-momentum exactly; does not reproduce true n-body phase-space density.
 */
export function nBody(parent: FourVector, masses: readonly number[], rng: Rng): FourVector[] {
  if (masses.length === 1) return [parent];
  if (masses.length === 2) return twoBody(parent, masses[0]!, masses[1]!, rng);
  const M = parent.mass();
  const rest = masses.slice(1);
  const restMin = rest.reduce((a, b) => a + b, 0);
  const restMax = M - masses[0]!;
  const mRest = restMin + (restMax - restMin) * rng.uniform(0.05, 0.95);
  const [first, restSystem] = twoBody(parent, masses[0]!, mRest, rng);
  return [first, ...nBody(restSystem, rest, rng)];
}

/** Displaced decay vertex from exponential proper decay length cτ. */
export function decayVertexFor(b: EventBuilder, p4: FourVector, mass: number, ctauM: number, prodVtx: number, kind: VertexKind, rng: Rng): { id: number; radius: number } {
  const v = b.vertex(prodVtx);
  const pp = p4.p();
  const betaGamma = pp / mass;
  const L = rng.exponential(ctauM * betaGamma);
  const ux = p4.px / pp, uy = p4.py / pp, uz = p4.pz / pp;
  const beta = pp / p4.e;
  const x = v.x + L * ux, y = v.y + L * uy, z = v.z + L * uz;
  const id = b.addVertex(kind, x, y, z, v.t + L / (beta * C_M_PER_NS));
  return { id, radius: Math.hypot(x, y) };
}

// ---- Hadron species and decays -----------------------------------------------------------------

interface HadronChoice { pdg: number; mass: number }

const HADRON_TABLE: ReadonlyArray<[number, number]> = [
  // [|pdg|, relative abundance] — toy composition of jet/UE hadrons
  [211, 0.58], [111, 0.2], [321, 0.08], [130, 0.03], [310, 0.03], [2212, 0.04], [2112, 0.04],
];

export function pickHadron(rng: Rng): HadronChoice {
  let u = rng.next() * HADRON_TABLE.reduce((a, [, w]) => a + w, 0);
  for (const [pdg, w] of HADRON_TABLE) {
    u -= w;
    if (u <= 0) {
      const signed = pdg === 111 || pdg === 130 || pdg === 310 ? pdg : rng.bernoulli(0.5) ? pdg : -pdg;
      return { pdg: signed, mass: ParticleDatabase.lookup(signed).massGeV };
    }
  }
  const pdg = rng.bernoulli(0.5) ? 211 : -211;
  return { pdg, mass: PION_CHARGED_MASS_GEV };
}

/**
 * Adds a hadron and performs its (toy) decays:
 *   π⁰ → γγ (prompt, same vertex),  K⁰_S → π⁺π⁻,  Λ → p π⁻ (secondary vertices).
 */
export function addHadron(b: EventBuilder, pdg: number, p4: FourVector, mass: number, vtx: number, parents: number[], rng: Rng): number {
  const id = b.add(pdg, 1, p4, mass, vtx, parents);
  if (pdg === 111) {
    const [g1, g2] = twoBody(p4, 0, 0, rng);
    b.decayAt(id, vtx);
    b.add(22, 1, g1, 0, vtx, [id]);
    b.add(22, 1, g2, 0, vtx, [id]);
  } else if (pdg === 310 || Math.abs(pdg) === 3122) {
    const ctau = pdg === 310 ? CTAU_K0S_M : CTAU_LAMBDA_M;
    const dv = decayVertexFor(b, p4, mass, ctau, vtx, 'secondary', rng);
    if (dv.radius < TRACKER_DECAY_RADIUS_M) {
      b.decayAt(id, dv.id);
      if (pdg === 310) {
        const [a, c] = twoBody(p4, PION_CHARGED_MASS_GEV, PION_CHARGED_MASS_GEV, rng);
        b.add(211, 1, a, PION_CHARGED_MASS_GEV, dv.id, [id]);
        b.add(-211, 1, c, PION_CHARGED_MASS_GEV, dv.id, [id]);
      } else {
        const s = Math.sign(pdg);
        const pm = ParticleDatabase.lookup(2212).massGeV;
        const [a, c] = twoBody(p4, pm, PION_CHARGED_MASS_GEV, rng);
        b.add(2212 * s, 1, a, pm, dv.id, [id]);
        b.add(-211 * s, 1, c, PION_CHARGED_MASS_GEV, dv.id, [id]);
      }
    }
  }
  return id;
}

/** Orthonormal basis perpendicular to unit vector u. */
function perpBasis(ux: number, uy: number, uz: number): [[number, number, number], [number, number, number]] {
  const ax = Math.abs(ux) < 0.9 ? 1 : 0;
  const ay = ax === 1 ? 0 : 1;
  // e1 = normalize(a × u)
  let e1x = ay * uz - 0 * uy, e1y = 0 * ux - ax * uz, e1z = ax * uy - ay * ux;
  const n1 = Math.hypot(e1x, e1y, e1z);
  e1x /= n1; e1y /= n1; e1z /= n1;
  // e2 = u × e1
  const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
  return [[e1x, e1y, e1z], [e2x, e2y, e2z]];
}

export interface FragmentOptions {
  /** Leading heavy-flavour hadron (e.g. B meson) taking fraction ~zLead of the momentum. */
  leading?: { pdg: number; mass: number; zMean: number; ctauM: number };
  /** Mean intrinsic kT of hadrons relative to the parton axis [GeV]. */
  kT?: number;
}

/**
 * Toy fragmentation of a parton into hadrons. Hadron 3-momenta sum exactly to the parton
 * 3-momentum; energies follow from hadron masses, so the jet acquires a small mass.
 */
export function fragment(b: EventBuilder, partonId: number, vtx: number, rng: Rng, opts: FragmentOptions = {}): number[] {
  const P = b.get(partonId).p4;
  const pMag = P.p();
  const ux = P.px / pMag, uy = P.py / pMag, uz = P.pz / pMag;
  const [e1, e2] = perpBasis(ux, uy, uz);
  const nHad = Math.max(2, Math.round(2 + 2.3 * Math.log(Math.max(P.e, 3)) + rng.gaussian(0, 1)));

  const species: HadronChoice[] = [];
  let zLead = 0;
  if (opts.leading) {
    zLead = Math.min(0.95, Math.max(0.4, rng.gaussian(opts.leading.zMean, 0.1)));
    species.push({ pdg: opts.leading.pdg, mass: opts.leading.mass });
  }
  const nRest = opts.leading ? nHad - 1 : nHad;
  for (let i = 0; i < nRest; i++) species.push(pickHadron(rng));
  balanceCharge(species, rng);

  // Longitudinal fractions: leading takes zLead, the rest share (1 − zLead) via normalized exponentials.
  const w = species.map((_, i) => (opts.leading && i === 0 ? 0 : rng.exponential(1)));
  const wSum = w.reduce((a, c) => a + c, 0) || 1;
  const z = w.map((x, i) => (opts.leading && i === 0 ? zLead : ((1 - zLead) * x) / wSum));

  // Transverse kicks with zero sum.
  const kT = opts.kT ?? 0.35;
  const k1 = species.map(() => rng.gaussian(0, kT));
  const k2 = species.map(() => rng.gaussian(0, kT));
  const m1 = k1.reduce((a, c) => a + c, 0) / species.length;
  const m2 = k2.reduce((a, c) => a + c, 0) / species.length;

  b.decayAt(partonId, vtx);
  const ids: number[] = [];
  species.forEach((h, i) => {
    const a = k1[i]! - m1, c = k2[i]! - m2;
    const pl = z[i]! * pMag;
    const px = pl * ux + a * e1[0] + c * e2[0];
    const py = pl * uy + a * e1[1] + c * e2[1];
    const pz = pl * uz + a * e1[2] + c * e2[2];
    const p4 = FourVector.fromMassMomentum(h.mass, px, py, pz);
    if (opts.leading && i === 0) {
      ids.push(addHeavyHadron(b, h.pdg, p4, h.mass, opts.leading.ctauM, vtx, [partonId], rng));
    } else {
      ids.push(addHadron(b, h.pdg, p4, h.mass, vtx, [partonId], rng));
    }
  });
  return ids;
}

/** Heavy-flavour hadron with a displaced decay into 3–5 light hadrons. */
function addHeavyHadron(b: EventBuilder, pdg: number, p4: FourVector, mass: number, ctau: number, vtx: number, parents: number[], rng: Rng): number {
  const id = b.add(pdg, 1, p4, mass, vtx, parents);
  const dv = decayVertexFor(b, p4, mass, ctau, vtx, 'displaced', rng);
  b.decayAt(id, dv.id);
  const n = rng.int(3, 6);
  const prods: HadronChoice[] = [];
  const parentCharge = ParticleDatabase.lookup(pdg).charge;
  for (let i = 0; i < n; i++) {
    const kaon = i === 0; // b → c → s: a kaon is typical among the products
    const sign = rng.bernoulli(0.5) ? 1 : -1;
    prods.push(kaon ? { pdg: 321 * sign, mass: KAON_CHARGED_MASS_GEV } : { pdg: 211 * sign, mass: PION_CHARGED_MASS_GEV });
  }
  balanceCharge(prods, rng, parentCharge);
  const moms = nBody(p4, prods.map((p) => p.mass), rng);
  prods.forEach((h, i) => addHadron(b, h.pdg, moms[i]!, h.mass, dv.id, [id], rng));
  return id;
}

/**
 * Flips the sign of charged hadrons (particle ↔ antiparticle) until the total charge is
 * within ±1 of `target` (each flip changes the total by 2).
 */
function balanceCharge(list: HadronChoice[], rng: Rng, target = 0): void {
  const q = (h: HadronChoice) => ParticleDatabase.lookup(h.pdg).charge;
  for (let guard = 0; guard < 64; guard++) {
    const diff = list.reduce((a, h) => a + q(h), 0) - target;
    if (Math.abs(diff) <= 1) return;
    const candidates = list.map((h, i) => [h, i] as const).filter(([h]) => Math.sign(q(h)) === Math.sign(diff));
    if (!candidates.length) return;
    const [h, i] = rng.pick(candidates);
    list[i] = { pdg: -h.pdg, mass: h.mass };
  }
}

// ---- Soft physics ------------------------------------------------------------------------------

/** Soft-particle pT: Γ(2, T) + small offset (Boltzmann-like shape), with optional hard tail. */
export function softPt(rng: Rng, T: number, tailProb = 0.02): number {
  if (rng.bernoulli(tailProb)) return 2 + rng.exponential(2.5);
  return rng.exponential(T) + rng.exponential(T) + 0.05;
}

/**
 * Soft hadrons (underlying event / pile-up / heavy-ion bulk) from `vtx`.
 * Optional elliptic-flow modulation dN/dφ ∝ 1 + 2 v₂ cos 2(φ − Ψ).
 */
export function addSoft(b: EventBuilder, vtx: number, nHadrons: number, etaMax: number, T: number, rng: Rng, flow?: { v2: number; psi: number }): void {
  for (let i = 0; i < nHadrons; i++) {
    const h = pickHadron(rng);
    const pt = softPt(rng, T);
    const eta = rng.uniform(-etaMax, etaMax);
    let phi = rng.uniform(0, TWO_PI);
    if (flow) {
      const v2 = Math.min(0.25, flow.v2 * Math.min(pt / 1.5, 1.5));
      for (let k = 0; k < 50; k++) {
        phi = rng.uniform(0, TWO_PI);
        if (rng.next() * (1 + 2 * v2) <= 1 + 2 * v2 * Math.cos(2 * (phi - flow.psi))) break;
      }
    }
    addHadron(b, h.pdg, FourVector.fromPtEtaPhiM(pt, eta, phi - Math.PI, h.mass), h.mass, vtx, [], rng);
  }
}

export function beamSpotVertex(b: EventBuilder, kind: VertexKind, rng: Rng, sigmaZ = 0.042): number {
  return b.addVertex(kind, rng.gaussian(0, 12e-6), rng.gaussian(0, 12e-6), rng.gaussian(0, sigmaZ), rng.gaussian(0, 0.18));
}

export { CTAU_B_MESON_M };
