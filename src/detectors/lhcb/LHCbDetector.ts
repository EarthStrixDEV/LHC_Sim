/**
 * LHCb — simplified educational model of a single-arm forward spectrometer (Run 3 layout).
 *
 * Approximate positions along the beam (LHCb Collaboration, JINST 3 (2008) S08005 and
 * JINST 19 (2024) P05065 for the upgraded detector — VERIFY):
 *   VELO   silicon pixel stations from z ≈ −0.29 to 0.75 m, 5.1 mm from the beam:
 *          resolves b/c-hadron decay vertices displaced by millimetres
 *   RICH1  z ≈ 1.0–2.2 m (C₄F₁₀ gas, n ≈ 1.0014)
 *   UT     z ≈ 2.3–2.7 m
 *   Magnet warm dipole z ≈ 3–8 m, vertical field, ∫B dl ≈ 4 T·m
 *   SciFi  T1–T3, z ≈ 7.8–9.4 m
 *   RICH2  z ≈ 9.5–11.9 m (CF₄ gas, n ≈ 1.0005)
 *   ECAL / HCAL  z ≈ 12.5–13.3 / 13.3–14.6 m
 *   Muon   M2–M5, z ≈ 15.2–18.8 m
 * Acceptance ≈ 2 < η < 5 (forward only). Detector planes are modelled as annular disks.
 */
import type { CalorimeterSpec, DetectorModel, GeometryElement, MuonStation, TrackerLayer } from '../../physics/detector/DetectorModel';
import { DipoleField } from '../../physics/propagation/DipoleField';

const ETA_RANGE: readonly [number, number] = [2, 5];

const VELO_Z = [-0.25, -0.2, -0.15, -0.1, -0.05, 0.02, 0.05, 0.08, 0.11, 0.14, 0.17, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7];
const VELO: readonly TrackerLayer[] = VELO_Z.map((z, i): TrackerLayer => ({
  name: `VELO station ${i + 1}`, subsystem: 'pixel', kind: 'disk', rMin: 0.0051, rMax: 0.042, z: Math.abs(z), resolutionM: 12e-6, efficiency: 0.99, side: z < 0 ? -1 : 1,
}));
const UT: readonly TrackerLayer[] = [2.33, 2.37, 2.6, 2.64].map((z, i): TrackerLayer => ({ name: `UT layer ${i + 1}`, subsystem: 'strip', kind: 'disk', rMin: 0.034, rMax: 0.8, z, resolutionM: 50e-6, efficiency: 0.98, side: 1 }));
const SCIFI: readonly TrackerLayer[] = [7.83, 7.9, 7.97, 8.04, 8.51, 8.58, 8.65, 8.72, 9.19, 9.26, 9.33, 9.4].map((z, i): TrackerLayer => ({
  name: `SciFi T${Math.floor(i / 4) + 1} layer ${(i % 4) + 1}`, subsystem: 'strip', kind: 'disk', rMin: 0.1, rMax: 3.0, z, resolutionM: 80e-6, efficiency: 0.98, side: 1,
}));

const ECAL: CalorimeterSpec = {
  kind: 'ecal', name: 'ECAL (shashlik)', barrelRMin: 6.0, barrelRMax: 6.0, barrelZHalf: 0,
  endcapZMin: 12.5, endcapZMax: 13.3, endcapRMin: 0.15, endcapRMax: 3.9, etaMax: 5.0,
  cellDEta: 0.05, cellDPhi: 0.05, stochastic: 0.1, constant: 0.01, cellThresholdGeV: 0.05, etaRange: ETA_RANGE,
};
const HCAL: CalorimeterSpec = {
  kind: 'hcal', name: 'HCAL (iron/scintillator tiles)', barrelRMin: 6.0, barrelRMax: 6.0, barrelZHalf: 0,
  endcapZMin: 13.3, endcapZMax: 14.6, endcapRMin: 0.25, endcapRMax: 4.2, etaMax: 5.0,
  cellDEta: 0.15, cellDPhi: 0.15, stochastic: 0.69, constant: 0.09, cellThresholdGeV: 0.3, etaRange: ETA_RANGE,
};

const MUON: readonly MuonStation[] = [15.2, 16.4, 17.6, 18.8].map((z, i): MuonStation => ({ name: `Muon M${i + 2}`, kind: 'endcap', rMin: 0.3, rMax: 5.0, z, resolutionM: 1e-3, side: 1 }));

