/**
 * Detector-level measurements (DETECTOR MEASUREMENT category — what the apparatus records),
 * kept separate from truth and from reconstructed objects.
 *
 * Tracker hits are stored structure-of-arrays so they can be transferred from the worker
 * and uploaded to GPU buffers without per-hit objects.
 */

export const SUBSYSTEM_CODE = { pixel: 0, strip: 1, trt: 2, tpc: 3 } as const;
export type TrackerSubsystemCode = (typeof SUBSYSTEM_CODE)[keyof typeof SUBSYSTEM_CODE];

export interface TrackerHits {
  /** xyz per hit [m]. */
  readonly positions: Float32Array;
  /** Hit time [ns]. */
  readonly times: Float32Array;
  /** Truth particle that produced the hit (simulation bookkeeping, not "measured"). */
  readonly particleIds: Int32Array;
  readonly subsystems: Uint8Array;
  readonly count: number;
}

export interface MuonHit {
  readonly particleId: number;
  readonly station: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Local track direction (segment) — unit vector. */
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly t: number;
}
