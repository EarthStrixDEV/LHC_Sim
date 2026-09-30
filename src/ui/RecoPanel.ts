/**
 * Phase 2 reconstruction view: educational Kalman-like track fit (truth vs hits vs initial
 * estimate vs fit, residuals, uncertainty), vertices, topo-clusters, generalized-kT jets, MET.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import type { FittedTrack } from '../physics/reconstruction/AdvancedReconstruction';
import type { JetAlgorithmP } from '../physics/reconstruction/GeneralizedKt';
import { h, kvTable, section, select } from './dom';

export class RecoPanel {
  readonly el: HTMLElement;
  private readonly fitSel = h('select') as HTMLSelectElement;
  private readonly fitInfo = h('div');
  private readonly resPlot = h('canvas', { width: 330, height: 120, class: 'plot' });
  private readonly sigPlot = h('canvas', { width: 330, height: 90, class: 'plot' });
  private readonly objects = h('div');
  private readonly R = h('input', { type: 'range', min: 0.2, max: 1.0, step: 0.1 }) as HTMLInputElement;
  private readonly Rlabel = h('span', { class: 'tree-meta' });
  private readonly alg: HTMLSelectElement;

  constructor(c: SimulationController) {
    this.fitSel.addEventListener('change', () => c.selectParticle(Number(this.fitSel.value)));
    this.alg = select(
      [{ value: '-1', label: 'anti-kT (p = −1)' }, { value: '0', label: 'Cambridge/Aachen (p = 0)' }, { value: '1', label: 'kT (p = 1)' }],
      String(c.state.event.jets.p),
      (v) => c.setJets({ p: Number(v) as JetAlgorithmP }),
    );
    this.R.value = String(c.state.event.jets.R);
    this.R.addEventListener('input', () => (this.Rlabel.textContent = `R = ${Number(this.R.value).toFixed(1)}`));
    this.R.addEventListener('change', () => c.setJets({ R: Number(this.R.value) }));
    this.el = h(
      'div',
      {},
      section(
        'Track fit — educational Kalman-like estimator',
        h('div', { class: 'hint' }, 'Not production ATLAS/CMS reconstruction. Sequential update over the hits: x⁻ = Fx, P⁻ = FPFᵀ + Q, K = P⁻Hᵀ(HP⁻Hᵀ + R)⁻¹, x = x⁻ + K(z − Hx⁻), P = (I − KH)P⁻.'),
        h('div', { class: 'row' }, h('label', {}, 'Track'), this.fitSel),
        this.fitInfo,
        this.resPlot,
        this.sigPlot,
        h('div', { class: 'hint' }, 'Compare in the 3D view: AUGMENTED shows truth + hits + fit; ANALYSIS shows hits + fit. Dashed = initial 3-hit estimate, solid = fit, faint = ±1σ(pT), orange whiskers = residuals ×1000.'),
      ),
      section(
        'Vertices, clusters, jets, MET (Phase 2)',
        h('div', { class: 'row' }, h('label', {}, 'Jet algorithm'), this.alg),
        h('div', { class: 'row' }, h('label', {}, 'Radius'), this.R, this.Rlabel),
        this.objects,
      ),
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.event.processed !== p.event.processed || s.event.selectedParticleId !== p.event.selectedParticleId) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    const adv = s.event.processed?.advanced;
    this.Rlabel.textContent = `R = ${s.event.jets.R.toFixed(1)}`;
    this.alg.value = String(s.event.jets.p);
    if (!adv) {
      this.fitInfo.replaceChildren(h('div', { class: 'hint' }, s.event.processed ? 'No Phase 2 reconstruction for this event (reconstructed-level source data).' : 'Load an event.'));
      this.objects.replaceChildren();
      this.fitSel.replaceChildren();
      return;
    }
    this.fitSel.replaceChildren(...adv.fits.slice(0, 40).map((f) => h('option', { value: f.particleId }, `#${f.particleId}  truth pT ${f.truthPt.toFixed(1)} GeV, ${f.hits.length} hits`)));
    const f = adv.fits.find((x) => x.particleId === s.event.selectedParticleId) ?? adv.fits[0];
    if (f) {
      this.fitSel.value = String(f.particleId);
      this.renderFit(f);
    } else {
      this.fitInfo.replaceChildren(h('div', { class: 'hint' }, adv.notes[0] ?? 'No fitted tracks.'));
    }
    const pv = adv.vertices.find((v) => v.isPrimary);
    const pe = s.event.processed!;
    this.objects.replaceChildren(
      kvTable([
        ['Primary vertex', pv ? `z = ${(pv.z * 1e3).toFixed(2)} ± ${(pv.zSigma * 1e3).toFixed(2)} mm, ${pv.nTracks} tracks, Σ pT² = ${pv.sumPt2.toFixed(0)} GeV²` : 'none (needs ≥ 2 fitted tracks)'],
        ['Other vertices', `${Math.max(0, adv.vertices.length - 1)}${pe.pileUp ? ` (truth: ${pe.pileUp.n} pile-up interactions)` : ''}`],
        ['Displaced vertices', adv.displaced.length ? adv.displaced.map((d) => `${d.tag} r=${(d.r * 100).toFixed(1)} cm (m_ππ ${d.massPiPi.toFixed(3)})`).join('; ') : 'none'],
        ['Topo-clusters', `${adv.clusters.length} (4-2-0 thresholds)`],
        ['Jets', `${adv.jetAlgorithm}: ${adv.jets.length} with pT > ${adv.jetConfig.ptMin} GeV — ${adv.jets.slice(0, 4).map((j) => j.pt.toFixed(0)).join(', ')}${adv.jets.length > 4 ? ' …' : ''} GeV`],
        ['MET (clusters + μ)', `${adv.met.met.toFixed(1)} GeV at φ = ${adv.met.phi.toFixed(2)} (Phase 1 track soft-term MET: ${pe.reco.met.met.toFixed(1)} GeV)`],
      ]),
      h('ul', {}, ...adv.notes.map((n) => h('li', { class: 'hint' }, n))),
    );
  }

  private renderFit(f: FittedTrack): void {
    const fit = f.fit;
    this.fitInfo.replaceChildren(
      kvTable([
        ['Truth pT (simulation)', `${f.truthPt.toFixed(3)} GeV, q = ${f.truthCharge > 0 ? '+' : '−'}`],
        ['Initial estimate (3 hits)', `${fit.ptSeed.toFixed(3)} GeV`],
        ['Fitted', `${fit.ptFit.toFixed(3)} ± ${fit.ptSigma.toFixed(3)} GeV, q = ${fit.charge > 0 ? '+' : '−'}  (pull ${((fit.ptFit - f.truthPt) / fit.ptSigma).toFixed(2)})`],
        ['d₀, z₀', `${(fit.fitted.d0 * 1e6).toFixed(1)} µm, ${(fit.z0 * 1e3).toFixed(2)} mm`],
        ['χ² / ndf', `${fit.chi2.toFixed(1)} / ${fit.ndf}`],
      ]),
    );
    this.drawResiduals(f);
    this.drawSigma(f);
  }

  private drawResiduals(f: FittedTrack): void {
    const g = this.resPlot.getContext('2d');
    if (!g) return;
    const W = this.resPlot.width, H = this.resPlot.height, L = 38;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const steps = f.fit.steps;
    const rMax = Math.max(...steps.map((s) => s.r), 0.1);
    const lim = Math.max(...steps.map((s) => Math.abs(s.residual) + s.residualSigma), 1e-6) * 1.1;
    const X = (r: number) => L + (r / rMax) * (W - L - 8);
    const Y = (v: number) => H / 2 - (v / lim) * (H / 2 - 12);
    g.strokeStyle = '#2a3340';
    g.beginPath();
    g.moveTo(L, H / 2);
    g.lineTo(W - 8, H / 2);
    g.stroke();
    // Predicted residuals (before each update) with their ±1σ, and final residuals.
    steps.forEach((s) => {
      g.strokeStyle = '#6b7280';
      g.beginPath();
      g.moveTo(X(s.r), Y(s.residual - s.residualSigma));
      g.lineTo(X(s.r), Y(s.residual + s.residualSigma));
      g.stroke();
      g.fillStyle = '#9ca3af';
      g.fillRect(X(s.r) - 2, Y(s.residual) - 2, 4, 4);
    });
    f.hits.forEach((hh, i) => {
      const r = Math.hypot(hh[0], hh[1]);
      const v = f.fit.residuals[i]!;
      if (!Number.isFinite(v)) return;
      g.fillStyle = '#f59e0b';
      g.beginPath();
      g.arc(X(r), Y(v), 2.2, 0, 2 * Math.PI);
      g.fill();
    });
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    g.fillText(`rφ residual ±${(lim * 1e6).toFixed(0)} µm`, 2, 11);
    g.fillText('grey: predicted ± σ before update · orange: after fit · r →', L, H - 3);
  }

  private drawSigma(f: FittedTrack): void {
    const g = this.sigPlot.getContext('2d');
    if (!g) return;
    const W = this.sigPlot.width, H = this.sigPlot.height, L = 38;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const v = f.fit.steps.map((s) => s.relPtSigma).filter((x) => Number.isFinite(x) && x > 0);
    if (v.length < 2) return;
    const lo = Math.log10(Math.min(...v)), hi = Math.log10(Math.max(...v));
    const Y = (x: number) => H - 14 - ((Math.log10(x) - lo) / Math.max(hi - lo, 1e-6)) * (H - 26);
    g.strokeStyle = '#60a5fa';
    g.beginPath();
    v.forEach((x, i) => {
      const px = L + (i / (v.length - 1)) * (W - L - 8);
      if (i) g.lineTo(px, Y(x));
      else g.moveTo(px, Y(x));
    });
    g.stroke();
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    g.fillText(`σ(pT)/pT: ${(v[0]! * 100).toPrecision(2)} % → ${(v[v.length - 1]! * 100).toPrecision(2)} %`, 2, 11);
    g.fillText('after each hit →', L, H - 3);
  }
}
