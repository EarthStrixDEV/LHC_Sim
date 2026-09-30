/**
 * Detector-specific field maps (Phase 2), built once and cached.
 *
 * ATLAS: the central solenoid is replaced by an (r, z) map of an ideal finite solenoid
 *   (a = 1.23 m, L = 5.3 m, 2 T at the centre), which reproduces the end fall-off the
 *   Phase 1 regional model ignored. Outside the mapped volume the Phase 1 regional model
 *   (tile flux return, 1/r toroids) is the analytic fallback.
 * CMS: finite solenoid map (a = 3.15 m, L = 12.5 m, 3.8 T at the centre) inside r < 3.9 m,
 *   |z| < 6.5 m; the barrel return yoke (−1.8 T) comes from the regional model.
 *
 * Coil dimensions are approximate (VERIFY). A vacuum current sheet has no iron: the real
 * yoke makes the field inside the coil more uniform, so the end fall-off here is somewhat
 * stronger than in the real magnets. Reproduced in known-approximations.md.
 */
import { createAtlasField } from '../../detectors/atlas/ATLASField';
import { CMS_SOLENOID_B, createCmsField } from '../../detectors/cms/CMSField';
import type { MagneticField } from '../../physics/propagation/MagneticField';
import { AxisymmetricFieldMap, CompositeField, GridFieldMap3D } from './FieldMap';
import { createAliceField } from '../../detectors/alice/ALICEDetector';
import { createLhcbField } from '../../detectors/lhcb/LHCbDetector';
import { SumField } from '../../physics/propagation/DipoleField';
import { FiniteSolenoidField } from './FiniteSolenoid';

export const ATLAS_SOLENOID = { radiusM: 1.23, lengthM: 5.3, centralT: 2.0 } as const;
export const CMS_SOLENOID = { radiusM: 3.15, lengthM: 12.5, centralT: CMS_SOLENOID_B } as const;

let atlas: MagneticField | null = null;
let cms: MagneticField | null = null;

export function atlasSolenoidMap(): AxisymmetricFieldMap {
  const sol = new FiniteSolenoidField(ATLAS_SOLENOID.radiusM, ATLAS_SOLENOID.lengthM, ATLAS_SOLENOID.centralT, 'ATLAS central solenoid');
  return AxisymmetricFieldMap.fromField(sol, { min: 0, max: 2.2, n: 111 }, { min: 0, max: 3.4, n: 171 }, true);
}

export function cmsSolenoidMap(): AxisymmetricFieldMap {
  const sol = new FiniteSolenoidField(CMS_SOLENOID.radiusM, CMS_SOLENOID.lengthM, CMS_SOLENOID.centralT, 'CMS solenoid');
  return AxisymmetricFieldMap.fromField(sol, { min: 0, max: 3.9, n: 79 }, { min: 0, max: 6.5, n: 131 }, true);
}

export function createAtlasFieldMap(): MagneticField {
  if (!atlas) {
    const map = atlasSolenoidMap();
    atlas = new CompositeField(
      'atlas-fieldmap',
      'ATLAS field map (solenoid r–z map + regional toroids)',
      'Solenoid: interpolated (r, z) map of a finite 2 T solenoid (end fall-off included). Tile return and 1/r toroids: Phase 1 analytic regions (fallback). Not the official ATLAS map.',
      [{ within: (r, z) => r <= 2.2 && Math.abs(z) <= 3.4, field: map }],
      createAtlasField(),
    );
  }
  return atlas;
}

export function createCmsFieldMap(): MagneticField {
  if (!cms) {
    const map = cmsSolenoidMap();
    cms = new CompositeField(
      'cms-fieldmap',
      'CMS field map (3.8 T solenoid r–z map + return yoke)',
      'Solenoid: interpolated (r, z) map of a finite 3.8 T solenoid. Barrel return yoke: uniform −1.8 T region (fallback). Not the official CMS map.',
      [{ within: (r, z) => r <= 3.9 && Math.abs(z) <= 6.5, field: map }],
      createCmsField(),
    );
  }
  return cms;
}

let alice: MagneticField | null = null;
let lhcb: MagneticField | null = null;

/**
 * ALICE: (r, z) map of the large L3 solenoid (a ≈ 5.93 m, L ≈ 14.1 m, 0.5 T — VERIFY; the real
 * magnet is octagonal) plus the analytic muon-arm dipole.
 */
export function createAliceFieldMap(): MagneticField {
  if (!alice) {
    const sol = new FiniteSolenoidField(5.93, 14.1, 0.5, 'ALICE L3 solenoid');
    const map = AxisymmetricFieldMap.fromField(sol, { min: 0, max: 5.9, n: 60 }, { min: 0, max: 7.5, n: 76 }, true);
    alice = new SumField('alice-fieldmap', 'ALICE field map (L3 r–z map + muon dipole)', 'L3: interpolated (r, z) map of a finite 0.5 T solenoid (zero outside the mapped volume); muon arm: Gaussian 3 T·m dipole. Not the official ALICE map.', [map, createAliceField().parts[1]!]);
  }
  return alice;
}

/** LHCb: the dipole tabulated on a 3D Cartesian grid (trilinear interpolation). */
export function createLhcbFieldMap(): MagneticField {
  if (!lhcb) {
    lhcb = GridFieldMap3D.fromField(createLhcbField(), { min: -4, max: 4, n: 17 }, { min: -3.5, max: 3.5, n: 15 }, { min: -0.5, max: 11, n: 116 }, { kind: 'zero' });
  }
  return lhcb;
}
