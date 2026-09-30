/**
 * Invariant-mass analysis helpers. Masses are always computed from four-vectors:
 *     m₁₂² = (P₁ + P₂)²
 */
import { FourVector } from '../events/FourVector';
import { recoP4, type RecoBase, type ReconstructedEvent } from './ReconstructedObject';

export type PairKind = 'muon' | 'electron' | 'photon';

export interface PairResult {
  readonly kind: PairKind;
  readonly mass: number;
  readonly objectIds: readonly [string, string];
  readonly p4: FourVector;
}

export function pairMass(a: RecoBase, b: RecoBase): number {
  return recoP4(a).add(recoP4(b)).mass();
}

/**
 * Selects a candidate pair:
 *  - leptons: the opposite-charge pair with the largest scalar pT sum (leading pair);
 *  - photons: the two leading photons.
 * Returns null when fewer than two candidates exist.
 */
export function selectPair(reco: ReconstructedEvent, kind: PairKind): PairResult | null {
  const list: readonly RecoBase[] = kind === 'muon' ? reco.muons : kind === 'electron' ? reco.electrons : reco.photons;
  const sorted = [...list].sort((a, b) => b.pt - a.pt);
  let best: [RecoBase, RecoBase] | null = null;
  let bestSum = -1;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!, b = sorted[j]!;
      if (kind !== 'photon' && a.charge * b.charge >= 0) continue;
      const s = a.pt + b.pt;
      if (s > bestSum) {
        bestSum = s;
        best = [a, b];
      }
      if (kind === 'photon') break; // leading two
    }
    if (kind === 'photon' && best) break;
  }
  if (!best) return null;
  const p4 = recoP4(best[0]).add(recoP4(best[1]));
  return { kind, mass: p4.mass(), objectIds: [best[0].id, best[1].id], p4 };
}
