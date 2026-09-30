/**
 * Educational binned maximum-likelihood fits of 1D histograms.
 *
 * Expected counts per bin ν_i(θ) = f(x_i; θ)·Δx (evaluated at the bin centre); the negative
 * Poisson log-likelihood NLL(θ) = Σ [ν_i − n_i ln ν_i] is minimized with Levenberg–Marquardt
 * steps on the Fisher information F_jk = Σ (∂ν_i/∂θ_j)(∂ν_i/∂θ_k)/ν_i (numerical derivatives).
 * Parameter uncertainties: √diag(F⁻¹) at the minimum. Goodness of fit: Pearson χ²/ndf.
 *
 * Models:
 *   gauss         N · G(x; μ, σ)
 *   gauss+exp     N · G(x; μ, σ) + exp(a₀ + a₁ (x − x_c))           (signal + falling background)
 *   gauss+linear  N · G(x; μ, σ) + b₀ + b₁ (x − x_c)
 * N is the signal yield (events); the background is expressed in events per bin.
 */

export type FitModel = 'gauss' | 'gauss+exp' | 'gauss+linear';

export const FIT_MODEL_LABEL: Record<FitModel, string> = {
  gauss: 'Gaussian peak',
  'gauss+exp': 'Gaussian + exponential background',
  'gauss+linear': 'Gaussian + linear background',
};

export interface BinnedData {
  readonly xMin: number;
  readonly xMax: number;
  readonly counts: ArrayLike<number>;
}

export interface FitResult {
  readonly model: FitModel;
  readonly params: readonly number[];
  readonly errors: readonly number[];
  readonly names: readonly string[];
  readonly nll: number;
  readonly chi2: number;
  readonly ndf: number;
  readonly converged: boolean;
  readonly iterations: number;
  /** Signal yield and its error [events]. */
  readonly signal: number;
  readonly signalError: number;
  /** Background events within μ ± 2σ (models with background). */
  readonly backgroundIn2Sigma: number;
  /** Approximate significance S/√B in μ ± 2σ (educational). */
  readonly significance: number | null;
  /** Evaluate the fitted expected counts per bin at x (for drawing). */
  readonly curve: (x: number) => number;
  readonly backgroundCurve: ((x: number) => number) | null;
}

const SQRT2PI = Math.sqrt(2 * Math.PI);

function binWidth(d: BinnedData): number {
  return (d.xMax - d.xMin) / d.counts.length;
}

function modelFn(model: FitModel, xc: number, bw: number): { names: string[]; f: (x: number, p: readonly number[]) => number; bg: ((x: number, p: readonly number[]) => number) | null } {
  const g = (x: number, p: readonly number[]) => ((p[0]! * bw) / (Math.abs(p[2]!) * SQRT2PI)) * Math.exp(-0.5 * ((x - p[1]!) / p[2]!) ** 2);
  if (model === 'gauss') return { names: ['N', 'μ', 'σ'], f: g, bg: null };
  if (model === 'gauss+exp') {
    const bg = (x: number, p: readonly number[]) => Math.exp(p[3]! + p[4]! * (x - xc));
    return { names: ['N', 'μ', 'σ', 'a₀', 'a₁'], f: (x, p) => g(x, p) + bg(x, p), bg };
  }
  const bg = (x: number, p: readonly number[]) => p[3]! + p[4]! * (x - xc);
  return { names: ['N', 'μ', 'σ', 'b₀', 'b₁'], f: (x, p) => g(x, p) + bg(x, p), bg };
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}

function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const out: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0));
    const col = solve(A, e);
    if (!col) return null;
    out.push(col);
  }
  return out[0]!.map((_, i) => out.map((c) => c[i]!));
}

export interface FitOptions {
  readonly model: FitModel;
  /** Expected peak position [x units] (starting value). */
  readonly peakHint?: number;
  readonly maxIterations?: number;
}

