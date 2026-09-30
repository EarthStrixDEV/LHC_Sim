/**
 * RegionalField — piecewise field built from cylindrical regions (first match wins).
 * A stand-in for real field maps: each region has an analytic field shape.
 */
import type { MagneticField } from './MagneticField';

export type RegionShape =
  /** Uniform axial field Bz. */
  | { kind: 'axial'; bz: number }
  /** Azimuthal toroidal field Bφ = B0·r0 / r (∮B·dl = μ0·I_enclosed). */
  | { kind: 'toroidal'; b0r0: number };

export interface FieldRegion {
  readonly name: string;
  readonly rMin: number;
  readonly rMax: number;
  readonly zMin: number;
  readonly zMax: number;
  /** If true the region is mirrored to negative z (|z| ∈ [zMin, zMax]). */
  readonly symmetricZ: boolean;
  readonly shape: RegionShape;
  readonly note: string;
}

export class RegionalField implements MagneticField {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly regions: readonly FieldRegion[],
    readonly description: string,
  ) {}

  /** Index of the region containing the point, or −1. */
  regionIndex(x: number, y: number, z: number): number {
    const r = Math.sqrt(x * x + y * y);
    for (let i = 0; i < this.regions.length; i++) {
      const g = this.regions[i]!;
      const zz = g.symmetricZ ? Math.abs(z) : z;
      if (r >= g.rMin && r < g.rMax && zz >= g.zMin && zz < g.zMax) return i;
    }
    return -1;
  }

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    const i = this.regionIndex(x, y, z);
    if (i < 0) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      return;
    }
    const s = this.regions[i]!.shape;
    if (s.kind === 'axial') {
      out[0] = 0; out[1] = 0; out[2] = s.bz;
      return;
    }
    const r = Math.sqrt(x * x + y * y);
    if (r < 1e-9) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      return;
    }
    const b = s.b0r0 / r;
    // φ̂ = (−y/r, x/r, 0)
    out[0] = (-b * y) / r;
    out[1] = (b * x) / r;
    out[2] = 0;
  }
}
