/**
 * Linear transverse beam optics with 2×2 transfer matrices acting on [x, x'] (or [y, y']).
 *
 * Conventions: quadrupole strength k = G / (Bρ) [m⁻²]; k > 0 focuses the plane in which
 * the matrix is applied. A quadrupole that focuses x (k) defocuses y (−k): this is a
 * direct consequence of ∇×B = 0 in the magnet aperture (B_x = G·y, B_y = G·x).
 */

/** Row-major 2×2 matrix [m11, m12, m21, m22]. */
export type Mat2 = readonly [number, number, number, number];

export const IDENTITY: Mat2 = [1, 0, 0, 1];

export function drift(L: number): Mat2 {
  return [1, L, 0, 1];
}

/** Thin lens of focal length f (f > 0 focusing). */
export function thinQuad(f: number): Mat2 {
  return [1, 0, -1 / f, 1];
}

/** Thick quadrupole of strength k [m⁻²] and length L [m]; k < 0 is defocusing. */
export function thickQuad(k: number, L: number): Mat2 {
  if (Math.abs(k) < 1e-15) return drift(L);
  if (k > 0) {
    const s = Math.sqrt(k);
    const phi = s * L;
    return [Math.cos(phi), Math.sin(phi) / s, -s * Math.sin(phi), Math.cos(phi)];
  }
  const s = Math.sqrt(-k);
  const phi = s * L;
  return [Math.cosh(phi), Math.sinh(phi) / s, s * Math.sinh(phi), Math.cosh(phi)];
}

/** Matrix product A·B (apply B first, then A). */
export function mul(a: Mat2, b: Mat2): Mat2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

export function det(m: Mat2): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function apply(m: Mat2, x: number, xp: number): [number, number] {
  return [m[0] * x + m[1] * xp, m[2] * x + m[3] * xp];
}

export interface Twiss {
  readonly beta: number;
  readonly alpha: number;
  readonly gamma: number;
}

export interface PeriodicSolution {
  readonly stable: boolean;
  /** cos μ = Tr(M)/2 */
  readonly cosMu: number;
  /** Phase advance per period [rad]; NaN when unstable. */
  readonly mu: number;
  readonly twiss: Twiss | null;
}

/**
 * Periodic (matched) Twiss parameters of a one-period matrix M:
 *   cos μ = (m11 + m22)/2,  β = m12 / sin μ,  α = (m11 − m22)/(2 sin μ).
 * Motion is bounded only when |cos μ| < 1.
 */
export function periodicTwiss(m: Mat2): PeriodicSolution {
  const cosMu = (m[0] + m[3]) / 2;
  if (!(Math.abs(cosMu) < 1)) return { stable: false, cosMu, mu: Number.NaN, twiss: null };
  // Sign of sin μ chosen so that β > 0.
  let sinMu = Math.sqrt(1 - cosMu * cosMu);
  if (m[1] < 0) sinMu = -sinMu;
  const beta = m[1] / sinMu;
  const alpha = (m[0] - m[3]) / (2 * sinMu);
  const mu = Math.atan2(sinMu, cosMu);
  return { stable: true, cosMu, mu: mu < 0 ? mu + 2 * Math.PI : mu, twiss: { beta, alpha, gamma: (1 + alpha * alpha) / beta } };
}

/** Transports Twiss parameters through M. */
export function propagateTwiss(m: Mat2, t: Twiss): Twiss {
  const [m11, m12, m21, m22] = m;
  const beta = m11 * m11 * t.beta - 2 * m11 * m12 * t.alpha + m12 * m12 * t.gamma;
  const alpha = -m11 * m21 * t.beta + (m11 * m22 + m12 * m21) * t.alpha - m12 * m22 * t.gamma;
  return { beta, alpha, gamma: (1 + alpha * alpha) / beta };
}
