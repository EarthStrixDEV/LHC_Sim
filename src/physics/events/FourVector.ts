/**
 * Lorentz four-vector P = (E, px, py, pz) in natural units (c = 1), GeV.
 * Metric (+, −, −, −):  m² = E² − |p|².
 *
 * Immutable; allocation is acceptable because four-vectors are used in physics/analysis
 * code, not in per-frame render loops.
 */

/** |η| returned for momenta exactly along the beam axis (pT = 0, pz ≠ 0). */
export const ETA_BEAM_AXIS = 1e3;

export class FourVector {
  constructor(
    readonly e: number,
    readonly px: number,
    readonly py: number,
    readonly pz: number,
  ) {}

  static readonly ZERO = new FourVector(0, 0, 0, 0);

  static fromMassMomentum(m: number, px: number, py: number, pz: number): FourVector {
    return new FourVector(Math.sqrt(m * m + px * px + py * py + pz * pz), px, py, pz);
  }

  /** Builds from (pT, η, φ, m). */
  static fromPtEtaPhiM(pt: number, eta: number, phi: number, m: number): FourVector {
    const px = pt * Math.cos(phi);
    const py = pt * Math.sin(phi);
    const pz = pt * Math.sinh(eta);
    return FourVector.fromMassMomentum(m, px, py, pz);
  }

  /** Builds from (pT, rapidity y, φ, m): E = mT cosh y, pz = mT sinh y. */
  static fromPtYPhiM(pt: number, y: number, phi: number, m: number): FourVector {
    const mT = Math.sqrt(m * m + pt * pt);
    return new FourVector(mT * Math.cosh(y), pt * Math.cos(phi), pt * Math.sin(phi), mT * Math.sinh(y));
  }

  static fromArray(a: readonly [number, number, number, number]): FourVector {
    return new FourVector(a[0], a[1], a[2], a[3]);
  }

  static sum(vs: Iterable<FourVector>): FourVector {
    let e = 0, x = 0, y = 0, z = 0;
    for (const v of vs) {
      e += v.e; x += v.px; y += v.py; z += v.pz;
    }
    return new FourVector(e, x, y, z);
  }

  toArray(): [number, number, number, number] {
    return [this.e, this.px, this.py, this.pz];
  }

  add(o: FourVector): FourVector {
    return new FourVector(this.e + o.e, this.px + o.px, this.py + o.py, this.pz + o.pz);
  }

  sub(o: FourVector): FourVector {
    return new FourVector(this.e - o.e, this.px - o.px, this.py - o.py, this.pz - o.pz);
  }

  scale(s: number): FourVector {
    return new FourVector(this.e * s, this.px * s, this.py * s, this.pz * s);
  }

  /** Minkowski product with metric (+,−,−,−). */
  dot(o: FourVector): number {
    return this.e * o.e - this.px * o.px - this.py * o.py - this.pz * o.pz;
  }

  /** m² = E² − p². May be slightly negative from rounding. */
  m2(): number {
    return this.dot(this);
  }

  /**
   * Invariant mass. Tiny negative m² from floating-point rounding (|m²| ≤ 1e-9·E²) maps to 0;
   * larger negative m² (space-like) returns −√(−m²) following the ROOT TLorentzVector convention.
   */
  mass(): number {
    const m2 = this.m2();
    if (m2 >= 0) return Math.sqrt(m2);
    if (-m2 <= 1e-9 * this.e * this.e) return 0;
    return -Math.sqrt(-m2);
  }

  p2(): number {
    return this.px * this.px + this.py * this.py + this.pz * this.pz;
  }

  p(): number {
    return Math.sqrt(this.p2());
  }

  pt(): number {
    return Math.hypot(this.px, this.py);
  }

  /** Transverse energy E_T = E · pT / p. */
  et(): number {
    const p = this.p();
    return p > 0 ? (this.e * this.pt()) / p : 0;
  }

  /** Azimuth φ = atan2(py, px) ∈ (−π, π]; 0 for pT = 0. */
  phi(): number {
    return this.px === 0 && this.py === 0 ? 0 : Math.atan2(this.py, this.px);
  }

  /**
   * Pseudorapidity η = ½ ln((p + pz)/(p − pz)) = asinh(pz / pT).
   * The asinh form avoids catastrophic cancellation at large |η|. Along the beam axis
   * (pT = 0) returns ±ETA_BEAM_AXIS instead of ±∞; for p = 0 returns 0.
   */
  eta(): number {
    const pt = this.pt();
    if (pt === 0) return this.pz === 0 ? 0 : Math.sign(this.pz) * ETA_BEAM_AXIS;
    return Math.asinh(this.pz / pt);
  }

  /** Rapidity y = ½ ln((E + pz)/(E − pz)). */
  rapidity(): number {
    const num = this.e + this.pz;
    const den = this.e - this.pz;
    if (num <= 0 || den <= 0) return Math.sign(this.pz) * ETA_BEAM_AXIS;
    return 0.5 * Math.log(num / den);
  }

  /** Polar angle θ from +z. */
  theta(): number {
    return Math.atan2(this.pt(), this.pz);
  }

  /** Velocity β = p/E as a 3-vector. */
  betaVector(): [number, number, number] {
    return [this.px / this.e, this.py / this.e, this.pz / this.e];
  }

  /**
   * Lorentz boost by velocity (bx, by, bz) (|β| < 1): transforms this vector from a frame
   * moving with −β into the frame where the boost source moves with +β.
   */
  boost(bx: number, by: number, bz: number): FourVector {
    const b2 = bx * bx + by * by + bz * bz;
    if (b2 === 0) return this;
    if (b2 >= 1) throw new RangeError('boost: |β| must be < 1');
    const gamma = 1 / Math.sqrt(1 - b2);
    const bp = bx * this.px + by * this.py + bz * this.pz;
    const gamma2 = (gamma - 1) / b2;
    return new FourVector(
      gamma * (this.e + bp),
      this.px + gamma2 * bp * bx + gamma * bx * this.e,
      this.py + gamma2 * bp * by + gamma * by * this.e,
      this.pz + gamma2 * bp * bz + gamma * bz * this.e,
    );
  }
}

/** Invariant mass of a system of four-vectors, m² = (ΣP)². */
export function invariantMass(...vs: FourVector[]): number {
  return FourVector.sum(vs).mass();
}
