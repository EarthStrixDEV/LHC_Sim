/**
 * Beam envelope inside the arc apertures — AUGMENTED. The σx(s), σy(s) profile comes
 * from the physics FODO model (BeamEnvelope); only the transverse scale is exaggerated
 * (stated in the label). Longitudinal positions are true.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import type { EnvelopeSamples } from '../../physics/beam/BeamEnvelope';

export interface ArcFrame {
  /** Position of the magnet axis at arc length s (writes into out). */
  point(s: number, out: { x: number; y: number; z: number }): void;
  /** Horizontal (lateral, toward ring centre) unit vector at s. */
  lateral(s: number, out: { x: number; y: number; z: number }): void;
}

/** Target displayed half-size of the largest σ [m] (well inside the ~22 mm beam screen). */
const DISPLAY_MAX_HALF_SIZE_M = 0.018;
const RING_SEGMENTS = 14;

export function envelopeExaggeration(env: EnvelopeSamples): number {
  let m = 0;
  for (let i = 0; i < env.sigmaX.length; i++) m = Math.max(m, env.sigmaX[i]!, env.sigmaY[i]!);
  return m > 0 && Number.isFinite(m) ? DISPLAY_MAX_HALF_SIZE_M / m : 0;
}

/**
 * Builds an elliptical tube following the reference orbit of one aperture across `nCells`
 * periodic cells. `swapPlanes` mirrors the optics for the counter-rotating beam (its F/D
 * pattern is interchanged at the same location in the twin-aperture magnets).
 */
export function buildEnvelopeTube(env: EnvelopeSamples, frame: ArcFrame, cellLength: number, nCells: number, lateralOffset: number, exaggeration: number, color: string, swapPlanes: boolean): Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  const P = { x: 0, y: 0, z: 0 }, L = { x: 0, y: 0, z: 0 };
  const n = env.s.length;
  let row = 0;
  for (let c = 0; c < nCells; c++) {
    for (let i = c === 0 ? 0 : 1; i < n; i++) {
      const s = c * cellLength + env.s[i]!;
      frame.point(s, P);
      frame.lateral(s, L);
      const sx = (swapPlanes ? env.sigmaY[i]! : env.sigmaX[i]!) * exaggeration;
      const sy = (swapPlanes ? env.sigmaX[i]! : env.sigmaY[i]!) * exaggeration;
      const cx = P.x + L.x * lateralOffset, cy = P.y, cz = P.z + L.z * lateralOffset;
      for (let k = 0; k < RING_SEGMENTS; k++) {
        const a = (k / RING_SEGMENTS) * Math.PI * 2;
        const h = Math.cos(a) * sx, v = Math.sin(a) * sy;
        pos.push(cx + L.x * h, cy + v, cz + L.z * h);
      }
      if (row > 0) {
        const b = (row - 1) * RING_SEGMENTS, t = row * RING_SEGMENTS;
        for (let k = 0; k < RING_SEGMENTS; k++) {
          const k1 = (k + 1) % RING_SEGMENTS;
          idx.push(b + k, t + k, b + k1, b + k1, t + k, t + k1);
        }
      }
      row++;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new MeshBasicNodeMaterial({ color: new Color(color), transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false });
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}
