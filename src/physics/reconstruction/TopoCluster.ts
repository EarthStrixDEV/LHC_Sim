/**
 * Topological calorimeter clustering (educational, "4-2-0" scheme as used by ATLAS):
 *   seeds:      cells with E > 4σ_noise
 *   growth:     neighbours (8-connected in η–φ) with E > 2σ_noise extend the cluster and
 *               propagate growth
 *   boundary:   all remaining neighbours (E > 0) are added once, without propagation
 * Seeds are processed in decreasing energy; a cell belongs to the first cluster reaching it
 * (no cluster splitting). σ_noise per calorimeter is taken as half the cell threshold
 * (educational choice — the real noise is cell- and layer-dependent).
 */
import { cellGrid, type CaloCell } from '../detector/CalorimeterDeposit';
import type { CalorimeterSpec } from '../detector/DetectorModel';

export interface TopoCluster {
  readonly calo: 'ecal' | 'hcal';
  readonly energy: number;
  readonly eta: number;
  readonly phi: number;
  readonly et: number;
  readonly nCells: number;
  /** [E, px, py, pz] (massless). */
  readonly p4: [number, number, number, number];
}

export const TOPO_THRESHOLDS = { seed: 4, grow: 2, boundary: 0 } as const;

export function topoClusters(cells: readonly CaloCell[], spec: CalorimeterSpec): TopoCluster[] {
  if (cells.length === 0) return [];
  const sigma = spec.cellThresholdGeV / 2;
  const { nPhi } = cellGrid(spec);
  const key = (ie: number, ip: number) => ie * nPhi + ((ip + nPhi) % nPhi);
  const byKey = new Map<number, CaloCell>();
  for (const c of cells) byKey.set(key(c.ieta, c.iphi), c);
  const owner = new Map<number, number>();
  const clusters: CaloCell[][] = [];
  const seeds = cells.filter((c) => c.energy > TOPO_THRESHOLDS.seed * sigma).sort((a, b) => b.energy - a.energy || a.ieta - b.ieta || a.iphi - b.iphi);
  for (const s of seeds) {
    const k0 = key(s.ieta, s.iphi);
    if (owner.has(k0)) continue;
    const id = clusters.length;
    const members: CaloCell[] = [s];
    owner.set(k0, id);
    const queue = [s];
    const boundary: CaloCell[] = [];
    while (queue.length) {
      const c = queue.shift()!;
      for (let de = -1; de <= 1; de++)
        for (let dp = -1; dp <= 1; dp++) {
          if (!de && !dp) continue;
          const k = key(c.ieta + de, c.iphi + dp);
          const nb = byKey.get(k);
          if (!nb || owner.has(k)) continue;
          if (nb.energy > TOPO_THRESHOLDS.grow * sigma) {
            owner.set(k, id);
            members.push(nb);
            queue.push(nb);
          } else if (nb.energy > TOPO_THRESHOLDS.boundary * sigma) {
            boundary.push(nb);
          }
        }
    }
    for (const b of boundary) {
      const k = key(b.ieta, b.iphi);
      if (owner.has(k)) continue;
      owner.set(k, id);
      members.push(b);
    }
    clusters.push(members);
  }
  return clusters.map((m) => {
    let E = 0, px = 0, py = 0, pz = 0;
    for (const c of m) {
      const et = c.energy / Math.cosh(c.eta);
      E += c.energy;
      px += et * Math.cos(c.phi);
      py += et * Math.sin(c.phi);
      pz += et * Math.sinh(c.eta);
    }
    // Massless cluster four-vector along the energy-weighted direction.
    const p = Math.hypot(px, py, pz) || 1;
    const f = E / p;
    const p4: [number, number, number, number] = [E, px * f, py * f, pz * f];
    const pt = Math.hypot(p4[1], p4[2]);
    return { calo: spec.kind, energy: E, eta: Math.asinh(p4[3] / (pt || 1e-12)), phi: Math.atan2(p4[2], p4[1]), et: pt, nCells: m.length, p4 };
  });
}
