/**
 * Adapter: Phase 1 curated toy samples ("lhcsim-event-sample/1") → normalized model.
 * The on-disk files are unchanged; conversion is a lossless wrap with explicit provenance.
 */
import type { EventSampleFile } from '../../physics/events/EventSchema';
import { NORMALIZED_SCHEMA_ID, validateNormalizedSample, type NormalizedSample } from '../NormalizedEvent';

export function curatedToNormalized(file: EventSampleFile): NormalizedSample {
  const m = file.sample;
  return validateNormalizedSample({
    schema: NORMALIZED_SCHEMA_ID,
    provenance: {
      sourceType: 'CURATED',
      isSimulation: true,
      experiment: null,
      datasetId: m.id,
      title: m.title,
      year: null,
      collisionSystem: m.collisionSystem,
      sqrtSGeV: m.sqrtSGeV,
      integratedLuminosityInvPb: null,
      generator: { name: m.generator, version: null, tune: null, process: m.process, seed: m.seed, settings: {} },
      source: { name: 'lhcsim curated samples (scripts/generate-events.ts)', url: null, doi: null, license: 'Project-internal synthetic data' },
      processingNotes: [...m.notes],
    },
    meta: m,
    events: file.events.map((ev) => ({ eventNumber: ev.eventId, run: null, lumiBlock: null, weights: [1], truth: ev, reco: null })),
  });
}
