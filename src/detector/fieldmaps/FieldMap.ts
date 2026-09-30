/**
 * Field maps: magnetic fields tabulated on grids and interpolated.
 *
 *   B = field.sample(position)
 *
 * Every FieldMap is also a MagneticField (fieldAt), so TrackPropagator uses it unchanged and
 * stays unaware of how the field is represented.
 *
 *  - GridFieldMap3D: Cartesian grid of (Bx, By, Bz), trilinear interpolation.
 *  - AxisymmetricFieldMap: (r, z) grid of (Br, Bz) for solenoid-like fields, bilinear
 *    interpolation, optional z-mirror symmetry (Bz even, Br odd in z).
 * Outside the grid the configured policy applies: zero field, clamp to the edge value, or an
 * analytic fallback field.
 */
import type { MagneticField } from '../../physics/propagation/MagneticField';

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

export type OutsidePolicy = { readonly kind: 'zero' } | { readonly kind: 'clamp' } | { readonly kind: 'fallback'; readonly field: MagneticField };

export interface FieldMap extends MagneticField {
  sample(p: Vec3): [number, number, number];
  contains(x: number, y: number, z: number): boolean;
}

abstract class FieldMapBase implements FieldMap {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly description: string;
  constructor(protected readonly outside: OutsidePolicy) {}
  abstract contains(x: number, y: number, z: number): boolean;
  /** Interpolation at a point inside (or clamped onto) the grid. */
  protected abstract interpolate(x: number, y: number, z: number, out: Float64Array): void;

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    if (this.contains(x, y, z) || this.outside.kind === 'clamp') return this.interpolate(x, y, z, out);
    if (this.outside.kind === 'fallback') return this.outside.field.fieldAt(x, y, z, out);
    out[0] = 0; out[1] = 0; out[2] = 0;
  }

  sample(p: Vec3): [number, number, number] {
    const o = new Float64Array(3);
    this.fieldAt(p.x, p.y, p.z, o);
    return [o[0]!, o[1]!, o[2]!];
  }
}

export interface Axis { readonly min: number; readonly max: number; readonly n: number }

function locate(a: Axis, v: number): [number, number] {
  const t = ((Math.min(Math.max(v, a.min), a.max) - a.min) / (a.max - a.min)) * (a.n - 1);
  const i = Math.min(Math.floor(t), a.n - 2);
  return [i, t - i];
}

export class GridFieldMap3D extends FieldMapBase {
  readonly description: string;
  /** Interleaved (Bx, By, Bz), index ((ix·ny + iy)·nz + iz)·3. */
  constructor(
    readonly id: string,
    readonly label: string,
    readonly ax: Axis,
    readonly ay: Axis,
    readonly az: Axis,
    readonly data: Float32Array | Float64Array,
    outside: OutsidePolicy = { kind: 'zero' },
  ) {
    super(outside);
    if (data.length !== ax.n * ay.n * az.n * 3) throw new RangeError('GridFieldMap3D: data size does not match the axes');
    if (ax.n < 2 || ay.n < 2 || az.n < 2) throw new RangeError('GridFieldMap3D: need ≥ 2 nodes per axis');
    this.description = `3D grid ${ax.n}×${ay.n}×${az.n}, trilinear interpolation; outside: ${outside.kind}.`;
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= this.ax.min && x <= this.ax.max && y >= this.ay.min && y <= this.ay.max && z >= this.az.min && z <= this.az.max;
  }

  protected interpolate(x: number, y: number, z: number, out: Float64Array): void {
    const [i, fx] = locate(this.ax, x), [j, fy] = locate(this.ay, y), [k, fz] = locate(this.az, z);
    const ny = this.ay.n, nz = this.az.n, d = this.data;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let di = 0; di < 2; di++)
        for (let dj = 0; dj < 2; dj++)
          for (let dk = 0; dk < 2; dk++) {
            const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
            if (w !== 0) acc += w * d[(((i + di) * ny + (j + dj)) * nz + (k + dk)) * 3 + c]!;
          }
      out[c] = acc;
    }
  }

  /** Tabulates any field on a Cartesian grid. */
  static fromField(field: MagneticField, ax: Axis, ay: Axis, az: Axis, outside: OutsidePolicy = { kind: 'zero' }): GridFieldMap3D {
    const data = new Float32Array(ax.n * ay.n * az.n * 3);
    const o = new Float64Array(3);
    const v = (a: Axis, i: number) => a.min + ((a.max - a.min) * i) / (a.n - 1);
    for (let i = 0; i < ax.n; i++)
      for (let j = 0; j < ay.n; j++)
        for (let k = 0; k < az.n; k++) {
          field.fieldAt(v(ax, i), v(ay, j), v(az, k), o);
          if (!Number.isFinite(o[0]!) || !Number.isFinite(o[1]!) || !Number.isFinite(o[2]!)) throw new RangeError(`${field.id}: non-finite field at grid node (${i}, ${j}, ${k})`);
          data.set(o, ((i * ay.n + j) * az.n + k) * 3);
        }
    return new GridFieldMap3D(`${field.id}-grid3d`, `${field.label} (3D map)`, ax, ay, az, data, outside);
  }
}

