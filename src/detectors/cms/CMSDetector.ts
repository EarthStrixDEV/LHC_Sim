/**
 * CMS — Phase 2 detailed educational model (independently explorable).
 *
 * Major systems, with approximate dimensions from CMS Collaboration, JINST 3 (2008) S08004
 * and the Phase-1 pixel upgrade (CMS-TDR-011):
 *   Tracker    4 pixel barrel layers + 3 pixel disks; strip barrel TIB/TOB (10 layers);
 *              TID + TEC end-cap disks
 *   ECAL       PbWO₄ crystals, barrel |η| < 1.48 and end-caps to |η| = 3.0, preshower
 *   HCAL       brass/scintillator barrel (HB), end-cap (HE), outer (HO), forward (HF, 3 < |η| < 5)
 *   Solenoid   3.8 T superconducting coil (free bore Ø 6 m, 12.5 m long)
 *   Muons      4 drift-tube (DT) stations interleaved with the 3 barrel yoke layers;
 *              cathode-strip chambers (CSC) on the end-cap yoke disks
 * All volumes are simplified cylinders/disks (not engineering CAD). The HF and preshower
 * are geometry only; the response uses one ECAL and one HCAL grid up to |η| = 3.
 */
import type { CalorimeterSpec, DetectorModel, GeometryElement, MuonStation, TrackerLayer } from '../../physics/detector/DetectorModel';
import { createCmsField } from './CMSField';

const TRACKER: readonly TrackerLayer[] = [
  ...[0.029, 0.068, 0.109, 0.16].map((r, i): TrackerLayer => ({ name: `Pixel BPix L${i + 1}`, subsystem: 'pixel', kind: 'barrel', rMin: r, rMax: r, z: 0.27, resolutionM: 10e-6, efficiency: 0.98 })),
  ...[0.291, 0.396, 0.516].map((z, i): TrackerLayer => ({ name: `Pixel FPix D${i + 1}`, subsystem: 'pixel', kind: 'disk', rMin: 0.045, rMax: 0.161, z, resolutionM: 15e-6, efficiency: 0.98 })),
  ...[0.255, 0.339, 0.418, 0.498].map((r, i): TrackerLayer => ({ name: `TIB L${i + 1}`, subsystem: 'strip', kind: 'barrel', rMin: r, rMax: r, z: 0.7, resolutionM: 25e-6, efficiency: 0.97 })),
  ...[0.608, 0.692, 0.78, 0.868, 0.965, 1.08].map((r, i): TrackerLayer => ({ name: `TOB L${i + 1}`, subsystem: 'strip', kind: 'barrel', rMin: r, rMax: r, z: 1.1, resolutionM: 35e-6, efficiency: 0.97 })),
  ...[0.8, 0.9, 1.0].map((z, i): TrackerLayer => ({ name: `TID D${i + 1}`, subsystem: 'strip', kind: 'disk', rMin: 0.2, rMax: 0.5, z, resolutionM: 30e-6, efficiency: 0.97 })),
  ...[1.25, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8].map((z, i): TrackerLayer => ({ name: `TEC D${i + 1}`, subsystem: 'strip', kind: 'disk', rMin: 0.23, rMax: 1.1, z, resolutionM: 35e-6, efficiency: 0.97 })),
];

const ECAL: CalorimeterSpec = {
  kind: 'ecal', name: 'PbWO₄ crystal ECAL (EB + EE)', barrelRMin: 1.29, barrelRMax: 1.52, barrelZHalf: 3.0,
  endcapZMin: 3.15, endcapZMax: 3.4, endcapRMin: 0.3, endcapRMax: 1.5, etaMax: 3.0,
  cellDEta: 0.0174, cellDPhi: 0.0174, stochastic: 0.028, constant: 0.003, cellThresholdGeV: 0.05,
};

const HCAL: CalorimeterSpec = {
  kind: 'hcal', name: 'Brass/scintillator HCAL (HB + HE)', barrelRMin: 1.77, barrelRMax: 2.95, barrelZHalf: 4.3,
  endcapZMin: 3.9, endcapZMax: 5.6, endcapRMin: 0.4, endcapRMax: 2.9, etaMax: 3.0,
  cellDEta: 0.087, cellDPhi: 0.087, stochastic: 1.0, constant: 0.05, cellThresholdGeV: 0.3,
};

/** DT stations sit in the gaps between the three barrel yoke layers. */
const MUON: readonly MuonStation[] = [
  ...[4.1, 5.05, 6.0, 7.2].map((r, i): MuonStation => ({ name: `DT MB${i + 1}`, kind: 'barrel', rMin: r, rMax: r, z: 6.6, resolutionM: 100e-6 })),
  ...[6.8, 7.9, 9.7, 10.6].map((z, i): MuonStation => ({ name: `CSC ME${i + 1}`, kind: 'endcap', rMin: 1.0, rMax: 7.0, z, resolutionM: 100e-6 })),
];

const YOKE_LAYERS: ReadonlyArray<[number, number]> = [[4.45, 4.8], [5.35, 5.8], [6.35, 7.0]];
const ENDCAP_YOKE: ReadonlyArray<[number, number]> = [[7.1, 7.7], [8.3, 9.4], [10.0, 10.5]];

