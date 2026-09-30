/**
 * "Color By" semantics: maps a track to a color plus redundant encodings (width, dash,
 * opacity) and produces the matching legend. Legend and colors are generated from the
 * same function, so the legend always states what color currently means.
 */
import type { VertexKind } from '../../physics/events/EventSchema';
import type { TrackRecord } from '../../physics/propagation/EventPropagation';
import { colormapGradientCss, COLORMAP_LABEL, hexToRgb, logNorm, sampleColormap, type ColormapId, type RGB } from './Colormaps';
import { PALETTES, type CategoricalPalette, type PaletteId, type ParticleClass } from './PhysicsPalette';

export type ColorBy = 'particleType' | 'charge' | 'pt' | 'energy' | 'vertex' | 'subsystem' | 'collection';

export const COLOR_BY_LABEL: Record<ColorBy, string> = {
  particleType: 'Particle Type',
  charge: 'Charge',
  pt: 'pT',
  energy: 'Energy',
  vertex: 'Origin Vertex',
  subsystem: 'Detector Subsystem',
  collection: 'Collection',
};

export type DashStyle = 0 | 1 | 2; // solid, dashed, dotted

export interface TrackStyle {
  readonly color: RGB;
  /** Relative width multiplier. */
  readonly width: number;
  readonly dash: DashStyle;
  readonly opacity: number;
}

export interface ColorContext {
  readonly colorBy: ColorBy;
  readonly palette: PaletteId;
  readonly colormap: ColormapId;
}

/** Continuous-scale ranges (GeV, log scale). */
export const PT_RANGE = { lo: 0.5, hi: 500 } as const;
export const ENERGY_RANGE = { lo: 0.5, hi: 1000 } as const;

export function particleClass(pdgId: number, charge: number): ParticleClass {
  const a = Math.abs(pdgId);
  if (a === 13) return 'muon';
  if (a === 11) return 'electron';
  if (a === 22) return 'photon';
  if (a === 12 || a === 14 || a === 16) return 'neutrino';
  return charge !== 0 ? 'charged' : 'neutral-hadron';
}

/** Redundant (non-hue) encoding by particle class — used in every Color By mode. */
export const CLASS_ENCODING: Record<ParticleClass, { width: number; dash: DashStyle; icon: string; label: string }> = {
  muon: { width: 2.2, dash: 0, icon: '━━', label: 'Muon' },
  electron: { width: 1.6, dash: 0, icon: '──', label: 'Electron' },
  photon: { width: 1.3, dash: 1, icon: '╌╌', label: 'Photon' },
  charged: { width: 1.0, dash: 0, icon: '─', label: 'Charged hadron' },
  'neutral-hadron': { width: 1.0, dash: 2, icon: '┈┈', label: 'Neutral hadron' },
  neutrino: { width: 1.0, dash: 2, icon: '┈', label: 'Neutrino (truth only, undetected)' },
};

function originOpacity(origin: VertexKind): number {
  return origin === 'pileup' ? 0.35 : 1;
}

export function trackStyle(t: TrackRecord, ctx: ColorContext): TrackStyle {
  const pal = PALETTES[ctx.palette];
  const cls = particleClass(t.pdgId, t.charge);
  const enc = CLASS_ENCODING[cls];
  // Opacity as secondary encoding: pile-up faded, very soft tracks slightly faded.
  const baseOpacity = originOpacity(t.origin) * (t.pt < 1 ? 0.7 : 1) * (cls === 'neutrino' ? 0.6 : 1);
  let color: RGB;
  switch (ctx.colorBy) {
    case 'particleType':
      color = hexToRgb(pal.particle[cls]);
      break;
    case 'charge':
      color = hexToRgb(t.charge > 0 ? pal.charge.positive : t.charge < 0 ? pal.charge.negative : pal.charge.neutral);
      break;
    case 'pt':
      color = sampleColormap(ctx.colormap, logNorm(t.pt, PT_RANGE.lo, PT_RANGE.hi));
      break;
    case 'energy':
      color = sampleColormap(ctx.colormap, logNorm(t.energy, ENERGY_RANGE.lo, ENERGY_RANGE.hi));
      break;
    case 'vertex':
      color = hexToRgb(pal.origin[t.origin]);
      break;
    case 'subsystem':
      // Trajectories are measured by the tracker (charged) or reach the muon system (muons).
      color = hexToRgb(cls === 'muon' ? pal.subsystem['muon-system'] : pal.subsystem.tracker);
      break;
    case 'collection':
      color = hexToRgb(t.recoId !== undefined ? pal.collection.reco : pal.collection.truth);
      break;
  }
  return { color, width: enc.width, dash: enc.dash, opacity: baseOpacity };
}

