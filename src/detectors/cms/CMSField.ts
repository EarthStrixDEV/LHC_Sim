/**
 * CMS field — test/comparison configuration.
 *  - Superconducting solenoid: Bz ≈ 3.8 T inside r < 2.95 m, |z| < 6.0 m (uniform; the real
 *    field is ~3.8 T at the centre and falls near the coil ends).
 *  - Return yoke (barrel iron, r 4.0–7.0 m): ≈ −1.8 T axial, order of magnitude of the
 *    field in the saturated steel of the barrel wheels (gaps between wheels ignored).
 */
import { RegionalField } from '../../physics/propagation/RegionalField';
import { UniformField } from '../../physics/propagation/UniformField';

export const CMS_SOLENOID_B = 3.8;

export function createCmsField(): RegionalField {
  return new RegionalField(
    'cms-regional',
    'CMS 3.8 T solenoid + return yoke',
    [
      { name: 'Solenoid volume', rMin: 0, rMax: 2.95, zMin: 0, zMax: 6.0, symmetricZ: true, shape: { kind: 'axial', bz: CMS_SOLENOID_B }, note: '3.8 T axial' },
      { name: 'Barrel return yoke', rMin: 4.0, rMax: 7.0, zMin: 0, zMax: 6.5, symmetricZ: true, shape: { kind: 'axial', bz: -1.8 }, note: 'return flux in iron' },
    ],
    'Test configuration: uniform 3.8 T solenoid and a uniform −1.8 T return-yoke region. Not a field map.',
  );
}

/** Pure uniform 3.8 T field (for unit tests of helix propagation). */
export function createCmsUniformField(): UniformField {
  return new UniformField(CMS_SOLENOID_B);
}
