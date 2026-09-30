/**
 * Anti-kT jet clustering (Cacciari, Salam, Soyez, JHEP 04 (2008) 063), E-scheme recombination.
 *
 *   d_ij = min(pT_i⁻², pT_j⁻²) · ΔR_ij² / R²,   d_iB = pT_i⁻²
 *
 * Implemented with per-particle nearest-neighbour caching (the "N²" strategy): O(N²)
 * typical, adequate for a few thousand calorimeter towers.
 *
 * A jet is an ALGORITHMIC object defined by this procedure — not a physical cone of matter.
 */
import { FourVector } from '../events/FourVector';

export interface JetInput {
  readonly p4: FourVector;
  /** Index into the caller's constituent list. */
  readonly index: number;
}

export interface ClusteredJet {
  readonly p4: FourVector;
  readonly constituents: readonly number[];
}

interface PJ {
  p4: FourVector;
  pt2inv: number;
  rap: number;
  phi: number;
  constituents: number[];
  nn: number;
  nnDist: number;
  alive: boolean;
}

export function antiKt(inputs: readonly JetInput[], R: number): ClusteredJet[] {
  const R2 = R * R;
  const pj: PJ[] = inputs
    .filter((i) => i.p4.pt() > 0)
    .map((i) => {
      const pt = i.p4.pt();
      return { p4: i.p4, pt2inv: 1 / (pt * pt), rap: i.p4.rapidity(), phi: i.p4.phi(), constituents: [i.index], nn: -1, nnDist: R2, alive: true };
    });
  const n = pj.length;
  const dist2 = (a: PJ, b: PJ): number => {
    let dphi = Math.abs(a.phi - b.phi);
    if (dphi > Math.PI) dphi = 2 * Math.PI - dphi;
    const dy = a.rap - b.rap;
    return dy * dy + dphi * dphi;
  };
  const updateNN = (i: number): void => {
    const a = pj[i]!;
    a.nn = -1;
    a.nnDist = R2;
    for (let j = 0; j < n; j++) {
      if (j === i || !pj[j]!.alive) continue;
      const d = dist2(a, pj[j]!);
      if (d < a.nnDist) {
        a.nnDist = d;
        a.nn = j;
      }
    }
  };
  for (let i = 0; i < n; i++) updateNN(i);

  const jets: ClusteredJet[] = [];
  let alive = n;
  while (alive > 0) {
    // Find minimum d over all alive: d_i = pt2inv_i * nnDist_i / R² (with nnDist = R² for beam).
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const a = pj[i]!;
      if (!a.alive) continue;
      const kt = a.nn >= 0 ? Math.min(a.pt2inv, pj[a.nn]!.pt2inv) : a.pt2inv;
      const d = (kt * a.nnDist) / R2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const a = pj[best]!;
    if (a.nn < 0) {
      // Closest to the beam: final jet.
      a.alive = false;
      alive--;
      jets.push({ p4: a.p4, constituents: a.constituents });
      for (let k = 0; k < n; k++) if (pj[k]!.alive && pj[k]!.nn === best) updateNN(k);
    } else {
      const j = a.nn;
      const b = pj[j]!;
      const merged = a.p4.add(b.p4);
      const pt = merged.pt();
      a.p4 = merged;
      a.pt2inv = pt > 0 ? 1 / (pt * pt) : Number.POSITIVE_INFINITY;
      a.rap = merged.rapidity();
      a.phi = merged.phi();
      a.constituents = a.constituents.concat(b.constituents);
      b.alive = false;
      alive--;
      for (let k = 0; k < n; k++) {
        const c = pj[k]!;
        if (!c.alive) continue;
        if (k === best || c.nn === best || c.nn === j) updateNN(k);
        else {
          const d = dist2(c, a);
          if (d < c.nnDist) {
            c.nnDist = d;
            c.nn = best;
          }
        }
      }
    }
  }
  return jets.sort((x, y) => y.p4.pt() - x.p4.pt());
}
