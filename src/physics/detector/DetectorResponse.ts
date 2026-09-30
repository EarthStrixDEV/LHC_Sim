/**
 * Simplified, parameterized detector response — EDUCATIONAL, not Geant4.
 *
 * TRUTH (propagated trajectories) → DETECTOR MEASUREMENTS:
 *  - Tracker hits where a charged trajectory crosses a barrel layer or end-cap disk
 *    (per-layer efficiency, Gaussian position smearing in the transverse plane).
 *  - Calorimeter deposits at the trajectory's calorimeter impact point:
 *      e±, γ      → EM shower: all energy in ECAL, fixed 3×3-cell lateral profile;
 *      hadrons    → random EM fraction f ∈ [0.1, 0.5] in ECAL, remainder in HCAL (3×3 profile);
 *      muons      → minimum-ionizing deposits (constant 0.3 GeV ECAL, 2.5 GeV HCAL);
 *      neutrinos  → nothing.
 *    Energies are smeared with σ/E = s/√E ⊕ c. No longitudinal shower development,
 *    no noise, no pile-up in the calorimeters, no e/h non-compensation.
 *  - Muon-system hits where muon trajectories cross the muon stations.
 *
 * All randomness is seeded from (event seed, particle id) → deterministic.
 */
import type { TruthEvent } from '../events/Event';
import type { TrackRecord } from '../propagation/EventPropagation';
import { Rng, seedFrom } from '../../utils/math';
import { caloResolution, type CalorimeterSpec, type DetectorModel } from './DetectorModel';
import { SUBSYSTEM_CODE, type MuonHit, type TrackerHits } from './DetectorHit';
import { cellCentre, cellGrid, cellIndex, type CaloCell } from './CalorimeterDeposit';
import { channelHash, type ChannelScenario } from '../../detector/response/ResponseConfig';
import { samplePoisson } from '../pileup/PileUp';

/** Lateral 3×3 profiles [centre, each of 4 edges, each of 4 corners]; each sums to 1. */
const EM_PROFILE = { centre: 0.72, edge: 0.05, corner: 0.02 } as const;
const HAD_PROFILE = { centre: 0.5, edge: 0.08, corner: 0.045 } as const;
/** Minimum-ionizing muon deposits [GeV] (order of magnitude for ATLAS-like depths). */
const MUON_MIP_ECAL_GEV = 0.3;
const MUON_MIP_HCAL_GEV = 2.5;
const HADRON_EM_FRACTION = { min: 0.1, max: 0.5 } as const;

export interface CaloImpact {
  readonly particleId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly t: number;
  /** η, φ of the impact point seen from the nominal IP. */
  readonly eta: number;
  readonly phi: number;
}

export interface DetectorResponseResult {
  readonly hits: TrackerHits;
  readonly ecal: readonly CaloCell[];
  readonly hcal: readonly CaloCell[];
  readonly muonHits: readonly MuonHit[];
  readonly impacts: ReadonlyMap<number, CaloImpact>;
  /** Number of tracker hits per truth particle (used by reconstruction). */
  readonly hitCounts: ReadonlyMap<number, number>;
  /** Muon stations crossed per truth particle. */
  readonly muonStationCounts: ReadonlyMap<number, number>;
}

const NOMINAL_SCENARIO: ChannelScenario = { deadFraction: 0, noisyCellsPerEvent: 0, noiseMeanGeV: 0.5, caloEnergyScale: 1 };
/** Tracker modules per layer in φ for the dead-module map. */
const MODULES_PER_LAYER = 48;

