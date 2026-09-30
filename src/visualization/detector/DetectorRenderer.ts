/**
 * Builds simplified detector geometry from a DetectorModel description.
 * Coordinates: detector frame, beam axis = +z, metres. Pure geometry — no physics.
 */
import {
  BoxGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  LOD,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { DetectorModel, GeometryElement, Subsystem } from '../../physics/detector/DetectorModel';

export interface DetectorBuildOptions {
  readonly segments: number;
  /** Opacity of all geometry (event view keeps it low so physics dominates). */
  readonly opacity: number;
  /** Leave one quadrant open (cutaway). */
  readonly cutaway: boolean;
  /** Muted tint mixed into subsystem colors (palette geometry color). */
  readonly tint: string;
  readonly wireframe?: boolean;
}

/** Engineering-ish muted colors per subsystem (not physics semantics). */
const SUBSYSTEM_COLOR: Record<Subsystem, string> = {
  beampipe: '#b8c0c8',
  pixel: '#a9b4be',
  strip: '#8f9aa6',
  trt: '#7e8a96',
  solenoid: '#4c5560',
  ecal: '#6f8a86',
  hcal: '#8a6f55',
  toroid: '#aab1b8',
  yoke: '#7a3f3f',
  muon: '#5f7482',
  tpc: '#7c8b6f',
  tof: '#6f6f8a',
  rich: '#8a7f6a',
  dipole: '#8a4a3a',
  absorber: '#5a5a55',
};

/** Cutaway: open quadrant centred on +x/+y (towards the default camera). */
const CUT_PHI_START = Math.PI / 2;
const CUT_PHI_LENGTH = Math.PI * 1.5;

export function subsystemMaterial(sub: Subsystem, o: DetectorBuildOptions): MeshStandardMaterial {
  const c = new Color(SUBSYSTEM_COLOR[sub]).lerp(new Color(o.tint), 0.35);
  const m = new MeshStandardMaterial({
    color: c,
    roughness: sub === 'toroid' || sub === 'beampipe' ? 0.35 : 0.75,
    metalness: sub === 'toroid' || sub === 'beampipe' ? 0.7 : 0.25,
    side: DoubleSide,
    transparent: o.opacity < 1,
    opacity: o.opacity,
    depthWrite: o.opacity >= 1,
    wireframe: o.wireframe ?? false,
  });
  return m;
}

/** Thick cylindrical shell (r ∈ [rMin, rMax], z ∈ [zMin, zMax]) around the z axis. */
function shellGeometry(e: { rMin: number; rMax: number; zMin: number; zMax: number }, segments: number, cutaway: boolean): LatheGeometry {
  const pts = [
    new Vector2(e.rMin, e.zMin),
    new Vector2(e.rMax, e.zMin),
    new Vector2(e.rMax, e.zMax),
    new Vector2(e.rMin, e.zMax),
    new Vector2(e.rMin, e.zMin),
  ];
  const g = cutaway ? new LatheGeometry(pts, segments, CUT_PHI_START, CUT_PHI_LENGTH) : new LatheGeometry(pts, segments);
  // Lathe revolves around +y; rotate so the axis is +z.
  g.rotateX(Math.PI / 2);
  return g;
}

function racetrackCoil(rMin: number, rMax: number, zMin: number, zMax: number, thickness: number): ExtrudeGeometry {
  // Coil outline in the (r, z) plane with rounded corners and a hollow interior.
  const w = rMax - rMin, h = zMax - zMin, rad = Math.min(w, h) * 0.25, t = Math.min(w, h) * 0.12;
  const s = roundedRect(rMin, zMin, w, h, rad);
  s.holes.push(roundedRect(rMin + t, zMin + t, w - 2 * t, h - 2 * t, Math.max(rad - t, 0.05)));
  const g = new ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -thickness / 2);
  // Shape lies in XY (x = r, y = z) with depth along Z; map to detector frame: x = r, z = z, y = thickness.
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, -1);
  return g;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function inCut(phi: number, cutaway: boolean): boolean {
  if (!cutaway) return false;
  let p = phi % (2 * Math.PI);
  if (p < 0) p += 2 * Math.PI;
  return p < CUT_PHI_START; // the open quadrant [0, π/2)
}

