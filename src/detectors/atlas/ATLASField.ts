/**
 * Simplified ATLAS magnetic field — deliberately NOT one uniform 2 T everywhere.
 *
 * Regions (first match wins):
 *  1. Inner detector / central solenoid: Bz = 2.0 T for r < 1.23 m, |z| < 2.65 m.
 *     (Real field drops to ~1 T at the solenoid ends — not modelled.)
 *  2. Tile calorimeter (solenoid flux return through the tile steel): uniform −Bz chosen so
 *     the returned flux equals the solenoid flux Φ = 2 T·π(1.23 m)² ≈ 9.5 Wb spread over the
 *     tile annulus → ≈ −0.24 T (a coarse average; the real field is concentrated in steel).
 *  3. End-cap toroids: Bφ = B0·r0 / r, r ∈ [1.65, 5.35] m, |z| ∈ [8.5, 13] m, B0·r0 = 2.0 T·m.
 *  4. Barrel toroid: Bφ = B0·r0 / r, r ∈ [4.7, 10.05] m, |z| < 12.65 m, B0·r0 = 3.5 T·m,
 *     giving ∫B·dl ≈ 2.7 T·m radially (ATLAS quotes 1.5–5.5 T·m in the barrel).
 *  Elsewhere (LAr calorimeter gap, outside): 0 T.
 *
 * The 1/r form follows from Ampère's law for an ideal toroid; the 8-coil φ ripple is ignored.
 */
import { RegionalField, type FieldRegion } from '../../physics/propagation/RegionalField';

const SOLENOID_B = 2.0;
const SOLENOID_R = 1.23;
const TILE_R_MIN = 2.28;
const TILE_R_MAX = 4.25;
const TILE_RETURN_BZ = (-SOLENOID_B * SOLENOID_R ** 2) / (TILE_R_MAX ** 2 - TILE_R_MIN ** 2);

export const ATLAS_FIELD_REGIONS: readonly FieldRegion[] = [
  { name: 'Central solenoid', rMin: 0, rMax: SOLENOID_R, zMin: 0, zMax: 2.65, symmetricZ: true, shape: { kind: 'axial', bz: SOLENOID_B }, note: '2 T axial (inner detector)' },
  { name: 'Tile flux return', rMin: TILE_R_MIN, rMax: TILE_R_MAX, zMin: 0, zMax: 6.1, symmetricZ: true, shape: { kind: 'axial', bz: TILE_RETURN_BZ }, note: 'solenoid return flux in tile steel (averaged)' },
  { name: 'End-cap toroid', rMin: 1.65, rMax: 5.35, zMin: 8.5, zMax: 13.0, symmetricZ: true, shape: { kind: 'toroidal', b0r0: 2.0 }, note: 'Bφ ∝ 1/r' },
  { name: 'Barrel toroid', rMin: 4.7, rMax: 10.05, zMin: 0, zMax: 12.65, symmetricZ: true, shape: { kind: 'toroidal', b0r0: 3.5 }, note: 'Bφ ∝ 1/r' },
];

export function createAtlasField(): RegionalField {
  return new RegionalField(
    'atlas-regional',
    'ATLAS regional (solenoid + toroids)',
    ATLAS_FIELD_REGIONS,
    'Piecewise approximation: 2 T solenoid in the inner detector, averaged flux return in the tile calorimeter, ~0 T in the LAr calorimeter, 1/r toroidal fields in the muon spectrometer. Not a field map.',
  );
}
