/**
 * Simplified reconstruction — DETECTOR MEASUREMENTS → RECONSTRUCTED OBJECTS.
 *
 * Educational approximations (see docs/physics-model.md §Reconstruction):
 *  - Tracks: charged trajectories with pT > 0.5 GeV, |η| < 2.5 and enough tracker hits;
 *    track fitting is not performed — pT is the truth pT smeared by the tracker resolution.
 *  - Vertexing is not modelled; primary-vertex association uses the truth vertex.
 *  - Muons: tracks whose trajectories left hits in ≥ 2 muon stations; combined resolution.
 *  - EM clusters: 5×5-cell sliding window around local maxima in the ECAL.
 *    electron = isolated cluster + matched track; photon = isolated cluster without track.
 *  - Jets: anti-kT R = 0.4 on calorimeter towers (ECAL+HCAL summed on the HCAL grid);
 *    for heavy ions a median-ρ·A underlying-event subtraction is applied.
 *  - MET: negative vector sum of objects + track soft term.
 */
import type { CollisionSystem } from '../events/EventSchema';
import type { TruthEvent } from '../events/Event';
import { FourVector } from '../events/FourVector';
import type { TrackRecord } from '../propagation/EventPropagation';
import type { DetectorModel } from '../detector/DetectorModel';
import { relResolution } from '../detector/DetectorModel';
import type { DetectorResponseResult } from '../detector/DetectorResponse';
import { cellCentre, cellGrid, cellIndex, type CaloCell } from '../detector/CalorimeterDeposit';
import { ELECTRON_MASS_GEV, MUON_MASS_GEV, PION_CHARGED_MASS_GEV } from '../constants/physicalConstants';
import { deltaR, Rng, seedFrom, wrapPi } from '../../utils/math';
import { antiKt } from './JetModel';
import { computeMET } from './MissingET';
import type { RecoBase, RecoElectron, RecoJet, RecoMuon, RecoPhoton, RecoTrack, ReconstructedEvent } from './ReconstructedObject';

export interface ReconstructionConfig {
  readonly trackPtMin: number;
  readonly trackMinHits: number;
  readonly leptonPtMin: number;
  readonly photonEtMin: number;
  readonly isolationCone: number;
  readonly isolationMax: number;
  readonly clusterSeedGeV: number;
  readonly maxHadronicFraction: number;
  readonly trackClusterMatchDR: number;
  readonly jetR: number;
  readonly jetPtMin: number;
  readonly jetEtaMax: number;
  readonly subtractUnderlyingEvent: boolean;
  readonly overlapDR: number;
}

export const PP_RECO: ReconstructionConfig = {
  trackPtMin: 0.5,
  trackMinHits: 7,
  leptonPtMin: 7,
  photonEtMin: 10,
  isolationCone: 0.3,
  isolationMax: 0.15,
  clusterSeedGeV: 1,
  maxHadronicFraction: 0.1,
  trackClusterMatchDR: 0.05,
  jetR: 0.4,
  jetPtMin: 20,
  jetEtaMax: 2.8,
  subtractUnderlyingEvent: false,
  overlapDR: 0.2,
};

export const HEAVY_ION_RECO: ReconstructionConfig = {
  ...PP_RECO,
  photonEtMin: 15,
  jetPtMin: 40,
  subtractUnderlyingEvent: true,
};

export function configFor(system: CollisionSystem): ReconstructionConfig {
  return system === 'PbPb' ? HEAVY_ION_RECO : PP_RECO;
}