function buildElement(e: GeometryElement, o: DetectorBuildOptions, mat: Material): Object3D {
  const g = new Group();
  g.name = e.name;
  const zRanges: Array<[number, number]> = e.symmetricZ ? [[e.zMin, e.zMax], [-e.zMax, -e.zMin]] : [[e.zMin, e.zMax]];

  if (e.kind === 'shell' || e.kind === 'disk') {
    for (const [z0, z1] of zRanges) g.add(new Mesh(shellGeometry({ rMin: e.rMin, rMax: e.rMax, zMin: z0, zMax: z1 }, o.segments, o.cutaway), mat));
    return g;
  }

  const n = e.count ?? 8;
  const m4 = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 0, 1);
  if (e.kind === 'toroid-coils') {
    for (const [z0, z1] of zRanges) {
      const coil = racetrackCoil(e.rMin, e.rMax, z0, z1, e.rMax > 6 ? 0.9 : 0.5);
      const phis = Array.from({ length: n }, (_, k) => (k + 0.5) * ((2 * Math.PI) / n)).filter((p) => !inCut(p, o.cutaway));
      const im = new InstancedMesh(coil, mat, phis.length);
      phis.forEach((phi, k) => {
        q.setFromAxisAngle(up, phi);
        m4.makeRotationFromQuaternion(q);
        im.setMatrixAt(k, m4);
      });
      g.add(im);
    }
    return g;
  }

  // chambers: boxes around φ
  const box = new BoxGeometry(1, 1, 1);
  const phis = Array.from({ length: n }, (_, k) => (k + 0.5) * ((2 * Math.PI) / n)).filter((p) => !inCut(p, o.cutaway));
  for (const [z0, z1] of zRanges) {
    const im = new InstancedMesh(box, mat, phis.length);
    const barrel = Math.abs(z1 - z0) > 1;
    const r = barrel ? (e.rMin + e.rMax) / 2 : (e.rMin + e.rMax) / 2;
    const scale = barrel
      ? new Vector3(e.rMax - e.rMin, ((2 * Math.PI * r) / n) * 0.8, z1 - z0)
      : new Vector3(e.rMax - e.rMin, ((2 * Math.PI * (r + e.rMax) / 2) / n) * 0.85, z1 - z0);
    phis.forEach((phi, k) => {
      q.setFromAxisAngle(up, phi);
      m4.compose(new Vector3(r * Math.cos(phi), r * Math.sin(phi), (z0 + z1) / 2), q, scale);
      im.setMatrixAt(k, m4);
    });
    g.add(im);
  }
  return g;
}

/** Full detector group; `lod` adds a coarse level for distant viewing. */
export function buildDetector(model: DetectorModel, o: DetectorBuildOptions, lod = false): Group {
  const root = new Group();
  root.name = model.name;
  const mats = new Map<Subsystem, Material>();
  const matFor = (s: Subsystem) => {
    let m = mats.get(s);
    if (!m) {
      m = subsystemMaterial(s, o);
      mats.set(s, m);
    }
    return m;
  };
  for (const e of model.geometry) {
    const hi = buildElement(e, o, matFor(e.subsystem));
    hi.userData.subsystem = e.subsystem;
    if (!lod) {
      root.add(hi);
      continue;
    }
    const l = new LOD();
    l.addLevel(hi, 0);
    l.addLevel(buildElement(e, { ...o, segments: Math.max(12, Math.floor(o.segments / 4)) }, matFor(e.subsystem)), 60);
    l.name = e.name;
    l.userData.subsystem = e.subsystem;
    root.add(l);
  }
  return root;
}
