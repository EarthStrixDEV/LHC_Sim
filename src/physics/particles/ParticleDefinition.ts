/**
 * Particle species definitions (independent of any event or rendering).
 */

export type ParticleCategory =
  | 'quark'
  | 'gluon'
  | 'charged-lepton'
  | 'neutrino'
  | 'photon'
  | 'gauge-boson'
  | 'higgs'
  | 'meson'
  | 'baryon'
  | 'nucleus';

/** Properties for a PDG code; for negative codes use ParticleDatabase.lookup(). */
export interface ParticleDefinition {
  readonly pdgId: number;
  readonly name: string;
  /** Symbol of the particle with this (positive) PDG code. */
  readonly symbol: string;
  /** Symbol of the antiparticle (negative PDG code); equals `symbol` if self-conjugate. */
  readonly antiSymbol: string;
  readonly massGeV: number;
  /** Electric charge in units of e for the positive PDG code. */
  readonly charge: number;
  readonly category: ParticleCategory;
  /**
   * True when the particle normally reaches the detector before decaying (cτ ≳ 1 m
   * at typical LHC boosts) — used by the toy generator and detector response.
   */
  readonly detectorStable: boolean;
}

/** Resolved properties for a signed PDG code. */
export interface ResolvedParticle {
  readonly pdgId: number;
  readonly name: string;
  readonly symbol: string;
  readonly massGeV: number;
  readonly charge: number;
  readonly category: ParticleCategory;
  readonly detectorStable: boolean;
}

/**
 * A species that could, in principle, be injected as a circulating beam.
 * `circulatable === false` species are never offered in the beam selector.
 */
export interface BeamSpecies {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly kind: 'lepton' | 'hadron' | 'ion' | 'neutral';
  readonly massGeV: number;
  /** Signed charge of the circulating particle in units of e (ions: fully stripped, +Z). */
  readonly chargeE: number;
  /** Atomic number (protons in the nucleus). 1 for p, 0 for leptons. */
  readonly Z: number;
  /** Mass number (nucleons). 1 for p, 0 for leptons. */
  readonly A: number;
  readonly pdgId: number;
  readonly circulatable: boolean;
  readonly notCirculatableReason?: string;
  /** Proper lifetime [s]; undefined = stable. */
  readonly properLifetimeS?: number;
  readonly source: string;
}
