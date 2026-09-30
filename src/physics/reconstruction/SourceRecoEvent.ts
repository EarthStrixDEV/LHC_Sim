/**
 * Pipeline branch for events WITHOUT generator truth (recorded collision data, or simulated
 * samples published at reconstruction level only).
 *
 * The source's reconstructed objects are taken as-is; nothing is re-simulated and no truth
 * is invented. For display, charged objects (μ, e, tracks) are drawn as helices computed
 * from their reconstructed momentum in the detector field model, and photons as straight
 * lines to the calorimeter face — the usual convention of experiment event displays.
 * Those trajectories are RECONSTRUCTED DATA and carry `recoId`.
 */
import { ELECTRON_MASS_GEV, MUON_MASS_GEV, PION_CHARGED_MASS_GEV } from '../constants/physicalConstants';
import type { DetectorModel } from '../detector/DetectorModel';
import type { TrackerHits } from '../detector/DetectorHit';
import type { RecoLevelRecord, RecoObjectRecord } from '../../data-sources/NormalizedEvent';
import { propagate, type TrackImportance } from '../propagation/TrackPropagator';
import { MAX_LOOPER_TURNS, type TrackRecord } from '../propagation/EventPropagation';
import type { ReconstructedEvent, RecoElectron, RecoJet, RecoMET, RecoMuon, RecoPhoton, RecoTrack } from './ReconstructedObject';

const DISPLAY_MASS: Record<RecoObjectRecord['kind'], number> = {
  muon: MUON_MASS_GEV,
  electron: ELECTRON_MASS_GEV,
  track: PION_CHARGED_MASS_GEV,
  photon: 0,
  jet: 0,
};

function p4Of(o: RecoObjectRecord): [number, number, number, number] {
  const px = o.pt * Math.cos(o.phi), py = o.pt * Math.sin(o.phi), pz = o.pt * Math.sinh(o.eta);
  return [Math.sqrt(px * px + py * py + pz * pz + o.m * o.m), px, py, pz];
}

function displayPdg(o: RecoObjectRecord): number {
  const q = Math.sign(o.charge) || 1;
  if (o.kind === 'muon') return -13 * q;
  if (o.kind === 'electron') return -11 * q;
  if (o.kind === 'photon') return 22;
  return 211 * q;
}

export function emptyHits(): TrackerHits {
  return { positions: new Float32Array(0), times: new Float32Array(0), particleIds: new Int32Array(0), subsystems: new Uint8Array(0), count: 0 };
}

export interface SourceRecoResult {
  readonly tracks: TrackRecord[];
  readonly reco: ReconstructedEvent;
}

export function processSourceReco(rec: RecoLevelRecord, det: DetectorModel): SourceRecoResult {
  const pv = rec.primaryVertex ?? { x: 0, y: 0, z: 0 };
  const tracks: TrackRecord[] = [];
  const recoTracks: RecoTrack[] = [];
  const muons: RecoMuon[] = [];
  const electrons: RecoElectron[] = [];
  const photons: RecoPhoton[] = [];
  const jets: RecoJet[] = [];
  const attr = (o: RecoObjectRecord, k: string): number => o.attrs?.[k] ?? Number.NaN;

  rec.objects.forEach((o, i) => {
    const p4 = p4Of(o);
    const base = { p4, pt: o.pt, eta: o.eta, phi: o.phi, charge: o.charge, truthParticleId: null };
    const id = `src-${o.kind}-${i}`;
    if (o.kind === 'jet') {
      jets.push({ ...base, id, kind: 'jet', radius: attr(o, 'R') || 0.4, nConstituents: attr(o, 'nConstituents'), subtractedPt: Number.NaN, emFraction: attr(o, 'emFraction') });
      return;
    }
    const charged = o.kind !== 'photon';
    const trackId = `src-trk-${i}`;
    if (charged) recoTracks.push({ ...base, id: trackId, kind: 'track', nHits: attr(o, 'nHits'), caloEta: null, caloPhi: null, fromPrimaryVertex: true });
    if (o.kind === 'muon') muons.push({ ...base, id, kind: 'muon', trackId, stations: attr(o, 'stations'), isolation: attr(o, 'isolation') });
    if (o.kind === 'electron') electrons.push({ ...base, id, kind: 'electron', trackId, clusterEnergy: p4[0], isolation: attr(o, 'isolation') });
    if (o.kind === 'photon') photons.push({ ...base, id, kind: 'photon', clusterEnergy: p4[0], isolation: attr(o, 'isolation') });

    const reachesOuter = o.kind === 'muon';
    const importance: TrackImportance = o.kind === 'track' ? (o.pt > 10 ? 2 : o.pt > 1 ? 1 : 0) : 2;
    const samples = propagate({
      charge: charged ? o.charge : 0,
      px: p4[1],
      py: p4[2],
      pz: p4[3],
      mass: DISPLAY_MASS[o.kind],
      x0: pv.x,
      y0: pv.y,
      z0: pv.z,
      t0: 0,
      field: det.field,
      limits: {
        maxRadiusM: reachesOuter ? det.envelope.rMax : det.ecal.barrelRMin,
        maxAbsZM: reachesOuter ? det.envelope.zMax : det.ecal.endcapZMin,
        maxPathM: Number.POSITIVE_INFINITY,
        maxTurns: MAX_LOOPER_TURNS,
      },
      importance,
      integrator: det.integrator ?? 'rk4',
    });
    tracks.push({
      particleId: -(i + 1),
      pdgId: displayPdg(o),
      charge: charged ? o.charge : 0,
      kind: charged ? 'charged' : 'neutral',
      pt: o.pt,
      eta: o.eta,
      phi: o.phi,
      energy: p4[0],
      origin: 'primary',
      importance,
      fromHardProcess: false,
      stopSurface: reachesOuter ? 'envelope' : 'calorimeter',
      samples,
      recoId: charged && o.kind === 'track' ? trackId : id,
    });
  });

  const met: RecoMET = rec.met
    ? {
        id: 'src-met',
        kind: 'met',
        p4: [rec.met.met, rec.met.met * Math.cos(rec.met.phi), rec.met.met * Math.sin(rec.met.phi), 0],
        pt: rec.met.met,
        eta: 0,
        phi: rec.met.phi,
        charge: 0,
        truthParticleId: null,
        met: rec.met.met,
        sumEt: rec.met.sumEt ?? Number.NaN,
        softTermPt: Number.NaN,
      }
    : { id: 'src-met', kind: 'met', p4: [0, 0, 0, 0], pt: 0, eta: 0, phi: 0, charge: 0, truthParticleId: null, met: 0, sumEt: Number.NaN, softTermPt: Number.NaN, unavailable: true };

  const byPt = <T extends { pt: number }>(a: T[]): T[] => a.sort((x, y) => y.pt - x.pt);
  return {
    tracks,
    reco: { tracks: byPt(recoTracks), electrons: byPt(electrons), muons: byPt(muons), photons: byPt(photons), jets: byPt(jets), met },
  };
}
