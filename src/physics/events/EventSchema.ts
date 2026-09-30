/**
 * On-disk event-sample schema ("lhcsim-event-sample/1").
 *
 * Deliberately HepMC-like (particles + vertices with explicit parent/child links) so
 * that later phases can add converters from HepMC3, PYTHIA 8 records, or CERN Open Data
 * without changing the downstream pipeline.
 *
 * Units: momenta/energies/masses in GeV, positions in metres, times in ns.
 */

export const EVENT_SCHEMA_ID = 'lhcsim-event-sample/1';

/**
 * Particle status codes (simplified HepMC convention):
 *   1  final state — reaches the detector
 *   2  decayed or fragmented (has children)
 *   3  hard-process documentation (partons, bosons of the hard scatter)
 *   4  incoming beam particle
 */
export type ParticleStatus = 1 | 2 | 3 | 4;

/**
 * Origin category used for colouring / analysis:
 *   primary   — hard-scatter primary vertex
 *   pileup    — additional simultaneous pp interactions in the same bunch crossing
 *   secondary — decays of long-lived light hadrons (K⁰_S, Λ) inside the tracker volume
 *   displaced — heavy-flavour (b/c) decay vertices a few mm from the primary vertex
 */
export type VertexKind = 'primary' | 'pileup' | 'secondary' | 'displaced';

export interface VertexRecord {
  readonly id: number;
  readonly kind: VertexKind;
  /** Position [m]. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Time relative to the bunch crossing [ns]. */
  readonly t: number;
}

export interface ParticleRecord {
  readonly id: number;
  readonly pdg: number;
  readonly status: ParticleStatus;
  /** Electric charge [e]. */
  readonly charge: number;
  /** Four-momentum [E, px, py, pz] in GeV. */
  readonly p: readonly [number, number, number, number];
  /** Generated mass [GeV] (may differ from PDG for off-shell resonances). */
  readonly m: number;
  readonly prodVtx: number;
  readonly decayVtx: number | null;
  readonly parents: readonly number[];
  readonly children: readonly number[];
}

export interface EventRecord {
  readonly eventId: number;
  readonly process: string;
  readonly seed: number;
  readonly vertices: readonly VertexRecord[];
  readonly particles: readonly ParticleRecord[];
  /** Generator-level documentation, e.g. the true resonance mass for this event. */
  readonly truthInfo?: Readonly<Record<string, number>>;
}

export type CollisionSystem = 'pp' | 'PbPb';

export interface SampleMetadata {
  readonly id: string;
  readonly title: string;
  readonly process: string;
  readonly collisionSystem: CollisionSystem;
  /** √s (pp) or √s_NN (heavy ions) [GeV]. */
  readonly sqrtSGeV: number;
  /** Always true in Phase 1: every sample comes from the toy generator. */
  readonly synthetic: boolean;
  readonly generator: string;
  readonly description: string;
  readonly seed: number;
  /** Intended resonance mass for analysis samples [GeV], if any. */
  readonly intendedMassGeV?: number;
  /** Which final-state objects pair into the resonance. */
  readonly analysisPair?: 'muon' | 'electron' | 'photon';
  readonly notes: readonly string[];
}

export interface EventSampleFile {
  readonly schema: typeof EVENT_SCHEMA_ID;
  readonly sample: SampleMetadata;
  readonly events: readonly EventRecord[];
}
