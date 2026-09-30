/**
 * Render-side track level of detail. Decides HOW a physics trajectory is drawn, never
 * what the trajectory is. Inputs are physics-owned importance/pT; outputs are tiers:
 *
 *   1 — high-quality tube (selected / leptons / photons / high pT)
 *   2 — crossed ribbons (normal tracks)
 *   3 — 1-px line segments (soft background, e.g. heavy-ion bulk)
 *   0 — omitted (only in dense events, below the preset's pT floor, never if selected)
 */
import type { TrackRecord } from '../../physics/propagation/EventPropagation';
import type { QualityPreset } from '../QualityPresets';

export type TrackTier = 0 | 1 | 2 | 3;

export function assignTiers(tracks: readonly TrackRecord[], q: QualityPreset, selectedParticleId: number | null): TrackTier[] {
  const dense = tracks.length > q.denseEventTracks;
  // Rank by importance then pT (stable, deterministic).
  const order = tracks
    .map((_, i) => i)
    .sort((a, b) => {
      const ta = tracks[a]!, tb = tracks[b]!;
      return tb.importance - ta.importance || tb.pt - ta.pt || ta.particleId - tb.particleId;
    });
  const tiers: TrackTier[] = new Array<TrackTier>(tracks.length).fill(3);
  let n1 = 0, n2 = 0;
  for (const i of order) {
    const t = tracks[i]!;
    if (t.particleId === selectedParticleId) {
      tiers[i] = 1;
      continue;
    }
    if (dense && t.pt < q.denseMinPt && t.importance === 0) {
      tiers[i] = 0;
      continue;
    }
    if (t.importance === 2 && n1 < q.maxTier1) {
      tiers[i] = 1;
      n1++;
    } else if (t.importance >= 1 && n2 < q.maxTier2) {
      tiers[i] = 2;
      n2++;
    } else {
      tiers[i] = 3;
    }
  }
  return tiers;
}
