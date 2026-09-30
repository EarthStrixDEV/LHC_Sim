/// <reference lib="webworker" />
/**
 * Physics worker: runs the CPU-heavy event pipeline (propagation, detector response,
 * reconstruction) and histogram accumulation off the render thread. Datasets are resolved
 * through the DataSourceRegistry; runtime datasets are registered by the main thread.
 */
import { loadDataset, registerSample } from '../data-sources/DataSourceRegistry';
import type { NormalizedSample } from '../data-sources/NormalizedEvent';
import { processDatasetEvent, type DetectorId, type ProcessedEvent, type ProcessOptions } from '../physics/EventProcessor';
import { selectPair, type PairKind } from '../physics/reconstruction/InvariantMass';
import { scanEvent, type ScanRow } from './scan';

export type WorkerRequest =
  | { type: 'register'; requestId: number; sample: NormalizedSample; label: string }
  | { type: 'process'; requestId: number; datasetId: string; index: number; detectorId: DetectorId; opts: ProcessOptions }
  | { type: 'accumulate'; requestId: number; datasetId: string; detectorId: DetectorId; pair: PairKind; from: number; to: number; opts: ProcessOptions }
  | { type: 'scan'; requestId: number; datasetId: string; detectorId: DetectorId; from: number; to: number; opts: ProcessOptions };

export type WorkerResponse =
  | { type: 'registered'; requestId: number }
  | { type: 'processed'; requestId: number; result: ProcessedEvent; workerMs: number }
  | { type: 'masses'; requestId: number; masses: number[]; processed: number; done: boolean }
  | { type: 'scanned'; requestId: number; rows: ScanRow[] }
  | { type: 'error'; requestId: number; message: string };

/** Typed arrays to transfer (zero-copy) back to the main thread. */
export function transferables(pe: ProcessedEvent): Transferable[] {
  const out: Transferable[] = [pe.response.hits.positions.buffer, pe.response.hits.times.buffer, pe.response.hits.particleIds.buffer, pe.response.hits.subsystems.buffer];
  for (const t of pe.tracks) out.push(t.samples.positions.buffer, t.samples.times.buffer, t.samples.arcLengths.buffer);
  return out as Transferable[];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'register') {
      registerSample(req.sample, req.label);
      ctx.postMessage({ type: 'registered', requestId: req.requestId } satisfies WorkerResponse);
      return;
    }
    const ds = await loadDataset(req.datasetId);
    if (req.type === 'scan') {
      const rows: ScanRow[] = [];
      for (let i = req.from; i < Math.min(req.to, ds.size); i++) rows.push(scanEvent(processDatasetEvent(ds, i, req.detectorId, { ...req.opts, advanced: false }), i));
      ctx.postMessage({ type: 'scanned', requestId: req.requestId, rows } satisfies WorkerResponse);
    } else if (req.type === 'process') {
      const t0 = performance.now();
      const result = processDatasetEvent(ds, req.index, req.detectorId, req.opts);
      const msg: WorkerResponse = { type: 'processed', requestId: req.requestId, result, workerMs: performance.now() - t0 };
      ctx.postMessage(msg, transferables(result));
    } else {
      const to = Math.min(req.to, ds.size);
      const CHUNK = 10;
      if (req.from >= to) ctx.postMessage({ type: 'masses', requestId: req.requestId, masses: [], processed: 0, done: true } satisfies WorkerResponse);
      for (let start = req.from; start < to; start += CHUNK) {
        const masses: number[] = [];
        const end = Math.min(start + CHUNK, to);
        for (let i = start; i < end; i++) {
          const pair = selectPair(processDatasetEvent(ds, i, req.detectorId, { ...req.opts, advanced: false }).reco, req.pair);
          if (pair) masses.push(pair.mass);
        }
        const msg: WorkerResponse = { type: 'masses', requestId: req.requestId, masses, processed: end - start, done: end >= to };
        ctx.postMessage(msg);
      }
    }
  } catch (e) {
    const msg: WorkerResponse = { type: 'error', requestId: req.requestId, message: e instanceof Error ? e.message : String(e) };
    ctx.postMessage(msg);
  }
};
