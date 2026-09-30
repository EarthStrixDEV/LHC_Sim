/**
 * Categorical palettes for EVENT DISPLAY semantics.
 * Colors represent visualization metadata, not physical particle colors.
 */

export type PaletteId = 'cern' | 'colorblind' | 'monochrome';

export type ParticleClass = 'muon' | 'electron' | 'photon' | 'charged' | 'neutral-hadron' | 'neutrino';
export type ObjectClass = 'jet' | 'met';
export type OriginClass = 'primary' | 'pileup' | 'secondary' | 'displaced';
export type SubsystemClass = 'tracker' | 'ecal' | 'hcal' | 'muon-system';
export type CollectionClass = 'truth' | 'hits' | 'deposits' | 'reco';

export interface CategoricalPalette {
  readonly id: PaletteId;
  readonly label: string;
  readonly particle: Record<ParticleClass, string>;
  readonly object: Record<ObjectClass, string>;
  readonly charge: { readonly positive: string; readonly negative: string; readonly neutral: string };
  readonly origin: Record<OriginClass, string>;
  readonly subsystem: Record<SubsystemClass, string>;
  readonly collection: Record<CollectionClass, string>;
  /** Base detector geometry tint (kept muted so physics objects dominate). */
  readonly geometry: string;
  readonly background: string;
}

export const PALETTE_DISCLAIMER =
  'CERN-inspired visualization palette. Colors represent visualization metadata, not physical particle colors.';

export const CERN_PALETTE: CategoricalPalette = {
  id: 'cern',
  label: 'CERN-inspired Event Display',
  particle: {
    muon: '#ff3b30',
    electron: '#34c759',
    photon: '#b36bff',
    charged: '#ff9f0a',
    'neutral-hadron': '#8ea3b8',
    neutrino: '#d0d0d0',
  },
  object: { jet: '#ffc83d', met: '#ff2dcc' },
  charge: { positive: '#ff6b5e', negative: '#4aa3ff', neutral: '#bdbdbd' },
  origin: { primary: '#ffd166', pileup: '#6c7a89', secondary: '#06d6a0', displaced: '#ef476f' },
  subsystem: { tracker: '#7fdbff', ecal: '#2ec4b6', hcal: '#f4a261', 'muon-system': '#ff3b30' },
  collection: { truth: '#ff9f0a', hits: '#7fdbff', deposits: '#2ec4b6', reco: '#ffffff' },
  geometry: '#5d6b7a',
  background: '#07090c',
};

/** Okabe–Ito based palette; avoids red/green discrimination. */
export const COLORBLIND_PALETTE: CategoricalPalette = {
  id: 'colorblind',
  label: 'Colorblind-safe (Okabe–Ito)',
  particle: {
    muon: '#D55E00',
    electron: '#0072B2',
    photon: '#CC79A7',
    charged: '#E69F00',
    'neutral-hadron': '#999999',
    neutrino: '#dddddd',
  },
  object: { jet: '#F0E442', met: '#56B4E9' },
  charge: { positive: '#E69F00', negative: '#56B4E9', neutral: '#999999' },
  origin: { primary: '#F0E442', pileup: '#777777', secondary: '#56B4E9', displaced: '#D55E00' },
  subsystem: { tracker: '#56B4E9', ecal: '#009E73', hcal: '#E69F00', 'muon-system': '#D55E00' },
  collection: { truth: '#E69F00', hits: '#56B4E9', deposits: '#009E73', reco: '#ffffff' },
  geometry: '#5a6470',
  background: '#07090c',
};

/** Luminance-only palette; categories rely on line style, width, labels and icons. */
export const MONOCHROME_PALETTE: CategoricalPalette = {
  id: 'monochrome',
  label: 'Monochrome',
  particle: {
    muon: '#ffffff',
    electron: '#d9d9d9',
    photon: '#bfbfbf',
    charged: '#a6a6a6',
    'neutral-hadron': '#808080',
    neutrino: '#666666',
  },
  object: { jet: '#e0e0e0', met: '#ffffff' },
  charge: { positive: '#ffffff', negative: '#9a9a9a', neutral: '#606060' },
  origin: { primary: '#ffffff', pileup: '#5a5a5a', secondary: '#b0b0b0', displaced: '#d8d8d8' },
  subsystem: { tracker: '#e6e6e6', ecal: '#bdbdbd', hcal: '#8c8c8c', 'muon-system': '#ffffff' },
  collection: { truth: '#e6e6e6', hits: '#bdbdbd', deposits: '#8c8c8c', reco: '#ffffff' },
  geometry: '#4a4a4a',
  background: '#050505',
};

export const PALETTES: Record<PaletteId, CategoricalPalette> = {
  cern: CERN_PALETTE,
  colorblind: COLORBLIND_PALETTE,
  monochrome: MONOCHROME_PALETTE,
};
