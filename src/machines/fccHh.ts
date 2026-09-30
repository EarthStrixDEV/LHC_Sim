import { FCC_HH } from '../physics/constants/acceleratorConstants';
import type { MachinePreset } from '../physics/accelerator/MachinePreset';
import { FCC_HH_DIPOLE } from '../physics/accelerator/MagnetModel';

/** Conceptual future collider. All figures are study-level and flagged VERIFY. */
export const FCC_HH_PRESET: MachinePreset = {
  id: 'fcc-hh',
  name: 'FCC-hh Concept',
  status: 'concept',
  description:
    'Future Circular Collider (hadron) — CONCEPT. ~91 km ring with ~14 T Nb₃Sn dipoles, ~85 TeV centre-of-mass. Study parameters, subject to change.',
  protonBunches: {
    bunchesPerBeam: 10_400,
    particlesPerBunch: 1e11,
    geometricReductionFactor: 0.85,
    source: 'FCC-CDR (VERIFY)',
  },
  circumferenceM: FCC_HH.circumference.value,
  dipoleBendingRadiusM: FCC_HH.dipoleBendingRadius.value,
  nominalDipoleFieldT: FCC_HH.dipoleNominalField.value,
  dipoleFieldLimitT: FCC_HH.dipoleNominalField.value,
  dipoleMagnet: FCC_HH_DIPOLE,
  nominalTemperatureK: FCC_HH.nominalTemperature.value,
  rfVoltagePerBeamMV: FCC_HH.rfVoltagePerBeam.value,
  designEnergyPerBeamGeV: FCC_HH.designEnergyPerBeam.value,
  allowedSpecies: ['proton', 'Pb208', 'O16', 'Ne20', 'Xe129'],
  arcOptics: {
    cellLengthM: 213,
    phaseAdvanceDeg: 90,
    quadMagneticLengthM: 7,
    quadMaxGradientTPerM: 360,
    normalizedEmittanceM: FCC_HH.normalizedEmittance.value,
  },
  interactionRegion: {
    quadTechnology: 'Nb3Sn',
    quadGradientTPerM: 200,
    peakCoilFieldT: 12,
    apertureM: 0.164,
    betaStarM: FCC_HH.betaStar.value,
    note: 'Conceptual final-focus parameters — VERIFY.',
  },
  peakLuminosityCm2s: FCC_HH.peakLuminosity.value,
  luminosityLabel: 'Study peak luminosity (concept)',
  highlights: [
    'CONCEPT — not an approved or constructed machine',
    '~14 T Nb₃Sn dipoles in a ~91 km tunnel',
    'Synchrotron radiation from protons becomes a significant heat load (~MW scale)',
  ],
  enforceLimits: true,
  sources: ['FCC-hh CDR, EPJ ST 228 (2019) 755', 'FCC Feasibility Study (2025) — VERIFY'],
};