export class AxisymmetricFieldMap extends FieldMapBase {
  readonly description: string;
  /** Interleaved (Br, Bz), index (ir·nz + iz)·2. z axis covers [z.min, z.max] (or |z| when mirrored). */
  constructor(
    readonly id: string,
    readonly label: string,
    readonly ar: Axis,
    readonly az: Axis,
    readonly data: Float32Array | Float64Array,
    readonly mirrorZ: boolean,
    outside: OutsidePolicy = { kind: 'zero' },
  ) {
    super(outside);
    if (data.length !== ar.n * az.n * 2) throw new RangeError('AxisymmetricFieldMap: data size does not match the axes');
    if (ar.min !== 0) throw new RangeError('AxisymmetricFieldMap: r axis must start at 0');
    this.description = `(r, z) map ${ar.n}×${az.n}${mirrorZ ? ' (z-mirrored)' : ''}, bilinear interpolation; outside: ${outside.kind}.`;
  }

  contains(x: number, y: number, z: number): boolean {
    const r = Math.hypot(x, y);
    const zz = this.mirrorZ ? Math.abs(z) : z;
    return r <= this.ar.max && zz >= this.az.min && zz <= this.az.max;
  }

  protected interpolate(x: number, y: number, z: number, out: Float64Array): void {
    const r = Math.hypot(x, y);
    const flip = this.mirrorZ && z < 0;
    const zz = flip ? -z : z;
    const [i, fr] = locate(this.ar, r), [k, fz] = locate(this.az, zz);
    const nz = this.az.n, d = this.data;
    const at = (ii: number, kk: number, c: number) => d[(ii * nz + kk) * 2 + c]!;
    const bi = (c: number) => (1 - fr) * ((1 - fz) * at(i, k, c) + fz * at(i, k + 1, c)) + fr * ((1 - fz) * at(i + 1, k, c) + fz * at(i + 1, k + 1, c));
    let br = bi(0);
    const bz = bi(1);
    if (flip) br = -br; // Br is odd in z for a z-symmetric solenoid
    out[0] = r > 0 ? (br * x) / r : 0;
    out[1] = r > 0 ? (br * y) / r : 0;
    out[2] = bz;
  }

  /** Tabulates a field in the (r, z) half-plane at φ = 0 (the field must be axisymmetric). */
  static fromField(field: MagneticField, ar: Axis, az: Axis, mirrorZ: boolean, outside: OutsidePolicy = { kind: 'zero' }): AxisymmetricFieldMap {
    const data = new Float32Array(ar.n * az.n * 2);
    const o = new Float64Array(3);
    for (let i = 0; i < ar.n; i++)
      for (let k = 0; k < az.n; k++) {
        const r = ar.min + ((ar.max - ar.min) * i) / (ar.n - 1);
        const z = az.min + ((az.max - az.min) * k) / (az.n - 1);
        field.fieldAt(r, 0, z, o);
        // Ideal current sheets are singular exactly on their edge (r = a, z = ±L/2): sample a
        // point 1 mm inward instead so every node is finite.
        if (!Number.isFinite(o[0]!) || !Number.isFinite(o[2]!)) field.fieldAt(Math.max(r - 1e-3, 0), 0, z - Math.sign(z) * 1e-3, o);
        data[(i * az.n + k) * 2] = o[0]!;
        data[(i * az.n + k) * 2 + 1] = o[2]!;
      }
    return new AxisymmetricFieldMap(`${field.id}-rz`, `${field.label} (r–z map)`, ar, az, data, mirrorZ, outside);
  }
}

/** First matching region wins; otherwise the fallback. */
export class CompositeField implements MagneticField {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly description: string,
    private readonly parts: ReadonlyArray<{ readonly within: (r: number, z: number) => boolean; readonly field: MagneticField }>,
    private readonly fallback: MagneticField,
  ) {}

  fieldAt(x: number, y: number, z: number, out: Float64Array): void {
    const r = Math.hypot(x, y);
    for (const p of this.parts) if (p.within(r, z)) return p.field.fieldAt(x, y, z, out);
    this.fallback.fieldAt(x, y, z, out);
  }
}

/** B = field.sample(position) for any MagneticField. */
export function sampleField(field: MagneticField, p: Vec3): [number, number, number] {
  const o = new Float64Array(3);
  field.fieldAt(p.x, p.y, p.z, o);
  return [o[0]!, o[1]!, o[2]!];
}
