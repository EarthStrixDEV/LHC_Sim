/**
 * TrackPropagator — integrates charged-particle motion in a static magnetic field.
 *
 * With path length s and unit tangent u = p/|p|, the Lorentz force dp/dt = q v × B becomes
 *     dr/ds = u,      du/ds = (κ q / |p|) · (u × B),     κ = 0.299792458 GeV/(T·m)
 * (|p| is conserved: magnetic forces do no work). Integrated with classical RK4 and an
 * adaptive step limited to a maximum turning angle per step. In a uniform field this
 * reproduces the analytic helix with radius R = pT / (κ |q| B).
 *
 * Not modelled (documented approximations): energy loss (dE/dx), multiple scattering,
 * bremsstrahlung, material interactions, electric fields.
 *
 * Output samples are plain typed arrays consumed by the visualization layer; rendering
 * never computes curvature itself.
 */
import { RIGIDITY_GEV_PER_TM, SPEED_OF_LIGHT_M_PER_S } from '../constants/physicalConstants';
import type { MagneticField } from './MagneticField';

const C_M_PER_NS = SPEED_OF_LIGHT_M_PER_S * 1e-9;

/** Render-independent importance tier; controls sampling density only (not accuracy). */
export type TrackImportance = 0 | 1 | 2;

export interface PropagationLimits {
  /** Stop when the transverse radius exceeds this [m]. */
  readonly maxRadiusM: number;
  /** Stop when |z| exceeds this [m]. */
  readonly maxAbsZM: number;
  /** Stop after this path length [m] (e.g. distance to a decay vertex). */
  readonly maxPathM: number;
  /** Stop after this many full turns (loopers). */
  readonly maxTurns: number;
}

export interface PropagationInput {
  readonly charge: number;
  /** Momentum [GeV/c]. */
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly mass: number;
  /** Start position [m] and time [ns]. */
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly t0: number;
  readonly field: MagneticField;
  readonly limits: PropagationLimits;
  readonly importance: TrackImportance;
  /**
   * 'rk4' (default, Phase 1): classical RK4 with a turning-angle step limit.
   * 'rk45': Dormand–Prince 5(4) with embedded error control (for non-uniform field maps);
   * the turning-angle limit still bounds the step so sampling density is unchanged.
   */
  readonly integrator?: Integrator;
  /** Local error tolerance for 'rk45' [m in position, rad in direction]. */
  readonly tolerance?: number;
}

export type Integrator = 'rk4' | 'rk45';

export type EndReason = 'radius' | 'z' | 'path' | 'turns' | 'steps' | 'zero-momentum';

export interface TrackSamples {
  /** xyz triplets [m]. */
  readonly positions: Float32Array;
  /** Time at each sample [ns]. */
  readonly times: Float32Array;
  /** Cumulative path length at each sample [m]. */
  readonly arcLengths: Float32Array;
  readonly count: number;
  readonly endReason: EndReason;
  readonly pathLengthM: number;
  /** Final direction (unit vector). */
  readonly endDirection: [number, number, number];
}

/** Maximum turning angle per RK4 step [rad] by importance. */
const MAX_TURN_PER_STEP: Record<TrackImportance, number> = { 0: 0.08, 1: 0.05, 2: 0.025 };
/** Maximum step length [m] (bounds straight-line and weak-field steps). */
const MAX_STEP_M = 0.1;
const MIN_STEP_M = 1e-4;
const MAX_STEPS = 20_000;
/** Store every Nth step by importance (endpoints are always stored). */
const STORE_EVERY: Record<TrackImportance, number> = { 0: 3, 1: 2, 2: 1 };

