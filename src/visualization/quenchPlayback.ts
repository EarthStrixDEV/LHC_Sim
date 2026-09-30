/**
 * Display-time mapping for the quench timeline (visual only). The physical sequence
 * spans milliseconds (detection, heaters) to minutes (energy extraction), so playback
 * starts ×10 slowed, then runs ×40 accelerated. The UI always states the simulated time.
 */
const SLOW_PHASE_WALL_S = 6;
const SLOW_RATE = 0.1;
const FAST_RATE = 40;

export function quenchSimTime(wallSeconds: number): number {
  if (wallSeconds <= SLOW_PHASE_WALL_S) return wallSeconds * SLOW_RATE;
  return SLOW_PHASE_WALL_S * SLOW_RATE + (wallSeconds - SLOW_PHASE_WALL_S) * FAST_RATE;
}

export function quenchPlaybackLabel(wallSeconds: number): string {
  return wallSeconds <= SLOW_PHASE_WALL_S ? `playback ×${SLOW_RATE} (slowed)` : `playback ×${FAST_RATE} (accelerated)`;
}
