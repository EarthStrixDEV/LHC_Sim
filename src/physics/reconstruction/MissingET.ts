/**
 * Missing transverse momentum — an INFERRED transverse-momentum imbalance, not a particle.
 *
 *   E_T^miss = −( Σ electrons + Σ photons + Σ muons + Σ jets + soft term )_T
 *
 * Soft term: primary-vertex tracks not associated with any selected object (track-based,
 * as in ATLAS TST MET). Longitudinal information is unknown at a hadron collider.
 */
import type { RecoBase, RecoMET, RecoTrack } from './ReconstructedObject';

export function computeMET(hardObjects: readonly RecoBase[], softTracks: readonly RecoTrack[]): RecoMET {
  let sx = 0, sy = 0, sumEt = 0;
  for (const o of hardObjects) {
    sx += o.p4[1];
    sy += o.p4[2];
    sumEt += o.pt;
  }
  let tx = 0, ty = 0;
  for (const t of softTracks) {
    tx += t.p4[1];
    ty += t.p4[2];
    sumEt += t.pt;
  }
  const mx = -(sx + tx);
  const my = -(sy + ty);
  const met = Math.hypot(mx, my);
  return {
    id: 'met',
    kind: 'met',
    p4: [met, mx, my, 0],
    pt: met,
    eta: 0,
    phi: met > 0 ? Math.atan2(my, mx) : 0,
    charge: 0,
    truthParticleId: null,
    met,
    sumEt,
    softTermPt: Math.hypot(tx, ty),
  };
}
