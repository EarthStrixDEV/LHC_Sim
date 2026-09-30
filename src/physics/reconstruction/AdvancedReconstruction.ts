/**
 * Phase 2 reconstruction layer, run on top of the Phase 1 objects (which are kept unchanged):
 *
 *   hits ──► Kalman-like track fits ──► primary / pile-up vertices, displaced vertices
 *   cells ─► topological clusters ────► generalized-kT jets (p, R configurable), cluster MET
 *
 * Hit-to-track assignment uses the simulation bookkeeping (no pattern recognition), stated in
 * the UI. The z coordinate of each hit is smeared here with a per-technology resolution
 * because the Phase 1 response measures only rφ. The helix model uses the mean Bz along each
 * track's hits (the field maps are not perfectly uniform). In non-uniform maps the transverse
 * momentum is not exactly conserved along the track (B_r components), so fitted pT and vertex
 * truth pT differ at the O(1 %) level; in the uniform 'regional' solenoids the helix is exact.
 */
import type { DetectorModel } from '../detector/DetectorModel';
import type { TrackerHits } from '../detector/DetectorHit';
import type { CaloCell } from '../detector/CalorimeterDeposit';
import type { TrackRecord } from '../propagation/EventPropagation';
import { fitTrack, type FitHit, type TrackFitResult } from '../fitting/KalmanTrackFit';
import { generalizedKt, JET_ALGORITHM_NAME, type JetAlgorithmP } from './GeneralizedKt';
import type { ReconstructedEvent } from './ReconstructedObject';
import { topoClusters, type TopoCluster } from './TopoCluster';
import { findDisplacedVertices, findPrimaryVertices, type DisplacedVertex, type RecoVertex, type VertexTrack } from './Vertexing';
import { Rng, seedFrom } from '../../utils/math';

export interface JetConfig {
  readonly p: JetAlgorithmP;
  readonly R: number;
  readonly ptMin: number;
}

export const DEFAULT_JET_CONFIG: JetConfig = { p: -1, R: 0.4, ptMin: 15 };

export interface FittedTrack {
  readonly particleId: number;
  readonly truthPt: number;
  readonly truthCharge: number;
  /** Measured hit positions used in the fit (xyz, with the z smearing applied). */
  readonly hits: readonly [number, number, number][];
  readonly fit: TrackFitResult;
}

export interface AdvancedJet {
  readonly p4: [number, number, number, number];
  readonly pt: number;
  readonly eta: number;
  readonly phi: number;
  readonly nConstituents: number;
}

export interface AdvancedReco {
  readonly bz: number;
  readonly fits: readonly FittedTrack[];
  readonly vertices: readonly RecoVertex[];
  readonly displaced: readonly DisplacedVertex[];
  readonly clusters: readonly TopoCluster[];
  readonly jetConfig: JetConfig;
  readonly jetAlgorithm: string;
  readonly jets: readonly AdvancedJet[];
  /** MET from topo-clusters and muons. */
  readonly met: { readonly met: number; readonly phi: number; readonly sumEt: number };
  readonly notes: readonly string[];
}

const MAX_FITS = 80;
/** Largest allowed distance between consecutive hits of one fitted segment [m]. */
const MAX_HIT_GAP_M = 0.5;
/**
 * Material per tracker layer in X₀ for the multiple-scattering process noise Q. Zero because the
 * simulated propagation has no multiple scattering (a non-zero Q would only inflate the
 * uncertainties); the Q term of the filter is implemented and exercised in the tests.
 */
const X_OVER_X0: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
/** z resolution per hit technology [m] (pixel, strip stereo, straw/TRD, TPC drift). */
const Z_SIGMA: Record<number, number> = { 0: 60e-6, 1: 0.6e-3, 2: 5e-3, 3: 1e-3 };

