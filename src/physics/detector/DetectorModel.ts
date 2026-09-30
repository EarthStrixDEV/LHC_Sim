/**
 * Generic, renderer-independent detector description used by detector response,
 * reconstruction and (read-only) by the geometry renderer.
 *
 * All geometry is simplified cylinders/disks — educational, NOT engineering CAD.
 */
import type { MagneticField } from '../propagation/MagneticField';
import type { Integrator } from '../propagation/TrackPropagator';

export type Subsystem =
  | 'beampipe'
  | 'pixel'
  | 'strip'
  | 'trt'
  | 'solenoid'
  | 'ecal'
  | 'hcal'
  | 'toroid'
  | 'yoke'
  | 'muon'
  | 'tpc'
  | 'tof'
  | 'rich'
  | 'dipole'
  | 'absorber';

export interface TrackerLayer {
  readonly name: string;
  readonly subsystem: 'pixel' | 'strip' | 'trt' | 'tpc';
  readonly kind: 'barrel' | 'disk';
  /** Barrel: radius [m]; disk: inner radius. */
  readonly rMin: number;
  /** Barrel: radius [m]; disk: outer radius. */
  readonly rMax: number;
  /** Barrel: half-length |z| ≤ zHalf; disk: |z| position. */
  readonly z: number;
  /** Single-hit resolution in the bending plane [m]. */
  readonly resolutionM: number;
  readonly efficiency: number;
  /** Disks only: +1 = only at +z, −1 = only at −z, undefined = mirrored on both sides. */
  readonly side?: 1 | -1;
}

export interface CalorimeterSpec {
  readonly kind: 'ecal' | 'hcal';
  readonly name: string;
  readonly barrelRMin: number;
  readonly barrelRMax: number;
  readonly barrelZHalf: number;
  readonly endcapZMin: number;
  readonly endcapZMax: number;
  readonly endcapRMin: number;
  readonly endcapRMax: number;
  readonly etaMax: number;
  readonly cellDEta: number;
  readonly cellDPhi: number;
  /** σ_E/E = stochastic/√E ⊕ constant  (E in GeV). */
  readonly stochastic: number;
  readonly constant: number;
  /** Cells below this energy are dropped (noise suppression) [GeV]. */
  readonly cellThresholdGeV: number;
  /** Signed η acceptance (e.g. LHCb [2, 5]); default [−etaMax, etaMax]. */
  readonly etaRange?: readonly [number, number];
  /** false for experiments without this calorimeter (e.g. ALICE has no hadronic calorimeter). */
  readonly present?: boolean;
}

export interface MuonStation {
  readonly name: string;
  readonly kind: 'barrel' | 'endcap';
  /** Barrel: radius; endcap: inner radius [m]. */
  readonly rMin: number;
  readonly rMax: number;
  /** Barrel: half-length; endcap: |z| position [m]. */
  readonly z: number;
  readonly resolutionM: number;
  /** End-caps only: +1 / −1 restricts the station to one side (forward spectrometers). */
  readonly side?: 1 | -1;
}

/** Visual-only geometry element derived from the detector description. */
export interface GeometryElement {
  readonly name: string;
  readonly subsystem: Subsystem;
  readonly kind: 'shell' | 'disk' | 'toroid-coils' | 'chambers';
  readonly rMin: number;
  readonly rMax: number;
  readonly zMin: number;
  readonly zMax: number;
  /** Mirror to −z. */
  readonly symmetricZ: boolean;
  /** Toroid coil or chamber count around φ. */
  readonly count?: number;
}

export type ExperimentDetectorId = 'atlas' | 'cms' | 'alice' | 'lhcb';

/** Honest statement of how detailed each model is (shown in the UI). */
export interface Fidelity {
  readonly level: 'detailed educational' | 'upgraded educational' | 'simplified educational';
  readonly summary: string;
}

/** Particle-identification systems (educational parameterizations). */
export interface PidSystems {
  /** Specific ionization in a gas tracker (ALICE TPC). */
  readonly dEdx?: { readonly name: string; readonly relResolution: number; readonly rMin: number; readonly rMax: number };
  /** Time of flight at radius r (ALICE TOF). */
  readonly tof?: { readonly name: string; readonly radiusM: number; readonly zHalfM: number; readonly timeResolutionNs: number };
  /** Ring-imaging Cherenkov detectors (LHCb RICH1/RICH2): radiator index and z extent. */
  readonly rich?: readonly { readonly name: string; readonly radiator: string; readonly n: number; readonly zMin: number; readonly zMax: number; readonly angleResolutionRad: number }[];
}

export interface DetectorModel {
  readonly id: ExperimentDetectorId;
  readonly fidelity: Fidelity;
  readonly pid?: PidSystems;
  readonly name: string;
  readonly field: MagneticField;
  /** Integrator used to propagate through this field (default RK4). */
  readonly integrator?: Integrator;
  /** Outer envelope used to stop propagation [m]. */
  readonly envelope: { readonly rMax: number; readonly zMax: number };
  readonly trackerLayers: readonly TrackerLayer[];
  readonly trackerEtaMax: number;
  /** Outer tracker envelope [m]. */
  readonly trackerOuter: { readonly rMax: number; readonly zMax: number };
  readonly ecal: CalorimeterSpec;
  readonly hcal: CalorimeterSpec;
  readonly muonStations: readonly MuonStation[];
  readonly muonEtaMax: number;
  /** Tracker momentum resolution σ(pT)/pT = a·pT[GeV] ⊕ b. */
  readonly trackResolution: { readonly a: number; readonly b: number };
  /** Combined (tracker + muon system) muon momentum resolution. */
  readonly muonResolution: { readonly a: number; readonly b: number };
  readonly geometry: readonly GeometryElement[];
  readonly notes: readonly string[];
}

/** Resolution σ/x = √((a·x)² + b²). */
export function relResolution(res: { a: number; b: number }, x: number): number {
  return Math.hypot(res.a * x, res.b);
}

/** Calorimeter relative energy resolution σ/E = s/√E ⊕ c. */
export function caloResolution(spec: CalorimeterSpec, E: number): number {
  return Math.hypot(spec.stochastic / Math.sqrt(Math.max(E, 1e-6)), spec.constant);
}