const GEOMETRY: readonly GeometryElement[] = [
  { name: 'Beam pipe', subsystem: 'beampipe', kind: 'shell', rMin: 0.025, rMax: 0.026, zMin: 0.8, zMax: 19.5, symmetricZ: false },
  { name: 'VELO (vertex locator)', subsystem: 'pixel', kind: 'shell', rMin: 0.005, rMax: 0.045, zMin: -0.29, zMax: 0.75, symmetricZ: false },
  { name: 'RICH1 (C₄F₁₀)', subsystem: 'rich', kind: 'shell', rMin: 0.05, rMax: 0.9, zMin: 1.0, zMax: 2.2, symmetricZ: false },
  { name: 'Upstream Tracker (UT)', subsystem: 'strip', kind: 'disk', rMin: 0.034, rMax: 0.8, zMin: 2.3, zMax: 2.7, symmetricZ: false },
  { name: 'Dipole magnet (4 T·m)', subsystem: 'dipole', kind: 'shell', rMin: 2.2, rMax: 4.0, zMin: 3.0, zMax: 8.0, symmetricZ: false },
  { name: 'SciFi tracker T1–T3', subsystem: 'strip', kind: 'disk', rMin: 0.1, rMax: 3.0, zMin: 7.8, zMax: 9.45, symmetricZ: false },
  { name: 'RICH2 (CF₄)', subsystem: 'rich', kind: 'shell', rMin: 0.1, rMax: 2.8, zMin: 9.5, zMax: 11.9, symmetricZ: false },
  { name: 'ECAL', subsystem: 'ecal', kind: 'disk', rMin: ECAL.endcapRMin, rMax: ECAL.endcapRMax, zMin: ECAL.endcapZMin, zMax: ECAL.endcapZMax, symmetricZ: false },
  { name: 'HCAL', subsystem: 'hcal', kind: 'disk', rMin: HCAL.endcapRMin, rMax: HCAL.endcapRMax, zMin: HCAL.endcapZMin, zMax: HCAL.endcapZMax, symmetricZ: false },
  ...MUON.map((s): GeometryElement => ({ name: s.name, subsystem: 'muon', kind: 'disk', rMin: s.rMin, rMax: s.rMax, zMin: s.z - 0.1, zMax: s.z + 0.1, symmetricZ: false })),
  { name: 'Muon filters (iron)', subsystem: 'absorber', kind: 'disk', rMin: 0.3, rMax: 5.0, zMin: 15.5, zMax: 16.2, symmetricZ: false },
];

export function createLhcbField(): DipoleField {
  // Vertical field (By) bends charged tracks in the horizontal plane; ∫B dl ≈ 4.2 T·m.
  return new DipoleField('lhcb-dipole', 'LHCb warm dipole (∫B dl ≈ 4 T·m)', { axis: 'y', peakT: 1.05, centreZ: 5.2, sigmaZ: 1.6, halfX: 4.0, halfY: 3.5 });
}

export function createLhcbDetector(): DetectorModel {
  return {
    id: 'lhcb',
    name: 'LHCb (simplified forward spectrometer)',
    fidelity: {
      level: 'simplified educational',
      summary: 'Forward geometry (2 < η < 5): VELO vertexing, dipole spectrometer, RICH Cherenkov PID, calorimeters, muon stations — planes as annular disks; not the LHCb software.',
    },
    field: createLhcbField(),
    envelope: { rMax: 6.0, zMax: 19.5 },
    trackerLayers: [...VELO, ...UT, ...SCIFI],
    trackerEtaMax: 5.0,
    trackerOuter: { rMax: 3.0, zMax: 9.45 },
    ecal: ECAL,
    hcal: HCAL,
    muonStations: MUON,
    muonEtaMax: 5.0,
    // σ(p)/p ≈ 0.5–1 % (momentum, not pT) — approximated on pT (VERIFY)
    trackResolution: { a: 0.00005, b: 0.005 },
    muonResolution: { a: 0.00005, b: 0.006 },
    geometry: GEOMETRY,
    pid: {
      rich: [
        { name: 'RICH1', radiator: 'C₄F₁₀', n: 1.0014, zMin: 1.0, zMax: 2.2, angleResolutionRad: 1.6e-3 },
        { name: 'RICH2', radiator: 'CF₄', n: 1.0005, zMin: 9.5, zMax: 11.9, angleResolutionRad: 0.7e-3 },
      ],
    },
    notes: [
      'Forward acceptance 2 < η < 5; backward particles are propagated (they exist) but not measured.',
      'Detector planes are annular disks around the beam; real stations are rectangular.',
    ],
  };
}
