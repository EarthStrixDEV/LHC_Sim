/**
 * Educational spectrometer dipole: transverse field along one axis with a Gaussian
 * longitudinal profile B(z) = B_peak · exp(−(z − z₀)² / 2σ²) inside a rectangular aperture.
 * The integral ∫B dz = B_peak σ √(2π) sets the bending power. Fringe fields outside the
 * aperture and ∇·B = 0 corrections are not modelled.
 */
import type { MagneticField } from './MagneticField';

export interface DipoleSpec {
  readonly axis: 'x' | 'y';
  readonly peakT: number;
  readonly centreZ: number;
  readonly sigmaZ: number;
  readonly halfX: number;
  readonly halfY: number;
}

export function dipoleIntegralTm(d: DipoleSpec): number {
  return Math.abs(d.peakT) * d.sigmaZ * Math.sqrt(2 * Math.PI);
}

export class DipoleField implements MagneticField {
  readonly description: string;
  constructor(
    readonly id: string,
    readonly label: string,
    readonly spec: DipoleSpec,
  ) {
    this.description = `Dipole B${spec.axis} peak ${spec.peakT} T at z = ${spec.centreZ} m, ∫B dz ≈ ${dipoleIntegralTm(spec).toFixed(1)} T·m (Gaussian profile, no fringe/∇·B correction).`;
  }

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    out[0] = 0; out[1] = 0; out[2] = 0;
    const d = this.spec;
    if (Math.abs(x) > d.halfX || Math.abs(y) > d.halfY) return;
    const u = (z - d.centreZ) / d.sigmaZ;
    if (Math.abs(u) > 4) return;
    const b = d.peakT * Math.exp(-0.5 * u * u);
    if (d.axis === 'x') out[0] = b;
    else out[1] = b;
  }
}

/** Sum of independent field sources. */
export class SumField implements MagneticField {
  private readonly tmp = new Float64Array(3);
  constructor(
    readonly id: string,
    readonly label: string,
    readonly description: string,
    readonly parts: readonly MagneticField[],
  ) {}

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    let bx = 0, by = 0, bz = 0;
    for (const p of this.parts) {
      p.fieldAt(x, y, z, this.tmp);
      bx += this.tmp[0]!;
      by += this.tmp[1]!;
      bz += this.tmp[2]!;
    }
    out[0] = bx; out[1] = by; out[2] = bz;
  }
}
