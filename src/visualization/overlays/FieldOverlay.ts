/**
 * Magnetic-field overlay — AUGMENTED visualization sampled directly from the physics
 * MagneticField model (no separate "visual" field). Arrow direction = B̂, color = |B|
 * (Viridis, linear 0–4 T), length ∝ √|B| for legibility.
 */
import { Color, ConeGeometry, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import type { MagneticField } from '../../physics/propagation/MagneticField';
import { sampleColormap, type RGB } from '../colors/Colormaps';

export const FIELD_COLOR_MAX_T = 4;

export function buildFieldArrows(field: MagneticField, extent: { r: number; z: number }, spacing: number): InstancedMesh | null {
  const pts: Array<[number, number, number]> = [];
  // Sample the x–z half-planes at φ = 0 and φ = π/2 (field lines of both solenoid and toroid visible).
  for (let z = -extent.z; z <= extent.z + 1e-9; z += spacing) {
    for (let r = spacing / 2; r <= extent.r; r += spacing) {
      pts.push([r, 0, z], [0, r, z]);
    }
  }
  const B = new Float64Array(3);
  const keep: Array<{ p: [number, number, number]; b: [number, number, number]; mag: number }> = [];
  for (const p of pts) {
    field.fieldAt(p[0], p[1], p[2], B);
    const mag = Math.hypot(B[0]!, B[1]!, B[2]!);
    if (mag > 1e-3) keep.push({ p, b: [B[0]!, B[1]!, B[2]!], mag });
  }
  if (!keep.length) return null;
  const geo = new ConeGeometry(0.045, 1, 6);
  const mat = new MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  const mesh = new InstancedMesh(geo, mat, keep.length);
  const m4 = new Matrix4(), q = new Quaternion(), yAxis = new Vector3(0, 1, 0), dir = new Vector3(), s = new Vector3();
  const rgb: RGB = [0, 0, 0];
  const c = new Color();
  keep.forEach((k, i) => {
    dir.set(k.b[0], k.b[1], k.b[2]).normalize();
    q.setFromUnitVectors(yAxis, dir);
    const len = spacing * 0.45 * Math.sqrt(Math.min(k.mag, FIELD_COLOR_MAX_T) / FIELD_COLOR_MAX_T) + 0.08;
    m4.compose(new Vector3(...k.p), q, s.set(1, len, 1));
    mesh.setMatrixAt(i, m4);
    sampleColormap('viridis', k.mag / FIELD_COLOR_MAX_T, rgb);
    mesh.setColorAt(i, c.setRGB(rgb[0], rgb[1], rgb[2]));
  });
  mesh.name = 'field-overlay';
  mesh.frustumCulled = false;
  return mesh;
}