export function propagate(inp: PropagationInput): TrackSamples {
  const p = Math.hypot(inp.px, inp.py, inp.pz);
  const pos: number[] = [inp.x0, inp.y0, inp.z0];
  const tim: number[] = [inp.t0];
  const arc: number[] = [0];
  if (p === 0) return pack(pos, tim, arc, 'zero-momentum', 0, [0, 0, 1]);

  const E = Math.sqrt(p * p + inp.mass * inp.mass);
  const velocity = (p / E) * C_M_PER_NS; // m/ns
  const k = (RIGIDITY_GEV_PER_TM * inp.charge) / p; // curvature factor [1/(T·m)]
  const { maxRadiusM, maxAbsZM, maxPathM, maxTurns } = inp.limits;
  const maxR2 = maxRadiusM * maxRadiusM;
  const maxTurnAngle = maxTurns * 2 * Math.PI;
  const turnPerStep = MAX_TURN_PER_STEP[inp.importance];
  const storeEvery = STORE_EVERY[inp.importance];

  let x = inp.x0, y = inp.y0, z = inp.z0;
  let ux = inp.px / p, uy = inp.py / p, uz = inp.pz / p;
  let s = 0;
  let turned = 0;
  let reason: EndReason = 'steps';
  const B = new Float64Array(3);

  // Neutral: exact straight line to the first boundary (still sampled for time animation).
  if (k === 0) {
    const sEnd = Math.min(maxPathM, distanceToBoundary(x, y, z, ux, uy, uz, maxRadiusM, maxAbsZM));
    const n = Math.max(2, Math.ceil(sEnd / 0.5));
    for (let i = 1; i <= n; i++) {
      const si = (sEnd * i) / n;
      pos.push(x + ux * si, y + uy * si, z + uz * si);
      tim.push(inp.t0 + si / velocity);
      arc.push(si);
    }
    const endR2 = (x + ux * sEnd) ** 2 + (y + uy * sEnd) ** 2;
    reason = sEnd >= maxPathM ? 'path' : endR2 >= maxR2 * 0.999999 ? 'radius' : 'z';
    return pack(pos, tim, arc, reason, sEnd, [ux, uy, uz]);
  }

  // Scratch state (no allocations inside the loop).
  const adaptive = inp.integrator === 'rk45';
  const tol = inp.tolerance ?? 1e-7;
  const dpState = new Float64Array(6);
  let hNext = MAX_STEP_M;
  let step = 0;
  for (; step < MAX_STEPS; step++) {
    inp.field.fieldAt(x, y, z, B);
    const bMag = Math.hypot(B[0]!, B[1]!, B[2]!);
    // Local radius of curvature (∞ in field-free regions).
    const R = bMag > 0 ? 1 / Math.abs(k * bMag) : Number.POSITIVE_INFINITY;
    let h = Math.min(MAX_STEP_M, Math.max(MIN_STEP_M, turnPerStep * R));
    if (adaptive) h = Math.min(h, hNext);
    if (s + h > maxPathM) h = maxPathM - s;

    let nx: number, ny: number, nz: number, nux: number, nuy: number, nuz: number;
    if (adaptive) {
      // Dormand–Prince 5(4): shrink until the embedded error estimate is below tolerance.
      for (let tries = 0; ; tries++) {
        const err = dp45(inp.field, k, x, y, z, ux, uy, uz, h, dpState);
        const scaled = err / tol;
        if (scaled <= 1 || h <= MIN_STEP_M || tries > 30) {
          hNext = h * Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(scaled, 1e-10), -0.2)));
          break;
        }
        h = Math.max(MIN_STEP_M, h * Math.max(0.1, 0.9 * Math.pow(scaled, -0.25)));
      }
      nx = dpState[0]!; ny = dpState[1]!; nz = dpState[2]!;
      nux = dpState[3]!; nuy = dpState[4]!; nuz = dpState[5]!;
      const nn = Math.hypot(nux, nuy, nuz);
      nux /= nn; nuy /= nn; nuz /= nn;
    } else {

    // RK4 on (r, u):  r' = u,  u' = k (u × B(r))
    const [k1x, k1y, k1z] = cross(ux, uy, uz, B, k);
    let mx = x + 0.5 * h * ux, my = y + 0.5 * h * uy, mz = z + 0.5 * h * uz;
    let vx = ux + 0.5 * h * k1x, vy = uy + 0.5 * h * k1y, vz = uz + 0.5 * h * k1z;
    inp.field.fieldAt(mx, my, mz, B);
    const [k2x, k2y, k2z] = cross(vx, vy, vz, B, k);
    const r2x = vx, r2y = vy, r2z = vz;
    mx = x + 0.5 * h * r2x; my = y + 0.5 * h * r2y; mz = z + 0.5 * h * r2z;
    vx = ux + 0.5 * h * k2x; vy = uy + 0.5 * h * k2y; vz = uz + 0.5 * h * k2z;
    inp.field.fieldAt(mx, my, mz, B);
    const [k3x, k3y, k3z] = cross(vx, vy, vz, B, k);
    const r3x = vx, r3y = vy, r3z = vz;
    mx = x + h * r3x; my = y + h * r3y; mz = z + h * r3z;
    vx = ux + h * k3x; vy = uy + h * k3y; vz = uz + h * k3z;
    inp.field.fieldAt(mx, my, mz, B);
    const [k4x, k4y, k4z] = cross(vx, vy, vz, B, k);
    const r4x = vx, r4y = vy, r4z = vz;

    nx = x + (h / 6) * (ux + 2 * r2x + 2 * r3x + r4x);
    ny = y + (h / 6) * (uy + 2 * r2y + 2 * r3y + r4y);
    nz = z + (h / 6) * (uz + 2 * r2z + 2 * r3z + r4z);
    nux = ux + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    nuy = uy + (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    nuz = uz + (h / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);
    const norm = Math.hypot(nux, nuy, nuz); // renormalize: |u| = 1 exactly
    nux /= norm; nuy /= norm; nuz /= norm;
    }

    // Boundary crossing: interpolate linearly to the boundary within this step.
    const nr2 = nx * nx + ny * ny;
    let frac = 1;
    if (nr2 > maxR2) {
      const r0 = Math.sqrt(x * x + y * y);
      const r1 = Math.sqrt(nr2);
      frac = Math.min(frac, (maxRadiusM - r0) / Math.max(r1 - r0, 1e-12));
      reason = 'radius';
    }
    if (Math.abs(nz) > maxAbsZM) {
      const f = (maxAbsZM - Math.abs(z)) / Math.max(Math.abs(nz) - Math.abs(z), 1e-12);
      if (f < frac) {
        frac = f;
        reason = 'z';
      }
    }
    frac = Math.max(0, Math.min(1, frac));
    if (frac < 1) {
      nx = x + (nx - x) * frac; ny = y + (ny - y) * frac; nz = z + (nz - z) * frac;
      h *= frac;
    }

    x = nx; y = ny; z = nz;
    ux = nux; uy = nuy; uz = nuz;
    s += h;
    turned += Number.isFinite(R) ? h / R : 0;

    const done = frac < 1 || s >= maxPathM - 1e-12 || turned >= maxTurnAngle;
    if (done || step % storeEvery === 0) {
      pos.push(x, y, z);
      tim.push(inp.t0 + s / velocity);
      arc.push(s);
    }
    if (frac < 1) break;
    if (s >= maxPathM - 1e-12) {
      reason = 'path';
      break;
    }
    if (turned >= maxTurnAngle) {
      reason = 'turns';
      break;
    }
  }
  return pack(pos, tim, arc, reason, s, [ux, uy, uz]);
}

