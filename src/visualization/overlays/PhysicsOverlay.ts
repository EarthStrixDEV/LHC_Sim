/**
 * Particle labels and invariant-mass annotations (CSS2D, category-tagged).
 */
import { Group, Vector3 } from 'three/webgpu';
import type { TrackRecord } from '../../physics/propagation/EventPropagation';
import { ParticleDatabase } from '../../physics/particles/ParticleDatabase';
import type { PairResult } from '../../physics/reconstruction/InvariantMass';
import type { ReconstructedEvent, RecoBase } from '../../physics/reconstruction/ReconstructedObject';
import { makeLabel } from '../scenes/SceneDomain';

/** Labels at the end of the most important truth trajectories. */
export function buildTrackLabels(tracks: readonly TrackRecord[], max: number): Group {
  const g = new Group();
  const chosen = tracks
    .filter((t) => (t.importance === 2 && t.kind !== 'neutrino') || (t.kind === 'neutrino' && t.pt > 5))
    .sort((a, b) => b.pt - a.pt)
    .slice(0, max);
  for (const t of chosen) {
    const n = t.samples.count - 1;
    const p = t.samples.positions;
    const sym = ParticleDatabase.lookup(t.pdgId).symbol;
    const l = makeLabel(`${sym}  ${t.pt.toFixed(1)} GeV`, t.kind === 'neutrino' ? 'TRUTH · undetected' : 'TRUTH', 'lbl-truth');
    l.position.set(p[3 * n]!, p[3 * n + 1]!, p[3 * n + 2]!);
    g.add(l);
  }
  return g;
}

function direction(o: RecoBase): Vector3 {
  return new Vector3(Math.cos(o.phi), Math.sin(o.phi), Math.sinh(o.eta)).normalize();
}

/** Labels for reconstructed leptons/photons and the selected pair's invariant mass. */
export function buildRecoLabels(reco: ReconstructedEvent, pair: PairResult | null): Group {
  const g = new Group();
  const objs: RecoBase[] = [...reco.electrons, ...reco.muons, ...reco.photons];
  const name: Record<string, string> = { electron: 'e', muon: 'μ', photon: 'γ' };
  for (const o of objs) {
    const sign = o.kind === 'photon' ? '' : o.charge > 0 ? '⁺' : '⁻';
    const l = makeLabel(`${name[o.kind]}${sign} reco  pT ${o.pt.toFixed(1)} GeV`, 'RECONSTRUCTED', 'lbl-reco');
    l.position.copy(direction(o).multiplyScalar(2.2));
    g.add(l);
  }
  if (pair) {
    const sym = pair.kind === 'muon' ? 'μμ' : pair.kind === 'electron' ? 'ee' : 'γγ';
    const a = objs.find((o) => o.id === pair.objectIds[0]);
    const b = objs.find((o) => o.id === pair.objectIds[1]);
    if (a && b) {
      const l = makeLabel(`m(${sym}) = ${pair.mass.toFixed(2)} GeV`, 'ANALYSIS', 'lbl-mass');
      l.position.copy(direction(a).add(direction(b)).normalize().multiplyScalar(1.4));
      g.add(l);
    }
  }
  return g;
}
