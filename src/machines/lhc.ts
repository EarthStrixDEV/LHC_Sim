import { LHC } from '../physics/constants/acceleratorConstants';
import type { MachinePreset } from '../physics/accelerator/MachinePreset';
import { LHC_MAIN_DIPOLE } from '../physics/accelerator/MagnetModel';

export const LHC_ARC_OPTICS = {
  cellLengthM: LHC.arcCellLength.value,
  phaseAdvanceDeg: LHC.arcCellPhaseAdvance.value,
  quadMagneticLengthM: LHC.quadMagneticLength.value,
  quadMaxGradientTPerM: LHC.quadGradient.value,
  normalizedEmittanceM: LHC.normalizedEmittance.value,
} as const;

export const LHC_PRESET: MachinePreset = {
  id: 'lhc',
  name: 'LHC',
  status: 'operational',
  description:
    'Large Hadron Collider: 26.7 km ring of Nb-Ti dipoles at 1.9 K. Design 7 TeV/beam at 8.33 T (Run 3 operates at 6.8 TeV).',
  protonBunches: {
    bunchesPerBeam: LHC.bunchesPerBeam.value,
    particlesPerBunch: LHC.protonsPerBunch.value,
    geometricReductionFactor: 0.84,
    source: 'LHC-DR',
  },
  circumferenceM: LHC.circumference.value,
  dipoleBendingRadiusM: LHC.dipoleBendingRadius.value,
  nominalDipoleFieldT: LHC.dipoleNominalField.value,
  dipoleFieldLimitT: LHC.dipoleNominalField.value,
  dipoleMagnet: LHC_MAIN_DIPOLE,
  nominalTemperatureK: LHC.nominalTemperature.value,
  rfVoltagePerBeamMV: LHC.rfVoltagePerBeam.value,
  designEnergyPerBeamGeV: LHC.designEnergyPerBeam.value,
  allowedSpecies: ['proton', 'Pb208', 'Xe129', 'O16', 'Ne20'],
  arcOptics: LHC_ARC_OPTICS,
  interactionRegion: {
    quadTechnology: 'NbTi',
    quadGradientTPerM: 205,
    peakCoilFieldT: 8.6,
    apertureM: 0.07,
    betaStarM: LHC.betaStar.value,
    note: 'Nb-Ti inner triplets (MQXA/MQXB), 70 mm aperture. Values approximate — VERIFY.',
  },
  peakLuminosityCm2s: LHC.peakLuminosity.value,
  luminosityLabel: 'Design peak luminosity',
  highlights: [
    '1232 Nb-Ti twin-aperture dipoles, 8.33 T design field at 1.9 K',
    'Proton and ion (Pb, Xe, O, Ne) operation',
  ],
  enforceLimits: true,
  sources: ['LHC Design Report Vol. I, CERN-2004-003'],
};
