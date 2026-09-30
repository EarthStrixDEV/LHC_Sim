/**
 * Track-fit comparison for one track (RECONSTRUCTED DATA over DETECTOR MEASUREMENT):
 *   initial estimate (3-hit seed)  — dashed grey helix
 *   fitted track                   — solid helix
 *   ±1σ in pT                      — faint helices bracketing the fit
 *   residuals                      — whiskers at each hit, magnified ×RESIDUAL_SCALE (stated)
 * Truth (AUGMENTED) and hits are drawn by the regular track / hit renderers.
 * Also: reconstructed vertices on the beam line and displaced vertices.
 */
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicNodeMaterial, LineDashedNodeMaterial, LineSegments, Mesh, MeshBasicNodeMaterial, OctahedronGeometry, CylinderGeometry } from 'three/webgpu';
import type { FittedTrack } from '../../physics/reconstruction/AdvancedReconstruction';
import type { Perigee } from '../../physics/fitting/KalmanTrackFit';
import type { DisplacedVertex, RecoVertex } from '../../physics/reconstruction/Vertexing';
import { makeLabel } from '../scenes/SceneDomain';

export const RESIDUAL_SCALE = 1000;

function helixPoints(p: Perigee, z0: number, cot: number, sMax: number, n = 120): number[] {
  const x0 = -p.d0 * Math.sin(p.phi0), y0 = p.d0 * Math.cos(p.phi0);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (sMax * i) / n;
    let x: number, y: number;
    if (Math.abs(p.rho) < 1e-9) {
      x = x0 + s * Math.cos(p.phi0);
      y = y0 + s * Math.sin(p.phi0);
    } else {
      x = x0 + (Math.sin(p.phi0 + p.rho * s) - Math.sin(p.phi0)) / p.rho;
      y = y0 - (Math.cos(p.phi0 + p.rho * s) - Math.cos(p.phi0)) / p.rho;
    }
    out.push(x, y, z0 + s * cot);
  }
  return out;
}

function line(points: number[], color: string, opacity = 1, dashed = false): Line {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  const l = dashed ? new Line(g, new LineDashedNodeMaterial({ color, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity })) : new Line(g, new LineBasicNodeMaterial({ color, transparent: opacity < 1, opacity }));
  if (dashed) l.computeLineDistances();
  return l;
}

export function buildTrackFitOverlay(f: FittedTrack, bz: number, colors: { fit: string; seed: string }): Group {
  const g = new Group();
  const lastHit = f.hits[f.hits.length - 1]!;
  const rMax = Math.hypot(lastHit[0], lastHit[1]);
  // Arc length to the outermost hit (+10 %).
  const sEnd = (p: Perigee) => {
    const ang = Math.abs(p.rho) > 1e-9 ? 2 * Math.asin(Math.min(1, (rMax * Math.abs(p.rho)) / 2)) / Math.abs(p.rho) : rMax;
    return ang * 1.1;
  };
  const fit = f.fit.fitted;
  g.add(line(helixPoints(f.fit.seed, f.fit.z0, f.fit.cotTheta, sEnd(f.fit.seed)), colors.seed, 0.9, true));
  g.add(line(helixPoints(fit, f.fit.z0, f.fit.cotTheta, sEnd(fit)), colors.fit));
  const relSig = f.fit.ptSigma / f.fit.ptFit;
  for (const k of [1 + relSig, 1 - relSig]) {
    if (k <= 0) continue;
    const pb: Perigee = { ...fit, rho: fit.rho / k };
    g.add(line(helixPoints(pb, f.fit.z0, f.fit.cotTheta, sEnd(pb)), colors.fit, 0.3));
  }
  // Residual whiskers (rφ), magnified.
  const w: number[] = [];
  f.hits.forEach((h, i) => {
    const r = Math.hypot(h[0], h[1]);
    const res = f.fit.residuals[i]!;
    if (!Number.isFinite(res) || r === 0) return;
    const ex = -h[1] / r, ey = h[0] / r;
    w.push(h[0], h[1], h[2], h[0] - ex * res * RESIDUAL_SCALE, h[1] - ey * res * RESIDUAL_SCALE, h[2]);
  });
  if (w.length) {
    const wg = new BufferGeometry();
    wg.setAttribute('position', new Float32BufferAttribute(w, 3));
    g.add(new LineSegments(wg, new LineBasicNodeMaterial({ color: '#f59e0b' })));
  }
  const l = makeLabel(
    `Fit: pT = ${f.fit.ptFit.toFixed(2)} ± ${f.fit.ptSigma.toFixed(2)} GeV (seed ${f.fit.ptSeed.toFixed(2)}, truth ${f.truthPt.toFixed(2)}) · χ²/ndf = ${(f.fit.chi2 / f.fit.ndf).toFixed(2)} · residuals ×${RESIDUAL_SCALE} · B = ${bz.toFixed(2)} T`,
    'RECONSTRUCTED · EDUCATIONAL KALMAN',
    'lbl-note',
  );
  l.position.set(lastHit[0], lastHit[1] + 0.25, lastHit[2]);
  g.add(l);
  return g;
}

export function buildVertexMarkers(vertices: readonly RecoVertex[], displaced: readonly DisplacedVertex[], colors: { pv: string; pu: string; sv: string }): Group {
  const g = new Group();
  const disc = new CylinderGeometry(0.02, 0.02, 0.004, 16);
  disc.rotateX(Math.PI / 2);
  for (const v of vertices) {
    const m = new Mesh(disc, new MeshBasicNodeMaterial({ color: v.isPrimary ? colors.pv : colors.pu }));
    m.position.set(0, 0, v.z);
    g.add(m);
  }
  const oct = new OctahedronGeometry(0.012, 0);
  for (const d of displaced) {
    const m = new Mesh(oct, new MeshBasicNodeMaterial({ color: colors.sv }));
    m.position.set(d.x, d.y, d.z);
    g.add(m);
    if (d.tag !== 'unidentified') {
      const l = makeLabel(`${d.tag === 'K0S' ? 'K⁰_S' : 'Λ'} candidate, r = ${(d.r * 100).toFixed(1)} cm`, 'RECONSTRUCTED', 'lbl-note');
      l.position.set(d.x, d.y + 0.05, d.z);
      g.add(l);
    }
  }
  const pv = vertices.find((v) => v.isPrimary);
  if (pv) {
    const l = makeLabel(`Reconstructed primary vertex z = ${(pv.z * 1000).toFixed(2)} mm · ${vertices.length - 1} other vertices`, 'RECONSTRUCTED', 'lbl-note');
    l.position.set(0, -0.15, pv.z);
    g.add(l);
  }
  return g;
}
