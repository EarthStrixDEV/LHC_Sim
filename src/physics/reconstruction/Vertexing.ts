/**
 * Educational vertex reconstruction from fitted tracks.
 *
 * Primary / pile-up vertices: tracks compatible with the beam line (|d₀| < 1 mm) are sorted by
 * z₀ and split where consecutive z₀ differ by more than a gap (1 mm); clusters with ≥ 2 tracks
 * become vertices at the weighted mean z. The primary vertex is the one with the largest Σ pT²
 * (the usual hard-scatter choice).
 *
 * Displaced (secondary) vertices: pairs of opposite-charge tracks with large transverse
 * impact-parameter significance are intersected in the transverse plane; the pair invariant
 * mass under π⁺π⁻ and pπ hypotheses tags K⁰_S → π⁺π⁻ and Λ → pπ⁻ candidates. Heavy-flavour
 * decays with more than two tracks are reported as two-track seeds (no multi-track fit).
 */
import { KAON_NEUTRAL_MASS_GEV, LAMBDA_MASS_GEV, PION_CHARGED_MASS_GEV, PROTON_MASS_GEV } from '../constants/physicalConstants';
import { pointAtRadius, type Perigee } from '../fitting/KalmanTrackFit';

export interface VertexTrack {
  readonly id: number;
  readonly perigee: Perigee;
  readonly d0Sigma: number;
  readonly z0: number;
  readonly cotTheta: number;
  readonly pt: number;
  readonly charge: number;
}

export interface RecoVertex {
  readonly z: number;
  readonly zSigma: number;
  readonly nTracks: number;
  readonly sumPt2: number;
  readonly isPrimary: boolean;
  readonly trackIds: readonly number[];
}

export interface DisplacedVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly trackIds: readonly [number, number];
  readonly massPiPi: number;
  readonly massPPi: number;
  readonly tag: 'K0S' | 'Lambda' | 'unidentified';
}

const BEAMLINE_D0_M = 1e-3;
const Z_GAP_M = 1e-3;

export function findPrimaryVertices(tracks: readonly VertexTrack[]): RecoVertex[] {
  const cand = tracks.filter((t) => Math.abs(t.perigee.d0) < BEAMLINE_D0_M).sort((a, b) => a.z0 - b.z0);
  const groups: VertexTrack[][] = [];
  for (const t of cand) {
    const g = groups[groups.length - 1];
    if (g && t.z0 - g[g.length - 1]!.z0 < Z_GAP_M) g.push(t);
    else groups.push([t]);
  }
  const vs = groups
    .filter((g) => g.length >= 2)
    .map((g) => {
      const z = g.reduce((s, t) => s + t.z0, 0) / g.length;
      const spread = Math.sqrt(g.reduce((s, t) => s + (t.z0 - z) ** 2, 0) / g.length);
      return { z, zSigma: spread / Math.sqrt(g.length), nTracks: g.length, sumPt2: g.reduce((s, t) => s + t.pt * t.pt, 0), isPrimary: false, trackIds: g.map((t) => t.id) };
    });
  if (vs.length === 0) return [];
  const pv = vs.reduce((a, b) => (b.sumPt2 > a.sumPt2 ? b : a));
  return vs.map((v) => ({ ...v, isPrimary: v === pv })).sort((a, b) => b.sumPt2 - a.sumPt2);
}

function circleCentre(p: Perigee): { x: number; y: number; R: number } | null {
  if (Math.abs(p.rho) < 1e-9) return null;
  const R = 1 / p.rho;
  const x0 = -p.d0 * Math.sin(p.phi0), y0 = p.d0 * Math.cos(p.phi0);
  return { x: x0 - R * Math.sin(p.phi0), y: y0 + R * Math.cos(p.phi0), R: Math.abs(R) };
}

