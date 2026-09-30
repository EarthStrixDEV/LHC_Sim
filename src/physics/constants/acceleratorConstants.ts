/**
 * Accelerator and magnet parameters.
 *
 * Every value carries a source tag. Values tagged VERIFY are plausible educational
 * figures that should be re-checked against primary documentation before being quoted.
 *
 * Sources:
 *   [LHC-DR]   O. Brüning et al., "LHC Design Report Vol. I", CERN-2004-003-V-1 (2004).
 *   [HL-TDR]   O. Aberle et al., "High-Luminosity LHC Technical Design Report",
 *              CERN-2020-010 (2020).
 *   [FCC-CDR]  A. Abada et al., "FCC-hh: The Hadron Collider", Eur. Phys. J. ST 228 (2019) 755.
 *   [FCC-FS]   FCC Feasibility Study Report (2025) — updated FCC-hh baseline. VERIFY.
 *   [RUN3]     LHC Run 3 operational parameters (6.8 TeV per beam, 2022–).
 */

export interface SourcedValue {
  readonly value: number;
  readonly unit: string;
  readonly source: string;
  readonly verify?: boolean;
  readonly note?: string;
}

export const LHC = {
  circumference: { value: 26_658.883, unit: 'm', source: 'LHC-DR' },
  dipoleBendingRadius: { value: 2_803.95, unit: 'm', source: 'LHC-DR' },
  dipoleNominalField: { value: 8.33, unit: 'T', source: 'LHC-DR', note: 'at 7 TeV design energy' },
  dipoleUltimateField: { value: 9.0, unit: 'T', source: 'LHC-DR', note: 'ultimate, never operated' },
  dipoleCount: { value: 1232, unit: '', source: 'LHC-DR' },
  dipoleMagneticLength: { value: 14.3, unit: 'm', source: 'LHC-DR' },
  dipoleNominalCurrent: { value: 11_850, unit: 'A', source: 'LHC-DR' },
  dipoleInductance: { value: 0.0987, unit: 'H', source: 'LHC-DR', note: 'single twin-aperture dipole' },
  dipoleApertureSeparation: { value: 0.194, unit: 'm', source: 'LHC-DR' },
  cryostatOuterDiameter: { value: 0.914, unit: 'm', source: 'LHC-DR' },
  designEnergyPerBeam: { value: 7_000, unit: 'GeV', source: 'LHC-DR' },
  run3EnergyPerBeam: { value: 6_800, unit: 'GeV', source: 'RUN3' },
  injectionEnergy: { value: 450, unit: 'GeV', source: 'LHC-DR' },
  nominalTemperature: { value: 1.9, unit: 'K', source: 'LHC-DR' },
  arcCellLength: { value: 106.9, unit: 'm', source: 'LHC-DR' },
  arcCellPhaseAdvance: { value: 90, unit: 'deg', source: 'LHC-DR' },
  quadGradient: { value: 223, unit: 'T/m', source: 'LHC-DR', note: 'MQ arc quadrupole, nominal' },
  quadMagneticLength: { value: 3.1, unit: 'm', source: 'LHC-DR' },
  rfVoltagePerBeam: { value: 16, unit: 'MV', source: 'LHC-DR' },
  rfFrequency: { value: 400.79e6, unit: 'Hz', source: 'LHC-DR' },
  normalizedEmittance: { value: 3.75e-6, unit: 'm·rad', source: 'LHC-DR' },
  bunchesPerBeam: { value: 2808, unit: '', source: 'LHC-DR' },
  protonsPerBunch: { value: 1.15e11, unit: '', source: 'LHC-DR' },
  betaStar: { value: 0.55, unit: 'm', source: 'LHC-DR', note: 'IP1/IP5 design' },
  peakLuminosity: { value: 1e34, unit: 'cm⁻²s⁻¹', source: 'LHC-DR' },
  tunnelDiameter: { value: 3.8, unit: 'm', source: 'LHC-DR' },
  /** Main-dipole circuit energy-extraction time constant. */
  dipoleCircuitExtractionTau: { value: 104, unit: 's', source: 'LHC-DR', verify: true },
  /** Time for current in a quenched magnet to be diverted through its bypass diode. */
  quenchedMagnetCurrentDecayTau: { value: 0.2, unit: 's', source: 'LHC-DR', verify: true },
  quenchHeaterDelay: { value: 0.03, unit: 's', source: 'LHC-DR', verify: true },
} as const satisfies Record<string, SourcedValue>;

export const HL_LHC = {
  /** Arc dipoles are unchanged from LHC; energy stays ~7 TeV. */
  designEnergyPerBeam: { value: 7_000, unit: 'GeV', source: 'HL-TDR' },
  /** Nb3Sn MQXF inner-triplet quadrupoles. */
  irQuadGradient: { value: 132.2, unit: 'T/m', source: 'HL-TDR' },
  irQuadAperture: { value: 0.15, unit: 'm', source: 'HL-TDR' },
  irQuadPeakCoilField: { value: 11.4, unit: 'T', source: 'HL-TDR', verify: true },
  betaStar: { value: 0.15, unit: 'm', source: 'HL-TDR', note: 'nominal round optics' },
  levelledLuminosity: { value: 5e34, unit: 'cm⁻²s⁻¹', source: 'HL-TDR', note: 'nominal levelled' },
  ultimateLevelledLuminosity: { value: 7.5e34, unit: 'cm⁻²s⁻¹', source: 'HL-TDR' },
  protonsPerBunch: { value: 2.2e11, unit: '', source: 'HL-TDR' },
  normalizedEmittance: { value: 2.5e-6, unit: 'm·rad', source: 'HL-TDR' },
} as const satisfies Record<string, SourcedValue>;

export const FCC_HH = {
  circumference: { value: 90_700, unit: 'm', source: 'FCC-FS', verify: true },
  dipoleNominalField: {
    value: 14,
    unit: 'T',
    source: 'FCC-FS',
    verify: true,
    note: 'CDR baseline was 16 T Nb3Sn; 2025 study quotes ~14 T',
  },
  /** Bending radius chosen so that 14 T bends ~42.5 TeV protons (√s ≈ 85 TeV). */
  dipoleBendingRadius: { value: 10_130, unit: 'm', source: 'FCC-FS', verify: true },
  designEnergyPerBeam: { value: 42_500, unit: 'GeV', source: 'FCC-FS', verify: true },
  rfVoltagePerBeam: { value: 42, unit: 'MV', source: 'FCC-CDR', verify: true },
  nominalTemperature: { value: 1.9, unit: 'K', source: 'FCC-CDR' },
  betaStar: { value: 0.3, unit: 'm', source: 'FCC-CDR', verify: true },
  peakLuminosity: { value: 3e34, unit: 'cm⁻²s⁻¹', source: 'FCC-CDR', verify: true },
  normalizedEmittance: { value: 2.2e-6, unit: 'm·rad', source: 'FCC-CDR' },
} as const satisfies Record<string, SourcedValue>;
