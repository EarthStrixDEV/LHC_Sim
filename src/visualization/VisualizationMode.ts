/**
 * Visualization honesty modes. A pure policy table: what each mode may show, and which
 * epistemic category every visible element belongs to.
 */

export type VisMode = 'PHYSICAL' | 'DETECTOR' | 'AUGMENTED' | 'ANALYSIS' | 'CINEMATIC';

export type EpistemicCategory =
  | 'PHYSICALLY VISIBLE'
  | 'DETECTOR MEASUREMENT'
  | 'SIMULATION TRUTH'
  | 'RECONSTRUCTED DATA'
  | 'ANALYSIS OVERLAY'
  | 'CINEMATIC ENHANCEMENT';

export interface VisPolicy {
  readonly mode: VisMode;
  readonly description: string;
  /** Categories that may appear on screen in this mode. */
  readonly categories: readonly EpistemicCategory[];
  readonly showGeometry: boolean;
  readonly showStatusLights: boolean;
  readonly showBeam: boolean;
  readonly showBeamEnvelope: boolean;
  readonly showTruthTracks: boolean;
  readonly showNeutrinos: boolean;
  readonly showTrackerHits: boolean;
  readonly showCaloDeposits: boolean;
  readonly showMuonSegments: boolean;
  readonly showFieldOverlay: boolean;
  readonly showSynchrotronPhotons: boolean;
  readonly showParticleLabels: boolean;
  readonly showRecoTracks: boolean;
  readonly showRecoObjects: boolean;
  readonly showJetCones: boolean;
  readonly showMET: boolean;
  readonly showInvariantMass: boolean;
  readonly showDecayTree: boolean;
  /** Visual exaggeration allowed (must be labelled). */
  readonly amplifiedEffects: boolean;
  /** Bloom multiplier (0 = off). Still gated by the quality preset. */
  readonly bloomScale: number;
  /** Detector geometry opacity in the event view (physics objects must dominate). */
  readonly geometryOpacity: number;
}

const NONE = {
  showBeam: false, showBeamEnvelope: false, showTruthTracks: false, showNeutrinos: false, showTrackerHits: false,
  showCaloDeposits: false, showMuonSegments: false, showFieldOverlay: false, showSynchrotronPhotons: false,
  showParticleLabels: false, showRecoTracks: false, showRecoObjects: false, showJetCones: false, showMET: false,
  showInvariantMass: false, showDecayTree: false, amplifiedEffects: false,
} as const;

export const VIS_POLICIES: Record<VisMode, VisPolicy> = {
  PHYSICAL: {
    ...NONE,
    mode: 'PHYSICAL',
    description: 'What a human observer could physically see: tunnel, equipment, detector, status lights. Beams and particle tracks are invisible to the eye.',
    categories: ['PHYSICALLY VISIBLE'],
    showGeometry: true,
    showStatusLights: true,
    bloomScale: 0,
    geometryOpacity: 1,
  },
  DETECTOR: {
    ...NONE,
    mode: 'DETECTOR',
    description: 'What the detector records: tracker hits, calorimeter energy deposits, muon-chamber segments.',
    categories: ['PHYSICALLY VISIBLE', 'DETECTOR MEASUREMENT'],
    showGeometry: true,
    showStatusLights: true,
    showTrackerHits: true,
    showCaloDeposits: true,
    showMuonSegments: true,
    bloomScale: 0,
    geometryOpacity: 0.1,
  },
  AUGMENTED: {
    ...NONE,
    mode: 'AUGMENTED',
    description: 'Invisible quantities made visible: simulated trajectories, magnetic fields, beam envelopes, (amplified) synchrotron photons, particle labels.',
    categories: ['PHYSICALLY VISIBLE', 'DETECTOR MEASUREMENT', 'SIMULATION TRUTH'],
    showGeometry: true,
    showStatusLights: true,
    showBeam: true,
    showBeamEnvelope: true,
    showTruthTracks: true,
    showNeutrinos: true,
    showTrackerHits: true,
    showCaloDeposits: true,
    showMuonSegments: true,
    showFieldOverlay: true,
    showSynchrotronPhotons: true,
    showParticleLabels: true,
    amplifiedEffects: true,
    bloomScale: 0.3,
    geometryOpacity: 0.06,
  },
  ANALYSIS: {
    ...NONE,
    mode: 'ANALYSIS',
    description: 'Reconstructed objects and analysis constructs: reconstructed tracks, e/μ/γ, jet cones, MET arrow, invariant masses, decay tree.',
    categories: ['PHYSICALLY VISIBLE', 'DETECTOR MEASUREMENT', 'RECONSTRUCTED DATA', 'ANALYSIS OVERLAY'],
    showGeometry: true,
    showStatusLights: false,
    showCaloDeposits: true,
    showMuonSegments: true,
    showRecoTracks: true,
    showRecoObjects: true,
    showJetCones: true,
    showMET: true,
    showInvariantMass: true,
    showDecayTree: true,
    showParticleLabels: true,
    bloomScale: 0,
    geometryOpacity: 0.06,
  },
  CINEMATIC: {
    ...NONE,
    mode: 'CINEMATIC',
    description: 'Presentation mode: stronger bloom, enhanced readability, amplified effects. Everything beyond PHYSICAL is enhanced visualization.',
    categories: ['PHYSICALLY VISIBLE', 'DETECTOR MEASUREMENT', 'SIMULATION TRUTH', 'CINEMATIC ENHANCEMENT'],
    showGeometry: true,
    showStatusLights: true,
    showBeam: true,
    showBeamEnvelope: true,
    showTruthTracks: true,
    showTrackerHits: true,
    showCaloDeposits: true,
    showMuonSegments: true,
    showSynchrotronPhotons: true,
    amplifiedEffects: true,
    bloomScale: 1,
    geometryOpacity: 0.08,
  },
};

export const VIS_MODES: readonly VisMode[] = ['PHYSICAL', 'DETECTOR', 'AUGMENTED', 'ANALYSIS', 'CINEMATIC'];

export function policyFor(mode: VisMode): VisPolicy {
  return VIS_POLICIES[mode];
}

/**
 * Which trajectories an honesty mode may draw for an event.
 *  - 'truth' source (simulation): truth trajectories where SIMULATION TRUTH is allowed; in
 *    reconstruction-only modes, only the trajectories matched to reconstructed tracks.
 *  - 'reco' source (recorded data or reco-level samples): trajectories are RECONSTRUCTED DATA
 *    and are drawn only where reconstructed objects are allowed — never as simulation truth.
 */
export function trajectoryVisibility(pol: VisPolicy, source: 'truth' | 'reco'): 'all' | 'reco-matched' | 'none' {
  if (source === 'reco') return pol.showRecoTracks ? 'all' : 'none';
  if (pol.showTruthTracks) return 'all';
  return pol.showRecoTracks ? 'reco-matched' : 'none';
}