// ---- Legend ------------------------------------------------------------------------------------

export type LegendEntry =
  | { kind: 'swatch'; color: string; label: string; icon?: string; note?: string }
  | { kind: 'gradient'; gradientCss: string; minLabel: string; maxLabel: string; label: string };

export interface LegendSpec {
  readonly title: string;
  readonly entries: readonly LegendEntry[];
  readonly footnote: string;
}

export function legendFor(ctx: ColorContext): LegendSpec {
  const pal: CategoricalPalette = PALETTES[ctx.palette];
  const sw = (color: string, label: string, icon?: string, note?: string): LegendEntry => ({ kind: 'swatch', color, label, ...(icon ? { icon } : {}), ...(note ? { note } : {}) });
  const footnote = `${pal.label}. Colors represent visualization metadata, not physical particle colors.`;
  switch (ctx.colorBy) {
    case 'particleType':
      return {
        title: 'PARTICLE TYPE',
        entries: [
          ...(Object.keys(CLASS_ENCODING) as ParticleClass[]).map((c) => sw(pal.particle[c], CLASS_ENCODING[c].label, CLASS_ENCODING[c].icon)),
          sw(pal.object.jet, 'Jet (analysis cone)', '△'),
          sw(pal.object.met, 'MET (inferred, analysis arrow)', '➜'),
        ],
        footnote,
      };
    case 'charge':
      return {
        title: 'CHARGE',
        entries: [sw(pal.charge.positive, 'Positive (+)', '+'), sw(pal.charge.negative, 'Negative (−)', '−'), sw(pal.charge.neutral, 'Neutral (0)', '○', 'dashed/dotted line')],
        footnote,
      };
    case 'pt':
      return {
        title: 'TRANSVERSE MOMENTUM pT',
        entries: [{ kind: 'gradient', gradientCss: colormapGradientCss(ctx.colormap), minLabel: `${PT_RANGE.lo} GeV`, maxLabel: `${PT_RANGE.hi}+ GeV`, label: `pT (log scale, ${COLORMAP_LABEL[ctx.colormap]})` }],
        footnote: 'Continuous scale. Line width/dash still encode particle class.',
      };
    case 'energy':
      return {
        title: 'ENERGY',
        entries: [{ kind: 'gradient', gradientCss: colormapGradientCss(ctx.colormap), minLabel: `${ENERGY_RANGE.lo} GeV`, maxLabel: `${ENERGY_RANGE.hi}+ GeV`, label: `E (log scale, ${COLORMAP_LABEL[ctx.colormap]})` }],
        footnote: 'Continuous scale. Line width/dash still encode particle class.',
      };
    case 'vertex':
      return {
        title: 'ORIGIN VERTEX',
        entries: [
          sw(pal.origin.primary, 'Primary vertex', '●'),
          sw(pal.origin.pileup, 'Pile-up vertex', '◌', 'faded'),
          sw(pal.origin.secondary, 'Secondary vertex (K⁰_S, Λ decays)', '◆'),
          sw(pal.origin.displaced, 'Displaced vertex (b-hadron decays)', '▲'),
        ],
        footnote,
      };
    case 'subsystem':
      return {
        title: 'DETECTOR SUBSYSTEM',
        entries: [sw(pal.subsystem.tracker, 'Inner tracker'), sw(pal.subsystem.ecal, 'EM calorimeter'), sw(pal.subsystem.hcal, 'Hadronic calorimeter'), sw(pal.subsystem['muon-system'], 'Muon spectrometer')],
        footnote,
      };
    case 'collection':
      return {
        title: 'COLLECTION',
        entries: [sw(pal.collection.truth, 'Simulation truth trajectories'), sw(pal.collection.hits, 'Detector hits'), sw(pal.collection.deposits, 'Calorimeter deposits'), sw(pal.collection.reco, 'Reconstructed objects')],
        footnote,
      };
  }
}