/** Starting values from the histogram itself (no hidden knowledge of the truth). */
export function initialParams(d: BinnedData, model: FitModel, hint: number | undefined): number[] {
  const n = d.counts.length, bw = binWidth(d);
  const x = (i: number) => d.xMin + (i + 0.5) * bw;
  let iMax = -1;
  for (let i = 0; i < n; i++) {
    if (hint !== undefined && Math.abs(x(i) - hint) > 0.15 * (d.xMax - d.xMin)) continue;
    if (iMax < 0 || d.counts[i]! > d.counts[iMax]!) iMax = i;
  }
  if (iMax < 0) iMax = Math.floor(n / 2);
  const edge = (Number(d.counts[0]) + Number(d.counts[1] ?? 0) + Number(d.counts[n - 1]) + Number(d.counts[n - 2] ?? 0)) / 4;
  const bgLevel = model === 'gauss' ? 0 : Math.max(edge, 0.1);
  // σ from the half-maximum width around the peak.
  const half = (Number(d.counts[iMax]) - bgLevel) / 2 + bgLevel;
  let lo = iMax, hi = iMax;
  while (lo > 0 && d.counts[lo]! > half) lo--;
  while (hi < n - 1 && d.counts[hi]! > half) hi++;
  const sigma = Math.max(((hi - lo) * bw) / 2.355, bw);
  let total = 0;
  for (let i = 0; i < n; i++) total += Number(d.counts[i]);
  if (model === 'gauss') return [Math.max(total, 1), x(iMax), sigma];
  // Background start values: least-squares line through the sidebands (|x − peak| > 3σ),
  // in ln(counts) for the exponential model.
  const xc = (d.xMin + d.xMax) / 2;
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(x(i) - x(iMax)) < 3 * sigma) continue;
    const yv = model === 'gauss+exp' ? Math.log(Math.max(Number(d.counts[i]), 0.5)) : Number(d.counts[i]);
    const u = x(i) - xc;
    sw += 1; sx += u; sy += yv; sxx += u * u; sxy += u * yv;
  }
  const den = sw * sxx - sx * sx;
  const b1 = sw > 2 && den !== 0 ? (sw * sxy - sx * sy) / den : 0;
  const b0 = sw > 0 ? (sy - b1 * sx) / sw : model === 'gauss+exp' ? Math.log(bgLevel) : bgLevel;
  const bgAt = (i: number) => (model === 'gauss+exp' ? Math.exp(b0 + b1 * (x(i) - xc)) : b0 + b1 * (x(i) - xc));
  // Peak yield and width from the excess over the background estimate near the peak.
  let se = 0, sex = 0, sexx = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(x(i) - x(iMax)) > 3 * sigma) continue;
    const e = Math.max(Number(d.counts[i]) - bgAt(i), 0);
    se += e; sex += e * x(i); sexx += e * x(i) * x(i);
  }
  const m = se > 0 ? sex / se : x(iMax);
  const s2 = se > 0 ? Math.sqrt(Math.max(sexx / se - m * m, 0)) : sigma;
  return [Math.max(se, 1), m, Math.min(Math.max(s2, bw / 2), sigma * 2), b0, b1];
}

