/**
 * Educational sequential track estimator inspired by the Kalman filter — NOT the ATLAS/CMS
 * production track reconstruction.
 *
 * Transverse plane, uniform solenoid field Bz. State (perigee parameters)
 *   x = (d₀, φ₀, ρ):  signed transverse impact parameter [m], direction at the perigee [rad],
 *                     signed curvature ρ = 1/R [1/m] (ρ > 0: counter-clockwise).
 * pT = κ|Bz|/|ρ| with κ = 0.2998 GeV/(T·m); for Bz > 0 a positive charge turns clockwise (ρ < 0).
 *
 * The parameters are constant along an ideal helix, so F = I; multiple scattering in each
 * layer is represented by process noise Q on φ₀ and ρ (Highland formula, fixed x/X₀ per layer).
 * Each hit measures its azimuth φ at radius r: z_k = φ_k, h(x) = φ(r_k; x), H = ∂h/∂x
 * (numerical Jacobian → extended Kalman filter), R = (σ_rφ / r)².
 *
 *   x_k⁻ = F x_{k−1}             P_k⁻ = F P_{k−1} Fᵀ + Q_k
 *   K_k = P_k⁻ Hᵀ (H P_k⁻ Hᵀ + R_k)⁻¹
 *   x_k = x_k⁻ + K_k (z_k − h(x_k⁻))    P_k = (I − K_k H) P_k⁻
 *
 * The longitudinal parameters (z₀, cot θ) come from a weighted straight-line fit of z versus
 * transverse arc length after the transverse fit. Energy loss is not modelled.
 */
import { RIGIDITY_GEV_PER_TM } from '../constants/physicalConstants';

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Perigee {
  readonly d0: number;
  readonly phi0: number;
  readonly rho: number;
}

export interface FitHit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** rφ resolution [m]. */
  readonly sigma: number;
}

export interface TrackFitStep {
  readonly r: number;
  readonly residual: number;
  /** Predicted residual uncertainty √(H P⁻ Hᵀ + R) in rφ [m]. */
  readonly residualSigma: number;
  /** σ(pT)/pT after this update. */
  readonly relPtSigma: number;
  readonly chi2: number;
}

export interface TrackFitResult {
  readonly seed: Perigee;
  readonly fitted: Perigee;
  readonly cov: Mat3;
  readonly z0: number;
  readonly cotTheta: number;
  readonly ptSeed: number;
  readonly ptFit: number;
  readonly ptSigma: number;
  readonly charge: number;
  readonly chi2: number;
  readonly ndf: number;
  readonly steps: readonly TrackFitStep[];
  /** Final (smoothed-free) residuals of every hit w.r.t. the fitted track [m, rφ]. */
  readonly residuals: readonly number[];
}



// ---- geometry -------------------------------------------------------------------------------

