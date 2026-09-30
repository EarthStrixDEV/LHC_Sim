import type { DetectorModel } from '../../physics/detector/DetectorModel';
import { createAtlasField } from './ATLASField';
import { ATLAS_ECAL, ATLAS_ENVELOPE, ATLAS_GEOMETRY, ATLAS_HCAL, ATLAS_MUON_STATIONS, ATLAS_TRACKER_LAYERS } from './ATLASGeometry';

export function createAtlasDetector(): DetectorModel {
  return {
    id: 'atlas',
    name: 'ATLAS (upgraded educational model)',
    fidelity: {
      level: 'upgraded educational',
      summary: 'Phase 1 ATLAS upgraded with a solenoid field map, forward calorimeter and New Small Wheel geometry; TRT as effective layers; parameterized response; not Athena/Geant4.',
    },
    field: createAtlasField(),
    envelope: ATLAS_ENVELOPE,
    trackerLayers: ATLAS_TRACKER_LAYERS,
    trackerEtaMax: 2.5,
    trackerOuter: { rMax: 1.08, zMax: 2.72 },
    ecal: ATLAS_ECAL,
    hcal: ATLAS_HCAL,
    muonStations: ATLAS_MUON_STATIONS,
    muonEtaMax: 2.7,
    // Inner detector: σ(pT)/pT ≈ 0.05 %·pT ⊕ 1 %  (JINST 3 S08003)
    trackResolution: { a: 0.0005, b: 0.01 },
    // Combined muons (ID + MS), educational: ≈1.5–2 % at 50–100 GeV
    muonResolution: { a: 0.0001, b: 0.015 },
    geometry: ATLAS_GEOMETRY,
    notes: [
      'Simplified geometry — not engineering CAD.',
      'Field: Phase 2 default is an interpolated finite-solenoid map in the inner detector with the Phase 1 regional model (tile return, 1/r toroids) as fallback; the regional model remains selectable.',
      'FCal (3.1 < |η| < 4.9) is geometry only; the response grids end at |η| = 3.2.',
    ],
  };
}
