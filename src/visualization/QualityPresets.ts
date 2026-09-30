/**
 * Rendering quality presets. They change rendering cost only — never physics inputs.
 * (Physics modules do not import this file; see tests/visualization.test.ts.)
 */

export type QualityId = 'ULTRA' | 'HIGH' | 'MEDIUM' | 'SCIENTIFIC';

export interface QualityPreset {
  readonly id: QualityId;
  readonly label: string;
  readonly maxPixelRatio: number;
  readonly shadows: boolean;
  readonly bloom: boolean;
  /** Base bloom strength before the vis-mode multiplier. */
  readonly bloomStrength: number;
  readonly fxaa: boolean;
  readonly fog: boolean;
  /** Radial segments of tier-1 tube tracks. */
  readonly tubeSegments: number;
  /** Max tracks drawn as tier-1 tubes / tier-2 ribbons. */
  readonly maxTier1: number;
  readonly maxTier2: number;
  /** Tracks below this pT are omitted in events with more than `denseEventTracks` tracks (render-only). */
  readonly denseMinPt: number;
  readonly denseEventTracks: number;
  /** City instance budget and ring/tunnel detail. */
  readonly cityBuildings: number;
  readonly tunnelCells: number;
  readonly geometrySegments: number;
}

export const QUALITY_PRESETS: Record<QualityId, QualityPreset> = {
  ULTRA: {
    id: 'ULTRA', label: 'Ultra', maxPixelRatio: 2, shadows: true, bloom: true, bloomStrength: 0.35, fxaa: true, fog: true,
    tubeSegments: 8, maxTier1: 60, maxTier2: 2500, denseMinPt: 0, denseEventTracks: 5000,
    cityBuildings: 6000, tunnelCells: 6, geometrySegments: 96,
  },
  HIGH: {
    id: 'HIGH', label: 'High', maxPixelRatio: 1.5, shadows: true, bloom: true, bloomStrength: 0.25, fxaa: true, fog: true,
    tubeSegments: 6, maxTier1: 40, maxTier2: 1500, denseMinPt: 0.2, denseEventTracks: 1500,
    cityBuildings: 4000, tunnelCells: 4, geometrySegments: 64,
  },
  MEDIUM: {
    id: 'MEDIUM', label: 'Medium', maxPixelRatio: 1, shadows: false, bloom: false, bloomStrength: 0, fxaa: false, fog: true,
    tubeSegments: 4, maxTier1: 20, maxTier2: 600, denseMinPt: 0.4, denseEventTracks: 800,
    cityBuildings: 2000, tunnelCells: 3, geometrySegments: 40,
  },
  SCIENTIFIC: {
    id: 'SCIENTIFIC', label: 'Scientific', maxPixelRatio: 2, shadows: false, bloom: false, bloomStrength: 0, fxaa: true, fog: false,
    tubeSegments: 6, maxTier1: 100, maxTier2: 6000, denseMinPt: 0, denseEventTracks: 100000,
    cityBuildings: 1500, tunnelCells: 4, geometrySegments: 64,
  },
};

export const QUALITY_IDS: readonly QualityId[] = ['ULTRA', 'HIGH', 'MEDIUM', 'SCIENTIFIC'];
