/**
 * Registry of curated, synthetic event samples bundled with Phase 1.
 * Samples are produced offline by scripts/generate-events.ts (toy generator, fixed seeds)
 * and loaded lazily; nothing is generated in the browser.
 */
import { JsonEventSource, type EventSource } from './EventLoader';

export interface SampleEntry {
  readonly id: string;
  readonly label: string;
  readonly source: EventSource;
}

export const EVENT_SAMPLES: readonly SampleEntry[] = [
  { id: 'zmumu', label: 'Z → μ⁺μ⁻', source: new JsonEventSource('zmumu', () => import('../../data/events/zmumu.json')) },
  { id: 'hgg', label: 'H → γγ', source: new JsonEventSource('hgg', () => import('../../data/events/hgg.json')) },
  { id: 'zee', label: 'Z → e⁺e⁻', source: new JsonEventSource('zee', () => import('../../data/events/zee.json')) },
  { id: 'dijet', label: 'Multijet (pp)', source: new JsonEventSource('dijet', () => import('../../data/events/dijet.json')) },
  { id: 'ttbar', label: 'tt̄ → μ + jets (educational)', source: new JsonEventSource('ttbar', () => import('../../data/events/ttbar.json')) },
  { id: 'pbpb', label: 'Pb–Pb (simplified high multiplicity)', source: new JsonEventSource('pbpb', () => import('../../data/events/pbpb.json')) },
];

export function sampleById(id: string): SampleEntry | undefined {
  return EVENT_SAMPLES.find((s) => s.id === id);
}
