import { HL_LHC } from '../physics/constants/acceleratorConstants';
import type { MachinePreset } from '../physics/accelerator/MachinePreset';
import { LHC_PRESET } from './lhc';

/**
 * HL-LHC is NOT an "11 T LHC". The arc dipoles — and therefore the maximum beam
 * energy — are those of the LHC. The upgrade is concentrated in the interaction regions:
 * Nb3Sn inner-triplet quadrupoles with larger aperture give much smaller β*, which,
 * with crab cavities and brighter beams, raises (levelled) luminosity ~5×.
 */
export const HL_LHC_PRESET: MachinePreset = {
  ...LHC_PRESET,
  id: 'hl-lhc',
  name: 'HL-LHC',
  status: 'upgrade',
  description:
    'High-Luminosity LHC: same 8.33 T Nb-Ti arc dipoles and ~7 TeV/beam; upgraded interaction regions with Nb₃Sn final-focus quadrupoles.',
  designEnergyPerBeamGeV: HL_LHC.designEnergyPerBeam.value,
  protonBunches: {
    bunchesPerBeam: 2760,
    particlesPerBunch: HL_LHC.protonsPerBunch.value,
    // Crab cavities largely compensate the crossing-angle reduction. VERIFY.
    geometricReductionFactor: 0.9,
    source: 'HL-TDR (VERIFY F)',
  },
  arcOptics: { ...LHC_PRESET.arcOptics, normalizedEmittanceM: HL_LHC.normalizedEmittance.value },
  interactionRegion: {
    quadTechnology: 'Nb3Sn',
    quadGradientTPerM: HL_LHC.irQuadGradient.value,
    peakCoilFieldT: HL_LHC.irQuadPeakCoilField.value,
    apertureM: HL_LHC.irQuadAperture.value,
    betaStarM: HL_LHC.betaStar.value,
    note: 'MQXF Nb₃Sn triplets, 150 mm aperture, ~11.4 T peak coil field (a quadrupole, not the arc dipoles).',
  },
  peakLuminosityCm2s: HL_LHC.levelledLuminosity.value,
  luminosityLabel: 'Nominal levelled luminosity',
  highlights: [
    'Arc dipoles unchanged (LHC-class 8.33 T) → beam energy stays ~7 TeV',
    'Nb₃Sn inner-triplet quadrupoles (~11 T peak coil field) → stronger final focusing',
    `β* ≈ ${HL_LHC.betaStar.value} m vs 0.55 m at LHC design`,
    'Crab cavities + brighter bunches → ~5× levelled luminosity (up to 7.5×10³⁴ cm⁻²s⁻¹ ultimate)',
  ],
  sources: ['HL-LHC Technical Design Report, CERN-2020-010'],
};
