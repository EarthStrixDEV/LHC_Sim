/**
 * Tracker hits and muon-chamber segments (DETECTOR MEASUREMENT) as GPU instances with
 * time-of-flight reveal.
 */
import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three/webgpu';
import { float, instancedBufferAttribute, step, uniform } from 'three/tsl';
import type { MuonHit, TrackerHits } from '../../physics/detector/DetectorHit';
import { PALETTES, type PaletteId } from '../colors/PhysicsPalette';

/** Display sizes [m] per tracker subsystem code (pixel, strip, TRT) — presentation only. */
const HIT_SIZE_M = [0.006, 0.008, 0.011, 0.012];
const SEGMENT_LENGTH_M = 0.6;
const SEGMENT_WIDTH_M = 0.07;

export class HitRenderer {
  readonly group = new Group();
  readonly time = uniform(1e9);
  count = 0;

  build(hits: TrackerHits, muonHits: readonly MuonHit[], palette: PaletteId, showTracker: boolean, showMuon: boolean): void {
    this.dispose();
    const pal = PALETTES[palette];
    this.count = 0;
    const m4 = new Matrix4();
    const q = new Quaternion();
    const v = new Vector3();
    const s = new Vector3();

    if (showTracker && hits.count > 0) {
      const mesh = new InstancedMesh(new OctahedronGeometry(1, 0), this.material(), hits.count);
      const times = new Float32Array(hits.count);
      const c = new Color(pal.subsystem.tracker);
      const cTrt = new Color(pal.subsystem.tracker).multiplyScalar(0.7);
      for (let i = 0; i < hits.count; i++) {
        const size = HIT_SIZE_M[hits.subsystems[i]!] ?? 0.008;
        m4.compose(v.set(hits.positions[3 * i]!, hits.positions[3 * i + 1]!, hits.positions[3 * i + 2]!), q.identity(), s.setScalar(size));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, hits.subsystems[i] === 2 ? cTrt : c);
        times[i] = hits.times[i]!;
      }
      this.attachTime(mesh, times);
      this.group.add(mesh);
      this.count += hits.count;
    }

    if (showMuon && muonHits.length > 0) {
      const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material(), muonHits.length);
      const times = new Float32Array(muonHits.length);
      const c = new Color(pal.subsystem['muon-system']);
      const zAxis = new Vector3(0, 0, 1);
      muonHits.forEach((h, i) => {
        q.setFromUnitVectors(zAxis, v.set(h.dx, h.dy, h.dz).normalize());
        m4.compose(new Vector3(h.x, h.y, h.z), q, s.set(SEGMENT_WIDTH_M, SEGMENT_WIDTH_M, SEGMENT_LENGTH_M));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c);
        times[i] = h.t;
      });
      this.attachTime(mesh, times);
      this.group.add(mesh);
      this.count += muonHits.length;
    }
  }

  private material(): MeshBasicNodeMaterial {
    const m = new MeshBasicNodeMaterial({ color: 0xffffff, transparent: true });
    return m;
  }

  private attachTime(mesh: InstancedMesh, times: Float32Array): void {
    const attr = new InstancedBufferAttribute(times, 1);
    const mat = mesh.material as MeshBasicNodeMaterial;
    mat.opacityNode = step(instancedBufferAttribute(attr), this.time).mul(float(0.95));
    mat.alphaTest = 0.01;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
  }

  dispose(): void {
    for (const c of this.group.children) {
      const m = c as InstancedMesh;
      m.geometry.dispose();
      (m.material as MeshBasicNodeMaterial).dispose();
      m.dispose();
    }
    this.group.clear();
  }
}
