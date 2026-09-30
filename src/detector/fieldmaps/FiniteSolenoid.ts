/**
 * Exact vacuum field of an ideal finite solenoid (thin current sheet of radius a and length
 * L), from N. Derby & S. Olbert, Am. J. Phys. 78 (2010) 229, using Bulirsch's generalized
 * complete elliptic integral C(k_c, p, c, s):
 *
 *   z± = z ± L/2,   α± = a / √(z±² + (ρ+a)²),   β± = z± / √(z±² + (ρ+a)²),
 *   γ = (a − ρ)/(a + ρ),   k± = √((z±² + (a−ρ)²) / (z±² + (a+ρ)²))
 *   B_ρ = B₀ [α₊ C(k₊, 1, 1, −1) − α₋ C(k₋, 1, 1, −1)]
 *   B_z = B₀ a/(a+ρ) [β₊ C(k₊, γ², 1, γ) − β₋ C(k₋, γ², 1, γ)],     B₀ = μ₀ n I / π
 *
 * The field is normalized so that B_z at the centre equals the requested central field.
 * No iron: real detector solenoids have flux-return yokes that change the field outside
 * the coil (handled by composing with a yoke model).
 */
import type { MagneticField } from '../../physics/propagation/MagneticField';

/** Bulirsch's cel(kc, p, c, s) for p > 0 (all uses here), relative accuracy ~1e-12. */
export function cel(kc: number, p: number, c: number, s: number): number {
  if (kc === 0 || !(p > 0)) return Number.NaN;
  let k = Math.abs(kc);
  let pp = Math.sqrt(p);
  let cc = c;
  let ss = s / pp;
  let em = 1;
  let f = cc;
  cc = cc + ss / pp;
  let g = k / pp;
  ss = 2 * (ss + f * g);
  pp = g + pp;
  g = em;
  em = k + em;
  let kk = k;
  for (let it = 0; Math.abs(g - k) > g * 1e-13 && it < 60; it++) {
    k = 2 * Math.sqrt(kk);
    kk = k * em;
    f = cc;
    cc = cc + ss / pp;
    g = kk / pp;
    ss = 2 * (ss + f * g);
    pp = g + pp;
    g = em;
    em = k + em;
  }
  return (Math.PI / 2) * (ss + cc * em) / (em * (em + pp));
}

/** (Bρ, Bz) for B₀ = 1 at cylindrical (ρ, z). */
function unitField(a: number, halfL: number, rho: number, z: number): [number, number] {
  const r = Math.max(rho, 1e-12);
  const zp = z + halfL, zm = z - halfL;
  const dp = Math.sqrt(zp * zp + (r + a) ** 2), dm = Math.sqrt(zm * zm + (r + a) ** 2);
  const ap = a / dp, am = a / dm, bp = zp / dp, bm = zm / dm;
  const gamma = (a - r) / (a + r);
  const kp = Math.sqrt((zp * zp + (a - r) ** 2) / (zp * zp + (a + r) ** 2));
  const km = Math.sqrt((zm * zm + (a - r) ** 2) / (zm * zm + (a + r) ** 2));
  // On the current sheet itself (ρ = a at an end) k → 0: nudge to stay finite.
  const kpp = Math.max(kp, 1e-12), kmm = Math.max(km, 1e-12);
  const br = rho < 1e-12 ? 0 : ap * cel(kpp, 1, 1, -1) - am * cel(kmm, 1, 1, -1);
  const bz = (a / (a + r)) * (bp * cel(kpp, gamma * gamma, 1, gamma) - bm * cel(kmm, gamma * gamma, 1, gamma));
  return [br, bz];
}

export class FiniteSolenoidField implements MagneticField {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  private readonly scale: number;

  constructor(
    readonly radiusM: number,
    readonly lengthM: number,
    readonly centralFieldT: number,
    name = 'finite solenoid',
  ) {
    this.scale = centralFieldT / unitField(radiusM, lengthM / 2, 0, 0)[1];
    this.id = `solenoid-${radiusM}-${lengthM}-${centralFieldT}`;
    this.label = `${name} (${centralFieldT} T, a = ${radiusM} m, L = ${lengthM} m)`;
    this.description = 'Exact vacuum field of an ideal current-sheet solenoid (Derby & Olbert 2010); no iron.';
  }

  /** (Bρ, Bz) at cylindrical coordinates. */
  cylindrical(rho: number, z: number): [number, number] {
    const [br, bz] = unitField(this.radiusM, this.lengthM / 2, rho, z);
    return [br * this.scale, bz * this.scale];
  }

  /** Analytic on-axis field B_z(0, z) = (B_c / norm) · ½ [(z+L/2)/√((z+L/2)²+a²) − (z−L/2)/√((z−L/2)²+a²)]. */
  onAxis(z: number): number {
    const a = this.radiusM, h = this.lengthM / 2;
    const f = (u: number) => 0.5 * ((u + h) / Math.hypot(u + h, a) - (u - h) / Math.hypot(u - h, a));
    return (this.centralFieldT * f(z)) / f(0);
  }

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    const rho = Math.hypot(x, y);
    const [br, bz] = this.cylindrical(rho, z);
    out[0] = rho > 0 ? (br * x) / rho : 0;
    out[1] = rho > 0 ? (br * y) / rho : 0;
    out[2] = bz;
  }
}
