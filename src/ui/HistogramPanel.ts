/**
 * Analysis panel: invariant-mass histogram accumulated over the current dataset (filled in the
 * physics worker from reconstructed four-vectors), binned maximum-likelihood fits (Gaussian or
 * signal + background), JSROOT drawing with the native canvas as fallback, TH1D JSON export,
 * and loading ROOT-derived TH1 histograms from a file.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { fitHistogram, FIT_MODEL_LABEL, type FitModel, type FitResult } from '../analysis/fitting/HistogramFit';
import type { PlainHistogram } from '../data-sources/root/JSROOTBridge';
import { Histogram1D } from '../physics/reconstruction/Histogram';
import { h, kvTable, select } from './dom';

const DEFAULT_RANGES = {
  muon: { lo: 60, hi: 120, label: 'm(μ⁺μ⁻) [GeV]' },
  electron: { lo: 60, hi: 120, label: 'm(e⁺e⁻) [GeV]' },
  photon: { lo: 105, hi: 145, label: 'm(γγ) [GeV]' },
} as const;
const BINS = 60;

export class HistogramPanel {
  readonly el = h('div', { class: 'panel-body' });
  private readonly canvas = h('canvas', { width: 330, height: 200, class: 'plot' });
  private readonly jsrootDiv = h('div', { class: 'jsroot-plot', style: 'width:330px;height:240px;display:none' });
  private readonly info = h('div', { class: 'hint' });
  private readonly fitOut = h('div');
  private readonly buttons: HTMLElement;
  private readonly lo = h('input', { type: 'number', step: 'any' }) as HTMLInputElement;
  private readonly hi = h('input', { type: 'number', step: 'any' }) as HTMLInputElement;
  private model: FitModel = 'gauss+linear';
  private fit: FitResult | null = null;
  private rootHist: PlainHistogram | null = null;
  private rangeKey = '';
  private useJsroot = false;

  constructor(private readonly c: SimulationController) {
    this.buttons = h(
      'div',
      { class: 'btn-row' },
      h('button', { onclick: () => void c.accumulateHistogram(25) }, '+25 events'),
      h('button', { onclick: () => void c.accumulateHistogram(100000) }, 'All events'),
      h('button', { onclick: () => c.resetHistogram() }, 'Reset'),
    );
    for (const i of [this.lo, this.hi]) i.addEventListener('change', () => this.refit());
    const rootFile = h('input', { type: 'file', accept: '.root' }) as HTMLInputElement;
    const rootSel = h('select') as HTMLSelectElement;
    const rootMsg = h('span', { class: 'tree-meta' });
    rootFile.addEventListener('change', async () => {
      const f = rootFile.files?.[0];
      if (!f) return;
      try {
        const { openRootFile, listHistograms, readHistogram } = await import('../data-sources/root/JSROOTBridge');
        const handle = await openRootFile(f);
        const names = listHistograms(handle);
        rootSel.replaceChildren(...names.map((n) => h('option', { value: n }, n)));
        rootMsg.textContent = names.length ? `${names.length} TH1 found` : 'no TH1 in file';
        const load = async () => {
          this.rootHist = await readHistogram(handle, rootSel.value);
          this.fit = null;
          this.render(this.c.state);
        };
        rootSel.onchange = () => void load();
        if (names.length) await load();
      } catch (e) {
        rootMsg.textContent = `failed: ${(e as Error).message}`;
      }
    });
    this.el.append(
      h(
        'section',
        { class: 'panel-section' },
        h('h3', {}, 'Invariant-mass histogram & fits'),
        this.canvas,
        this.jsrootDiv,
        this.buttons,
        h('div', { class: 'row' }, h('label', {}, 'Range [GeV]'), this.lo, this.hi),
        h('div', { class: 'row' }, h('label', {}, 'Fit model'), select((Object.keys(FIT_MODEL_LABEL) as FitModel[]).map((m) => ({ value: m, label: FIT_MODEL_LABEL[m] })), this.model, (v) => { this.model = v; this.refit(); })),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { onclick: () => this.refit(true) }, 'Fit'),
          h('button', { onclick: () => { this.useJsroot = !this.useJsroot; this.render(this.c.state); } }, 'Toggle JSROOT view'),
          h('button', { onclick: () => this.exportJson() }, 'Export TH1D JSON'),
        ),
        this.fitOut,
        this.info,
        h('details', {}, h('summary', {}, 'ROOT-derived histogram (TH1 from a .root file)'), rootFile, rootSel, rootMsg, h('div', { class: 'btn-row' }, h('button', { onclick: () => { this.rootHist = null; this.fit = null; this.render(this.c.state); } }, 'Back to accumulated histogram'))),
      ),
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.histogram !== p.histogram || s.event.pair !== p.event.pair || s.event.meta !== p.event.meta) this.render(s);
    });
  }

  /** Current histogram: ROOT-loaded, or accumulated from the dataset. */
  private current(s: SimulationState): PlainHistogram | null {
    if (this.rootHist) return this.rootHist;
    const kind = s.event.meta?.analysisPair;
    if (!kind) return null;
    const key = `${s.event.sampleId}`;
    if (key !== this.rangeKey) {
      this.rangeKey = key;
      const m = s.event.meta?.intendedMassGeV;
      const r = m ? { lo: +(m * 0.75).toPrecision(3), hi: +(m * 1.25).toPrecision(3) } : DEFAULT_RANGES[kind];
      this.lo.value = String(r.lo);
      this.hi.value = String(r.hi);
      this.fit = null;
    }
    const lo = Number(this.lo.value), hi = Number(this.hi.value);
    const hist = new Histogram1D('mass', 'Invariant mass', BINS, lo, hi > lo ? hi : lo + 1, DEFAULT_RANGES[kind].label);
    for (const m of s.histogram.masses) hist.fill(m);
    return { name: 'mass', title: `${s.event.meta?.title ?? ''}`, xLabel: hist.xLabel, xMin: hist.xMin, xMax: hist.xMax, counts: Array.from(hist.counts) };
  }

  private refit(force = false): void {
    const s = this.c.state;
    const cur = this.current(s);
    if (cur && (force || this.fit)) {
      this.fit = fitHistogram({ xMin: cur.xMin, xMax: cur.xMax, counts: cur.counts }, { model: this.model, ...(s.event.meta?.intendedMassGeV && !this.rootHist ? { peakHint: s.event.meta.intendedMassGeV } : {}) });
    }
    this.render(s);
  }

  private exportJson(): void {
    const cur = this.current(this.c.state);
    if (!cur) return;
    const hh = new Histogram1D(cur.name, cur.title, cur.counts.length, cur.xMin, cur.xMax, cur.xLabel);
    cur.counts.forEach((c, i) => (hh.counts[i] = c));
    const blob = new Blob([JSON.stringify(hh.toJSON(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${cur.name}.th1d.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private render(s: SimulationState): void {
    const cur = this.current(s);
    this.buttons.style.display = this.rootHist || !s.event.meta?.analysisPair ? 'none' : '';
    if (!cur) {
      this.drawNative(null);
      this.info.textContent = 'This dataset has no resonance analysis (choose a dimuon, dielectron or diphoton sample), or load a TH1 from a ROOT file.';
      this.fitOut.replaceChildren();
      return;
    }
    const curve = this.fit ? this.curvePoints(cur, this.fit) : null;
    this.canvas.style.display = this.useJsroot ? 'none' : '';
    this.jsrootDiv.style.display = this.useJsroot ? '' : 'none';
    if (this.useJsroot) {
      void import('../data-sources/root/JSROOTBridge')
        .then((m) => m.drawWithJsroot(this.jsrootDiv, cur, curve))
        .catch((e) => {
          console.warn('[jsroot] drawing failed, falling back to the native histogram', e);
          this.useJsroot = false;
          this.canvas.style.display = '';
          this.jsrootDiv.style.display = 'none';
          this.drawNative(cur);
        });
    } else this.drawNative(cur, s);
    this.renderFit();
    const n = cur.counts.reduce((a, b) => a + b, 0);
    const prov = s.event.provenance;
    this.info.textContent = this.rootHist
      ? `ROOT-derived histogram "${cur.name}" (${n} entries) read with JSROOT.`
      : `${n} candidate pairs in range from ${s.histogram.processedEvents} processed events${s.histogram.accumulating ? ' · accumulating…' : ''}` +
        (s.event.meta?.intendedMassGeV ? ` · generated/nominal resonance mass ${s.event.meta.intendedMassGeV} GeV` : '') +
        ` · source: ${prov ? (prov.isSimulation ? 'simulation' : 'RECORDED COLLISION DATA') : '—'}.`;
  }

  private curvePoints(cur: PlainHistogram, fit: FitResult): { x: number[]; y: number[] } {
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i <= 200; i++) {
      const xv = cur.xMin + ((cur.xMax - cur.xMin) * i) / 200;
      x.push(xv);
      y.push(fit.curve(xv));
    }
    return { x, y };
  }

  private renderFit(): void {
    const f = this.fit;
    if (!f) {
      this.fitOut.replaceChildren(h('div', { class: 'hint' }, 'Press Fit for a binned Poisson maximum-likelihood fit.'));
      return;
    }
    this.fitOut.replaceChildren(
      kvTable([
        ...f.names.map((n, i): [string, string] => [n, `${f.params[i]!.toPrecision(5)} ± ${f.errors[i]!.toPrecision(2)}`]),
        ['χ² / ndf', `${f.chi2.toFixed(1)} / ${f.ndf}${f.converged ? '' : ' (not converged)'}`],
        ['Signal yield', `${f.signal.toFixed(0)} ± ${f.signalError.toFixed(0)} events`],
        ...(f.significance !== null ? [['S/√B in μ ± 2σ', `${f.significance.toFixed(1)} (B = ${f.backgroundIn2Sigma.toFixed(0)}) — educational estimate`] as [string, string]] : []),
      ]),
    );
  }

  private drawNative(cur: PlainHistogram | null, s?: SimulationState): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const W = this.canvas.width, H = this.canvas.height, padL = 30, padB = 26, padT = 8;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    if (!cur) return;
    const n = cur.counts.length;
    const maxC = Math.max(1, ...cur.counts, ...(this.fit ? cur.counts.map((_, i) => this.fit!.curve(cur.xMin + (i + 0.5) * ((cur.xMax - cur.xMin) / n))) : []));
    const bw = (W - padL - 6) / n;
    const X = (x: number) => padL + ((x - cur.xMin) / (cur.xMax - cur.xMin)) * (W - padL - 6);
    const Y = (v: number) => H - padB - (v / maxC) * (H - padB - padT);
    g.fillStyle = '#4aa3ff';
    cur.counts.forEach((c, i) => g.fillRect(padL + i * bw, Y(c), Math.max(bw - 1, 1), H - padB - Y(c)));
    // Poisson error bars.
    g.strokeStyle = '#9ec5ff';
    cur.counts.forEach((c, i) => {
      if (c <= 0) return;
      const xm = padL + (i + 0.5) * bw;
      g.beginPath();
      g.moveTo(xm, Y(c - Math.sqrt(c)));
      g.lineTo(xm, Y(c + Math.sqrt(c)));
      g.stroke();
    });
    if (this.fit) {
      const f = this.fit;
      const pts = this.curvePoints(cur, f);
      g.strokeStyle = '#f87171';
      g.lineWidth = 1.6;
      g.beginPath();
      pts.x.forEach((x, i) => (i ? g.lineTo(X(x), Y(pts.y[i]!)) : g.moveTo(X(x), Y(pts.y[i]!))));
      g.stroke();
      if (f.backgroundCurve) {
        g.setLineDash([4, 3]);
        g.strokeStyle = '#fbbf24';
        g.beginPath();
        pts.x.forEach((x, i) => (i ? g.lineTo(X(x), Y(f.backgroundCurve!(x))) : g.moveTo(X(x), Y(f.backgroundCurve!(x)))));
        g.stroke();
        g.setLineDash([]);
      }
      g.lineWidth = 1;
    }
    g.strokeStyle = '#3a4350';
    g.beginPath();
    g.moveTo(padL, padT);
    g.lineTo(padL, H - padB);
    g.lineTo(W - 6, H - padB);
    g.stroke();
    g.fillStyle = '#8b97a6';
    g.font = '10px system-ui';
    g.fillText(String(cur.xMin), padL - 4, H - padB + 12);
    g.fillText(String(cur.xMax), W - 26, H - padB + 12);
    g.fillText(cur.xLabel, W / 2 - 40, H - 4);
    g.fillText(String(Math.round(maxC)), 4, padT + 8);
    const pair = s?.event.pair;
    if (pair && !this.rootHist && pair.mass >= cur.xMin && pair.mass < cur.xMax) {
      g.strokeStyle = '#ff2dcc';
      g.setLineDash([4, 3]);
      g.beginPath();
      g.moveTo(X(pair.mass), padT);
      g.lineTo(X(pair.mass), H - padB);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ff2dcc';
      g.fillText('this event', Math.min(X(pair.mass) + 3, W - 50), padT + 10);
    }
  }
}
