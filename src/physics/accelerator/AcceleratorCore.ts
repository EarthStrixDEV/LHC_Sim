/**
 * AcceleratorCore — pure function from a machine configuration to beam/magnet physics.
 * Independent of Three.js and of the UI.
 */
import { PROTON_MASS_GEV, SPEED_OF_LIGHT_M_PER_S } from '../constants/physicalConstants';
import type { BeamSpecies } from '../particles/ParticleDefinition';
import type { MachinePreset } from './MachinePreset';
import { evaluateMagnet, type MagnetOperatingPoint } from './MagnetModel';
import {
  bendingRadiusM,
  kinematicsFromMomentum,
  kinematicsFromTotalEnergy,
  magneticRigidityTm,
  maxMomentumGeV,
  requiredDipoleFieldT,
  type Kinematics,
} from './MagneticRigidity';
import { validateMachine, type Feasibility, type PhysicsWarning } from './MachineValidator';
import { synchrotronLoss, type SynchrotronResult } from './SynchrotronRadiation';

export type OperatingMode = 'physics' | 'sandbox';

export type EnergySpec =
  | { kind: 'totalEnergy'; valueGeV: number }
  | { kind: 'momentum'; valueGeV: number }
  /** Total energy per nucleon [GeV/u]; requires A ≥ 1. */
  | { kind: 'energyPerNucleon'; valueGeV: number };

export interface AcceleratorInput {
  readonly machine: MachinePreset;
  readonly species: BeamSpecies;
  readonly mode: OperatingMode;
  readonly energy: EnergySpec;
  /**
   * Dipole field applied by the user [T]. Physics mode ignores it (the field follows the
   * beam); Sandbox uses it as-is, even if it does not match the beam rigidity.
   */
  readonly dipoleFieldT?: number;
  /** Coil temperature [K]. Physics mode always uses the machine's nominal temperature. */
  readonly temperatureK?: number;
  readonly overrides?: {
    readonly bendingRadiusM?: number;
    readonly circumferenceM?: number;
    readonly rfVoltagePerBeamMV?: number;
  };
}

export interface AcceleratorState {
  readonly machine: MachinePreset;
  readonly species: BeamSpecies;
  readonly mode: OperatingMode;
  readonly chargeE: number;
  readonly massGeV: number;
  readonly kinematics: Kinematics;
  /** Magnetic rigidity Bρ [T·m]. */
  readonly rigidityTm: number;
  /** Field needed to keep this beam on the ring's design orbit [T]. */
  readonly requiredDipoleFieldT: number;
  /** Field actually applied [T] (= required in Physics mode). */
  readonly operatingDipoleFieldT: number;
  /** Radius of the ring's dipole bending [m]. */
  readonly ringBendingRadiusM: number;
  /** Radius of curvature of this beam in the operating field [m]. */
  readonly beamBendingRadiusM: number;
  readonly circumferenceM: number;
  readonly revolutionFrequencyHz: number;
  /** Total energy per nucleon [GeV]; null for leptons. */
  readonly energyPerNucleonGeV: number | null;
  readonly momentumPerNucleonGeV: number | null;
  /** √s for symmetric head-on collisions of two identical beams [GeV]. */
  readonly sqrtSGeV: number;
  /** √s_NN per nucleon–nucleon pair [GeV]; null for leptons. */
  readonly sqrtSNNGeV: number | null;
  /** Highest energy per particle reachable at the configured field limit [GeV]. */
  readonly maxEnergyAtFieldLimitGeV: number;
  readonly synchrotron: SynchrotronResult;
  readonly magnet: MagnetOperatingPoint;
  readonly temperatureK: number;
  readonly feasibility: Feasibility;
  readonly warnings: readonly PhysicsWarning[];
}

export function resolveKinematics(species: BeamSpecies, energy: EnergySpec): { kin: Kinematics; belowRest: boolean } {
  const m = species.massGeV;
  switch (energy.kind) {
    case 'momentum':
      return { kin: kinematicsFromMomentum(m, energy.valueGeV), belowRest: false };
    case 'totalEnergy':
      return { kin: kinematicsFromTotalEnergy(m, energy.valueGeV), belowRest: energy.valueGeV < m };
    case 'energyPerNucleon': {
      if (species.A < 1) throw new Error(`Energy per nucleon is undefined for ${species.label} (A = 0)`);
      const E = energy.valueGeV * species.A;
      return { kin: kinematicsFromTotalEnergy(m, E), belowRest: E < m };
    }
  }
}

