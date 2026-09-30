/**
 * ALICE — simplified educational model emphasizing heavy-ion physics (Run 3 layout).
 *
 * Approximate dimensions (ALICE Collaboration, JINST 3 (2008) S08002; ITS2 TDR, CERN-LHCC-2013-024;
 * JINST 19 (2024) P05062 for the upgraded detector — VERIFY):
 *   ITS2   7 MAPS layers, r = 22–395 mm
 *   TPC    gas drift volume r = 0.85–2.47 m, |z| < 2.5 m; 159 pad rows → 30 effective layers here;
 *          measures dE/dx for particle identification
 *   TRD    6 layers r ≈ 2.9–3.7 m
 *   TOF    r ≈ 3.7 m, |η| < 0.9: time of flight → β → PID
 *   EMCal  r ≈ 4.3 m, |η| < 0.7 (real coverage ~2/3 in φ incl. DCal/PHOS — modelled as full φ)
 *   No hadronic calorimeter.
 *   L3 solenoid 0.5 T (large, low field: soft particles of heavy-ion collisions stay measurable)
 *   Forward muon arm (−4 < η < −2.5): absorber, 3 T·m dipole, tracking stations at −5.4…−14.4 m
 */
import type { CalorimeterSpec, DetectorModel, GeometryElement, MuonStation, TrackerLayer } from '../../physics/detector/DetectorModel';
import { DipoleField, SumField } from '../../physics/propagation/DipoleField';
import { RegionalField } from '../../physics/propagation/RegionalField';

export const ALICE_SOLENOID_B = 0.5;

const ITS: readonly TrackerLayer[] = [
  [0.0224, 0.135], [0.0301, 0.135], [0.0378, 0.135], [0.1944, 0.42], [0.2439, 0.42], [0.3423, 0.75], [0.3918, 0.75],
].map(([r, z], i): TrackerLayer => ({ name: `ITS L${i}`, subsystem: 'pixel', kind: 'barrel', rMin: r!, rMax: r!, z: z!, resolutionM: 5e-6, efficiency: 0.99 }));

const TPC: readonly TrackerLayer[] = Array.from({ length: 30 }, (_, i): TrackerLayer => {
  const r = 0.85 + (i + 0.5) * ((2.47 - 0.85) / 30);
  return { name: `TPC pad-row group ${i + 1}`, subsystem: 'tpc', kind: 'barrel', rMin: r, rMax: r, z: 2.5, resolutionM: 0.8e-3, efficiency: 0.9 };
});

const TRD: readonly TrackerLayer[] = Array.from({ length: 6 }, (_, i): TrackerLayer => {
  const r = 2.95 + i * 0.13;
  return { name: `TRD L${i + 1}`, subsystem: 'trt', kind: 'barrel', rMin: r, rMax: r, z: 3.5, resolutionM: 0.4e-3, efficiency: 0.9 };
});

const EMCAL: CalorimeterSpec = {
  kind: 'ecal', name: 'EMCal (Pb/scintillator)', barrelRMin: 4.28, barrelRMax: 4.6, barrelZHalf: 3.5,
  endcapZMin: 7.5, endcapZMax: 7.6, endcapRMin: 0, endcapRMax: 0, etaMax: 0.7,
  cellDEta: 0.0143, cellDPhi: 0.0143, stochastic: 0.11, constant: 0.017, cellThresholdGeV: 0.1,
};

const NO_HCAL: CalorimeterSpec = {
  kind: 'hcal', name: 'none (ALICE has no hadronic calorimeter)', barrelRMin: 4.6, barrelRMax: 4.6, barrelZHalf: 0,
  endcapZMin: 7.5, endcapZMax: 7.5, endcapRMin: 0, endcapRMax: 0, etaMax: 0,
  cellDEta: 0.1, cellDPhi: 0.1, stochastic: 1, constant: 0.1, cellThresholdGeV: 1e9, present: false,
};

const MUON: readonly MuonStation[] = [5.36, 6.86, 9.83, 12.92, 14.22].map((z, i): MuonStation => ({
  name: `Muon tracking station ${i + 1}`, kind: 'endcap', rMin: 0.2 + 0.04 * z, rMax: 0.6 + 0.2 * z, z, resolutionM: 100e-6, side: -1,
}));

