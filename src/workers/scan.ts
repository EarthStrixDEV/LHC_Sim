/** Per-event summary for trigger / pile-up studies (no geometry crosses the worker boundary). */
import type { ProcessedEvent } from '../physics/EventProcessor';

export interface ScanRow {
  readonly index: number;
  readonly l1: boolean;
  readonly hlt: boolean;
  readonly fired: string[];
  readonly nPileUp: number | null;
}

export function scanEvent(pe: ProcessedEvent, index: number): ScanRow {
  return { index, l1: pe.trigger?.l1Accept ?? false, hlt: pe.trigger?.hltAccept ?? false, fired: pe.trigger?.items.filter((i) => i.hlt).map((i) => i.id) ?? [], nPileUp: pe.pileUp?.n ?? null };
}
