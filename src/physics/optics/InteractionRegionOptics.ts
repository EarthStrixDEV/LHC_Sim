/**
 * Educational interaction-region optics for a high-luminosity IP (ATLAS IP1 / CMS IP5 type).
 *
 * Model (one side of the IP, mirror-symmetric):
 *   IP waist (β*, α* = 0) → drift L* → inner triplet Q1 (F) · Q2a (D) · Q2b (D) · Q3 (F) → drift
 * Thick-quadrupole transfer matrices; the other plane sees opposite polarities. The triplet
 * strength is fixed (optics ramps with the beam, k = G/(Bρ) at design energy).
 * Layout and gradient are approximate (LHC Design Report scale, VERIFY); no matching
 * section, no dispersion, no separation dipoles D1/D2, no coupling. Not MAD-X.
 *
 * Crossing angle: the beams cross with full angle θ_c in the crossing plane. Near the IP
 * (drift) the separation is d(s) = θ_c · s; the separation at the long-range (parasitic)
 * encounters every c·Δt/2 = 3.75 m is reported in units of σ. The Piwinski factor
 *   F = 1 / √(1 + (θ_c σ_z / (2σ*))²)
 * gives the geometric luminosity reduction.
 */
import { drift, thickQuad, type Mat2 } from '../beam/BeamOptics';
import { SPEED_OF_LIGHT_M_PER_S } from '../constants/physicalConstants';
import type { OpticsTable } from './OpticsTable';
import { beamSize, driftFromWaist, propagateTwiss, type Twiss } from './Twiss';

export interface TripletElement {
  readonly name: string;
  /** Distance of the element entrance from the IP [m]. */
  readonly start: number;
  readonly length: number;
  /** +1: focusing in x (defocusing in y), −1 the opposite. */
  readonly polarity: 1 | -1;
}

export interface IRLayout {
  readonly lStarM: number;
  readonly elements: readonly TripletElement[];
  /** Triplet gradient at design energy [T/m] and the rigidity it corresponds to [T·m]. */
  readonly gradientTPerM: number;
  readonly designRigidityTm: number;
  /** Extent of the model on each side of the IP [m]. */
  readonly extentM: number;
}

/** LHC IR1/IR5-like triplet (approximate positions and lengths — VERIFY). */
export const LHC_IR_LAYOUT: IRLayout = {
  lStarM: 23.0,
  elements: [
    { name: 'Q1', start: 23.0, length: 6.37, polarity: 1 },
    { name: 'Q2a', start: 31.5, length: 5.5, polarity: -1 },
    { name: 'Q2b', start: 38.0, length: 5.5, polarity: -1 },
    { name: 'Q3', start: 45.9, length: 6.37, polarity: 1 },
  ],
  gradientTPerM: 205,
  designRigidityTm: 7000 / 0.299792458,
  extentM: 80,
};

export interface IROpticsInput {
  readonly betaStarM: number;
  readonly geometricEmittanceM: number;
  /** Full crossing angle θ_c [rad]. */
  readonly fullCrossingAngleRad: number;
  readonly crossingPlane: 'x' | 'y';
  /** rms bunch length [m]. */
  readonly sigmaZM: number;
  /** Bunch spacing [ns] (long-range encounters every c·Δt/2). */
  readonly bunchSpacingNs: number;
  readonly layout?: IRLayout;
  /** Samples per side. */
  readonly samples?: number;
}

export interface LongRangeEncounter {
  readonly s: number;
  readonly separationM: number;
  readonly separationSigma: number;
}

export interface IROptics {
  readonly table: OpticsTable;
  readonly betaStarM: number;
  readonly sigmaStarM: number;
  readonly maxBetaM: number;
  /** β at the Q1 entrance (s = L*). */
  readonly betaAtQ1M: number;
  readonly piwinskiAngle: number;
  readonly piwinskiFactor: number;
  readonly longRange: readonly LongRangeEncounter[];
  readonly layout: IRLayout;
  readonly input: IROpticsInput;
}

function elementAt(layout: IRLayout, s: number): TripletElement | null {
  for (const e of layout.elements) if (s >= e.start && s < e.start + e.length) return e;
  return null;
}

