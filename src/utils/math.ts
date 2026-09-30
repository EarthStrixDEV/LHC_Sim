/**
 * Renderer-independent math helpers and the deterministic PRNG.
 *
 * Every random draw in physics code and every reproducibility-relevant visual draw must
 * go through `Rng`, seeded from (sample, event, stage) via `seedFrom`. Math.random() is
 * never used for anything that affects physics state.
 */

export type Vec3 = [number, number, number];

export const TWO_PI = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wraps an angle to (-π, π]. */
export function wrapPi(phi: number): number {
  let a = phi % TWO_PI;
  if (a <= -Math.PI) a += TWO_PI;
  else if (a > Math.PI) a -= TWO_PI;
  return a;
}

/** ΔR = √(Δη² + Δφ²) with φ wrapped. */
export function deltaR(eta1: number, phi1: number, eta2: number, phi2: number): number {
  const dEta = eta1 - eta2;
  const dPhi = wrapPi(phi1 - phi2);
  return Math.sqrt(dEta * dEta + dPhi * dPhi);
}

/** Quadrature sum. */
export function hypot2(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

// ---- Deterministic PRNG ------------------------------------------------------------------

/** 32-bit FNV-1a hash of a string — used to derive stable seeds from identifiers. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combines arbitrary seed parts (numbers/strings) into a single 32-bit seed. */
export function seedFrom(...parts: Array<string | number>): number {
  return hashString(parts.map(String).join('|'));
}

/**
 * Mulberry32 PRNG: small, fast, deterministic across JS engines (uses only 32-bit integer
 * ops). Adequate statistical quality for toy event generation and visual jitter; not a
 * cryptographic or high-precision Monte-Carlo generator.
 */
export class Rng {
  private state: number;
  private spareGaussian: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(loInclusive: number, hiExclusive: number): number {
    return loInclusive + Math.floor(this.next() * (hiExclusive - loInclusive));
  }

  /** Standard normal via Box–Muller (caches the second value). */
  gaussian(mean = 0, sigma = 1): number {
    if (this.spareGaussian !== null) {
      const g = this.spareGaussian;
      this.spareGaussian = null;
      return mean + sigma * g;
    }
    let u = 0;
    while (u <= Number.EPSILON) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = r * Math.sin(TWO_PI * v);
    return mean + sigma * r * Math.cos(TWO_PI * v);
  }

  exponential(mean: number): number {
    let u = 0;
    while (u <= Number.EPSILON) u = this.next();
    return -mean * Math.log(u);
  }

  /** Non-relativistic Breit–Wigner (Cauchy) sample, truncated to [lo, hi]. */
  breitWigner(mass: number, width: number, lo: number, hi: number): number {
    for (let i = 0; i < 1000; i++) {
      const m = mass + (width / 2) * Math.tan(Math.PI * (this.next() - 0.5));
      if (m >= lo && m <= hi) return m;
    }
    return mass;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)]!;
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }
}