export function simulateResponse(event: TruthEvent, det: DetectorModel, tracks: readonly TrackRecord[], scenario: ChannelScenario = NOMINAL_SCENARIO): DetectorResponseResult {
  const hitPos: number[] = [];
  const hitTime: number[] = [];
  const hitPid: number[] = [];
  const hitSub: number[] = [];
  const hitCounts = new Map<number, number>();
  const muonHits: MuonHit[] = [];
  const muonStationCounts = new Map<number, number>();
  const impacts = new Map<number, CaloImpact>();
  const ecal = new CellAccumulator(det.ecal);
  const hcal = new CellAccumulator(det.hcal);

  for (const tr of tracks) {
    const rng = new Rng(seedFrom(event.seed, 'response', tr.particleId));
    const s = tr.samples;

    // --- Tracker hits ---
    if (tr.kind === 'charged') {
      const n0 = hitTime.length;
      for (let i = 0; i + 1 < s.count; i++) {
        const x0 = s.positions[3 * i]!, y0 = s.positions[3 * i + 1]!, z0 = s.positions[3 * i + 2]!;
        const x1 = s.positions[3 * i + 3]!, y1 = s.positions[3 * i + 4]!, z1 = s.positions[3 * i + 5]!;
        const r0 = Math.hypot(x0, y0), r1 = Math.hypot(x1, y1);
        if (Math.min(r0, r1) > det.trackerOuter.rMax || Math.min(Math.abs(z0), Math.abs(z1)) > det.trackerOuter.zMax) continue;
        for (let li = 0; li < det.trackerLayers.length; li++) {
          const layer = det.trackerLayers[li]!;
          let f = -1;
          if (layer.kind === 'barrel') {
            const R = layer.rMin;
            if ((r0 - R) * (r1 - R) < 0) f = (R - r0) / (r1 - r0);
          } else {
            const Z = z1 >= z0 ? layer.z : -layer.z;
            if ((z0 - Z) * (z1 - Z) < 0) f = (Z - z0) / (z1 - z0);
            else if ((z0 + Z) * (z1 + Z) < 0) f = (-Z - z0) / (z1 - z0);
          }
          if (f < 0) continue;
          // Exact position on the local helix arc (chords between stored samples would misplace
          // hits by up to ~Rθ²/8 for soft tracks); falls back to the chord if the arc is degenerate.
          const arc = arcCrossing(s.positions, s.count, i, layer.kind === 'barrel' ? { r: layer.rMin } : { z: z1 >= z0 ? layer.z : -layer.z });
          const hx = arc ? arc[0] : x0 + (x1 - x0) * f, hy = arc ? arc[1] : y0 + (y1 - y0) * f, hz = arc ? arc[2] : z0 + (z1 - z0) * f;
          const hr = Math.hypot(hx, hy);
          if (layer.kind === 'barrel' ? Math.abs(hz) > layer.z : hr < layer.rMin || hr > layer.rMax) continue;
          if (layer.side !== undefined && Math.sign(hz) !== layer.side) continue;
          if (scenario.deadFraction > 0) {
            const sector = Math.floor(((Math.atan2(hy, hx) + Math.PI) / (2 * Math.PI)) * MODULES_PER_LAYER) % MODULES_PER_LAYER;
            if (channelHash(det.id, (li * 2 + (hz < 0 ? 1 : 0)) * MODULES_PER_LAYER + sector) < scenario.deadFraction) continue;
          }
          if (!rng.bernoulli(layer.efficiency)) continue;
          // Smear along the local φ direction (bending-plane resolution).
          const d = rng.gaussian(0, layer.resolutionM);
          const ex = hr > 0 ? -hy / hr : 0, ey = hr > 0 ? hx / hr : 0;
          hitPos.push(hx + d * ex, hy + d * ey, hz);
          hitTime.push(s.times[i]! + (s.times[i + 1]! - s.times[i]!) * f);
          hitPid.push(tr.particleId);
          hitSub.push(SUBSYSTEM_CODE[layer.subsystem]);
        }
      }
      hitCounts.set(tr.particleId, hitTime.length - n0);
    }

    // --- Muon system ---
    if (Math.abs(tr.pdgId) === 13) {
      const stations = new Set<string>();
      for (let i = 0; i + 1 < s.count; i++) {
        const x0 = s.positions[3 * i]!, y0 = s.positions[3 * i + 1]!, z0 = s.positions[3 * i + 2]!;
        const x1 = s.positions[3 * i + 3]!, y1 = s.positions[3 * i + 4]!, z1 = s.positions[3 * i + 5]!;
        const r0 = Math.hypot(x0, y0), r1 = Math.hypot(x1, y1);
        for (const st of det.muonStations) {
          let f = -1;
          if (st.kind === 'barrel') {
            if ((r0 - st.rMin) * (r1 - st.rMin) < 0) f = (st.rMin - r0) / (r1 - r0);
          } else if ((Math.abs(z0) - st.z) * (Math.abs(z1) - st.z) < 0) {
            f = (st.z - Math.abs(z0)) / (Math.abs(z1) - Math.abs(z0));
          }
          if (f < 0) continue;
          const hx = x0 + (x1 - x0) * f, hy = y0 + (y1 - y0) * f, hz = z0 + (z1 - z0) * f;
          const hr = Math.hypot(hx, hy);
          if (st.kind === 'barrel' ? Math.abs(hz) > st.z : hr < st.rMin || hr > st.rMax) continue;
          if (st.side !== undefined && Math.sign(hz) !== st.side) continue;
          const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1;
          muonHits.push({ particleId: tr.particleId, station: st.name, x: hx, y: hy, z: hz, dx: (x1 - x0) / len, dy: (y1 - y0) / len, dz: (z1 - z0) / len, t: s.times[i]! });
          stations.add(st.name);
        }
      }
      muonStationCounts.set(tr.particleId, stations.size);
    }

    // --- Calorimeter impact ---
    if (tr.kind === 'neutrino' || tr.stopSurface === 'decay') continue;
    const impact = findCaloImpact(tr, det);
    if (!impact) continue;
    impacts.set(tr.particleId, impact);
    const a = Math.abs(tr.pdgId);
    if (a === 13) {
      ecal.deposit(impact, MUON_MIP_ECAL_GEV, EM_PROFILE, tr.particleId);
      hcal.deposit(impact, MUON_MIP_HCAL_GEV, HAD_PROFILE, tr.particleId);
    } else if (a === 11 || a === 22) {
      ecal.deposit(impact, smear(det.ecal, tr.energy, rng), EM_PROFILE, tr.particleId);
    } else {
      const fEm = rng.uniform(HADRON_EM_FRACTION.min, HADRON_EM_FRACTION.max);
      ecal.deposit(impact, smear(det.hcal, tr.energy * fEm, rng), HAD_PROFILE, tr.particleId);
      hcal.deposit(impact, smear(det.hcal, tr.energy * (1 - fEm), rng), HAD_PROFILE, tr.particleId);
    }
  }

  return {
    hits: {
      positions: Float32Array.from(hitPos),
      times: Float32Array.from(hitTime),
      particleIds: Int32Array.from(hitPid),
      subsystems: Uint8Array.from(hitSub),
      count: hitTime.length,
    },
    ecal: ecal.cells(scenario, det.id, new Rng(seedFrom(event.seed, 'noise-ecal'))),
    hcal: det.hcal.present === false ? [] : hcal.cells(scenario, det.id, new Rng(seedFrom(event.seed, 'noise-hcal'))),
    muonHits,
    impacts,
    hitCounts,
    muonStationCounts,
  };
}

