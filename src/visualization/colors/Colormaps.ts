/**
 * Perceptually uniform scientific colormaps (continuous scalars only).
 * Stops are the 11 evenly spaced samples of matplotlib's `inferno` and `viridis`
 * (van der Walt & Smith, BIDS, 2015), linearly interpolated in sRGB between stops.
 * Rainbow/jet is intentionally not offered.
 */

export type ColormapId = 'inferno' | 'viridis';
export type RGB = [number, number, number];

const INFERNO = ['#000004', '#160b39', '#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746', '#fcffa4'];
const VIRIDIS = ['#440154', '#482475', '#414487', '#355f8d', '#2a788e', '#21918c', '#22a884', '#44bf70', '#7ad151', '#bddf26', '#fde725'];

export function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

const STOPS: Record<ColormapId, RGB[]> = {
  inferno: INFERNO.map(hexToRgb),
  viridis: VIRIDIS.map(hexToRgb),
};

export const COLORMAP_LABEL: Record<ColormapId, string> = { inferno: 'Inferno', viridis: 'Viridis' };

/** Samples colormap at t ∈ [0, 1] (clamped). Writes into `out` if provided. */
export function sampleColormap(id: ColormapId, t: number, out: RGB = [0, 0, 0]): RGB {
  const stops = STOPS[id];
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const a = stops[i]!, b = stops[i + 1]!;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

/** CSS linear-gradient for legends. */
export function colormapGradientCss(id: ColormapId): string {
  const stops = STOPS[id];
  return `linear-gradient(to right, ${stops.map((c, i) => `${rgbToCss(c)} ${(i / (stops.length - 1)) * 100}%`).join(', ')})`;
}

/** Log-scale normalization of x into [0, 1] between lo and hi (> 0). */
export function logNorm(x: number, lo: number, hi: number): number {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return Math.log(x / lo) / Math.log(hi / lo);
}
