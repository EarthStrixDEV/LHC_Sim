/**
 * Simplified ATLAS geometry.
 *
 * Dimensions are approximate values from ATLAS Collaboration, "The ATLAS Experiment at the
 * CERN Large Hadron Collider", JINST 3 (2008) S08003, plus the IBL (ATLAS-TDR-19).
 * Simplified cylinders/disks for education — NOT engineering CAD; TRT straws are
 * represented by a handful of effective layers.
 */
import type { CalorimeterSpec, GeometryElement, MuonStation, TrackerLayer } from '../../physics/detector/DetectorModel';

const PIXEL_RES = 10e-6;
const SCT_RES = 17e-6;
const TRT_RES = 130e-6;

export const ATLAS_TRACKER_LAYERS: readonly TrackerLayer[] = [
  // Pixel barrel incl. IBL
  ...[0.033, 0.0505, 0.0885, 0.1225].map((r, i): TrackerLayer => ({ name: i === 0 ? 'IBL' : `Pixel B${i}`, subsystem: 'pixel', kind: 'barrel', rMin: r, rMax: r, z: i === 0 ? 0.332 : 0.4, resolutionM: PIXEL_RES, efficiency: 0.98 })),
  // Pixel end-cap disks
  ...[0.495, 0.58, 0.65].map((z, i): TrackerLayer => ({ name: `Pixel D${i + 1}`, subsystem: 'pixel', kind: 'disk', rMin: 0.089, rMax: 0.15, z, resolutionM: PIXEL_RES, efficiency: 0.98 })),
  // SCT barrel
  ...[0.299, 0.371, 0.443, 0.514].map((r, i): TrackerLayer => ({ name: `SCT B${i + 3}`, subsystem: 'strip', kind: 'barrel', rMin: r, rMax: r, z: 0.749, resolutionM: SCT_RES, efficiency: 0.97 })),
  // SCT end-cap disks
  ...[0.853, 0.934, 1.091, 1.299, 1.399, 1.771, 2.115, 2.505, 2.72].map((z, i): TrackerLayer => ({ name: `SCT D${i + 1}`, subsystem: 'strip', kind: 'disk', rMin: 0.275, rMax: 0.56, z, resolutionM: SCT_RES, efficiency: 0.97 })),
  // TRT barrel: 8 effective layers standing in for ~73 straw layers
  ...Array.from({ length: 8 }, (_, i): TrackerLayer => {
    const r = 0.563 + (i + 0.5) * ((1.066 - 0.563) / 8);
    return { name: `TRT B${i + 1}`, subsystem: 'trt', kind: 'barrel', rMin: r, rMax: r, z: 0.712, resolutionM: TRT_RES, efficiency: 0.9 };
  }),
  // TRT end-cap: 6 effective wheels
  ...Array.from({ length: 6 }, (_, i): TrackerLayer => ({ name: `TRT W${i + 1}`, subsystem: 'trt', kind: 'disk', rMin: 0.644, rMax: 1.004, z: 0.848 + i * ((2.71 - 0.848) / 5), resolutionM: TRT_RES, efficiency: 0.9 })),
];

export const ATLAS_ECAL: CalorimeterSpec = {
  kind: 'ecal',
  name: 'LAr electromagnetic calorimeter',
  barrelRMin: 1.5,
  barrelRMax: 1.97,
  barrelZHalf: 3.2,
  endcapZMin: 3.7,
  endcapZMax: 4.25,
  endcapRMin: 0.33,
  endcapRMax: 2.1,
  etaMax: 3.2,
  cellDEta: 0.025,
  cellDPhi: (2 * Math.PI) / 256,
  stochastic: 0.1,
  constant: 0.007,
  cellThresholdGeV: 0.05,
};

export const ATLAS_HCAL: CalorimeterSpec = {
  kind: 'hcal',
  name: 'Tile / LAr hadronic calorimeter',
  barrelRMin: 2.28,
  barrelRMax: 4.25,
  barrelZHalf: 6.1,
  endcapZMin: 4.3,
  endcapZMax: 6.05,
  endcapRMin: 0.37,
  endcapRMax: 2.0,
  etaMax: 3.2,
  cellDEta: 0.1,
  cellDPhi: (2 * Math.PI) / 64,
  stochastic: 0.5,
  constant: 0.03,
  cellThresholdGeV: 0.2,
};

