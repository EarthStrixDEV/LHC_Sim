/**
 * Fully stripped ion species.
 *
 * Nuclear mass is derived from the tabulated neutral-atom mass:
 *     m_nucleus ≈ M_atom · u − Z · m_e
 * The total electron binding energy (≲1 MeV even for Pb, i.e. <1e-5 relative) is
 * neglected — see docs/known-approximations.md.
 */
import { ATOMIC_MASS_UNIT_GEV, ELECTRON_MASS_GEV } from '../constants/physicalConstants';
import type { BeamSpecies } from './ParticleDefinition';

export interface IonDefinition {
  readonly id: string;
  readonly element: string;
  readonly Z: number;
  readonly A: number;
  /** Neutral atomic mass [u] from AME2020. */
  readonly atomicMassU: number;
}

export function nuclearMassGeV(ion: IonDefinition): number {
  return ion.atomicMassU * ATOMIC_MASS_UNIT_GEV - ion.Z * ELECTRON_MASS_GEV;
}

/** PDG nuclear code 10LZZZAAAI (L = I = 0). */
export function nuclearPdgId(Z: number, A: number): number {
  return 1_000_000_000 + Z * 10_000 + A * 10;
}

export const IONS: readonly IonDefinition[] = [
  { id: 'Pb208', element: 'Pb', Z: 82, A: 208, atomicMassU: 207.976_652_5 },
  { id: 'Xe129', element: 'Xe', Z: 54, A: 129, atomicMassU: 128.904_780_861 },
  { id: 'Ne20', element: 'Ne', Z: 10, A: 20, atomicMassU: 19.992_440_176_2 },
  { id: 'O16', element: 'O', Z: 8, A: 16, atomicMassU: 15.994_914_619_26 },
];

export function ionToBeamSpecies(ion: IonDefinition): BeamSpecies {
  return {
    id: ion.id,
    label: `${ion.element}-${ion.A} (Z=${ion.Z})`,
    symbol: `${ion.A}${ion.element}${ion.Z}+`,
    kind: 'ion',
    massGeV: nuclearMassGeV(ion),
    chargeE: ion.Z,
    Z: ion.Z,
    A: ion.A,
    pdgId: nuclearPdgId(ion.Z, ion.A),
    circulatable: true,
    source: 'AME2020 atomic mass; fully stripped nucleus',
  };
}
