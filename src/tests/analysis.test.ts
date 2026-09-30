import { describe, expect, it } from 'vitest';
import { fitHistogram, type FitModel } from '../analysis/fitting/HistogramFit';
import { Histogram1D } from '../physics/reconstruction/Histogram';
import { Rng } from '../utils/math';
import { samplePoisson } from '../physics/pileup/PileUp';

function toyHistogram(seed: number, nSig: number, mu: number, sigma: number, bg: (x: number) => number, lo: number, hi: number, bins: number): Histogram1D {
  const rng = new Rng(seed);
  const h = new Histogram1D('toy', 'toy', bins, lo, hi, 'm');
  for (let i = 0; i < nSig; i++) h.fill(rng.gaussian(mu, sigma));
  const bw = (hi - lo) / bins;
  for (let i = 0; i < bins; i++) {
    const x = lo + (i + 0.5) * bw;
    const k = samplePoisson(rng, bg(x));
    h.counts[i]! += k;
  }
  return h;
}

describe('Histogram fitting', () => {
  it('Gaussian fit recovers mean, width and yield within uncertainties (Z-like peak)', () => {
    const h = toyHistogram(1, 4000, 91.2, 2.6, () => 0, 70, 110, 80);
    const r = fitHistogram({ xMin: h.xMin, xMax: h.xMax, counts: h.counts }, { model: 'gauss' })!;
    expect(r.converged).toBe(true);
    expect(Math.abs(r.params[1]! - 91.2)).toBeLessThan(3 * r.errors[1]!);
    expect(Math.abs(r.params[2]! - 2.6)).toBeLessThan(3 * r.errors[2]!);
    expect(Math.abs(r.signal - 4000)).toBeLessThan(3 * r.signalError);
    expect(r.errors[1]).toBeCloseTo(2.6 / Math.sqrt(4000), 2);
    expect(r.chi2 / r.ndf).toBeLessThan(2);
  });

  it('signal + exponential background (H → γγ-like) separates signal from background', () => {
    const bg = (x: number) => 400 * Math.exp(-0.04 * (x - 105));
    const h = toyHistogram(2, 600, 125, 1.7, bg, 105, 160, 55);
    const r = fitHistogram({ xMin: h.xMin, xMax: h.xMax, counts: h.counts }, { model: 'gauss+exp', peakHint: 125 })!;
    expect(r.converged).toBe(true);
    expect(Math.abs(r.params[1]! - 125)).toBeLessThan(3 * r.errors[1]!);
    expect(Math.abs(r.signal - 600)).toBeLessThan(3 * r.signalError);
    expect(r.params[4]).toBeCloseTo(-0.04, 1);
    expect(r.significance!).toBeGreaterThan(3);
    expect(r.backgroundCurve!(110)).toBeGreaterThan(r.backgroundCurve!(150));
  });

  it('pulls of the fitted mean have unit width over repeated pseudo-experiments', () => {
    const pulls: number[] = [];
    for (let s = 0; s < 60; s++) {
      const h = toyHistogram(100 + s, 300, 91.2, 2.5, (x) => 3 + 0.05 * (x - 70), 70, 110, 40);
      const r = fitHistogram({ xMin: h.xMin, xMax: h.xMax, counts: h.counts }, { model: 'gauss+linear', peakHint: 91 });
      if (r?.converged) pulls.push((r.params[1]! - 91.2) / r.errors[1]!);
    }
    expect(pulls.length).toBeGreaterThan(50);
    const m = pulls.reduce((a, b) => a + b, 0) / pulls.length;
    const w = Math.sqrt(pulls.reduce((a, b) => a + (b - m) ** 2, 0) / pulls.length);
    expect(Math.abs(m)).toBeLessThan(0.4);
    expect(w).toBeGreaterThan(0.7);
    expect(w).toBeLessThan(1.35);
  });

  it('refuses nearly empty histograms and is deterministic', () => {
    expect(fitHistogram({ xMin: 0, xMax: 1, counts: [0, 1, 0, 0] }, { model: 'gauss' })).toBeNull();
    const h = toyHistogram(3, 500, 3.1, 0.03, () => 5, 2.8, 3.4, 60);
    const models: FitModel[] = ['gauss', 'gauss+exp', 'gauss+linear'];
    for (const model of models) {
      const a = fitHistogram({ xMin: h.xMin, xMax: h.xMax, counts: h.counts }, { model, peakHint: 3.1 })!;
      const b = fitHistogram({ xMin: h.xMin, xMax: h.xMax, counts: h.counts }, { model, peakHint: 3.1 })!;
      expect(a.params).toEqual(b.params);
      expect(a.params[1]).toBeCloseTo(3.1, 1);
    }
  });

  it('TH1D export keeps ROOT bin conventions (under/overflow at 0 and n+1)', () => {
    const h = new Histogram1D('m', 'mass', 4, 0, 4, 'x');
    for (const x of [-1, 0.5, 1.5, 1.6, 9]) h.fill(x);
    const j = h.toJSON() as { fArray: number[]; fEntries: number };
    expect(j.fArray).toEqual([1, 1, 2, 0, 0, 1]);
    expect(j.fEntries).toBe(5);
  });
});
