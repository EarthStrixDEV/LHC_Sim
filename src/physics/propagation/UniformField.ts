import type { MagneticField } from './MagneticField';

/** Uniform field, by default along +z (solenoid axis = beam axis). Optionally bounded by a cylinder. */
export class UniformField implements MagneticField {
  readonly id: string;
  readonly label: string;
  readonly description: string;

  constructor(
    readonly bz: number,
    readonly bounds: { rMax: number; zMax: number } | null = null,
    readonly bx = 0,
    readonly by = 0,
  ) {
    this.id = `uniform-${bz}T`;
    this.label = `Uniform ${bz} T`;
    this.description = bounds
      ? `Uniform B = ${bz} T inside r < ${bounds.rMax} m, |z| < ${bounds.zMax} m; zero outside.`
      : `Uniform B = (${bx}, ${by}, ${bz}) T everywhere.`;
  }

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    if (this.bounds && (x * x + y * y > this.bounds.rMax * this.bounds.rMax || Math.abs(z) > this.bounds.zMax)) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      return;
    }
    out[0] = this.bx; out[1] = this.by; out[2] = this.bz;
  }
}
