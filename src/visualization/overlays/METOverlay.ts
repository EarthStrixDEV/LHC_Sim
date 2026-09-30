/**
 * Missing transverse momentum — ANALYSIS OVERLAY arrow in the transverse plane.
 * Represents an inferred imbalance, not a particle; drawn at z = 0 from the beam axis.
 */
import { Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import type { RecoMET } from '../../physics/reconstruction/ReconstructedObject';
import { makeLabel } from '../scenes/SceneDomain';

/** Arrow length [m] per GeV (presentation scale), capped. */
const M_PER_GEV = 0.05;
const MAX_LENGTH_M = 7;

export function buildMETArrow(met: RecoMET, color: string): Group {
  const g = new Group();
  g.name = 'met';
  if (met.met < 1) return g;
  const L = Math.min(MAX_LENGTH_M, 0.8 + met.met * M_PER_GEV);
  const mat = new MeshBasicNodeMaterial({ color: new Color(color), transparent: true, opacity: 0.9 });
  const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, L * 0.85, 12), mat);
  shaft.position.y = (L * 0.85) / 2;
  const head = new Mesh(new ConeGeometry(0.14, L * 0.15, 16), mat);
  head.position.y = L * 0.85 + (L * 0.15) / 2;
  const arrow = new Group();
  arrow.add(shaft, head);
  // Arrow built along +y; rotate about z so +y points along φ_MET.
  arrow.rotation.z = met.phi - Math.PI / 2;
  g.add(arrow);
  const label = makeLabel(`E_T^miss = ${met.met.toFixed(1)} GeV (inferred)`, 'ANALYSIS', 'lbl-met');
  label.position.copy(new Vector3(Math.cos(met.phi), Math.sin(met.phi), 0).multiplyScalar(L + 0.4));
  g.add(label);
  return g;
}
