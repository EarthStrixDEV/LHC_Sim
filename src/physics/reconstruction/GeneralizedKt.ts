/**
 * Generalized-kT sequential recombination (educational; E-scheme):
 *
 *   d_ij = min(kT_i^{2p}, kT_j^{2p}) · ΔR_ij² / R²,     d_iB = kT_i^{2p}
 *   ΔR² = Δy² + Δφ²   (y = η for the massless calorimeter clusters used here)
 *
 *   p = −1 anti-kT · p = 0 Cambridge/Aachen · p = 1 kT
 *
 * Repeatedly take the smallest distance: if it is a d_ij, merge i and j; if it is a d_iB,
 * declare i a jet. Nearest-neighbour caching (only geometric ΔR matters for each particle's
 * neighbour, because min(kT_i, kT_j)^{2p} factorizes per pair as in FastJet's N² strategy)
 * keeps the cost O(N²). Deterministic: ties resolve to the lowest index.
 * A jet is the result of this algorithm — not a physical cone of matter.
 */

export type JetAlgorithmP = -1 | 0 | 1;

export const JET_ALGORITHM_NAME: Record<JetAlgorithmP, string> = { [-1]: 'anti-kT', 0: 'Cambridge/Aachen', 1: 'kT' };

export interface PseudoJetInput {
  /** [E, px, py, pz] GeV. */
  readonly p4: readonly [number, number, number, number];
}

export interface GKtJet {
  readonly p4: [number, number, number, number];
  readonly pt: number;
  readonly y: number;
  readonly phi: number;
  readonly constituents: readonly number[];
}

interface PJ {
  e: number; px: number; py: number; pz: number;
  y: number; phi: number; kt2p: number;
  constituents: number[];
  nn: number; nnDR2: number;
  alive: boolean;
}

function kinematics(e: number, px: number, py: number, pz: number, p: JetAlgorithmP): { y: number; phi: number; kt2p: number } {
  const pt2 = px * px + py * py;
  const y = e > Math.abs(pz) ? 0.5 * Math.log((e + pz) / (e - pz)) : Math.sign(pz) * 1e3;
  const kt2p = p === 0 ? 1 : p === 1 ? pt2 : 1 / pt2;
  return { y, phi: Math.atan2(py, px), kt2p };
}

export function generalizedKt(inputs: readonly PseudoJetInput[], R: number, p: JetAlgorithmP): GKtJet[] {
  const R2 = R * R;
  const pj: PJ[] = [];
  inputs.forEach((inp, i) => {
    const [e, px, py, pz] = inp.p4;
    if (px * px + py * py <= 0) return;
    pj.push({ e, px, py, pz, ...kinematics(e, px, py, pz, p), constituents: [i], nn: -1, nnDR2: R2, alive: true });
  });
  const n = pj.length;
  const dr2 = (a: PJ, b: PJ): number => {
    let dphi = Math.abs(a.phi - b.phi);
    if (dphi > Math.PI) dphi = 2 * Math.PI - dphi;
    const dy = a.y - b.y;
    return dy * dy + dphi * dphi;
  };
  const updateNN = (i: number): void => {
    const a = pj[i]!;
    a.nn = -1;
    a.nnDR2 = R2;
    for (let j = 0; j < n; j++) {
      if (j === i || !pj[j]!.alive) continue;
      const d = dr2(a, pj[j]!);
      if (d < a.nnDR2) {
        a.nnDR2 = d;
        a.nn = j;
      }
    }
  };
  for (let i = 0; i < n; i++) updateNN(i);
  // d_i = kT_i^{2p}·ΔR²/R² with its nearest neighbour when that neighbour has a smaller kT^{2p}
  // is equivalent to min(kT_i^{2p}, kT_j^{2p}); using min over the pair directly:
  const dij = (i: number): number => {
    const a = pj[i]!;
    if (a.nn < 0) return a.kt2p; // beam distance
    return Math.min(a.kt2p, pj[a.nn]!.kt2p) * (a.nnDR2 / R2);
  };
  const jets: GKtJet[] = [];
  let alive = n;
  while (alive > 0) {
    let best = -1, bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!pj[i]!.alive) continue;
      const d = dij(i);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = pj[best]!;
    if (a.nn >= 0 && dij(best) < a.kt2p) {
      // Merge best and its neighbour (E-scheme).
      const b = pj[a.nn]!;
      const e = a.e + b.e, px = a.px + b.px, py = a.py + b.py, pz = a.pz + b.pz;
      Object.assign(a, { e, px, py, pz, ...kinematics(e, px, py, pz, p) });
      a.constituents = [...a.constituents, ...b.constituents];
      b.alive = false;
      alive--;
      const merged = pj.indexOf(b);
      for (let j = 0; j < n; j++) if (pj[j]!.alive && (j === best || pj[j]!.nn === best || pj[j]!.nn === merged)) updateNN(j);
      // The merged pseudo-jet may now be the nearest neighbour of others.
      for (let j = 0; j < n; j++) {
        if (!pj[j]!.alive || j === best) continue;
        const d = dr2(pj[j]!, a);
        if (d < pj[j]!.nnDR2) {
          pj[j]!.nnDR2 = d;
          pj[j]!.nn = best;
        }
      }
    } else {
      a.alive = false;
      alive--;
      jets.push({ p4: [a.e, a.px, a.py, a.pz], pt: Math.hypot(a.px, a.py), y: a.y, phi: a.phi, constituents: a.constituents });
      for (let j = 0; j < n; j++) if (pj[j]!.alive && pj[j]!.nn === best) updateNN(j);
    }
  }
  return jets.sort((x, y) => y.pt - x.pt);
}