const GEOMETRY: readonly GeometryElement[] = [
  { name: 'Beam pipe', subsystem: 'beampipe', kind: 'shell', rMin: 0.022, rMax: 0.023, zMin: -3, zMax: 3, symmetricZ: false },
  { name: 'Pixel detector (BPix/FPix)', subsystem: 'pixel', kind: 'shell', rMin: 0.029, rMax: 0.16, zMin: -0.52, zMax: 0.52, symmetricZ: false },
  { name: 'Strip tracker (TIB/TOB)', subsystem: 'strip', kind: 'shell', rMin: 0.25, rMax: 1.1, zMin: -1.1, zMax: 1.1, symmetricZ: false },
  { name: 'Strip end-caps (TID/TEC)', subsystem: 'strip', kind: 'disk', rMin: 0.2, rMax: 1.1, zMin: 1.2, zMax: 2.8, symmetricZ: true },
  { name: 'ECAL barrel (EB)', subsystem: 'ecal', kind: 'shell', rMin: ECAL.barrelRMin, rMax: ECAL.barrelRMax, zMin: -3, zMax: 3, symmetricZ: false },
  { name: 'ECAL end-cap (EE)', subsystem: 'ecal', kind: 'disk', rMin: ECAL.endcapRMin, rMax: ECAL.endcapRMax, zMin: ECAL.endcapZMin, zMax: ECAL.endcapZMax, symmetricZ: true },
  { name: 'Preshower (ES)', subsystem: 'ecal', kind: 'disk', rMin: 0.45, rMax: 1.25, zMin: 3.0, zMax: 3.12, symmetricZ: true },
  { name: 'HCAL barrel (HB)', subsystem: 'hcal', kind: 'shell', rMin: HCAL.barrelRMin, rMax: HCAL.barrelRMax, zMin: -4.3, zMax: 4.3, symmetricZ: false },
  { name: 'HCAL end-cap (HE)', subsystem: 'hcal', kind: 'disk', rMin: HCAL.endcapRMin, rMax: HCAL.endcapRMax, zMin: HCAL.endcapZMin, zMax: HCAL.endcapZMax, symmetricZ: true },
  { name: 'HCAL outer (HO)', subsystem: 'hcal', kind: 'shell', rMin: 3.85, rMax: 4.05, zMin: -6.3, zMax: 6.3, symmetricZ: false },
  { name: 'HCAL forward (HF)', subsystem: 'hcal', kind: 'disk', rMin: 0.125, rMax: 1.3, zMin: 11.15, zMax: 12.8, symmetricZ: true },
  { name: 'Solenoid (3.8 T)', subsystem: 'solenoid', kind: 'shell', rMin: 2.95, rMax: 3.5, zMin: -6.25, zMax: 6.25, symmetricZ: false },
  ...YOKE_LAYERS.map(([a, b], i): GeometryElement => ({ name: `Barrel yoke layer ${i + 1}`, subsystem: 'yoke', kind: 'shell', rMin: a, rMax: b, zMin: -6.5, zMax: 6.5, symmetricZ: false })),
  ...ENDCAP_YOKE.map(([a, b], i): GeometryElement => ({ name: `End-cap yoke YE${i + 1}`, subsystem: 'yoke', kind: 'disk', rMin: 0.9, rMax: 7.0, zMin: a, zMax: b, symmetricZ: true })),
  ...MUON.map((s): GeometryElement =>
    s.kind === 'barrel'
      ? { name: `Muon ${s.name}`, subsystem: 'muon', kind: 'chambers', rMin: s.rMin - 0.15, rMax: s.rMin + 0.15, zMin: -s.z, zMax: s.z, symmetricZ: false, count: 12 }
      : { name: `Muon ${s.name}`, subsystem: 'muon', kind: 'chambers', rMin: s.rMin, rMax: s.rMax, zMin: s.z - 0.15, zMax: s.z + 0.15, symmetricZ: true, count: 18 },
  ),
];

export function createCmsDetector(): DetectorModel {
  return {
    id: 'cms',
    name: 'CMS (detailed educational model)',
    fidelity: {
      level: 'detailed educational',
      summary: 'All major CMS systems (pixel/strip tracker, EB/EE/ES, HB/HE/HO/HF, 3.8 T solenoid, DT/CSC with yoke layers) as simplified volumes; parameterized response; not CMSSW/Geant4.',
    },
    field: createCmsField(),
    envelope: { rMax: 7.6, zMax: 11 },
    trackerLayers: TRACKER,
    trackerEtaMax: 2.5,
    trackerOuter: { rMax: 1.1, zMax: 2.8 },
    ecal: ECAL,
    hcal: HCAL,
    muonStations: MUON,
    muonEtaMax: 2.4,
    // σ(pT)/pT ≈ 1.5 %·(pT/100 GeV) ⊕ 0.5 % (JINST 9 P10009 order of magnitude — VERIFY)
    trackResolution: { a: 0.00015, b: 0.005 },
    muonResolution: { a: 0.0001, b: 0.01 },
    geometry: GEOMETRY,
    notes: [
      'Detailed educational model: major systems explorable; volumes are simplified cylinders/disks, not engineering CAD.',
      'HF and the preshower are shown as geometry; the response uses one ECAL and one HCAL projective grid up to |η| = 3.',
    ],
  };
}
