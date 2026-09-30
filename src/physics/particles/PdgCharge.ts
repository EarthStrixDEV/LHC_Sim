/**
 * Electric charge from a PDG Monte-Carlo particle code, for codes outside the curated
 * ParticleDatabase (generators emit hundreds of hadron species).
 *
 * Uses the PDG numbering scheme: hadron codes ±n_r n_L n_q1 n_q2 n_q3 n_J.
 *  - mesons (n_q1 = 0):  Q = [q(n_q2) − q(n_q3)] · (−1)^{n_q2}   (e.g. 211 → +1, 321 → +1, 521 → +1)
 *  - baryons / diquarks: Q = q(n_q1) + q(n_q2) + q(n_q3)
 * then multiplied by sign(code). Nuclei (10LZZZAAAI) give Q = Z.
 */
import { ParticleDatabase } from './ParticleDatabase';

const QUARK_CHARGE = [0, -1 / 3, 2 / 3, -1 / 3, 2 / 3, -1 / 3, 2 / 3];

/** Fundamental/special codes with fixed charge (positive-code convention). */
const FIXED: ReadonlyMap<number, number> = new Map([
  [11, -1], [12, 0], [13, -1], [14, 0], [15, -1], [16, 0], [17, -1], [18, 0],
  [21, 0], [22, 0], [23, 0], [24, 1], [25, 0], [32, 0], [33, 0], [34, 1], [35, 0], [36, 0], [37, 1],
  [81, 0], [82, 0], [83, 0], [90, 0], [91, 0], [92, 0], [93, 0], [99, 0], [990, 0],
]);

export function pdgCharge(pdg: number): number {
  const a = Math.abs(pdg);
  const sign = pdg < 0 ? -1 : 1;
  if (a === 0) return 0;
  if (a >= 1_000_000_000) return ParticleDatabase.lookup(pdg).charge;
  if (a <= 6) return sign * QUARK_CHARGE[a]!;
  const fixed = FIXED.get(a);
  if (fixed !== undefined) return sign * fixed;
  if (ParticleDatabase.has(pdg)) {
    const def = ParticleDatabase.lookup(pdg);
    if (!def.name.startsWith('unknown')) return def.charge;
  }
  const n = a % 10_000;
  const q3 = Math.floor(n / 10) % 10;
  const q2 = Math.floor(n / 100) % 10;
  const q1 = Math.floor(n / 1000) % 10;
  if (q1 > 6 || q2 > 6 || q3 > 6) return 0;
  let q: number;
  if (q1 === 0) {
    if (q2 === 0) return 0;
    q = (QUARK_CHARGE[q2]! - QUARK_CHARGE[q3]!) * (q2 % 2 === 1 ? -1 : 1);
  } else {
    q = QUARK_CHARGE[q1]! + QUARK_CHARGE[q2]! + QUARK_CHARGE[q3]!;
  }
  return sign * Math.round(q * 3) / 3;
}
