/**
 * Educational FODO cell:  ½QF → drift(+dipoles) → QD → drift(+dipoles) → ½QF
 *
 * The cell starts and ends in the middle of the focusing quadrupole, so it is
 * mirror-symmetric and α = 0 at both ends. Dipoles sit in the drifts; their weak
 * focusing (~1/ρ² ≈ 1e-7 m⁻² for the LHC, vs k ≈ 1e-2 m⁻² in the quadrupoles) is
 * neglected, so they are transported as drifts. This is NOT the full LHC lattice
 * (no dispersion, chromaticity, insertions, or coupling).
 */
import { drift, IDENTITY, mul, thickQuad, type Mat2 } from './BeamOptics';

export type LatticeElementType = 'quadF' | 'quadD' | 'drift' | 'dipole';

export interface LatticeElement {
  readonly type: LatticeElementType;
  readonly label: string;
  readonly sStartM: number;
  readonly lengthM: number;
  /** Strength in the horizontal plane [m⁻²] (vertical is −k). Zero for drifts/dipoles. */
  readonly kx: number;
}

export interface FodoParameters {
  readonly cellLengthM: number;
  readonly quadLengthM: number;
  readonly quadGradientTPerM: number;
  readonly rigidityTm: number;
  /** Dipoles per half-cell (visual/structural only). */
  readonly dipolesPerHalfCell: number;
  readonly dipoleLengthM: number;
}

export interface FodoCell {
  readonly params: FodoParameters;
  readonly elements: readonly LatticeElement[];
  /** Quadrupole strength k = G/Bρ [m⁻²]. */
  readonly k: number;
  /** Thin-lens focal length of the full quadrupole f = 1/(k·Lq) [m]. */
  readonly focalLengthM: number;
  readonly matrixX: Mat2;
  readonly matrixY: Mat2;
}

/**
 * Gradient that gives phase advance μ per cell in the thin-lens approximation:
 *   sin(μ/2) = L_half / (2 f),  f = 1/(k Lq),  k = G/Bρ  ⇒  G = 2 Bρ sin(μ/2) / (L_half Lq)
 */
export function gradientForPhaseAdvance(cellLengthM: number, quadLengthM: number, rigidityTm: number, muRad: number): number {
  const halfCell = cellLengthM / 2;
  return (2 * rigidityTm * Math.sin(muRad / 2)) / (halfCell * quadLengthM);
}

export function buildFodoCell(p: FodoParameters): FodoCell {
  const k = Number.isFinite(p.rigidityTm) && p.rigidityTm > 0 ? p.quadGradientTPerM / p.rigidityTm : 0;
  const halfQ = p.quadLengthM / 2;
  const halfCell = p.cellLengthM / 2;
  const driftLen = halfCell - p.quadLengthM; // space between quad ends in each half-cell
  if (driftLen <= 0) throw new Error('FODO: quadrupoles longer than half-cell');

  const elements: LatticeElement[] = [];
  let s = 0;
  const push = (type: LatticeElementType, label: string, lengthM: number, kx: number): void => {
    elements.push({ type, label, sStartM: s, lengthM, kx });
    s += lengthM;
  };

  const fillDrift = (tag: string): void => {
    const nD = p.dipolesPerHalfCell;
    const dipoleTotal = nD * p.dipoleLengthM;
    if (nD === 0 || dipoleTotal >= driftLen) {
      push('drift', `drift ${tag}`, driftLen, 0);
      return;
    }
    const gap = (driftLen - dipoleTotal) / (nD + 1);
    for (let i = 0; i < nD; i++) {
      push('drift', `gap ${tag}${i}`, gap, 0);
      push('dipole', `MB ${tag}${i + 1}`, p.dipoleLengthM, 0);
    }
    push('drift', `gap ${tag}${nD}`, gap, 0);
  };

  push('quadF', 'QF/2', halfQ, k);
  fillDrift('A');
  push('quadD', 'QD', p.quadLengthM, -k);
  fillDrift('B');
  push('quadF', 'QF/2', halfQ, k);

  let mx: Mat2 = IDENTITY;
  let my: Mat2 = IDENTITY;
  for (const e of elements) {
    mx = mul(elementMatrix(e, 1), mx);
    my = mul(elementMatrix(e, -1), my);
  }
  return {
    params: p,
    elements,
    k,
    focalLengthM: k !== 0 ? 1 / (k * p.quadLengthM) : Number.POSITIVE_INFINITY,
    matrixX: mx,
    matrixY: my,
  };
}

/** Transfer matrix of an element (or a slice of it) in plane sign +1 (x) or −1 (y). */
export function elementMatrix(e: LatticeElement, planeSign: 1 | -1, lengthM = e.lengthM): Mat2 {
  if (e.type === 'quadF' || e.type === 'quadD') return thickQuad(planeSign * e.kx, lengthM);
  return drift(lengthM);
}