export function fitHistogram(d: BinnedData, opts: FitOptions): FitResult | null {
  const n = d.counts.length;
  const bw = binWidth(d);
  const xc = (d.xMin + d.xMax) / 2;
  const xs = Array.from({ length: n }, (_, i) => d.xMin + (i + 0.5) * bw);
  const { names, f, bg } = modelFn(opts.model, xc, bw);
  let total = 0;
  for (let i = 0; i < n; i++) total += Number(d.counts[i]);
  if (total < 5) return null;
  const nuOf = (q: readonly number[]) => xs.map((x) => Math.max(f(x, q), 1e-9));
  const nllOf = (q: readonly number[]) => nuOf(q).reduce((s, nu, i) => s + nu - Number(d.counts[i]) * Math.log(nu), 0);
  const inBounds = (q: readonly number[]) => q[0]! >= 0 && q[1]! >= d.xMin && q[1]! <= d.xMax && q[2]! >= bw / 3 && q[2]! <= (d.xMax - d.xMin) / 2;

  /** Levenberg–Marquardt on the Poisson NLL; parameters with free[j] = false stay fixed. */
  const minimize = (p0: number[], free: readonly boolean[], maxIt: number) => {
    let p = p0;
    const np = p.length;
    let nll = nllOf(p);
    let lambda = 1e-3;
    let converged = false;
    let it = 0;
    let fisher: number[][] = [];
    for (; it < maxIt; it++) {
      const nu = nuOf(p);
      const J: number[][] = xs.map(() => new Array(np).fill(0));
      for (let j = 0; j < np; j++) {
        const h = Math.max(Math.abs(p[j]!) * 1e-6, 1e-8);
        const pp = [...p], pm = [...p];
        pp[j]! += h;
        pm[j]! -= h;
        xs.forEach((x, i) => (J[i]![j] = (f(x, pp) - f(x, pm)) / (2 * h)));
      }
      const grad = new Array(np).fill(0);
      fisher = Array.from({ length: np }, () => new Array(np).fill(0));
      for (let i = 0; i < n; i++) {
        const w = 1 / nu[i]!;
        for (let j = 0; j < np; j++) {
          grad[j] += (1 - Number(d.counts[i]) / nu[i]!) * J[i]![j]!;
          for (let k = 0; k < np; k++) fisher[j]![k]! += w * J[i]![j]! * J[i]![k]!;
        }
      }
      let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const A = fisher.map((r, j) => r.map((v, k) => (!free[j] || !free[k] ? (j === k ? 1 : 0) : j === k ? v * (1 + lambda) + 1e-12 : v)));
        const step = solve(A, grad.map((g, j) => (free[j] ? -g : 0)));
        if (!step) break;
        const q = p.map((v, j) => v + step[j]!);
        q[2] = Math.abs(q[2]!);
        // Physical bounds: non-negative yield, peak inside the range, width between ⅓ bin and ½ range.
        if (!inBounds(q)) {
          lambda *= 10;
          continue;
        }
        const nq = nllOf(q);
        if (Number.isFinite(nq) && nq < nll) {
          const dN = nll - nq;
          p = q;
          nll = nq;
          lambda = Math.max(lambda / 10, 1e-9);
          improved = true;
          // ΔNLL = 0.5 corresponds to 1σ: 1e-5 is far below the statistical resolution.
          if (dN < 1e-5) converged = true;
          break;
        }
        lambda *= 10;
      }
      if (!improved || converged) {
        converged = converged || !improved;
        break;
      }
    }
    return { p, nll, fisher, converged, it };
  };

  const start = initialParams(d, opts.model, opts.peakHint);
  const maxIt = opts.maxIterations ?? 200;
  // Stage 1 (background models): peak position and width fixed at their start values, so
  // the background shape settles before the peak can wander; stage 2: all parameters free.
  const stage1 = start.length > 3 ? minimize(start, start.map((_, j) => j !== 1 && j !== 2), maxIt) : null;
  const res = minimize(stage1 ? stage1.p : start, start.map(() => true), maxIt);
  const { p, nll, fisher, converged } = res;
  const it = res.it + (stage1?.it ?? 0);
  const cov = invert(fisher);
  const errors = p.map((_, j) => (cov ? Math.sqrt(Math.max(cov[j]![j]!, 0)) : Number.NaN));
  const nu = nuOf(p);
  let chi2 = 0;
  for (let i = 0; i < n; i++) chi2 += (Number(d.counts[i]) - nu[i]!) ** 2 / nu[i]!;
  const [N, mu, sigma] = p as [number, number, number];
  let B = 0;
  if (bg) for (const x of xs) if (Math.abs(x - mu) <= 2 * sigma) B += Math.max(bg(x, p), 0);
  const S = 0.9545 * N;
  const P = [...p];
  return {
    model: opts.model,
    params: p,
    errors,
    names,
    nll,
    chi2,
    ndf: Math.max(1, n - p.length),
    converged,
    iterations: it,
    signal: N,
    signalError: errors[0]!,
    backgroundIn2Sigma: B,
    significance: bg && B > 0 ? S / Math.sqrt(B) : null,
    curve: (x: number) => f(x, P),
    backgroundCurve: bg ? (x: number) => bg(x, P) : null,
  };
}
