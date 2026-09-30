/**
 * Educational pile-up: Poisson-distributed additional inelastic interactions overlaid on a
 * hard-scatter truth event.
 *
 *   P(n; μ) = e^{−μ} μⁿ / n!
 *
 * Overlay events come either from a supplied minimum-bias dataset (e.g. PYTHIA
 * SoftQCD:inelastic) or, by default, from the toy minimum-bias model below. Pile-up
 * vertices are distributed along the luminous region (Gaussian in z and t) and every
 * overlaid particle is attached to a vertex of kind 'pileup', so Color-by-Vertex works.
 * Deterministic: all randomness comes from the supplied Rng.
 */
import { PION_CHARGED_MASS_GEV, KAON_CHARGED_MASS_GEV, PROTON_MASS_GEV, PION_NEUTRAL_MASS_GEV } from '../constants/physicalConstants';
import type { EventRecord, ParticleRecord, VertexRecord } from '../events/EventSchema';
import type { Rng } from '../../utils/math';

/** ln P(n; μ). */
export function poissonLogPmf(n: number, mu: number): number {
  if (n < 0 || !Number.isInteger(n)) return Number.NEGATIVE_INFINITY;
  if (mu === 0) return n === 0 ? 0 : Number.NEGATIVE_INFINITY;
  let lnFact = 0;
  for (let k = 2; k <= n; k++) lnFact += Math.log(k);
  return -mu + n * Math.log(mu) - lnFact;
}

export function poissonPmf(n: number, mu: number): number {
  return Math.exp(poissonLogPmf(n, mu));
}

/** Exact inversion sampling (sequential search from 0); fine for μ ≲ 500. */
export function samplePoisson(rng: Rng, mu: number): number {
  if (mu <= 0) return 0;
  if (mu > 500) throw new RangeError('μ > 500 not supported');
  const u = rng.next();
  let n = 0;
  let p = Math.exp(-mu);
  let cdf = p;
  while (u > cdf && n < 10_000) {
    n++;
    p *= mu / n;
    cdf += p;
  }
  return n;
}

/** Luminous region (Gaussian) used to place pile-up vertices. VERIFY: Run-3 σz ≈ 35–45 mm. */
export interface LuminousRegion {
  readonly sigmaZM: number;
  readonly sigmaTNs: number;
  readonly sigmaXYM: number;
}
export const LHC_LUMINOUS_REGION: LuminousRegion = { sigmaZM: 0.04, sigmaTNs: 0.18, sigmaXYM: 1.2e-5 };

export interface PileUpConfig {
  readonly enabled: boolean;
  /** Mean number of additional interactions per crossing. */
  readonly mu: number;
}

// ---- Toy minimum-bias interaction ----------------------------------------------------------

/**
 * Toy inelastic interaction: dN_ch/dη ≈ 6 over |η| < 3 (13 TeV order of magnitude, VERIFY),
 * negative-binomial-like multiplicity fluctuations via a Gamma-distributed mean,
 * pT ~ Gamma(2, 0.25 GeV) (⟨pT⟩ ≈ 0.5 GeV), species 80 % π, 12 % K, 8 % p (charge balanced),
 * plus π⁰ (half the charged-pion rate) decaying promptly into γγ.
 */
const TOY_DNCH_DETA = 6;
const TOY_ETA_MAX = 3;

function gammaSample(rng: Rng, shape: number, scale: number): number {
  // Marsaglia–Tsang for shape ≥ 1.
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = rng.gaussian();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale;
  }
}

interface Builder { particles: ParticleRecord[]; vertices: VertexRecord[]; nextId: number }

function addParticle(b: Builder, pdg: number, charge: number, m: number, pt: number, eta: number, phi: number, vtx: number, status: 1 | 2, parents: number[] = []): ParticleRecord {
  const px = pt * Math.cos(phi), py = pt * Math.sin(phi), pz = pt * Math.sinh(eta);
  const p: ParticleRecord = { id: b.nextId++, pdg, status, charge, p: [Math.sqrt(px * px + py * py + pz * pz + m * m), px, py, pz], m, prodVtx: vtx, decayVtx: null, parents, children: [] };
  b.particles.push(p);
  return p;
}

