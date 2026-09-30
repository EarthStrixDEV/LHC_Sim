/**
 * A loaded normalized sample with cached truth navigation. Used identically on the main
 * thread (inspection) and in the physics worker (processing).
 */
import { TruthEvent } from '../physics/events/Event';
import type { SampleMetadata } from '../physics/events/EventSchema';
import type { NormalizedEvent, NormalizedSample, Provenance } from './NormalizedEvent';

export class NormalizedDataset {
  private readonly truthCache = new Map<number, TruthEvent>();

  constructor(readonly sample: NormalizedSample) {}

  get id(): string {
    return this.sample.provenance.datasetId;
  }
  get meta(): SampleMetadata {
    return this.sample.meta;
  }
  get provenance(): Provenance {
    return this.sample.provenance;
  }
  get size(): number {
    return this.sample.events.length;
  }

  wrap(index: number): number {
    const n = this.size;
    return ((index % n) + n) % n;
  }

  event(index: number): NormalizedEvent {
    return this.sample.events[this.wrap(index)]!;
  }

  /** Truth navigation for the event, or null when the source has no truth (never invented). */
  truthEvent(index: number): TruthEvent | null {
    const i = this.wrap(index);
    const rec = this.sample.events[i]!.truth;
    if (!rec) return null;
    let ev = this.truthCache.get(i);
    if (!ev) {
      ev = new TruthEvent(rec);
      this.truthCache.set(i, ev);
    }
    return ev;
  }
}
