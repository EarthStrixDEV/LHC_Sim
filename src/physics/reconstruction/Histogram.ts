/**
 * Fixed-binning 1D histogram (analysis side). Serializes to a TH1-like JSON structure so
 * a later phase can hand it to JSROOT (`JSROOT.parse` / `createHistogram`).
 */

export class Histogram1D {
  readonly counts: Float64Array;
  private sumW = 0;
  private sumWX = 0;
  private sumWX2 = 0;
  underflow = 0;
  overflow = 0;
  entries = 0;

  constructor(
    readonly name: string,
    readonly title: string,
    readonly nBins: number,
    readonly xMin: number,
    readonly xMax: number,
    readonly xLabel: string,
  ) {
    this.counts = new Float64Array(nBins);
  }

  get binWidth(): number {
    return (this.xMax - this.xMin) / this.nBins;
  }

  binCenter(i: number): number {
    return this.xMin + (i + 0.5) * this.binWidth;
  }

  fill(x: number, w = 1): void {
    if (!Number.isFinite(x)) return;
    this.entries++;
    if (x < this.xMin) {
      this.underflow += w;
      return;
    }
    if (x >= this.xMax) {
      this.overflow += w;
      return;
    }
    this.counts[Math.floor((x - this.xMin) / this.binWidth)]! += w;
    this.sumW += w;
    this.sumWX += w * x;
    this.sumWX2 += w * x * x;
  }

  /** Mean of in-range entries (ROOT convention: excludes under/overflow). */
  mean(): number {
    return this.sumW > 0 ? this.sumWX / this.sumW : Number.NaN;
  }

  rms(): number {
    if (this.sumW <= 0) return Number.NaN;
    const m = this.mean();
    return Math.sqrt(Math.max(this.sumWX2 / this.sumW - m * m, 0));
  }

  maxCount(): number {
    let m = 0;
    for (const c of this.counts) m = Math.max(m, c);
    return m;
  }

  reset(): void {
    this.counts.fill(0);
    this.sumW = this.sumWX = this.sumWX2 = 0;
    this.underflow = this.overflow = this.entries = 0;
  }

  /** TH1D-like object (JSROOT-compatible field names). */
  toJSON(): Record<string, unknown> {
    return {
      _typename: 'TH1D',
      fName: this.name,
      fTitle: this.title,
      fXaxis: { fNbins: this.nBins, fXmin: this.xMin, fXmax: this.xMax, fTitle: this.xLabel },
      fArray: [this.underflow, ...this.counts, this.overflow],
      fEntries: this.entries,
      fTsumw: this.sumW,
      fTsumwx: this.sumWX,
      fTsumwx2: this.sumWX2,
    };
  }
}