function smear(spec: CalorimeterSpec, E: number, rng: Rng): number {
  return Math.max(0, E * (1 + rng.gaussian(0, caloResolution(spec, E))));
}

/** Point where the trajectory reaches the ECAL front (or crosses it, for muons). */
export function findCaloImpact(tr: TrackRecord, det: DetectorModel): CaloImpact | null {
  const s = tr.samples;
  const R = det.ecal.barrelRMin;
  const Z = det.ecal.endcapZMin;
  for (let i = 0; i < s.count; i++) {
    const x = s.positions[3 * i]!, y = s.positions[3 * i + 1]!, z = s.positions[3 * i + 2]!;
    const r = Math.hypot(x, y);
    if (r >= R * 0.999 || Math.abs(z) >= Z * 0.999) {
      const eta = etaOf(x, y, z);
      if (Math.abs(eta) >= det.ecal.etaMax) return null;
      const range = det.ecal.etaRange;
      if (range && (eta < range[0] || eta > range[1])) return null;
      return { particleId: tr.particleId, x, y, z, t: s.times[i]!, eta: etaOf(x, y, z), phi: Math.atan2(y, x) };
    }
  }
  return null;
}

function etaOf(x: number, y: number, z: number): number {
  const r = Math.hypot(x, y);
  return r > 0 ? Math.asinh(z / r) : Math.sign(z) * 10;
}

class CellAccumulator {
  private readonly map = new Map<number, { e: number; t: number; c: number[] }>();
  private readonly nEta: number;
  private readonly nPhi: number;

  constructor(private readonly spec: CalorimeterSpec) {
    ({ nEta: this.nEta, nPhi: this.nPhi } = cellGrid(spec));
  }