export function reconstruct(event: TruthEvent, det: DetectorModel, tracks: readonly TrackRecord[], resp: DetectorResponseResult, cfg: ReconstructionConfig): ReconstructedEvent {
  const pvZ = [...event.vertices.values()].find((v) => v.kind === 'primary')?.z ?? 0;

  // ---- Tracks ------------------------------------------------------------------------------
  const recoTracks: RecoTrack[] = [];
  for (const tr of tracks) {
    if (tr.kind !== 'charged' || tr.stopSurface === 'decay') continue;
    if (tr.pt < cfg.trackPtMin || Math.abs(tr.eta) > det.trackerEtaMax) continue;
    const nHits = resp.hitCounts.get(tr.particleId) ?? 0;
    if (nHits < cfg.trackMinHits) continue;
    const rng = new Rng(seedFrom(event.seed, 'reco-track', tr.particleId));
    const pt = tr.pt * (1 + rng.gaussian(0, relResolution(det.trackResolution, tr.pt)));
    const p4 = FourVector.fromPtEtaPhiM(Math.abs(pt), tr.eta, tr.phi, PION_CHARGED_MASS_GEV);
    const imp = resp.impacts.get(tr.particleId);
    recoTracks.push({
      id: `trk${tr.particleId}`,
      kind: 'track',
      p4: p4.toArray(),
      pt: p4.pt(),
      eta: tr.eta,
      phi: tr.phi,
      charge: Math.sign(tr.charge),
      truthParticleId: tr.particleId,
      nHits,
      caloEta: imp ? imp.eta : null,
      caloPhi: imp ? imp.phi : null,
      fromPrimaryVertex: tr.origin !== 'pileup',
    });
  }
  const pvTracks = recoTracks.filter((t) => t.fromPrimaryVertex);
  const trackIso = (eta: number, phi: number, pt: number, excludeId: string | null): number => {
    let s = 0;
    for (const t of pvTracks) {
      if (t.id === excludeId) continue;
      const dr = deltaR(eta, phi, t.eta, t.phi);
      if (dr < cfg.isolationCone && dr > 1e-6) s += t.pt;
    }
    return pt > 0 ? s / pt : Number.POSITIVE_INFINITY;
  };

  // ---- Muons -------------------------------------------------------------------------------
  const muons: RecoMuon[] = [];
  for (const t of recoTracks) {
    const stations = resp.muonStationCounts.get(t.truthParticleId!) ?? 0;
    if (stations < 2 || Math.abs(t.eta) > det.muonEtaMax) continue;
    const tr = tracks.find((x) => x.particleId === t.truthParticleId)!;
    const rng = new Rng(seedFrom(event.seed, 'reco-muon', tr.particleId));
    const pt = tr.pt * (1 + rng.gaussian(0, relResolution(det.muonResolution, tr.pt)));
    if (pt < cfg.leptonPtMin) continue;
    const iso = trackIso(t.eta, t.phi, pt, t.id);
    if (iso > cfg.isolationMax) continue;
    const p4 = FourVector.fromPtEtaPhiM(pt, t.eta, t.phi, MUON_MASS_GEV);
    muons.push({ id: `mu${tr.particleId}`, kind: 'muon', p4: p4.toArray(), pt, eta: t.eta, phi: t.phi, charge: t.charge, truthParticleId: tr.particleId, trackId: t.id, stations, isolation: iso });
  }

  // ---- EM clusters → electrons / photons ---------------------------------------------------------
  const clusters = emClusters(resp.ecal, det, cfg.clusterSeedGeV);
  const electrons: RecoElectron[] = [];
  const photons: RecoPhoton[] = [];
  const usedTracks = new Set<string>(muons.map((m) => m.trackId));
  for (const c of clusters) {
    const et = c.energy / Math.cosh(c.eta);
    if (et < Math.min(cfg.photonEtMin, cfg.leptonPtMin)) continue;
    const eHad = resp.hcal.reduce((s, h) => (deltaR(c.eta, c.phi, h.eta, h.phi) < 0.15 ? s + h.energy : s), 0);
    if (eHad / c.energy > cfg.maxHadronicFraction) continue;

    let match: RecoTrack | null = null;
    for (const t of recoTracks) {
      if (t.caloEta === null || t.caloPhi === null || usedTracks.has(t.id)) continue;
      if (deltaR(c.eta, c.phi, t.caloEta, t.caloPhi) < cfg.trackClusterMatchDR && t.pt > 0.2 * et && (!match || t.pt > match.pt)) match = t;
    }
    if (match) {
      if (et < cfg.leptonPtMin) continue;
      const pt = c.energy / Math.cosh(match.eta);
      const iso = trackIso(match.eta, match.phi, pt, match.id);
      if (iso > cfg.isolationMax) continue;
      usedTracks.add(match.id);
      const p4 = FourVector.fromPtEtaPhiM(pt, match.eta, match.phi, ELECTRON_MASS_GEV);
      electrons.push({ id: `el${match.truthParticleId}`, kind: 'electron', p4: p4.toArray(), pt, eta: match.eta, phi: match.phi, charge: match.charge, truthParticleId: match.truthParticleId, trackId: match.id, clusterEnergy: c.energy, isolation: iso });
    } else {
      if (et < cfg.photonEtMin) continue;
      // Direction from the primary vertex to the cluster on the ECAL front face.
      const front = caloFrontPoint(det, c.eta);
      const eta = Math.asinh((front.z - pvZ) / front.r);
      const pt = c.energy / Math.cosh(eta);
      const iso = trackIso(eta, c.phi, pt, null);
      if (iso > cfg.isolationMax) continue;
      const p4 = FourVector.fromPtEtaPhiM(pt, eta, c.phi, 0);
      photons.push({ id: `ph${photons.length}`, kind: 'photon', p4: p4.toArray(), pt, eta, phi: c.phi, charge: 0, truthParticleId: c.leadingContributor, clusterEnergy: c.energy, isolation: iso });
    }
  }

  // ---- Jets --------------------------------------------------------------------------------------
  const towers = buildTowers(resp.ecal, resp.hcal, det);
  const clustered = antiKt(towers.list.map((t, i) => ({ p4: t.p4, index: i })), cfg.jetR);
  let rho = 0;
  if (cfg.subtractUnderlyingEvent) rho = medianTowerDensity(towers, det);
  const area = Math.PI * cfg.jetR * cfg.jetR;
  const emObjects: RecoBase[] = [...electrons, ...photons];
  const jets: RecoJet[] = [];
  for (const j of clustered) {
    const rawPt = j.p4.pt();
    const sub = rho * area;
    const pt = rawPt - sub;
    if (pt < cfg.jetPtMin) continue;
    const eta = j.p4.eta();
    if (Math.abs(eta) > cfg.jetEtaMax) continue;
    const phi = j.p4.phi();
    if (emObjects.some((o) => deltaR(o.eta, o.phi, eta, phi) < cfg.overlapDR)) continue;
    const p4 = j.p4.scale(pt / rawPt);
    let eEm = 0, eAll = 0;
    for (const k of j.constituents) {
      eEm += towers.list[k]!.eEm;
      eAll += towers.list[k]!.p4.e;
    }
    jets.push({ id: `jet${jets.length}`, kind: 'jet', p4: p4.toArray(), pt, eta, phi, charge: 0, truthParticleId: null, radius: cfg.jetR, nConstituents: j.constituents.length, subtractedPt: sub, emFraction: eAll > 0 ? eEm / eAll : 0 });
  }

  // ---- MET ---------------------------------------------------------------------------------------
  const lepTrackIds = new Set([...muons.map((m) => m.trackId), ...electrons.map((e) => e.trackId)]);
  const soft = pvTracks.filter((t) => !lepTrackIds.has(t.id) && !jets.some((j) => deltaR(j.eta, j.phi, t.eta, t.phi) < cfg.jetR) && !photons.some((p) => deltaR(p.eta, p.phi, t.eta, t.phi) < 0.05));
  const met = computeMET([...electrons, ...photons, ...muons, ...jets], soft);

  return { tracks: recoTracks, electrons, muons, photons, jets, met };
}

