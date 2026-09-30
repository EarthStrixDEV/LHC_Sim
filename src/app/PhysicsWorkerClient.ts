/**
 * Main-thread client for the physics worker, with a synchronous in-thread fallback when
 * module workers are unavailable. Both paths run the identical pure pipeline.
 */
import { loadDataset } from '../data-sources/DataSourceRegistry';
import type { NormalizedSample } from '../data-sources/NormalizedEvent';
import { processDatasetEvent, type DetectorId, type ProcessedEvent, type ProcessOptions } from '../physics/EventProcessor';
import { selectPair, type PairKind } from '../physics/reconstruction/InvariantMass';
import type { WorkerRequest, WorkerResponse } from '../workers/physics.worker';
import { scanEvent, type ScanRow } from '../workers/scan';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onMasses?: (masses: number[], processed: number) => void;
};

export class PhysicsWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  readonly usesWorker: boolean;

  constructor() {
    try {
      this.worker = new Worker(new URL('../workers/physics.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
      this.worker.onerror = (e) => console.error('[physics worker]', e.message);
    } catch (e) {
      console.warn('[physics worker] unavailable, falling back to main thread', e);
      this.worker = null;
    }
    this.usesWorker = this.worker !== null;
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.requestId);
    if (!p) return;
    if (msg.type === 'error') {
      this.pending.delete(msg.requestId);
      p.reject(new Error(msg.message));
    } else if (msg.type === 'processed') {
      this.pending.delete(msg.requestId);
      p.resolve({ result: msg.result, workerMs: msg.workerMs });
    } else if (msg.type === 'scanned') {
      this.pending.delete(msg.requestId);
      p.resolve(msg.rows);
    } else if (msg.type === 'registered') {
      this.pending.delete(msg.requestId);
      p.resolve(undefined);
    } else {
      p.onMasses?.(msg.masses, msg.processed);
      if (msg.done) {
        this.pending.delete(msg.requestId);
        p.resolve(undefined);
      }
    }
  }

  private send(req: DistributiveOmit<WorkerRequest, 'requestId'>, extra: Partial<Pending> = {}): Promise<unknown> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, ...extra });
      this.worker!.postMessage({ ...req, requestId });
    });
  }

  /** Makes a runtime dataset (already registered on the main thread) known to the worker. */
  async register(sample: NormalizedSample, label: string): Promise<void> {
    if (this.worker) await this.send({ type: 'register', sample, label });
  }

  async process(datasetId: string, index: number, detectorId: DetectorId, opts: ProcessOptions = {}): Promise<{ result: ProcessedEvent; workerMs: number }> {
    if (this.worker) return (await this.send({ type: 'process', datasetId, index, detectorId, opts })) as { result: ProcessedEvent; workerMs: number };
    const ds = await loadDataset(datasetId);
    const t0 = performance.now();
    const result = processDatasetEvent(ds, index, detectorId, opts);
    return { result, workerMs: performance.now() - t0 };
  }

  async scan(datasetId: string, detectorId: DetectorId, from: number, to: number, opts: ProcessOptions): Promise<ScanRow[]> {
    if (this.worker) return (await this.send({ type: 'scan', datasetId, detectorId, from, to, opts })) as ScanRow[];
    const ds = await loadDataset(datasetId);
    const rows: ScanRow[] = [];
    for (let i = from; i < Math.min(to, ds.size); i++) rows.push(scanEvent(processDatasetEvent(ds, i, detectorId, { ...opts, advanced: false }), i));
    return rows;
  }

  async accumulate(datasetId: string, detectorId: DetectorId, pair: PairKind, from: number, to: number, onMasses: (m: number[], processed: number) => void, opts: ProcessOptions = {}): Promise<void> {
    if (this.worker) {
      await this.send({ type: 'accumulate', datasetId, detectorId, pair, from, to, opts }, { onMasses });
      return;
    }
    const ds = await loadDataset(datasetId);
    for (let i = from; i < Math.min(to, ds.size); i++) {
      const p = selectPair(processDatasetEvent(ds, i, detectorId, { ...opts, advanced: false }).reco, pair);
      onMasses(p ? [p.mass] : [], 1);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
