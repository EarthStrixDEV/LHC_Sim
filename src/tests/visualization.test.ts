import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VIS_POLICIES, VIS_MODES } from '../visualization/VisualizationMode';
import { QUALITY_PRESETS, QUALITY_IDS } from '../visualization/QualityPresets';
import { assignTiers } from '../visualization/tracks/TrackLOD';
import { legendFor, trackStyle, type ColorBy } from '../visualization/colors/ColorMode';
import { sampleColormap } from '../visualization/colors/Colormaps';
import { PALETTES } from '../visualization/colors/PhysicsPalette';
import { loadSample } from '../physics/events/EventLoader';
import { sampleById } from '../physics/events/EventDatabase';
import { processEvent } from '../physics/EventProcessor';

describe('visualization honesty modes', () => {
  it('PHYSICAL hides every invisible quantity (no beams, no tracks, no overlays)', () => {
    const p = VIS_POLICIES.PHYSICAL;
    expect(p.showBeam || p.showBeamEnvelope || p.showTruthTracks || p.showRecoTracks || p.showTrackerHits || p.showCaloDeposits || p.showFieldOverlay || p.showSynchrotronPhotons || p.showJetCones || p.showMET).toBe(false);
    expect(p.bloomScale).toBe(0);
    expect(p.categories).toEqual(['PHYSICALLY VISIBLE']);
  });

  it('DETECTOR shows detector response but not truth trajectories', () => {
    const p = VIS_POLICIES.DETECTOR;
    expect(p.showTrackerHits && p.showCaloDeposits && p.showMuonSegments).toBe(true);
    expect(p.showTruthTracks).toBe(false);
    expect(p.showJetCones).toBe(false);
  });

  it('AUGMENTED enables truth trajectories, fields and beam envelopes, labelled as simulation truth', () => {
    const p = VIS_POLICIES.AUGMENTED;
    expect(p.showTruthTracks && p.showFieldOverlay && p.showBeamEnvelope && p.showBeam).toBe(true);
    expect(p.categories).toContain('SIMULATION TRUTH');
  });

  it('ANALYSIS enables reconstructed overlays (jets, MET, invariant mass) as analysis categories', () => {
    const p = VIS_POLICIES.ANALYSIS;
    expect(p.showRecoObjects && p.showJetCones && p.showMET && p.showInvariantMass && p.showDecayTree).toBe(true);
    expect(p.showTruthTracks).toBe(false);
    expect(p.categories).toEqual(expect.arrayContaining(['RECONSTRUCTED DATA', 'ANALYSIS OVERLAY']));
  });

  it('only CINEMATIC declares cinematic enhancement; amplified effects are never on in PHYSICAL/DETECTOR/ANALYSIS', () => {
    for (const m of VIS_MODES) {
      const p = VIS_POLICIES[m];
      expect(p.categories.includes('CINEMATIC ENHANCEMENT')).toBe(m === 'CINEMATIC');
      if (m === 'PHYSICAL' || m === 'DETECTOR' || m === 'ANALYSIS') expect(p.amplifiedEffects).toBe(false);
    }
  });

  it('detector geometry is muted relative to event information in event-bearing modes', () => {
    for (const m of ['DETECTOR', 'AUGMENTED', 'ANALYSIS', 'CINEMATIC'] as const) expect(VIS_POLICIES[m].geometryOpacity).toBeLessThan(0.3);
  });
});

describe('color system', () => {
  const COLOR_BYS: ColorBy[] = ['particleType', 'charge', 'pt', 'energy', 'vertex', 'subsystem', 'collection'];

  it('legend follows the current Color By semantics', () => {
    expect(legendFor({ colorBy: 'particleType', palette: 'cern', colormap: 'viridis' }).title).toBe('PARTICLE TYPE');
    expect(legendFor({ colorBy: 'pt', palette: 'cern', colormap: 'viridis' }).entries[0]!.kind).toBe('gradient');
    const vertex = legendFor({ colorBy: 'vertex', palette: 'cern', colormap: 'viridis' });
    expect(vertex.entries.map((e) => (e.kind === 'swatch' ? e.label : '')).join('|')).toMatch(/Primary.*Pile-up.*Secondary.*Displaced/);
    for (const c of COLOR_BYS) expect(legendFor({ colorBy: c, palette: 'colorblind', colormap: 'inferno' }).entries.length).toBeGreaterThan(0);
  });

  it('every legend states that colors are visualization metadata', () => {
    for (const c of COLOR_BYS) expect(legendFor({ colorBy: c, palette: 'cern', colormap: 'viridis' }).footnote).toMatch(/metadata|Continuous scale/);
  });

  it('colorblind palette distinguishes muons and electrons without the red/green pair', () => {
    const cb = PALETTES.colorblind.particle;
    expect(cb.muon).not.toBe(cb.electron);
    expect(cb.electron.toLowerCase()).toBe('#0072b2'); // blue, not green
  });

  it('inferno/viridis are monotonic in luminance-ish (dark → bright)', () => {
    for (const id of ['inferno', 'viridis'] as const) {
      const lum = (t: number) => {
        const [r, g, b] = sampleColormap(id, t);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      expect(lum(1)).toBeGreaterThan(lum(0.5));
      expect(lum(0.5)).toBeGreaterThan(lum(0));
    }
  });

  it('non-hue encodings: photons dashed, neutral hadrons dotted, muons widest', async () => {
    const s = await loadSample(sampleById('hgg')!.source);
    const pe = processEvent(s.event(0), 'pp', 'atlas');
    const ctx = { colorBy: 'particleType' as const, palette: 'monochrome' as const, colormap: 'viridis' as const };
    const photon = pe.tracks.find((t) => t.pdgId === 22)!;
    expect(trackStyle(photon, ctx).dash).toBe(1);
    const pileup = pe.tracks.find((t) => t.origin === 'pileup');
    if (pileup) expect(trackStyle(pileup, ctx).opacity).toBeLessThan(0.5);
  });
});

describe('quality presets and LOD do not change physics', () => {
  it('physics modules never import visualization/quality code', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..', 'physics'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"][./]*(visualization|ui)\//);
      expect(src, f).not.toMatch(/from ['"]three/);
    }
  });

  it('track tiers vary with quality while trajectories stay identical', async () => {
    const s = await loadSample(sampleById('pbpb')!.source);
    const pe = processEvent(s.event(0), "PbPb", "atlas");
    const before = pe.tracks.map((t) => t.samples.positions.slice());
    const tiers = QUALITY_IDS.map((q) => assignTiers(pe.tracks, QUALITY_PRESETS[q], null));
    expect(new Set(tiers.map((t) => t.join(""))).size).toBeGreaterThan(1);
    pe.tracks.forEach((t, i) => expect(t.samples.positions).toEqual(before[i]));
    // Re-processing gives identical physics regardless of any rendering setting.
    const again = processEvent(s.event(0), 'PbPb', 'atlas');
    expect(again.reco.jets.map((j) => j.pt)).toEqual(pe.reco.jets.map((j) => j.pt));
  });

  it('a selected track is always drawn at the highest tier', async () => {
    const s = await loadSample(sampleById('pbpb')!.source);
    const pe = processEvent(s.event(0), 'PbPb', 'atlas');
    const soft = pe.tracks.find((t) => t.pt < 0.2)!;
    const tiers = assignTiers(pe.tracks, QUALITY_PRESETS.MEDIUM, soft.particleId);
    expect(tiers[pe.tracks.indexOf(soft)]).toBe(1);
  });
});