/** First intersection of the perigee circle with the cylinder of radius r (moving forward). */
export function pointAtRadius(p: Perigee, r: number): { x: number; y: number; s: number } | null {
  const sp = Math.sin(p.phi0), cp = Math.cos(p.phi0);
  const x0 = -p.d0 * sp, y0 = p.d0 * cp;
  if (Math.abs(p.rho) < 1e-9) {
    // Straight line x0 + s·t: |P|² = r² → s² + 2s(P0·t) + |P0|² − r² = 0 (P0·t = 0 at perigee).
    const disc = r * r - p.d0 * p.d0;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    return { x: x0 + s * cp, y: y0 + s * sp, s };
  }
  const R = 1 / p.rho;
  // Centre to the left of the direction for ρ > 0.
  const xc = x0 - R * sp, yc = y0 + R * cp;
  const dc = Math.hypot(xc, yc);
  const Ra = Math.abs(R);
  // Intersection of two circles: |P| = r and |P − C| = Ra.
  const a = (r * r - Ra * Ra + dc * dc) / (2 * dc);
  const h2 = r * r - a * a;
  if (h2 < 0 || dc === 0) return null;
  const h = Math.sqrt(h2);
  const ux = xc / dc, uy = yc / dc;
  const cand = [
    { x: a * ux - h * uy, y: a * uy + h * ux },
    { x: a * ux + h * uy, y: a * uy - h * ux },
  ];
  // Arc length from the perigee along the direction of motion (turning sense = sign ρ).
  const ang0 = Math.atan2(y0 - yc, x0 - xc);
  let best: { x: number; y: number; s: number } | null = null;
  for (const c of cand) {
    let d = Math.atan2(c.y - yc, c.x - xc) - ang0;
    if (p.rho > 0) d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    else d = ((-d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const s = d * Ra;
    if (!best || s < best.s) best = { ...c, s };
  }
  return best;
}

function phiAt(p: Perigee, r: number): number | null {
  const q = pointAtRadius(p, r);
  return q ? Math.atan2(q.y, q.x) : null;
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// ---- seed -----------------------------------------------------------------------------------

/** Circle through three points → perigee parameters (the "initial estimate"). */
export function seedFromHits(h1: FitHit, h2: FitHit, h3: FitHit): Perigee {
  const ax = h1.x, ay = h1.y, bx = h2.x, by = h2.y, cx = h3.x, cy = h3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const dirPhi = Math.atan2(h3.y - h1.y, h3.x - h1.x);
  if (Math.abs(d) < 1e-15) return { d0: 0, phi0: dirPhi, rho: 0 };
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const xc = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const yc = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const R = Math.hypot(ax - xc, ay - yc);
  // Turning sense from the cross product of successive chords.
  const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
  const rho = cross > 0 ? 1 / R : -1 / R;
  // Perigee: point of the circle closest to the origin.
  const dc = Math.hypot(xc, yc);
  const px = xc - (xc / dc) * R, py = yc - (yc / dc) * R;
  // Tangent direction at the perigee consistent with the turning sense.
  const rx = px - xc, ry = py - yc;
  const phi0 = rho > 0 ? Math.atan2(rx, -ry) : Math.atan2(-rx, ry);
  const d0 = -px * Math.sin(phi0) + py * Math.cos(phi0);
  return { d0, phi0, rho };
}

// ---- fit ------------------------------------------------------------------------------------

export interface FitOptions {
  /** Solenoid field [T]. */
  readonly bz: number;
  /** Material per layer in radiation lengths (multiple-scattering process noise). */
  readonly xOverX0: number;
  /** Momentum used for the scattering estimate [GeV] (the seed). */
  readonly mass?: number;
}

function highlandTheta0(p: number, beta: number, x: number): number {
  if (x <= 0) return 0;
  return (0.0136 / (beta * p)) * Math.sqrt(x) * (1 + 0.038 * Math.log(x));
}

export function ptFromRho(rho: number, bz: number): number {
  return Math.abs(rho) > 0 ? (RIGIDITY_GEV_PER_TM * Math.abs(bz)) / Math.abs(rho) : Number.POSITIVE_INFINITY;
}

/** Hits must be ordered by increasing radius (first half-turn). Needs ≥ 4 hits. */
export function fitTrack(allHits: readonly FitHit[], opts: FitOptions): TrackFitResult | null {
  if (allHits.length < 4) return null;
  const pre = seedFromHits(allHits[0]!, allHits[Math.floor(allHits.length / 2)]!, allHits[allHits.length - 1]!);
  // Near the turning point of a looper (r → 2R) the azimuth φ(r) is not a usable measurement
  // function (dφ/dr → ∞): keep hits with r < 0.9 · 2R.
  const rCut = Math.abs(pre.rho) > 0 ? 1.8 / Math.abs(pre.rho) : Number.POSITIVE_INFINITY;
  const hits = allHits.filter((h) => Math.hypot(h.x, h.y) < rCut);
  if (hits.length < 4) return null;
  const n = hits.length;
  const seed = hits.length === allHits.length ? pre : seedFromHits(hits[0]!, hits[Math.floor(n / 2)]!, hits[n - 1]!);
  let x: Vec3 = [seed.d0, seed.phi0, seed.rho];
  // Broad initial covariance: the filter must "learn" from the hits.
  let P: Mat3 = [1e-4, 0, 0, 0, 1e-2, 0, 0, 0, Math.max(1e-2, (seed.rho * 0.5) ** 2)];
  const steps: TrackFitStep[] = [];
  let chi2 = 0;
  const pSeed = ptFromRho(seed.rho, opts.bz);
  const m = opts.mass ?? 0.1396;
  const beta = pSeed / Math.hypot(pSeed, m);

  for (const hit of hits) {
    const r = Math.hypot(hit.x, hit.y);
    // --- prediction: F = I, Q from multiple scattering (angle kick θ₀ → φ₀; curvature ~ θ₀/r)
    const th0 = highlandTheta0(pSeed, beta, opts.xOverX0);
    const Q: Mat3 = [0, 0, 0, 0, th0 * th0, 0, 0, 0, (th0 / Math.max(r, 0.05)) ** 2 * 0.25];
    const Pm = add(P, Q);
    const xm = x;
    const phiPred = phiAt({ d0: xm[0], phi0: xm[1], rho: xm[2] }, r);
    if (phiPred === null) continue;
    const zMeas = Math.atan2(hit.y, hit.x);
    const innov = wrap(zMeas - phiPred);
    const Rm = (hit.sigma / r) ** 2;
    // Measurement update, iterated (IEKF): relinearize h at the updated state a few times.
    // The first iteration is the plain extended-Kalman update of the formulas above.
    let xi: Vec3 = xm;
    let H: Vec3 = [0, 0, 0];
    let K: Vec3 = [0, 0, 0];
    let S = Rm;
    for (let iter = 0; iter < 3; iter++) {
      const hi = phiAt({ d0: xi[0], phi0: xi[1], rho: xi[2] }, r);
      if (hi === null) break;
      const eps: Vec3 = [1e-6, 1e-6, Math.max(1e-7, Math.abs(xi[2]) * 1e-5)];
      H = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const xp = [...xi] as Vec3;
        xp[i] += eps[i]!;
        const fp = phiAt({ d0: xp[0], phi0: xp[1], rho: xp[2] }, r);
        H[i] = fp === null ? 0 : wrap(fp - hi) / eps[i]!;
      }
      const PH = mulVec(Pm, H);
      S = dot(H, PH) + Rm;
      K = [PH[0] / S, PH[1] / S, PH[2] / S];
      const v = wrap(zMeas - hi) - (H[0] * (xm[0] - xi[0]) + H[1] * (xm[1] - xi[1]) + H[2] * (xm[2] - xi[2]));
      const next: Vec3 = [xm[0] + K[0] * v, xm[1] + K[1] * v, xm[2] + K[2] * v];
      const moved = Math.abs(next[0] - xi[0]) + Math.abs(next[1] - xi[1]) + Math.abs(next[2] - xi[2]);
      xi = next;
      if (moved < 1e-12) break;
    }
    x = xi;
    // P = (I − K H) P⁻
    const IKH: Mat3 = [1 - K[0] * H[0], -K[0] * H[1], -K[0] * H[2], -K[1] * H[0], 1 - K[1] * H[1], -K[1] * H[2], -K[2] * H[0], -K[2] * H[1], 1 - K[2] * H[2]];
    P = mul(IKH, Pm);
    const c2 = (innov * innov) / S;
    chi2 += c2;
    steps.push({ r, residual: innov * r, residualSigma: Math.sqrt(S) * r, relPtSigma: Math.sqrt(Math.max(P[8], 0)) / Math.max(Math.abs(x[2]), 1e-12), chi2: c2 });
  }
  const fitted: Perigee = { d0: x[0], phi0: x[1], rho: x[2] };
  const residuals = hits.map((h) => {
    const r = Math.hypot(h.x, h.y);
    const f = phiAt(fitted, r);
    return f === null ? Number.NaN : wrap(Math.atan2(h.y, h.x) - f) * r;
  });
  // Longitudinal: z = z0 + s·cotθ, weighted least squares (equal weights).
  let sw = 0, ss = 0, sz = 0, sss = 0, ssz = 0;
  for (const h of hits) {
    const q = pointAtRadius(fitted, Math.hypot(h.x, h.y));
    if (!q) continue;
    sw += 1; ss += q.s; sz += h.z; sss += q.s * q.s; ssz += q.s * h.z;
  }
  const det = sw * sss - ss * ss;
  const cotTheta = det !== 0 ? (sw * ssz - ss * sz) / det : 0;
  const z0 = sw > 0 ? (sz - cotTheta * ss) / sw : 0;
  const ptFit = ptFromRho(fitted.rho, opts.bz);
  return {
    seed,
    fitted,
    cov: P,
    z0,
    cotTheta,
    ptSeed: pSeed,
    ptFit,
    ptSigma: ptFit * Math.sqrt(Math.max(P[8], 0)) / Math.max(Math.abs(fitted.rho), 1e-12),
    charge: -Math.sign(fitted.rho) * Math.sign(opts.bz || 1),
    chi2,
    ndf: Math.max(1, steps.length - 3),
    steps,
    residuals,
  };
}

function add(a: Mat3, b: Mat3): Mat3 {
  return a.map((v, i) => v + b[i]!) as Mat3;
}
function mul(a: Mat3, b: Mat3): Mat3 {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
  return o;
}
function mulVec(a: Mat3, v: Vec3): Vec3 {
  return [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
