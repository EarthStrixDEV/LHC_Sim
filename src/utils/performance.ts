/**
 * Runtime profiling. Allocation-free in the per-frame path: samples go into fixed-size
 * ring buffers.
 */

export class RollingStat {
  private readonly buf: Float64Array;
  private idx = 0;
  private filled = 0;

  constructor(size = 120) {
    this.buf = new Float64Array(size);
  }

  push(v: number): void {
    this.buf[this.idx] = v;
    this.idx = (this.idx + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
  }

  mean(): number {
    if (this.filled === 0) return 0;
    let s = 0;
    for (let i = 0; i < this.filled; i++) s += this.buf[i]!;
    return s / this.filled;
  }

  max(): number {
    let m = 0;
    for (let i = 0; i < this.filled; i++) m = Math.max(m, this.buf[i]!);
    return m;
  }
}

export interface FrameBudget {
  physicsMs: number;
  sceneUpdateMs: number;
  renderMs: number;
  frameMs: number;
}

/** Target budget from the Phase 1 spec (targets, not hard requirements). */
export const FRAME_BUDGET_MS = {
  total: 1000 / 60,
  physics: 3,
  sceneUpdate: 2,
  render: 5,
  post: 4,
} as const;

export class PerformanceMonitor {
  readonly frame = new RollingStat();
  readonly physics = new RollingStat();
  readonly sceneUpdate = new RollingStat();
  readonly render = new RollingStat();
  /** Last off-main-thread (worker) event-processing time. */
  workerMs = 0;
  drawCalls = 0;
  triangles = 0;
  visibleTracks = 0;
  activeParticles = 0;
  geometries = 0;
  textures = 0;
  backend = 'unknown';
  lastSceneTransitionMs = 0;

  private lastFrameStart = 0;

  beginFrame(now: number): void {
    if (this.lastFrameStart > 0) this.frame.push(now - this.lastFrameStart);
    this.lastFrameStart = now;
  }

  fps(): number {
    const m = this.frame.mean();
    return m > 0 ? 1000 / m : 0;
  }

  /** JS heap usage where the (non-standard) Chrome API exists. */
  heapMB(): number | null {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? mem.usedJSHeapSize / (1024 * 1024) : null;
  }
}

/** Measures a synchronous section and pushes the duration into a stat. */
export function timed<T>(stat: RollingStat, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  stat.push(performance.now() - t0);
  return r;
}
