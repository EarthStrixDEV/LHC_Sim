/**
 * EventLoader — source-agnostic loading and validation of event samples.
 *
 * An EventSource yields an EventSampleFile. Phase 1 ships a JSON source for curated
 * synthetic samples; future sources (CERN Open Data, HepMC3, PYTHIA-in-WASM) implement the
 * same interface and convert into the lhcsim schema.
 */
import { EVENT_SCHEMA_ID, type EventRecord, type EventSampleFile, type SampleMetadata } from './EventSchema';
import { TruthEvent } from './Event';

export interface EventSource {
  readonly id: string;
  readonly kind: 'curated-json' | 'cern-open-data' | 'hepmc' | 'pythia-wasm';
  load(): Promise<EventSampleFile>;
}

/** Wraps a lazy JSON import (bundled by Vite, code-split per sample). */
export class JsonEventSource implements EventSource {
  readonly kind = 'curated-json' as const;
  constructor(
    readonly id: string,
    private readonly importer: () => Promise<{ default: unknown } | unknown>,
  ) {}

  async load(): Promise<EventSampleFile> {
    const mod = await this.importer();
    const data = (mod as { default?: unknown }).default ?? mod;
    return parseEventSample(data);
  }
}

export class EventValidationError extends Error {}

/** Structural validation; throws on inconsistent parent/child links or unknown vertices. */
export function parseEventSample(data: unknown): EventSampleFile {
  const f = data as EventSampleFile;
  if (!f || f.schema !== EVENT_SCHEMA_ID) throw new EventValidationError(`Unsupported event schema: ${(f as { schema?: string })?.schema}`);
  for (const ev of f.events) validateEvent(ev);
  return f;
}

export function validateEvent(ev: EventRecord): void {
  const ids = new Set<number>();
  const vtx = new Set(ev.vertices.map((v) => v.id));
  const byId = new Map(ev.particles.map((p) => [p.id, p]));
  for (const p of ev.particles) {
    if (ids.has(p.id)) throw new EventValidationError(`Event ${ev.eventId}: duplicate particle id ${p.id}`);
    ids.add(p.id);
    if (!vtx.has(p.prodVtx)) throw new EventValidationError(`Event ${ev.eventId}: particle ${p.id} has unknown production vertex`);
    if (p.decayVtx !== null && !vtx.has(p.decayVtx)) throw new EventValidationError(`Event ${ev.eventId}: particle ${p.id} has unknown decay vertex`);
  }
  for (const p of ev.particles) {
    for (const c of p.children) {
      const child = byId.get(c);
      if (!child || !child.parents.includes(p.id)) {
        throw new EventValidationError(`Event ${ev.eventId}: child link ${p.id}→${c} is not reciprocated`);
      }
    }
    for (const par of p.parents) {
      const parent = byId.get(par);
      if (!parent || !parent.children.includes(p.id)) {
        throw new EventValidationError(`Event ${ev.eventId}: parent link ${par}→${p.id} is not reciprocated`);
      }
    }
    if (p.status === 1 && p.children.length > 0) {
      throw new EventValidationError(`Event ${ev.eventId}: final-state particle ${p.id} has children`);
    }
  }
}

export interface LoadedSample {
  readonly meta: SampleMetadata;
  readonly records: readonly EventRecord[];
  event(index: number): TruthEvent;
}

export async function loadSample(source: EventSource): Promise<LoadedSample> {
  const file = await source.load();
  const cache = new Map<number, TruthEvent>();
  return {
    meta: file.sample,
    records: file.events,
    event(index: number): TruthEvent {
      const i = ((index % file.events.length) + file.events.length) % file.events.length;
      let ev = cache.get(i);
      if (!ev) {
        ev = new TruthEvent(file.events[i]!);
        cache.set(i, ev);
      }
      return ev;
    },
  };
}
