/**
 * Magnetic-field models (renderer independent). Positions in metres, field in tesla.
 *
 * `fieldAt` writes into a caller-provided array to keep the propagation loop free of
 * allocations. Future phases can implement this interface with interpolated field maps.
 */

export interface MagneticField {
  readonly id: string;
  readonly label: string;
  /** Writes (Bx, By, Bz) at (x, y, z) into out[0..2]. */
  fieldAt(x: number, y: number, z: number, out: Float64Array): void;
  /** Human-readable description of the approximation (shown in the inspector). */
  readonly description: string;
}

export type Vec3Out = Float64Array;

export function fieldMagnitude(field: MagneticField, x: number, y: number, z: number, scratch: Float64Array): number {
  field.fieldAt(x, y, z, scratch);
  return Math.hypot(scratch[0]!, scratch[1]!, scratch[2]!);
}
