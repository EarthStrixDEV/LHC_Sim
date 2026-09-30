/**
 * TruthEvent — an event's Monte-Carlo truth record with navigation helpers.
 */
import type { EventRecord, VertexKind, VertexRecord } from './EventSchema';
import { TruthParticle } from './Particle';

export class TruthEvent {
  readonly eventId: number;
  readonly process: string;
  readonly seed: number;
  readonly particles: readonly TruthParticle[];
  readonly vertices: ReadonlyMap<number, VertexRecord>;
  readonly truthInfo: Readonly<Record<string, number>>;
  private readonly byId: Map<number, TruthParticle>;

  constructor(rec: EventRecord) {
    this.eventId = rec.eventId;
    this.process = rec.process;
    this.seed = rec.seed;
    this.truthInfo = rec.truthInfo ?? {};
    this.vertices = new Map(rec.vertices.map((v) => [v.id, v]));
    this.particles = rec.particles.map((p) => new TruthParticle(p));
    this.byId = new Map(this.particles.map((p) => [p.id, p]));
    for (const p of this.particles) p.origin = this.vertexKind(p.productionVertex);
  }

  particle(id: number): TruthParticle | undefined {
    return this.byId.get(id);
  }

  vertexKind(id: number): VertexKind {
    return this.vertices.get(id)?.kind ?? 'primary';
  }

  finalState(): TruthParticle[] {
    return this.particles.filter((p) => p.isFinal);
  }

  parentsOf(id: number): TruthParticle[] {
    return (this.byId.get(id)?.parents ?? []).map((i) => this.byId.get(i)).filter(isDefined);
  }

  childrenOf(id: number): TruthParticle[] {
    return (this.byId.get(id)?.children ?? []).map((i) => this.byId.get(i)).filter(isDefined);
  }

  /** All ancestors up to the beam particles (breadth-first, no duplicates). */
  ancestorsOf(id: number): TruthParticle[] {
    return this.walk(id, (p) => p.parents);
  }

  /** All descendants (the full decay chain). */
  descendantsOf(id: number): TruthParticle[] {
    return this.walk(id, (p) => p.children);
  }

  private walk(id: number, next: (p: TruthParticle) => readonly number[]): TruthParticle[] {
    const out: TruthParticle[] = [];
    const start = this.byId.get(id);
    if (!start) return out;
    const seen = new Set<number>([id]);
    const queue = [...next(start)];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const p = this.byId.get(cur);
      if (!p) continue;
      out.push(p);
      queue.push(...next(p));
    }
    return out;
  }
}

function isDefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}
