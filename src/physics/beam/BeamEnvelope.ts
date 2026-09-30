/**
 * Beam envelope along a FODO cell: σ(s) = √(ε_geo · β(s)), ε_geo = ε_n / (βγ).
 * Dispersion and momentum spread are neglected (σ_δ·D contribution omitted).
 */
import { apply, periodicTwiss, propagateTwiss, type PeriodicSolution, type Twiss } from './BeamOptics';
import { elementMatrix, type FodoCell } from './FODOLattice';

export interface EnvelopeSamples {
  readonly s: Float64Array;
  readonly betaX: Float64Array;
  readonly betaY: Float64Array;
  readonly sigmaX: Float64Array;
  readonly sigmaY: Float64Array;
  readonly stableX: boolean;
  readonly stableY: boolean;
  readonly phaseAdvanceXDeg: number;
  readonly phaseAdvanceYDeg: number;
  readonly geometricEmittanceM: number;
  readonly solutionX: PeriodicSolution;
  readonly solutionY: PeriodicSolution;
}

/** Samples per metre of element length (min 2 per element). */
const SAMPLES_PER_M = 1;

export function computeEnvelope(cell: FodoCell, normalizedEmittanceM: number, betaGamma: number): EnvelopeSamples {
  const solX = periodicTwiss(cell.matrixX);
  const solY = periodicTwiss(cell.matrixY);
  const eps = betaGamma > 0 && Number.isFinite(betaGamma) ? normalizedEmittanceM / betaGamma : 0;

  const s: number[] = [0];
  const bx: number[] = [solX.twiss?.beta ?? Number.NaN];
  const by: number[] = [solY.twiss?.beta ?? Number.NaN];
  let tx: Twiss | null = solX.twiss;
  let ty: Twiss | null = solY.twiss;

  for (const e of cell.elements) {
    const n = Math.max(2, Math.ceil(e.lengthM * SAMPLES_PER_M));
    const ds = e.lengthM / n;
    const mX = elementMatrix(e, 1, ds);
    const mY = elementMatrix(e, -1, ds);
    for (let i = 1; i <= n; i++) {
      if (tx) tx = propagateTwiss(mX, tx);
      if (ty) ty = propagateTwiss(mY, ty);
      s.push(e.sStartM + i * ds);
      bx.push(tx?.beta ?? Number.NaN);
      by.push(ty?.beta ?? Number.NaN);
    }
  }

  const betaX = Float64Array.from(bx);
  const betaY = Float64Array.from(by);
  return {
    s: Float64Array.from(s),
    betaX,
    betaY,
    sigmaX: betaX.map((b) => Math.sqrt(eps * b)),
    sigmaY: betaY.map((b) => Math.sqrt(eps * b)),
    stableX: solX.stable,
    stableY: solY.stable,
    phaseAdvanceXDeg: (solX.mu * 180) / Math.PI,
    phaseAdvanceYDeg: (solY.mu * 180) / Math.PI,
    geometricEmittanceM: eps,
    solutionX: solX,
    solutionY: solY,
  };
}

/**
 * Tracks one particle through `nCells` consecutive cells, returning (s, x) at every
 * element slice — shows betatron oscillation (or exponential growth when unstable).
 */
export function trackThroughCells(cell: FodoCell, nCells: number, x0: number, xp0: number, plane: 1 | -1): { s: Float64Array; x: Float64Array } {
  const s: number[] = [0];
  const x: number[] = [x0];
  let xc = x0;
  let xpc = xp0;
  const L = cell.params.cellLengthM;
  for (let c = 0; c < nCells; c++) {
    for (const e of cell.elements) {
      const n = Math.max(2, Math.ceil(e.lengthM * SAMPLES_PER_M));
      const ds = e.lengthM / n;
      const m = elementMatrix(e, plane, ds);
      for (let i = 1; i <= n; i++) {
        [xc, xpc] = apply(m, xc, xpc);
        s.push(c * L + e.sStartM + i * ds);
        x.push(xc);
      }
    }
  }
  return { s: Float64Array.from(s), x: Float64Array.from(x) };
}
