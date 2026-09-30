/**
 * Educational two-level trigger:
 *
 *   Bunch crossing → detector activity → Level-1 (fast, coarse) → High-Level Trigger → recorded
 *
 * Level-1 emulation uses coarse quantities only: calorimeter trigger towers (Δη × Δφ = 0.1 × 0.1
 * sums of ECAL/HCAL cells, 1 GeV ET granularity) and muon candidates with a coarse pT
 * (rounded down to the threshold ladder). HLT uses the reconstructed objects with tighter
 * thresholds and isolation.
 *
 * Thresholds are ILLUSTRATIVE, of the magnitude used in Run-2/Run-3 menus; they are not the
 * configuration of the ATLAS or CMS trigger.
 */
import type { CaloCell } from '../detector/CalorimeterDeposit';
import type { ReconstructedEvent } from '../reconstruction/ReconstructedObject';

export type TriggerItemId = 'single-muon' | 'single-electron' | 'diphoton' | 'jet' | 'met';

export interface TriggerItem {
  readonly id: TriggerItemId;
  readonly label: string;
  readonly l1: string;
  readonly hlt: string;
  readonly l1Threshold: number;
  readonly hltThreshold: number;
  /** Relative isolation cut at HLT (sum pT in cone / pT); Infinity = none. */
  readonly hltIsolation: number;
  enabled: boolean;
}

export function defaultMenu(): TriggerItem[] {
  return [
    { id: 'single-muon', label: 'Single muon', l1: 'L1 μ ≥ 20 GeV', hlt: 'HLT isolated μ, pT > 26 GeV', l1Threshold: 20, hltThreshold: 26, hltIsolation: 0.15, enabled: true },
    { id: 'single-electron', label: 'Single electron', l1: 'L1 EM tower ≥ 22 GeV', hlt: 'HLT isolated e, pT > 26 GeV', l1Threshold: 22, hltThreshold: 26, hltIsolation: 0.15, enabled: true },
    { id: 'diphoton', label: 'Diphoton', l1: 'L1 2 EM towers ≥ 15 GeV', hlt: 'HLT 2γ, pT > 35 / 25 GeV', l1Threshold: 15, hltThreshold: 25, hltIsolation: Number.POSITIVE_INFINITY, enabled: true },
    { id: 'jet', label: 'Single jet', l1: 'L1 jet (0.8×0.8 window) ≥ 100 GeV', hlt: 'HLT jet pT > 420 GeV', l1Threshold: 100, hltThreshold: 420, hltIsolation: Number.POSITIVE_INFINITY, enabled: true },
    { id: 'met', label: 'Missing ET', l1: 'L1 E_T^miss (towers) ≥ 50 GeV', hlt: 'HLT E_T^miss > 110 GeV', l1Threshold: 50, hltThreshold: 110, hltIsolation: Number.POSITIVE_INFINITY, enabled: true },
  ];
}

/** Level-1 inputs: coarse towers and muon candidates. */
export interface L1Inputs {
  readonly emTowersEt: readonly number[];
  readonly jetWindowsEt: readonly number[];
  readonly metEt: number;
  readonly muonPts: readonly number[];
}

const TOWER = 0.1;
const TOWER_ETA_MAX = 4.9;
const JET_WINDOW_TOWERS = 8;

function towerKey(eta: number, phi: number): number {
  const ie = Math.floor((eta + TOWER_ETA_MAX) / TOWER);
  const ip = Math.floor(((phi + Math.PI) / (2 * Math.PI)) * 63) % 63;
  return ie * 64 + ip;
}