const GEOMETRY: readonly GeometryElement[] = [
  { name: 'Beam pipe', subsystem: 'beampipe', kind: 'shell', rMin: 0.018, rMax: 0.019, zMin: -4, zMax: 4, symmetricZ: false },
  { name: 'ITS2 (silicon pixels)', subsystem: 'pixel', kind: 'shell', rMin: 0.022, rMax: 0.4, zMin: -0.75, zMax: 0.75, symmetricZ: false },
  { name: 'TPC (gas drift volume)', subsystem: 'tpc', kind: 'shell', rMin: 0.85, rMax: 2.47, zMin: -2.5, zMax: 2.5, symmetricZ: false },
  { name: 'TRD', subsystem: 'trt', kind: 'shell', rMin: 2.9, rMax: 3.68, zMin: -3.5, zMax: 3.5, symmetricZ: false },
  { name: 'TOF', subsystem: 'tof', kind: 'shell', rMin: 3.7, rMax: 3.99, zMin: -3.7, zMax: 3.7, symmetricZ: false },
  { name: 'EMCal', subsystem: 'ecal', kind: 'shell', rMin: EMCAL.barrelRMin, rMax: EMCAL.barrelRMax, zMin: -3.3, zMax: 3.3, symmetricZ: false },
  { name: 'L3 solenoid (0.5 T)', subsystem: 'solenoid', kind: 'shell', rMin: 5.93, rMax: 6.6, zMin: -7.05, zMax: 7.05, symmetricZ: false },
  { name: 'Front absorber', subsystem: 'absorber', kind: 'disk', rMin: 0.05, rMax: 1.0, zMin: -5.0, zMax: -0.9, symmetricZ: false },
  { name: 'Muon dipole (3 T·m)', subsystem: 'dipole', kind: 'shell', rMin: 1.2, rMax: 2.6, zMin: -12.4, zMax: -7.4, symmetricZ: false },
  { name: 'Muon filter (iron wall)', subsystem: 'absorber', kind: 'disk', rMin: 0.3, rMax: 3.4, zMin: -15.9, zMax: -14.7, symmetricZ: false },
  ...MUON.map((s): GeometryElement => ({ name: s.name, subsystem: 'muon', kind: 'disk', rMin: s.rMin, rMax: s.rMax, zMin: -s.z - 0.08, zMax: -s.z + 0.08, symmetricZ: false })),
];

export function createAliceField(): SumField {
  const sol = new RegionalField('alice-l3', 'ALICE L3 solenoid 0.5 T', [
    { name: 'L3 solenoid volume', rMin: 0, rMax: 5.9, zMin: 0, zMax: 6.0, symmetricZ: true, shape: { kind: 'axial', bz: ALICE_SOLENOID_B }, note: '0.5 T axial' },
  ], 'Uniform 0.5 T inside the L3 magnet.');
  // Horizontal field bends muons in the vertical plane; ∫B dz ≈ 3 T·m.
  const dip = new DipoleField('alice-muon-dipole', 'ALICE muon dipole', { axis: 'x', peakT: 0.67, centreZ: -9.9, sigmaZ: 1.79, halfX: 2.5, halfY: 2.5 });
  return new SumField('alice-field', 'ALICE: 0.5 T L3 solenoid + muon-arm dipole', 'Uniform 0.5 T solenoid (|z| < 6 m, r < 5.9 m) plus a Gaussian-profile 3 T·m dipole around z = −9.9 m. Educational.', [sol, dip]);
}

export function createAliceDetector(): DetectorModel {
  return {
    id: 'alice',
    name: 'ALICE (simplified educational model)',
    fidelity: {
      level: 'simplified educational',
      summary: 'Heavy-ion emphasis: ITS2 + TPC tracking at 0.5 T, TPC dE/dx and TOF particle identification, EMCal, forward muon arm. Simplified volumes; not O²/Geant4.',
    },
    field: createAliceField(),
    envelope: { rMax: 6.0, zMax: 16 },
    trackerLayers: [...ITS, ...TPC, ...TRD],
    trackerEtaMax: 0.9,
    trackerOuter: { rMax: 3.7, zMax: 3.5 },
    ecal: EMCAL,
    hcal: NO_HCAL,
    muonStations: MUON,
    muonEtaMax: 4.0,
    // ITS+TPC: σ(pT)/pT ≈ 1 % at 1 GeV rising to a few % at 20 GeV (order of magnitude — VERIFY)
    trackResolution: { a: 0.0015, b: 0.008 },
    muonResolution: { a: 0.0005, b: 0.01 },
    geometry: GEOMETRY,
    pid: {
      dEdx: { name: 'TPC dE/dx', relResolution: 0.055, rMin: 0.85, rMax: 2.47 },
      tof: { name: 'TOF', radiusM: 3.7, zHalfM: 3.7, timeResolutionNs: 0.08 },
    },
    notes: [
      'Simplified model: EMCal modelled with full φ coverage; PHOS, DCal, FIT, ZDC omitted.',
      'TPC: 159 pad rows represented by 30 effective layers; drift-time physics not simulated.',
      'Forward muon arm only on the −z side (as in ALICE).',
    ],
  };
}
