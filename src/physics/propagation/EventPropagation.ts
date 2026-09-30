/**
 * Propagates the truth particles of an event through a detector's magnetic field.
 * Produces physics-owned trajectories (SIMULATION TRUTH) consumed by detector response,
 * reconstruction bookkeeping and the visualization layer.
 */
import type { DetectorModel } from '../detector/DetectorModel';
import type { TruthEvent } from '../events/Event';
import type { VertexKind } from '../events/EventSchema';
import type { TruthParticle } from '../events/Particle';
import { propagate, type TrackImportance, type TrackSamples } from './TrackPropagator';

export type TrackKind = 'charged' | 'neutral' | 'neutrino';
export type StopSurface = 'calorimeter' | 'envelope' | 'decay';

export interface TrackRecord {
  readonly particleId: number;
  readonly pdgId: number;
  readonly charge: number;
  readonly kind: TrackKind;
  readonly pt: number;
  readonly eta: number;
  readonly phi: number;
  readonly energy: number;
  readonly origin: VertexKind;
  readonly importance: TrackImportance;
  readonly fromHardProcess: boolean;
  readonly stopSurface: StopSurface;
  readonly samples: TrackSamples;
  /**
   * Set when the trajectory was computed from a source-provided reconstructed object
   * (no truth available); particleId is then a negative display id, not a truth particle.
   */
  readonly recoId?: string;
}

/** Loopers are followed for at most this many turns (display + CPU budget). */
export const MAX_LOOPER_TURNS = 1.5;

const HARD_PROCESS_PDG = new Set([6, 23, 24, 25]);

/** Particles that make physical trajectories (no partons, bosons, beams or prompt π⁰ decays). */
export function isPropagatable(p: TruthParticle, event: TruthEvent): boolean {
  if (p.status === 4 || p.status === 3) return false;
  if (p.category === 'quark' || p.category === 'gluon' || p.category === 'gauge-boson' || p.category === 'higgs') return false;
  if (p.status === 1) return true;
  // Decayed hadrons with a displaced decay vertex (K⁰_S, Λ, B) travel a finite distance.
  return p.decayVertex !== null && p.decayVertex !== p.productionVertex && event.vertices.has(p.decayVertex);
}

export function classifyImportance(p: TruthParticle, fromHard: boolean): TrackImportance {
  const a = Math.abs(p.pdgId);
  if (fromHard && (a === 11 || a === 13 || a === 22)) return 2;
  if (p.pt > 10) return 2;
  if (p.pt > 1) return 1;
  return 0;
}

export function isFromHardProcess(p: TruthParticle, event: TruthEvent): boolean {
  if (p.parents.length === 0) return false;
  return event.ancestorsOf(p.id).some((a) => HARD_PROCESS_PDG.has(Math.abs(a.pdgId)));
}

export function propagateEvent(event: TruthEvent, det: DetectorModel): TrackRecord[] {
  const out: TrackRecord[] = [];
  const caloFront = { r: det.ecal.barrelRMin, z: det.ecal.endcapZMin };
  for (const p of event.particles) {
    if (!isPropagatable(p, event)) continue;
    const prod = event.vertices.get(p.productionVertex);
    if (!prod) continue;
    const a = Math.abs(p.pdgId);
    const kind: TrackKind = p.isNeutrino ? 'neutrino' : p.charge !== 0 ? 'charged' : 'neutral';
    const reachesOuter = a === 13 || kind === 'neutrino';

    let maxPath = Number.POSITIVE_INFINITY;
    let stopSurface: StopSurface = reachesOuter ? 'envelope' : 'calorimeter';
    if (p.decayVertex !== null && p.status === 2) {
      const dv = event.vertices.get(p.decayVertex)!;
      maxPath = Math.hypot(dv.x - prod.x, dv.y - prod.y, dv.z - prod.z);
      stopSurface = 'decay';
    }
    const fromHard = isFromHardProcess(p, event);
    const importance = classifyImportance(p, fromHard);
    const samples = propagate({
      charge: p.charge,
      px: p.p4.px,
      py: p.p4.py,
      pz: p.p4.pz,
      mass: Math.max(p.mass, 0),
      x0: prod.x,
      y0: prod.y,
      z0: prod.z,
      t0: prod.t,
      field: det.field,
      limits: {
        maxRadiusM: reachesOuter ? det.envelope.rMax : caloFront.r,
        maxAbsZM: reachesOuter ? det.envelope.zMax : caloFront.z,
        maxPathM: maxPath,
        maxTurns: MAX_LOOPER_TURNS,
      },
      importance,
      integrator: det.integrator ?? 'rk4',
    });
    out.push({
      particleId: p.id,
      pdgId: p.pdgId,
      charge: p.charge,
      kind,
      pt: p.pt,
      eta: p.eta,
      phi: p.phi,
      energy: p.p4.e,
      origin: p.origin,
      importance,
      fromHardProcess: fromHard,
      stopSurface,
      samples,
    });
  }
  return out;
}
