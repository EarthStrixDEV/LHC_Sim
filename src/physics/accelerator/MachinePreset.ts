/**
 * Machine preset schema. Concrete presets live in src/machines/*.ts with source notes.
 */
import type { MagnetSpec, SuperconductorId } from './MagnetModel';

export type MachineId = 'lhc' | 'hl-lhc' | 'fcc-hh' | 'sandbox';
export type MachineStatus = 'operational' | 'upgrade' | 'concept' | 'sandbox';

export interface ArcOptics {
  /** Full FODO cell length [m] (QF → drift → QD → drift). */
  readonly cellLengthM: number;
  /** Design phase advance per cell [deg]. */
  readonly phaseAdvanceDeg: number;
  readonly quadMagneticLengthM: number;
  /** Maximum arc-quadrupole gradient [T/m]. */
  readonly quadMaxGradientTPerM: number;
  /** Normalized emittance εn [m·rad]. */
  readonly normalizedEmittanceM: number;
}

export interface InteractionRegion {
  readonly quadTechnology: SuperconductorId;
  readonly quadGradientTPerM: number;
  readonly peakCoilFieldT: number;
  readonly apertureM: number;
  /** β* at the high-luminosity IPs [m]. */
  readonly betaStarM: number;
  readonly note: string;
}

export interface BunchParameters {
  readonly bunchesPerBeam: number;
  readonly particlesPerBunch: number;
  /** Luminosity reduction from the crossing angle / hourglass (F ≤ 1). */
  readonly geometricReductionFactor: number;
  readonly source: string;
}

export interface MachinePreset {
  /** Nominal proton bunch parameters. */
  readonly protonBunches: BunchParameters;
  readonly id: MachineId;
  readonly name: string;
  readonly status: MachineStatus;
  readonly description: string;
  readonly circumferenceM: number;
  /** Bending radius inside the arc dipoles (not the geometric ring radius). */
  readonly dipoleBendingRadiusM: number;
  readonly nominalDipoleFieldT: number;
  /** Configured field limit for Physics mode. */
  readonly dipoleFieldLimitT: number;
  readonly dipoleMagnet: MagnetSpec;
  readonly nominalTemperatureK: number;
  readonly rfVoltagePerBeamMV: number;
  /** Design proton energy per beam [GeV]. */
  readonly designEnergyPerBeamGeV: number;
  /** Species ids the real machine is designed for; 'any' in Sandbox. */
  readonly allowedSpecies: readonly string[] | 'any';
  readonly arcOptics: ArcOptics;
  readonly interactionRegion: InteractionRegion;
  readonly peakLuminosityCm2s: number;
  readonly luminosityLabel: string;
  /** Short statements describing what distinguishes this machine (shown in the inspector). */
  readonly highlights: readonly string[];
  /** Physics mode enforces limits; Sandbox evaluates but never clamps. */
  readonly enforceLimits: boolean;
  readonly sources: readonly string[];
}

/** Geometric mean ring radius C / 2π (for schematic drawing only). */
export function geometricRadiusM(m: MachinePreset): number {
  return m.circumferenceM / (2 * Math.PI);
}