function cross(ux: number, uy: number, uz: number, B: Float64Array, k: number): [number, number, number] {
  const bx = B[0]!, by = B[1]!, bz = B[2]!;
  return [k * (uy * bz - uz * by), k * (uz * bx - ux * bz), k * (ux * by - uy * bx)];
}

/** Distance along a straight line from (x,y,z) with direction u to the cylinder boundary. */
export function distanceToBoundary(x: number, y: number, z: number, ux: number, uy: number, uz: number, rMax: number, zMax: number): number {
  let sR = Number.POSITIVE_INFINITY;
  const a = ux * ux + uy * uy;
  if (a > 1e-15) {
    const b = 2 * (x * ux + y * uy);
    const c = x * x + y * y - rMax * rMax;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) sR = (-b + Math.sqrt(disc)) / (2 * a);
  }
  let sZ = Number.POSITIVE_INFINITY;
  if (uz > 1e-15) sZ = (zMax - z) / uz;
  else if (uz < -1e-15) sZ = (-zMax - z) / uz;
  return Math.max(0, Math.min(sR, sZ));
}

function pack(pos: number[], tim: number[], arc: number[], endReason: EndReason, pathLengthM: number, dir: [number, number, number]): TrackSamples {
  return {
    positions: Float32Array.from(pos),
    times: Float32Array.from(tim),
    arcLengths: Float32Array.from(arc),
    count: tim.length,
    endReason,
    pathLengthM,
    endDirection: dir,
  };
}

// ---- Dormand–Prince 5(4) -------------------------------------------------------------------

const DP_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
] as const;
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0] as const;
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40] as const;
const dpK = Array.from({ length: 7 }, () => new Float64Array(6));
const dpY = new Float64Array(6);
const dpB = new Float64Array(3);

/** State derivative of (r, u): (u, k u × B(r)). */
function deriv(field: MagneticField, k: number, y: Float64Array, out: Float64Array): void {
  field.fieldAt(y[0]!, y[1]!, y[2]!, dpB);
  out[0] = y[3]!; out[1] = y[4]!; out[2] = y[5]!;
  out[3] = k * (y[4]! * dpB[2]! - y[5]! * dpB[1]!);
  out[4] = k * (y[5]! * dpB[0]! - y[3]! * dpB[2]!);
  out[5] = k * (y[3]! * dpB[1]! - y[4]! * dpB[0]!);
}

/** One DP5(4) step of length h; writes the 5th-order result into out and returns the error norm. */
function dp45(field: MagneticField, k: number, x: number, y: number, z: number, ux: number, uy: number, uz: number, h: number, out: Float64Array): number {
  const y0 = [x, y, z, ux, uy, uz];
  for (let st = 0; st < 7; st++) {
    for (let c = 0; c < 6; c++) {
      let v = y0[c]!;
      const a = DP_A[st]!;
      for (let j = 0; j < a.length; j++) v += h * a[j]! * dpK[j]![c]!;
      dpY[c] = v;
    }
    deriv(field, k, dpY, dpK[st]!);
  }
  let err = 0;
  for (let c = 0; c < 6; c++) {
    let v5 = y0[c]!, e = 0;
    for (let st = 0; st < 7; st++) {
      v5 += h * DP_B5[st]! * dpK[st]![c]!;
      e += h * (DP_B5[st]! - DP_B4[st]!) * dpK[st]![c]!;
    }
    out[c] = v5;
    err = Math.max(err, Math.abs(e));
  }
  return err;
}
