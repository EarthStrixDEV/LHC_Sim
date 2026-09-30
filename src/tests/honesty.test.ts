import { describe, expect, it } from 'vitest';
import { trajectoryVisibility, VIS_MODES, VIS_POLICIES } from '../visualization/VisualizationMode';
import { dataLevelsOf, primaryDataLevel } from '../data-sources/NormalizedEvent';
import { loadDataset } from '../data-sources/DataSourceRegistry';

describe('Scientific-honesty rules (Phase 2)', () => {
  it('reconstructed-data trajectories are never shown in modes that only allow simulation truth', () => {
    for (const m of VIS_MODES) {
      const pol = VIS_POLICIES[m];
      const v = trajectoryVisibility(pol, 'reco');
      if (!pol.categories.includes('RECONSTRUCTED DATA')) expect(v).toBe('none');
    }
    expect(trajectoryVisibility(VIS_POLICIES.ANALYSIS, 'reco')).toBe('all');
    expect(trajectoryVisibility(VIS_POLICIES.PHYSICAL, 'truth')).toBe('none');
    expect(trajectoryVisibility(VIS_POLICIES.ANALYSIS, 'truth')).toBe('reco-matched');
    expect(trajectoryVisibility(VIS_POLICIES.AUGMENTED, 'truth')).toBe('all');
  });

  it('bunch packets / beams only in augmented-type modes, never in PHYSICAL', () => {
    expect(VIS_POLICIES.PHYSICAL.showBeam).toBe(false);
    expect(VIS_POLICIES.PHYSICAL.showBeamEnvelope).toBe(false);
    expect(VIS_POLICIES.AUGMENTED.showBeamEnvelope).toBe(true);
  });

  it('curated simulation is labelled as simulated truth, never as recorded data', async () => {
    const ds = await loadDataset('zmumu');
    expect(primaryDataLevel(ds.provenance, ds.event(0))).toBe('SIMULATED_TRUTH');
    expect(dataLevelsOf(ds.provenance, ds.event(0))).not.toContain('RECORDED_COLLISION_DATA');
  });
});