export function computeAccelerator(input: AcceleratorInput): AcceleratorState {
  const { machine, species, mode } = input;
  const rho = input.overrides?.bendingRadiusM ?? machine.dipoleBendingRadiusM;
  const circumference = input.overrides?.circumferenceM ?? machine.circumferenceM;
  const effectiveMachine: MachinePreset =
    input.overrides?.rfVoltagePerBeamMV !== undefined
      ? { ...machine, rfVoltagePerBeamMV: input.overrides.rfVoltagePerBeamMV }
      : machine;

  const { kin, belowRest } = resolveKinematics(species, input.energy);
  const rigidity = magneticRigidityTm(kin.momentumGeV, species.chargeE);
  const requiredB = requiredDipoleFieldT(rigidity, rho);

  const operatingB =
    mode === 'physics' || input.dipoleFieldT === undefined ? requiredB : input.dipoleFieldT;
  const temperatureK =
    mode === 'physics' || input.temperatureK === undefined ? machine.nominalTemperatureK : input.temperatureK;

  const beamRadius = bendingRadiusM(rigidity, operatingB);
  const revolutionFrequencyHz = (kin.beta * SPEED_OF_LIGHT_M_PER_S) / circumference;

  // Radiation is emitted in the dipoles, where the beam's actual curvature radius applies.
  const radiatingRadius = Number.isFinite(beamRadius) ? beamRadius : rho;
  const synchrotron = synchrotronLoss({
    chargeE: species.chargeE,
    gamma: kin.gamma,
    beta: kin.beta,
    totalEnergyGeV: kin.totalEnergyGeV,
    bendingRadiusM: radiatingRadius,
    circumferenceM: circumference,
  });

  const magnet = evaluateMagnet(machine.dipoleMagnet, Number.isFinite(operatingB) ? operatingB : 0, temperatureK);

  const A = species.A;
  const energyPerNucleon = A >= 1 ? kin.totalEnergyGeV / A : null;
  const momentumPerNucleon = A >= 1 ? kin.momentumGeV / A : null;

  const pMax = maxMomentumGeV(machine.dipoleFieldLimitT, rho, species.chargeE);
  const maxE = kinematicsFromMomentum(species.massGeV, pMax).totalEnergyGeV;

  const { warnings, feasibility } = validateMachine({
    machine: effectiveMachine,
    species,
    mode,
    requestedEnergyBelowRest: belowRest,
    rigidityTm: rigidity,
    ringBendingRadiusM: rho,
    operatingFieldT: Number.isFinite(operatingB) ? Math.abs(operatingB) : 0,
    requiredFieldT: requiredB,
    totalEnergyGeV: kin.totalEnergyGeV,
    gamma: kin.gamma,
    revolutionFrequencyHz,
    temperatureK,
    synchrotron,
    magnet,
  });

  return {
    machine: effectiveMachine,
    species,
    mode,
    chargeE: species.chargeE,
    massGeV: species.massGeV,
    kinematics: kin,
    rigidityTm: rigidity,
    requiredDipoleFieldT: requiredB,
    operatingDipoleFieldT: operatingB,
    ringBendingRadiusM: rho,
    beamBendingRadiusM: beamRadius,
    circumferenceM: circumference,
    revolutionFrequencyHz,
    energyPerNucleonGeV: energyPerNucleon,
    momentumPerNucleonGeV: momentumPerNucleon,
    // Symmetric head-on collision of identical beams: s = (2E)² (crossing angle neglected).
    sqrtSGeV: 2 * kin.totalEnergyGeV,
    sqrtSNNGeV: energyPerNucleon !== null ? 2 * energyPerNucleon : null,
    maxEnergyAtFieldLimitGeV: maxE,
    synchrotron,
    magnet,
    temperatureK,
    feasibility,
    warnings,
  };
}

/**
 * Default beam momentum for a species: the rigidity of a design-energy proton beam,
 * i.e. |q/e| × p_proton ("proton-equivalent" energy scaling used for LHC ion runs).
 * Neutral species fall back to the proton momentum (they are rejected by the validator).
 */
export function designMomentumGeV(machine: MachinePreset, species: BeamSpecies): number {
  const pProton = kinematicsFromTotalEnergy(PROTON_MASS_GEV, machine.designEnergyPerBeamGeV).momentumGeV;
  return (Math.abs(species.chargeE) || 1) * pProton;
}
