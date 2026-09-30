/**
 * Calorimeter cells with deposited energy (DETECTOR MEASUREMENT).
 * Cells live on a projective (η, φ) grid seen from the nominal interaction point.
 */
import type { CalorimeterSpec } from './DetectorModel';

export interface CaloCell {
  readonly calo: 'ecal' | 'hcal';
  readonly ieta: number;
  readonly iphi: number;
  /** Cell-centre η, φ. */
  readonly eta: number;
  readonly phi: number;
  /** Deposited (measured, smeared) energy [GeV]. */
  readonly energy: number;
  /** Earliest contributing arrival time [ns]. */
  readonly time: number;
  /** Truth contributors (bookkeeping only). */
  readonly contributors: readonly number[];
}

export function cellGrid(spec: CalorimeterSpec): { nEta: number; nPhi: number } {
  return {
    nEta: Math.ceil((2 * spec.etaMax) / spec.cellDEta),
    nPhi: Math.round((2 * Math.PI) / spec.cellDPhi),
  };
}

export function cellIndex(spec: CalorimeterSpec, eta: number, phi: number): { ieta: number; iphi: number } | null {
  if (Math.abs(eta) >= spec.etaMax) return null;
  const { nPhi } = cellGrid(spec);
  const ieta = Math.floor((eta + spec.etaMax) / spec.cellDEta);
  let iphi = Math.floor((phi + Math.PI) / spec.cellDPhi) % nPhi;
  if (iphi < 0) iphi += nPhi;
  return { ieta, iphi };
}

export function cellCentre(spec: CalorimeterSpec, ieta: number, iphi: number): { eta: number; phi: number } {
  return {
    eta: -spec.etaMax + (ieta + 0.5) * spec.cellDEta,
    phi: -Math.PI + (iphi + 0.5) * spec.cellDPhi,
  };
}

/**
 * Display geometry of a cell: barrel cells sit at radius [rMin, rMax]; beyond the barrel
 * edge η the cell is placed on the end-cap face at |z| ∈ [zMin, zMax].
 */
export function cellPlacement(spec: CalorimeterSpec, eta: number): { region: 'barrel' | 'endcap'; inner: number; outer: number } {
  const etaEdge = Math.asinh(spec.barrelZHalf / spec.barrelRMin);
  if (Math.abs(eta) < etaEdge) return { region: 'barrel', inner: spec.barrelRMin, outer: spec.barrelRMax };
  return { region: 'endcap', inner: spec.endcapZMin, outer: spec.endcapZMax };
}
