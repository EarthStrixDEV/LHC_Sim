/**
 * RICH Cherenkov cones (LHCb) — DETECTOR MEASUREMENT concept view.
 * For each measured track the cone of half-angle θ_c is drawn over the radiator length, ending
 * in the ring the photons would form. In the real detector mirrors image these rings onto
 * photodetector planes outside the acceptance; the ring radius ∝ θ_c encodes the velocity.
 */
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicNodeMaterial, LineSegments, Vector3 } from 'three/webgpu';
import type { PidMeasurement } from '../../detector/response/PID';
import type { DetectorModel } from '../../physics/detector/DetectorModel';
import { makeLabel } from '../scenes/SceneDomain';

const SEGMENTS = 48;

export function buildRichRings(pid: readonly PidMeasurement[], det: DetectorModel, color: string): Group {
  const g = new Group();
  const pos: number[] = [];
  const u = new Vector3(), v = new Vector3(), d = new Vector3(), c = new Vector3();
  let n = 0;
  for (const m of pid) {
    for (const r of m.rich ?? []) {
      if (r.angleRad === null) continue;
      const spec = det.pid?.rich?.find((x) => x.name === r.name);
      const L = spec ? (spec.zMax - spec.zMin) / 2 : 1;
      d.set(...r.dir);
      c.set(r.x, r.y, r.z).addScaledVector(d, L);
      u.set(0, 1, 0).cross(d).normalize();
      v.copy(d).cross(u).normalize();
      const rad = Math.tan(r.angleRad) * L;
      for (let k = 0; k < SEGMENTS; k++) {
        for (const kk of [k, k + 1]) {
          const a = (kk / SEGMENTS) * Math.PI * 2;
          pos.push(c.x + rad * (Math.cos(a) * u.x + Math.sin(a) * v.x), c.y + rad * (Math.cos(a) * u.y + Math.sin(a) * v.y), c.z + rad * (Math.cos(a) * u.z + Math.sin(a) * v.z));
        }
      }
      n++;
    }
  }
  if (n === 0) return g;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.add(new LineSegments(geo, new LineBasicNodeMaterial({ color })));
  const l = makeLabel(`${n} Cherenkov rings (concept view: in LHCb mirrors image the rings onto photodetectors)`, 'DETECTOR MEASUREMENT', 'lbl-note');
  l.position.set(0, 2.5, 10.5);
  g.add(l);
  return g;
}