/** Momentum vector of a track at transverse point (x, y) on its circle. */
function momentumAt(t: VertexTrack, x: number, y: number): [number, number, number] {
  const c = circleCentre(t.perigee)!;
  const rx = x - c.x, ry = y - c.y;
  const n = Math.hypot(rx, ry) || 1;
  // Tangent in the direction of motion.
  const tx = t.perigee.rho > 0 ? -ry / n : ry / n;
  const ty = t.perigee.rho > 0 ? rx / n : -rx / n;
  return [t.pt * tx, t.pt * ty, t.pt * t.cotTheta];
}

function pairMass(a: [number, number, number], ma: number, b: [number, number, number], mb: number): number {
  const ea = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2 + ma * ma), eb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2 + mb * mb);
  return Math.sqrt(Math.max(0, (ea + eb) ** 2 - (a[0] + b[0]) ** 2 - (a[1] + b[1]) ** 2 - (a[2] + b[2]) ** 2));
}

export function findDisplacedVertices(tracks: readonly VertexTrack[], minSignificance = 4): DisplacedVertex[] {
  const disp = tracks.filter((t) => t.d0Sigma > 0 && Math.abs(t.perigee.d0) / t.d0Sigma > minSignificance && t.pt > 0.3);
  const out: DisplacedVertex[] = [];
  const used = new Set<number>();
  for (let i = 0; i < disp.length; i++) {
    for (let j = i + 1; j < disp.length; j++) {
      const a = disp[i]!, b = disp[j]!;
      if (a.charge * b.charge >= 0 || used.has(a.id) || used.has(b.id)) continue;
      const ca = circleCentre(a.perigee), cb = circleCentre(b.perigee);
      if (!ca || !cb) continue;
      const d = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      if (d === 0 || d > ca.R + cb.R + 2e-3 || d < Math.abs(ca.R - cb.R) - 2e-3) continue;
      const aa = Math.max(-ca.R, Math.min(ca.R, (ca.R * ca.R - cb.R * cb.R + d * d) / (2 * d)));
      const hh = Math.sqrt(Math.max(0, ca.R * ca.R - aa * aa));
      const ux = (cb.x - ca.x) / d, uy = (cb.y - ca.y) / d;
      const pts = [
        { x: ca.x + aa * ux - hh * uy, y: ca.y + aa * uy + hh * ux },
        { x: ca.x + aa * ux + hh * uy, y: ca.y + aa * uy - hh * ux },
      ];
      // Choose the crossing with the smaller radius that both tracks reach (and closest in z).
      let best: { x: number; y: number; z: number; dz: number } | null = null;
      for (const p of pts) {
        const r = Math.hypot(p.x, p.y);
        if (r < 2e-3 || r > 0.6) continue;
        const qa = pointAtRadius(a.perigee, r), qb = pointAtRadius(b.perigee, r);
        if (!qa || !qb) continue;
        const za = a.z0 + qa.s * a.cotTheta, zb = b.z0 + qb.s * b.cotTheta;
        const dz = Math.abs(za - zb);
        if (dz > 5e-3) continue;
        if (!best || dz < best.dz) best = { x: p.x, y: p.y, z: (za + zb) / 2, dz };
      }
      if (!best) continue;
      const pa = momentumAt(a, best.x, best.y), pb = momentumAt(b, best.x, best.y);
      const mpp = pairMass(pa, PION_CHARGED_MASS_GEV, pb, PION_CHARGED_MASS_GEV);
      const hi = Math.hypot(...pa) >= Math.hypot(...pb);
      const mppi = hi ? pairMass(pa, PROTON_MASS_GEV, pb, PION_CHARGED_MASS_GEV) : pairMass(pb, PROTON_MASS_GEV, pa, PION_CHARGED_MASS_GEV);
      const tag = Math.abs(mpp - KAON_NEUTRAL_MASS_GEV) < 0.03 ? 'K0S' : Math.abs(mppi - LAMBDA_MASS_GEV) < 0.015 ? 'Lambda' : 'unidentified';
      out.push({ x: best.x, y: best.y, z: best.z, r: Math.hypot(best.x, best.y), trackIds: [a.id, b.id], massPiPi: mpp, massPPi: mppi, tag });
      used.add(a.id);
      used.add(b.id);
    }
  }
  return out;
}
