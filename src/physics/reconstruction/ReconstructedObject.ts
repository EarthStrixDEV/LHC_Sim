/**
 * Reconstructed objects (RECONSTRUCTED DATA). Plain serializable data so they can cross
 * the worker boundary; use `recoP4()` to obtain a FourVector.
 */
import { FourVector } from '../events/FourVector';

export type RecoKind = 'track' | 'electron' | 'muon' | 'photon' | 'jet' | 'met';

export interface RecoBase {
  readonly id: string;
  readonly kind: RecoKind;
  /** [E, px, py, pz] in GeV. */
  readonly p4: readonly [number, number, number, number];
  readonly pt: number;
  readonly eta: number;
  readonly phi: number;
  readonly charge: number;
  /** Truth particle matched for bookkeeping/inspection (not used by the algorithms' decisions). */
  readonly truthParticleId: number | null;
}

export interface RecoTrack extends RecoBase {
  readonly kind: 'track';
  readonly nHits: number;
  /** η, φ at the calorimeter face (for cluster matching). */
  readonly caloEta: number | null;
  readonly caloPhi: number | null;
  /** Associated to the primary vertex (vertex reconstruction is not modelled: truth association). */
  readonly fromPrimaryVertex: boolean;
}

export interface RecoElectron extends RecoBase {
  readonly kind: 'electron';
  readonly trackId: string;
  readonly clusterEnergy: number;
  readonly isolation: number;
}

export interface RecoMuon extends RecoBase {
  readonly kind: 'muon';
  readonly trackId: string;
  readonly stations: number;
  readonly isolation: number;
}

export interface RecoPhoton extends RecoBase {
  readonly kind: 'photon';
  readonly clusterEnergy: number;
  readonly isolation: number;
}

export interface RecoJet extends RecoBase {
  readonly kind: 'jet';
  /** Jet radius parameter R of the anti-kT algorithm. */
  readonly radius: number;
  readonly nConstituents: number;
  /** Pile-up / underlying-event subtraction applied (ρ·A) [GeV]. */
  readonly subtractedPt: number;
  readonly emFraction: number;
}

export interface RecoMET extends RecoBase {
  readonly kind: 'met';
  readonly met: number;
  readonly sumEt: number;
  readonly softTermPt: number;
  /** True when the source provides no MET: a placeholder that is never drawn or used. */
  readonly unavailable?: boolean;
}

export type RecoObject = RecoTrack | RecoElectron | RecoMuon | RecoPhoton | RecoJet | RecoMET;

export interface ReconstructedEvent {
  readonly tracks: readonly RecoTrack[];
  readonly electrons: readonly RecoElectron[];
  readonly muons: readonly RecoMuon[];
  readonly photons: readonly RecoPhoton[];
  readonly jets: readonly RecoJet[];
  readonly met: RecoMET;
}

export function recoP4(o: RecoBase): FourVector {
  return FourVector.fromArray(o.p4 as [number, number, number, number]);
}