/** Isotropic two-body decay π⁰ → γγ in the rest frame, boosted to the lab. */
function pi0ToGammaGamma(b: Builder, pi0: ParticleRecord, rng: Rng): void {
  const [E, px, py, pz] = pi0.p;
  const m = PION_NEUTRAL_MASS_GEV;
  const cosT = 2 * rng.next() - 1, sinT = Math.sqrt(1 - cosT * cosT), ph = 2 * Math.PI * rng.next();
  const k = m / 2;
  const bx = px / E, by = py / E, bz = pz / E;
  const b2 = bx * bx + by * by + bz * bz;
  const g = 1 / Math.sqrt(1 - b2);
  const kids: number[] = [];
  for (const s of [1, -1]) {
    const lx = s * k * sinT * Math.cos(ph), ly = s * k * sinT * Math.sin(ph), lz = s * k * cosT;
    const bp = bx * lx + by * ly + bz * lz;
    const f = b2 > 0 ? ((g - 1) * bp) / b2 + g * k : 0;
    const qx = lx + f * bx, qy = ly + f * by, qz = lz + f * bz;
    const q: ParticleRecord = { id: b.nextId++, pdg: 22, status: 1, charge: 0, p: [g * (k + bp), qx, qy, qz], m: 0, prodVtx: pi0.prodVtx, decayVtx: null, parents: [pi0.id], children: [] };
    b.particles.push(q);
    kids.push(q.id);
  }
  const idx = b.particles.indexOf(pi0);
  b.particles[idx] = { ...pi0, status: 2, decayVtx: pi0.prodVtx, children: kids };
}

function toyInteraction(b: Builder, vtx: number, rng: Rng): void {
  const meanCh = TOY_DNCH_DETA * 2 * TOY_ETA_MAX * gammaSample(rng, 2, 0.5);
  const nCh = Math.max(2, Math.round(meanCh));
  for (let i = 0; i < nCh; i++) {
    const r = rng.next();
    const [a, m] = r < 0.8 ? [211, PION_CHARGED_MASS_GEV] : r < 0.92 ? [321, KAON_CHARGED_MASS_GEV] : [2212, PROTON_MASS_GEV];
    const q = i % 2 === 0 ? 1 : -1;
    addParticle(b, a * q, q, m, gammaSample(rng, 2, 0.25), (2 * rng.next() - 1) * TOY_ETA_MAX, 2 * Math.PI * rng.next(), vtx, 1);
  }
  const nPi0 = Math.round(nCh * 0.4);
  for (let i = 0; i < nPi0; i++) {
    const pi0 = addParticle(b, 111, 0, PION_NEUTRAL_MASS_GEV, gammaSample(rng, 2, 0.25), (2 * rng.next() - 1) * TOY_ETA_MAX, 2 * Math.PI * rng.next(), vtx, 1);
    pi0ToGammaGamma(b, pi0, rng);
  }
}

export interface OverlayResult {
  readonly event: EventRecord;
  readonly nPileUp: number;
}

/**
 * Overlays n ~ Poisson(μ) interactions. `minBias` (optional) supplies overlay events; their
 * final-state particles are re-attached to fresh pile-up vertices (ancestry is not kept).
 */
export function overlayPileUp(hard: EventRecord, mu: number, rng: Rng, region: LuminousRegion = LHC_LUMINOUS_REGION, minBias: readonly EventRecord[] = []): OverlayResult {
  const n = samplePoisson(rng, mu);
  const b: Builder = {
    particles: [...hard.particles],
    vertices: [...hard.vertices],
    nextId: Math.max(-1, ...hard.particles.map((p) => p.id)) + 1,
  };
  let nextV = Math.max(-1, ...hard.vertices.map((v) => v.id)) + 1;
  for (let k = 0; k < n; k++) {
    const v: VertexRecord = { id: nextV++, kind: 'pileup', x: rng.gaussian() * region.sigmaXYM, y: rng.gaussian() * region.sigmaXYM, z: rng.gaussian() * region.sigmaZM, t: rng.gaussian() * region.sigmaTNs };
    b.vertices.push(v);
    if (minBias.length > 0) {
      const src = minBias[Math.floor(rng.next() * minBias.length)]!;
      for (const p of src.particles) if (p.status === 1) b.particles.push({ ...p, id: b.nextId++, prodVtx: v.id, decayVtx: null, parents: [], children: [] });
    } else {
      toyInteraction(b, v.id, rng);
    }
  }
  return { event: { ...hard, vertices: b.vertices, particles: b.particles, truthInfo: { ...(hard.truthInfo ?? {}), pileUpInteractions: n } }, nPileUp: n };
}