export const ATLAS_MUON_STATIONS: readonly MuonStation[] = [
  { name: 'Barrel Inner (BI)', kind: 'barrel', rMin: 5.0, rMax: 5.0, z: 7.0, resolutionM: 80e-6 },
  { name: 'Barrel Middle (BM)', kind: 'barrel', rMin: 7.5, rMax: 7.5, z: 9.5, resolutionM: 80e-6 },
  { name: 'Barrel Outer (BO)', kind: 'barrel', rMin: 10.0, rMax: 10.0, z: 12.0, resolutionM: 80e-6 },
  { name: 'New Small Wheel (EI)', kind: 'endcap', rMin: 1.0, rMax: 5.0, z: 7.4, resolutionM: 80e-6 },
  { name: 'End-cap Middle (EM)', kind: 'endcap', rMin: 1.5, rMax: 11.0, z: 13.5, resolutionM: 80e-6 },
  { name: 'End-cap Outer (EO)', kind: 'endcap', rMin: 2.0, rMax: 11.0, z: 21.5, resolutionM: 80e-6 },
];

export const ATLAS_ENVELOPE = { rMax: 11.5, zMax: 22 } as const;

export const ATLAS_GEOMETRY: readonly GeometryElement[] = [
  { name: 'Beam pipe', subsystem: 'beampipe', kind: 'shell', rMin: 0.0235, rMax: 0.0245, zMin: -3.5, zMax: 3.5, symmetricZ: false },
  { name: 'Pixel detector', subsystem: 'pixel', kind: 'shell', rMin: 0.03, rMax: 0.15, zMin: -0.65, zMax: 0.65, symmetricZ: false },
  { name: 'SCT (silicon strips)', subsystem: 'strip', kind: 'shell', rMin: 0.28, rMax: 0.52, zMin: -2.72, zMax: 2.72, symmetricZ: false },
  { name: 'TRT (straw tubes)', subsystem: 'trt', kind: 'shell', rMin: 0.56, rMax: 1.07, zMin: -2.71, zMax: 2.71, symmetricZ: false },
  { name: 'Central solenoid (2 T)', subsystem: 'solenoid', kind: 'shell', rMin: 1.23, rMax: 1.28, zMin: -2.65, zMax: 2.65, symmetricZ: false },
  { name: 'LAr EM barrel', subsystem: 'ecal', kind: 'shell', rMin: ATLAS_ECAL.barrelRMin, rMax: ATLAS_ECAL.barrelRMax, zMin: -3.2, zMax: 3.2, symmetricZ: false },
  { name: 'LAr EM end-cap', subsystem: 'ecal', kind: 'disk', rMin: ATLAS_ECAL.endcapRMin, rMax: ATLAS_ECAL.endcapRMax, zMin: ATLAS_ECAL.endcapZMin, zMax: ATLAS_ECAL.endcapZMax, symmetricZ: true },
  { name: 'Tile calorimeter', subsystem: 'hcal', kind: 'shell', rMin: ATLAS_HCAL.barrelRMin, rMax: ATLAS_HCAL.barrelRMax, zMin: -6.1, zMax: 6.1, symmetricZ: false },
  { name: 'LAr hadronic end-cap', subsystem: 'hcal', kind: 'disk', rMin: ATLAS_HCAL.endcapRMin, rMax: ATLAS_HCAL.endcapRMax, zMin: ATLAS_HCAL.endcapZMin, zMax: ATLAS_HCAL.endcapZMax, symmetricZ: true },
  { name: 'Forward calorimeter (FCal)', subsystem: 'hcal', kind: 'disk', rMin: 0.07, rMax: 0.45, zMin: 4.7, zMax: 6.1, symmetricZ: true },
  { name: 'Barrel toroid (8 coils)', subsystem: 'toroid', kind: 'toroid-coils', rMin: 4.7, rMax: 10.05, zMin: -12.65, zMax: 12.65, symmetricZ: false, count: 8 },
  { name: 'End-cap toroid', subsystem: 'toroid', kind: 'toroid-coils', rMin: 0.83, rMax: 5.35, zMin: 8.5, zMax: 13.0, symmetricZ: true, count: 8 },
  ...ATLAS_MUON_STATIONS.map((s): GeometryElement =>
    s.kind === 'barrel'
      ? { name: `Muon ${s.name}`, subsystem: 'muon', kind: 'chambers', rMin: s.rMin - 0.25, rMax: s.rMin + 0.25, zMin: -s.z, zMax: s.z, symmetricZ: false, count: 16 }
      : { name: `Muon ${s.name}`, subsystem: 'muon', kind: 'chambers', rMin: s.rMin, rMax: s.rMax, zMin: s.z - 0.2, zMax: s.z + 0.2, symmetricZ: true, count: 16 },
  ),
];