// ---- Helpers ----------------------------------------------------------------------------------------

interface EmCluster {
  energy: number;
  eta: number;
  phi: number;
  leadingContributor: number | null;
}

/** Sliding-window clustering: 5×5 cells around local maxima (seeds processed by energy). */
function emClusters(cells: readonly CaloCell[], det: DetectorModel, seedGeV: number): EmCluster[] {
  const { nPhi, nEta } = cellGrid(det.ecal);
  const map = new Map<number, CaloCell>();
  for (const c of cells) map.set(c.ieta * nPhi + c.iphi, c);
  const at = (ie: number, ip: number): CaloCell | undefined => (ie < 0 || ie >= nEta ? undefined : map.get(ie * nPhi + ((ip + nPhi) % nPhi)));

  const seeds = cells
    .filter((c) => {
      if (c.energy < seedGeV) return false;
      for (let de = -1; de <= 1; de++) for (let dp = -1; dp <= 1; dp++) {
        if (de === 0 && dp === 0) continue;
        const n = at(c.ieta + de, c.iphi + dp);
        if (n && n.energy > c.energy) return false;
      }
      return true;
    })
    .sort((a, b) => b.energy - a.energy);

  const used = new Set<number>();
  const out: EmCluster[] = [];
  for (const s of seeds) {
    let e = 0, weta = 0, wdphi = 0;
    const contrib = new Map<number, number>();
    for (let de = -2; de <= 2; de++) for (let dp = -2; dp <= 2; dp++) {
      const c = at(s.ieta + de, s.iphi + dp);
      if (!c) continue;
      const key = c.ieta * nPhi + c.iphi;
      if (used.has(key)) continue;
      used.add(key);
      e += c.energy;
      weta += c.energy * c.eta;
      wdphi += c.energy * wrapPi(c.phi - s.phi);
      for (const pid of c.contributors) contrib.set(pid, (contrib.get(pid) ?? 0) + c.energy);
    }
    if (e <= 0) continue;
    let lead: number | null = null, leadE = 0;
    for (const [pid, ce] of contrib) if (ce > leadE) { leadE = ce; lead = pid; }
    out.push({ energy: e, eta: weta / e, phi: wrapPi(s.phi + wdphi / e), leadingContributor: lead });
  }
  return out;
}