export function advancedReconstruction(
  det: DetectorModel,
  tracks: readonly TrackRecord[],
  hits: TrackerHits,
  ecal: readonly CaloCell[],
  hcal: readonly CaloCell[],
  reco: ReconstructedEvent,
  seed: number,
  jetConfig: JetConfig = DEFAULT_JET_CONFIG,
): AdvancedReco {
  const b = new Float64Array(3);
  det.field.fieldAt(0, 0, 0, b);
  const bz = b[2]!;
  const notes: string[] = [];

  // ---- Track fits -----------------------------------------------------------------------
  const res = new Map<number, number>();
  for (const l of det.trackerLayers) {
    const code = { pixel: 0, strip: 1, trt: 2, tpc: 3 }[l.subsystem];
    if (!res.has(code)) res.set(code, l.resolutionM);
  }
  const byParticle = new Map<number, number[]>();
  for (let i = 0; i < hits.count; i++) {
    const pid = hits.particleIds[i]!;
    (byParticle.get(pid) ?? byParticle.set(pid, []).get(pid)!).push(i);
  }
  const fits: FittedTrack[] = [];
  if (Math.abs(bz) > 0.1) {
    const truthById = new Map(tracks.map((t) => [t.particleId, t]));
    const cands = reco.tracks.filter((t) => t.truthParticleId !== null).sort((a, b) => b.pt - a.pt).slice(0, MAX_FITS);
    for (const rt of cands) {
      const idx = byParticle.get(rt.truthParticleId!);
      const tr = truthById.get(rt.truthParticleId!);
      if (!idx || !tr) continue;
      // Hits in order of arrival; keep the outgoing half-turn (increasing radius).
      const ordered = [...idx].sort((i, j) => hits.times[i]! - hits.times[j]!);
      const rng = new Rng(seedFrom(seed, 'zsmear', rt.truthParticleId!));
      const fh: FitHit[] = [];
      let lastR = 0;
      let prev: [number, number, number] | null = null;
      for (const i of ordered) {
        const x = hits.positions[3 * i]!, y = hits.positions[3 * i + 1]!, z = hits.positions[3 * i + 2]!;
        const r = Math.hypot(x, y);
        // Stop at the first turn-back or a gap larger than the layer spacing (looper re-entry).
        if (r < lastR || (prev && Math.hypot(x - prev[0], y - prev[1], z - prev[2]) > MAX_HIT_GAP_M)) break;
        lastR = r;
        prev = [x, y, z];
        const code = hits.subsystems[i]!;
        fh.push({ x, y, z: z + rng.gaussian(0, Z_SIGMA[code] ?? 1e-3), sigma: res.get(code) ?? 50e-6 });
      }
      // Field seen by this track: mean Bz over its hits (non-uniform maps, e.g. solenoid ends).
      let bzTrack = 0;
      for (const hh of fh) {
        det.field.fieldAt(hh.x, hh.y, hh.z, b);
        bzTrack += b[2]!;
      }
      bzTrack /= Math.max(fh.length, 1);
      const fit = Math.abs(bzTrack) > 0.05 ? fitTrack(fh, { bz: bzTrack, xOverX0: X_OVER_X0[hits.subsystems[ordered[0]!]!] ?? 0.01 }) : null;
      if (fit) fits.push({ particleId: rt.truthParticleId!, truthPt: tr.pt, truthCharge: tr.charge, hits: fh.map((h) => [h.x, h.y, h.z]), fit });
    }
  } else {
    notes.push('Kalman-like fit needs a solenoid field along z; not applied for this detector (LHCb bends in a dipole).');
  }

  // ---- Vertices ---------------------------------------------------------------------------
  const vt: VertexTrack[] = fits.map((f) => ({
    id: f.particleId,
    perigee: f.fit.fitted,
    d0Sigma: Math.sqrt(Math.max(f.fit.cov[0], 0)),
    z0: f.fit.z0,
    cotTheta: f.fit.cotTheta,
    pt: f.fit.ptFit,
    charge: f.fit.charge,
  }));
  const vertices = findPrimaryVertices(vt);
  const displaced = findDisplacedVertices(vt);

  // ---- Topo-clusters, jets, MET -----------------------------------------------------------
  const clusters = [...topoClusters(ecal, det.ecal), ...(det.hcal.present === false ? [] : topoClusters(hcal, det.hcal))];
  const raw = generalizedKt(clusters.map((c) => ({ p4: c.p4 })), jetConfig.R, jetConfig.p);
  const jets: AdvancedJet[] = raw
    .filter((j) => j.pt >= jetConfig.ptMin)
    .map((j) => ({ p4: j.p4, pt: j.pt, eta: Math.asinh(j.p4[3] / j.pt), phi: j.phi, nConstituents: j.constituents.length }));
  let mx = 0, my = 0, sumEt = 0;
  for (const c of clusters) {
    mx -= c.p4[1];
    my -= c.p4[2];
    sumEt += c.et;
  }
  // Muons are minimum-ionizing in the calorimeters: add their measured momenta.
  for (const m of reco.muons) {
    mx -= m.p4[1];
    my -= m.p4[2];
    sumEt += m.pt;
  }
  notes.push('Hit-to-track assignment uses simulation bookkeeping (no pattern recognition).', 'Jets are built from topo-clusters without energy calibration; MET = −Σ(clusters + muons).');
  return {
    bz,
    fits,
    vertices,
    displaced,
    clusters,
    jetConfig,
    jetAlgorithm: `${JET_ALGORITHM_NAME[jetConfig.p]} R = ${jetConfig.R}`,
    jets,
    met: { met: Math.hypot(mx, my), phi: Math.atan2(my, mx), sumEt },
    notes,
  };
}
