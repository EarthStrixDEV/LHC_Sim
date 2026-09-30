/**
 * Jet cones — ANALYSIS OVERLAY. A jet is the output of the anti-kT algorithm; the cone
 * marks its catchment (ΔR < R) and is not a physical object.
 *
 * In (η, φ) the catchment is a disc of radius R. For small R it subtends a polar
 * half-angle ≈ R·sin θ = R / cosh η in both directions, so the 3D shape is ~circular.
 */
import { Color, ConeGeometry, DoubleSide, EdgesGeometry, Group, LineBasicNodeMaterial, LineSegments, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import type { RecoJet } from '../../physics/reconstruction/ReconstructedObject';
import { makeLabel } from '../scenes/SceneDomain';

/** Drawn cone length [m] (reaches the calorimeters) — presentation only. */
const CONE_LENGTH_M = 3.2;

export function buildJetCones(jets: ReadonlyArray<Pick<RecoJet, 'radius' | 'eta' | 'phi' | 'pt'>>, color: string, withLabels: boolean): Group {
  const g = new Group();
  g.name = 'jet-cones';
  const fill = new MeshBasicNodeMaterial({ color: new Color(color), transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false });
  const edge = new LineBasicNodeMaterial({ color: new Color(color), transparent: true, opacity: 0.6 });
  const yAxis = new Vector3(0, 1, 0);
  for (const j of jets) {
    const half = Math.atan(j.radius / Math.cosh(j.eta));
    const radius = CONE_LENGTH_M * Math.tan(half);
    const geo = new ConeGeometry(radius, CONE_LENGTH_M, 32, 1, true);
    // Apex at the origin: ConeGeometry apex is at +h/2 → flip and shift.
    geo.rotateX(Math.PI);
    geo.translate(0, CONE_LENGTH_M / 2, 0);
    const dir = new Vector3(Math.cos(j.phi), Math.sin(j.phi), Math.sinh(j.eta)).normalize();
    const q = new Quaternion().setFromUnitVectors(yAxis, dir);
    const cone = new Mesh(geo, fill);
    cone.quaternion.copy(q);
    const edges = new LineSegments(new EdgesGeometry(geo, 30), edge);
    edges.quaternion.copy(q);
    g.add(cone, edges);
    if (withLabels) {
      const l = makeLabel(`jet  pT ${j.pt.toFixed(1)} GeV`, 'ANALYSIS', 'lbl-jet');
      l.position.copy(dir.clone().multiplyScalar(CONE_LENGTH_M + 0.3));
      g.add(l);
    }
  }
  return g;
}