/** Point on the ECAL front face along direction η from the nominal IP. */
function caloFrontPoint(det: DetectorModel, eta: number): { r: number; z: number } {
  const R = det.ecal.barrelRMin;
  const z = R * Math.sinh(eta);
  if (Math.abs(z) <= det.ecal.barrelZHalf) return { r: R, z };
  const Z = Math.sign(eta) * det.ecal.endcapZMin;
  return { r: Math.abs(Z / Math.sinh(eta)), z: Z };
}

interface Tower {
  p4: FourVector;
  eEm: number;
  ieta: number;
  iphi: number;
}

function buildTowers(ecal: readonly CaloCell[], hcal: readonly CaloCell[], det: DetectorModel): { list: Tower[]; nEta: number; nPhi: number } {
  const { nEta, nPhi } = cellGrid(det.hcal);
  const acc = new Map<number, { e: number; eEm: number; ieta: number; iphi: number }>();
  const add = (eta: number, phi: number, e: number, em: boolean): void => {
    const idx = cellIndex(det.hcal, eta, phi);
    if (!idx) return;
    const key = idx.ieta * nPhi + idx.iphi;
    const t = acc.get(key) ?? { e: 0, eEm: 0, ieta: idx.ieta, iphi: idx.iphi };
    t.e += e;
    if (em) t.eEm += e;
    acc.set(key, t);
  };
  for (const c of ecal) add(c.eta, c.phi, c.energy, true);
  for (const c of hcal) add(c.eta, c.phi, c.energy, false);
  const list: Tower[] = [];
  for (const t of acc.values()) {
    const c = cellCentre(det.hcal, t.ieta, t.iphi);
    const pt = t.e / Math.cosh(c.eta);
    list.push({ p4: FourVector.fromPtEtaPhiM(pt, c.eta, c.phi, 0), eEm: t.eEm, ieta: t.ieta, iphi: t.iphi });
  }
  list.sort((a, b) => a.ieta - b.ieta || a.iphi - b.iphi);
  return { list, nEta, nPhi };
}

/** Median tower pT density ρ [GeV per unit η–φ area] over |η| < 2.5, empty towers included. */
function medianTowerDensity(towers: { list: Tower[]; nEta: number; nPhi: number }, det: DetectorModel): number {
  const towerArea = det.hcal.cellDEta * det.hcal.cellDPhi;
  const byKey = new Map(towers.list.map((t) => [t.ieta * towers.nPhi + t.iphi, t]));
  const dens: number[] = [];
  for (let ie = 0; ie < towers.nEta; ie++) {
    const eta = cellCentre(det.hcal, ie, 0).eta;
    if (Math.abs(eta) > 2.5) continue;
    for (let ip = 0; ip < towers.nPhi; ip++) {
      const t = byKey.get(ie * towers.nPhi + ip);
      dens.push(t ? t.p4.pt() / towerArea : 0);
    }
  }
  dens.sort((a, b) => a - b);
  return dens.length ? dens[Math.floor(dens.length / 2)]! : 0;
}
