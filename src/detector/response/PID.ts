/**
 * Educational particle identification (DETECTOR MEASUREMENT → hypothesis).
 *
 *  dE/dx (gas tracker): ALEPH-type Bethe–Bloch parameterization used by ALICE for the TPC,
 *    f(βγ) = P1/β^P4 · (P2 − β^P4 − ln(P3 + (βγ)^−P5)), normalized to 1 at the minimum
 *    (≈ βγ 3.5); Gaussian relative resolution. Parameters are the commonly quoted defaults
 *    (VERIFY): P1 = 0.0762, P2 = 10.632, P3 = 1.367e−5, P4 = 1.863, P5 = 1.948.
 *  Time of flight: t = L / (βc) with L the propagated path length to the TOF radius, Gaussian
 *    time resolution; β_meas = L / (c t_meas).
 *  RICH: Cherenkov angle cos θ_c = 1/(nβ) above threshold p_th = m/√(n² − 1); Gaussian angle
 *    resolution. The emitted photon ring is what the photodetectors record.
 * The hypothesis is the species with the smallest combined χ² over the available measurements.
 */
import { ELECTRON_MASS_GEV, KAON_CHARGED_MASS_GEV, MUON_MASS_GEV, PION_CHARGED_MASS_GEV, PROTON_MASS_GEV, SPEED_OF_LIGHT_M_PER_S } from '../../physics/constants/physicalConstants';
import type { DetectorModel } from '../../physics/detector/DetectorModel';
import type { TrackRecord } from '../../physics/propagation/EventPropagation';
import { Rng, seedFrom } from '../../utils/math';

export type Species = 'e' | 'mu' | 'pi' | 'K' | 'p';
export const SPECIES_MASS: Record<Species, number> = { e: ELECTRON_MASS_GEV, mu: MUON_MASS_GEV, pi: PION_CHARGED_MASS_GEV, K: KAON_CHARGED_MASS_GEV, p: PROTON_MASS_GEV };
const SPECIES: readonly Species[] = ['e', 'mu', 'pi', 'K', 'p'];
const C_M_PER_NS = SPEED_OF_LIGHT_M_PER_S * 1e-9;

const ALEPH = { p1: 0.0762, p2: 10.632, p3: 1.367e-5, p4: 1.863, p5: 1.948 } as const;

function alephRaw(bg: number): number {
  const beta = bg / Math.sqrt(1 + bg * bg);
  const bp = Math.pow(beta, ALEPH.p4);
  return (ALEPH.p1 / bp) * (ALEPH.p2 - bp - Math.log(ALEPH.p3 + Math.pow(1 / bg, ALEPH.p5)));
}

let MIP: number | null = null;
/** Mean dE/dx in units of the minimum-ionizing value (dimensionless). */
export function dEdxMean(p: number, mass: number): number {
  if (MIP === null) {
    let m = Number.POSITIVE_INFINITY;
    for (let lg = -1; lg <= 3; lg += 0.001) m = Math.min(m, alephRaw(10 ** lg));
    MIP = m;
  }
  return alephRaw(p / mass) / MIP;
}

export function velocityBeta(p: number, mass: number): number {
  return p / Math.sqrt(p * p + mass * mass);
}

/** Cherenkov angle [rad], or null below threshold. */
export function cherenkovAngle(p: number, mass: number, n: number): number | null {
  const c = 1 / (n * velocityBeta(p, mass));
  return c < 1 ? Math.acos(c) : null;
}

export function cherenkovThreshold(mass: number, n: number): number {
  return mass / Math.sqrt(n * n - 1);
}

export interface PidMeasurement {
  readonly particleId: number;
  readonly p: number;
  readonly trueSpecies: Species | null;
  readonly dEdx?: { readonly value: number; readonly sigma: number };
  readonly tof?: { readonly pathM: number; readonly timeNs: number; readonly beta: number; readonly sigmaNs: number };
  readonly rich?: readonly { readonly name: string; readonly n: number; readonly angleRad: number | null; readonly sigmaRad: number; readonly x: number; readonly y: number; readonly z: number; readonly dir: readonly [number, number, number] }[];
  readonly hypothesis: Species | null;
  /** χ² per species hypothesis. */
  readonly chi2: Readonly<Partial<Record<Species, number>>>;
}

function speciesOf(pdg: number): Species | null {
  const a = Math.abs(pdg);
  return a === 11 ? 'e' : a === 13 ? 'mu' : a === 211 ? 'pi' : a === 321 ? 'K' : a === 2212 ? 'p' : null;
}