/** Builds L1 inputs from calorimeter cells (ET = E / cosh η) and reconstructed muon pT. */
export function buildL1Inputs(ecal: readonly CaloCell[], hcal: readonly CaloCell[], reco: ReconstructedEvent): L1Inputs {
  const em = new Map<number, number>();
  const all = new Map<number, number>();
  let mx = 0, my = 0;
  const addCell = (c: CaloCell, isEm: boolean) => {
    const et = c.energy / Math.cosh(c.eta);
    const k = towerKey(c.eta, c.phi);
    if (isEm) em.set(k, (em.get(k) ?? 0) + et);
    all.set(k, (all.get(k) ?? 0) + et);
    mx -= et * Math.cos(c.phi);
    my -= et * Math.sin(c.phi);
  };
  for (const c of ecal) addCell(c, true);
  for (const c of hcal) addCell(c, false);
  // Jet windows: sums over 8×8 towers centred on local maxima (coarse, sliding by 2).
  const windows: number[] = [];
  const seen = new Set<string>();
  for (const [k] of [...all].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const ie0 = Math.floor(k / 64), ip0 = k % 64;
    const key = `${Math.floor(ie0 / 2)}:${Math.floor(ip0 / 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let s = 0;
    for (let de = -JET_WINDOW_TOWERS / 2; de < JET_WINDOW_TOWERS / 2; de++) {
      for (let dp = -JET_WINDOW_TOWERS / 2; dp < JET_WINDOW_TOWERS / 2; dp++) s += all.get((ie0 + de) * 64 + ((ip0 + dp + 63) % 63)) ?? 0;
    }
    windows.push(s);
  }
  // L1 muon candidates: coarse pT ladder (threshold granularity 1 GeV, rounded down).
  const muonPts = reco.muons.map((m) => Math.floor(m.pt));
  return { emTowersEt: [...em.values()].map((x) => Math.floor(x)).sort((a, b) => b - a), jetWindowsEt: windows.map(Math.floor).sort((a, b) => b - a), metEt: Math.floor(Math.hypot(mx, my)), muonPts };
}

export interface ItemDecision {
  readonly id: TriggerItemId;
  readonly l1: boolean;
  readonly hlt: boolean;
  readonly reason: string;
}

export interface TriggerDecision {
  readonly items: readonly ItemDecision[];
  readonly l1Accept: boolean;
  readonly hltAccept: boolean;
  /** Human-readable reason for the final decision. */
  readonly reason: string;
}

function isoOk(iso: number, cut: number): boolean {
  return !Number.isFinite(cut) || !Number.isFinite(iso) || iso < cut;
}

export function evaluateTrigger(menu: readonly TriggerItem[], l1: L1Inputs, reco: ReconstructedEvent): TriggerDecision {
  const items: ItemDecision[] = [];
  for (const it of menu) {
    if (!it.enabled) continue;
    let l1Pass = false, hltPass = false, reason = '';
    switch (it.id) {
      case 'single-muon': {
        l1Pass = l1.muonPts.some((p) => p >= it.l1Threshold);
        const m = reco.muons.find((x) => x.pt > it.hltThreshold && isoOk(x.isolation, it.hltIsolation));
        hltPass = l1Pass && !!m;
        reason = m ? `μ pT = ${m.pt.toFixed(1)} GeV` : `leading μ pT = ${(reco.muons[0]?.pt ?? 0).toFixed(1)} GeV`;
        break;
      }
      case 'single-electron': {
        l1Pass = (l1.emTowersEt[0] ?? 0) >= it.l1Threshold;
        const e = reco.electrons.find((x) => x.pt > it.hltThreshold && isoOk(x.isolation, it.hltIsolation));
        hltPass = l1Pass && !!e;
        reason = e ? `e pT = ${e.pt.toFixed(1)} GeV` : `leading EM tower ${l1.emTowersEt[0] ?? 0} GeV`;
        break;
      }
      case 'diphoton': {
        l1Pass = (l1.emTowersEt[1] ?? 0) >= it.l1Threshold;
        const g = reco.photons;
        hltPass = l1Pass && g.length >= 2 && g[0]!.pt > 35 && g[1]!.pt > it.hltThreshold;
        reason = g.length >= 2 ? `γ pT = ${g[0]!.pt.toFixed(1)}, ${g[1]!.pt.toFixed(1)} GeV` : `${g.length} photon(s)`;
        break;
      }
      case 'jet': {
        l1Pass = (l1.jetWindowsEt[0] ?? 0) >= it.l1Threshold;
        const j = reco.jets[0];
        hltPass = l1Pass && !!j && j.pt > it.hltThreshold;
        reason = j ? `leading jet pT = ${j.pt.toFixed(0)} GeV` : 'no jet';
        break;
      }
      case 'met': {
        l1Pass = l1.metEt >= it.l1Threshold;
        hltPass = l1Pass && !reco.met.unavailable && reco.met.met > it.hltThreshold;
        reason = `L1 E_T^miss ${l1.metEt} GeV, HLT ${reco.met.met.toFixed(0)} GeV`;
        break;
      }
    }
    items.push({ id: it.id, l1: l1Pass, hlt: hltPass, reason });
  }
  const l1Accept = items.some((i) => i.l1);
  const hltAccept = items.some((i) => i.hlt);
  const fired = items.filter((i) => i.hlt).map((i) => menu.find((m) => m.id === i.id)!.label);
  const reason = hltAccept ? `Recorded: ${fired.join(', ')}` : l1Accept ? 'Passed Level-1, rejected by the HLT' : 'Rejected at Level-1 (no coarse object above threshold)';
  return { items, l1Accept, hltAccept, reason };
}

/** Rate bookkeeping for a stream of decisions (fractions scale the input crossing rate). */
export interface TriggerRates {
  readonly inputRateHz: number;
  readonly l1RateHz: number;
  readonly hltRateHz: number;
  readonly rejectedRateHz: number;
}

export function triggerRates(inputRateHz: number, nEvents: number, nL1: number, nHlt: number): TriggerRates {
  const f = (k: number) => (nEvents > 0 ? (inputRateHz * k) / nEvents : 0);
  return { inputRateHz, l1RateHz: f(nL1), hltRateHz: f(nHlt), rejectedRateHz: inputRateHz - f(nHlt) };
}

/** Typical design budgets (order of magnitude, ATLAS/CMS Run 2–3). */
export const TRIGGER_BUDGETS = { l1OutputHz: 100e3, hltOutputHz: 1.5e3 } as const;