  deposit(impact: CaloImpact, energy: number, profile: { centre: number; edge: number; corner: number }, pid: number): void {
    if (energy <= 0) return;
    const idx = cellIndex(this.spec, impact.eta, impact.phi);
    if (!idx) return;
    for (let de = -1; de <= 1; de++) {
      for (let dp = -1; dp <= 1; dp++) {
        const ie = idx.ieta + de;
        if (ie < 0 || ie >= this.nEta) continue;
        const ip = (idx.iphi + dp + this.nPhi) % this.nPhi;
        const w = de === 0 && dp === 0 ? profile.centre : de === 0 || dp === 0 ? profile.edge : profile.corner;
        const key = ie * this.nPhi + ip;
        let cell = this.map.get(key);
        if (!cell) {
          cell = { e: 0, t: impact.t, c: [] };
          this.map.set(key, cell);
        }
        cell.e += energy * w;
        cell.t = Math.min(cell.t, impact.t);
        if (!cell.c.includes(pid)) cell.c.push(pid);
      }
    }
  }

  /**
   * Final cell list: energy scale applied, dead cells removed, noisy cells added (scenario),
   * then the noise-suppression threshold.
   */
  cells(sc: ChannelScenario, detId: string, rng: Rng): CaloCell[] {
    const out: CaloCell[] = [];
    const salt = this.spec.kind === 'ecal' ? 0 : 1 << 30;
    if (sc.noisyCellsPerEvent > 0 && this.nEta > 0) {
      const n = samplePoisson(rng, sc.noisyCellsPerEvent);
      for (let i = 0; i < n; i++) {
        const key = rng.int(0, this.nEta) * this.nPhi + rng.int(0, this.nPhi);
        const cell = this.map.get(key) ?? { e: 0, t: rng.uniform(-5, 20), c: [] };
        cell.e += rng.exponential(sc.noiseMeanGeV) / sc.caloEnergyScale;
        this.map.set(key, cell);
      }
    }
    for (const [key, v0] of this.map) {
      if (sc.deadFraction > 0 && channelHash(detId, salt + key) < sc.deadFraction) continue;
      const v = { ...v0, e: v0.e * sc.caloEnergyScale };
      if (v.e < this.spec.cellThresholdGeV) continue;
      const ieta = Math.floor(key / this.nPhi);
      const iphi = key % this.nPhi;
      const c = cellCentre(this.spec, ieta, iphi);
      out.push({ calo: this.spec.kind, ieta, iphi, eta: c.eta, phi: c.phi, energy: v.e, time: v.t, contributors: v.c });
    }
    out.sort((a, b) => a.ieta - b.ieta || a.iphi - b.iphi);
    return out;
  }
}

/**
 * Crossing of the trajectory segment [i, i+1] with a cylinder (r) or plane (z), computed on the
 * circle through three consecutive samples (the exact transverse projection of a helix in a
 * uniform field); z varies linearly with the turning angle. Returns null for straight or
 * degenerate segments (the caller then uses the chord).
 */
export function arcCrossing(pos: Float32Array, count: number, i: number, target: { r: number } | { z: number }): [number, number, number] | null {
  const k = i + 2 < count ? i + 2 : i - 1;
  if (k < 0) return null;
  const ax = pos[3 * i]!, ay = pos[3 * i + 1]!, az = pos[3 * i + 2]!;
  const bx = pos[3 * i + 3]!, by = pos[3 * i + 4]!, bz = pos[3 * i + 5]!;
  const cx = pos[3 * k]!, cy = pos[3 * k + 1]!;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-14) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const xc = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const yc = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const R = Math.hypot(ax - xc, ay - yc);
  if (!(R < 1e4)) return null;
  const aa = Math.atan2(ay - yc, ax - xc);
  let da = Math.atan2(by - yc, bx - xc) - aa;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  const at = (t: number): [number, number, number] => [xc + R * Math.cos(aa + t * da), yc + R * Math.sin(aa + t * da), az + t * (bz - az)];
  if ('z' in target) {
    if (bz === az) return null;
    const t = (target.z - az) / (bz - az);
    return t >= 0 && t <= 1 ? at(t) : null;
  }
  // Bisection on |P(t)| − r, starting from the chord estimate's bracket [0, 1].
  const g = (t: number) => {
    const q = at(t);
    return Math.hypot(q[0], q[1]) - target.r;
  };
  let lo = 0, hi = 1, glo = g(0);
  if (glo * g(1) > 0) return null;
  for (let it = 0; it < 40; it++) {
    const mid = 0.5 * (lo + hi);
    const gm = g(mid);
    if (gm * glo <= 0) hi = mid;
    else {
      lo = mid;
      glo = gm;
    }
  }
  return at(0.5 * (lo + hi));
}