/** First sample index where the predicate holds (linear interpolation not needed at this precision). */
function firstIndex(t: TrackRecord, pred: (x: number, y: number, z: number) => boolean): number {
  const s = t.samples;
  for (let i = 0; i < s.count; i++) if (pred(s.positions[3 * i]!, s.positions[3 * i + 1]!, s.positions[3 * i + 2]!)) return i;
  return -1;
}

export function measurePid(tracks: readonly TrackRecord[], det: DetectorModel, seed: number): PidMeasurement[] {
  const sys = det.pid;
  if (!sys) return [];
  const out: PidMeasurement[] = [];
  for (const t of tracks) {
    if (t.kind !== 'charged' || t.recoId !== undefined) continue;
    const p = t.pt * Math.cosh(t.eta);
    const trueSp = speciesOf(t.pdgId);
    const mass = trueSp ? SPECIES_MASS[trueSp] : Math.sqrt(Math.max(t.energy * t.energy - p * p, 0));
    const rng = new Rng(seedFrom(seed, 'pid', t.particleId));
    const chi2: Partial<Record<Species, number>> = {};
    const add = (sp: Species, v: number) => (chi2[sp] = (chi2[sp] ?? 0) + v);
    let dEdx: PidMeasurement['dEdx'];
    let tof: PidMeasurement['tof'];
    const rich: NonNullable<PidMeasurement['rich']>[number][] = [];

    if (sys.dEdx && firstIndex(t, (x, y) => Math.hypot(x, y) >= sys.dEdx!.rMax) >= 0) {
      const mean = dEdxMean(p, mass);
      const sigma = sys.dEdx.relResolution * mean;
      const value = mean + rng.gaussian(0, sigma);
      dEdx = { value, sigma };
      for (const sp of SPECIES) {
        const m = dEdxMean(p, SPECIES_MASS[sp]);
        add(sp, ((value - m) / (sys.dEdx.relResolution * m)) ** 2);
      }
    }
    if (sys.tof) {
      const i = firstIndex(t, (x, y, z) => Math.hypot(x, y) >= sys.tof!.radiusM && Math.abs(z) <= sys.tof!.zHalfM);
      if (i >= 0) {
        const L = t.samples.arcLengths[i]!;
        const tTrue = L / (velocityBeta(p, mass) * C_M_PER_NS);
        const tm = tTrue + rng.gaussian(0, sys.tof.timeResolutionNs);
        tof = { pathM: L, timeNs: tm, beta: L / (C_M_PER_NS * tm), sigmaNs: sys.tof.timeResolutionNs };
        for (const sp of SPECIES) add(sp, ((tm - L / (velocityBeta(p, SPECIES_MASS[sp]) * C_M_PER_NS)) / sys.tof.timeResolutionNs) ** 2);
      }
    }
    for (const r of sys.rich ?? []) {
      const i = firstIndex(t, (_x, _y, z) => z >= (r.zMin + r.zMax) / 2);
      if (i < 0 || i + 1 >= t.samples.count) continue;
      const s = t.samples.positions;
      const d = [s[3 * i + 3]! - s[3 * i]!, s[3 * i + 4]! - s[3 * i + 1]!, s[3 * i + 5]! - s[3 * i + 2]!];
      const dl = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
      const th = cherenkovAngle(p, mass, r.n);
      const angle = th === null ? null : th + rng.gaussian(0, r.angleResolutionRad);
      rich.push({ name: r.name, n: r.n, angleRad: angle, sigmaRad: r.angleResolutionRad, x: s[3 * i]!, y: s[3 * i + 1]!, z: s[3 * i + 2]!, dir: [d[0]! / dl, d[1]! / dl, d[2]! / dl] });
      for (const sp of SPECIES) {
        const e = cherenkovAngle(p, SPECIES_MASS[sp], r.n);
        // Threshold (veto) mode: a missing ring where one is expected costs ≈ 3σ (χ² 9); a ring
        // seen for a hypothesis below threshold costs ≈ 5σ (χ² 25). Educational choices.
        if (angle === null) add(sp, e === null ? 0 : 9);
        else add(sp, e === null ? 25 : ((angle - e) / r.angleResolutionRad) ** 2);
      }
    }
    const measured = dEdx || tof || rich.length;
    let best: Species | null = null;
    if (measured) for (const sp of SPECIES) if (best === null || chi2[sp]! < chi2[best]!) best = sp;
    if (!measured) continue;
    out.push({ particleId: t.particleId, p, trueSpecies: trueSp, ...(dEdx ? { dEdx } : {}), ...(tof ? { tof } : {}), ...(rich.length ? { rich } : {}), hypothesis: best, chi2 });
  }
  return out;
}