/** Transfer matrix over [s0, s1] in one plane (sign = +1 for x, −1 for y). */
function segmentMatrix(layout: IRLayout, s0: number, s1: number, sign: 1 | -1): Mat2 {
  const e = elementAt(layout, (s0 + s1) / 2);
  const L = s1 - s0;
  if (!e) return drift(L);
  const k = (sign * e.polarity * layout.gradientTPerM) / layout.designRigidityTm;
  return thickQuad(k, L);
}

export function computeIROptics(inp: IROpticsInput): IROptics {
  const layout = inp.layout ?? LHC_IR_LAYOUT;
  const n = inp.samples ?? 400;
  // Break points so that no sample step straddles an element edge.
  const edges = new Set<number>([0, layout.extentM]);
  for (const e of layout.elements) edges.add(e.start).add(e.start + e.length);
  const grid = [...new Set([...Array.from({ length: n + 1 }, (_, i) => (i / n) * layout.extentM), ...edges])].sort((a, b) => a - b);

  let tx: Twiss = driftFromWaist(inp.betaStarM, 0);
  let ty: Twiss = tx;
  const half = { s: [0], bx: [tx.beta], by: [ty.beta], ax: [0], ay: [0] };
  for (let i = 1; i < grid.length; i++) {
    const s0 = grid[i - 1]!, s1 = grid[i]!;
    tx = propagateTwiss(segmentMatrix(layout, s0, s1, 1), tx);
    ty = propagateTwiss(segmentMatrix(layout, s0, s1, -1), ty);
    half.s.push(s1);
    half.bx.push(tx.beta);
    half.by.push(ty.beta);
    half.ax.push(tx.alpha);
    half.ay.push(ty.alpha);
  }
  // Mirror to the other side of the IP: β(−s) = β(s), α(−s) = −α(s).
  const m = half.s.length;
  const total = 2 * m - 1;
  const mk = () => new Float64Array(total);
  const s = mk(), betx = mk(), bety = mk(), alfx = mk(), alfy = mk(), x = mk(), y = mk();
  const theta = inp.fullCrossingAngleRad / 2;
  for (let i = 0; i < total; i++) {
    const j = i < m ? m - 1 - i : i - m + 1;
    const sign = i < m ? -1 : 1;
    s[i] = sign * half.s[j]!;
    betx[i] = half.bx[j]!;
    bety[i] = half.by[j]!;
    alfx[i] = sign * half.ax[j]!;
    alfy[i] = sign * half.ay[j]!;
    // Beam-1 orbit near the IP: straight line at half angle (valid up to L*; beyond, bumps close — not modelled).
    const orbit = theta * Math.max(-layout.lStarM, Math.min(layout.lStarM, s[i]!));
    x[i] = inp.crossingPlane === 'x' ? orbit : 0;
    y[i] = inp.crossingPlane === 'y' ? orbit : 0;
  }
  const table: OpticsTable = { source: 'lhcsim educational IR model (not MAD-X)', s, betx, bety, alfx, alfy, x, y, names: null };

  const sigmaStar = beamSize(inp.geometricEmittanceM, inp.betaStarM);
  const phi = (inp.fullCrossingAngleRad * inp.sigmaZM) / (2 * sigmaStar);
  const step = (SPEED_OF_LIGHT_M_PER_S * inp.bunchSpacingNs * 1e-9) / 2;
  const longRange: LongRangeEncounter[] = [];
  for (let k = 1; k * step <= layout.lStarM; k++) {
    const sk = k * step;
    // Both planes share β(s) = β* + s²/β* in the drift before Q1 (round optics).
    const b = driftFromWaist(inp.betaStarM, sk).beta;
    const sep = inp.fullCrossingAngleRad * sk;
    longRange.push({ s: sk, separationM: sep, separationSigma: sep / beamSize(inp.geometricEmittanceM, b) });
  }
  return {
    table,
    betaStarM: inp.betaStarM,
    sigmaStarM: sigmaStar,
    maxBetaM: Math.max(...half.bx, ...half.by),
    betaAtQ1M: driftFromWaist(inp.betaStarM, layout.lStarM).beta,
    piwinskiAngle: phi,
    piwinskiFactor: 1 / Math.sqrt(1 + phi * phi),
    longRange,
    layout,
    input: inp,
  };
}
