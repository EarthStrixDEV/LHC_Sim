/**
 * IR optics panel: β*, crossing angle, βx(s)/βy(s) plot, beam size, Piwinski factor,
 * long-range separation, and import of external optics tables (MAD-X TFS).
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { parseTfs, type OpticsTable } from '../physics/optics/OpticsTable';
import { h, kvTable, section, select } from './dom';

export class OpticsPanel {
  readonly el: HTMLElement;
  private readonly plot = h('canvas', { width: 330, height: 170, class: 'plot' });
  private readonly info = h('div');
  private readonly betaStar = h('input', { type: 'number', min: 0.05, max: 20, step: 0.05 }) as HTMLInputElement;
  private readonly angle = h('input', { type: 'number', min: 0, max: 1000, step: 10 }) as HTMLInputElement;

  constructor(c: SimulationController) {
    const st = c.state.optics.settings;
    this.betaStar.value = (st.betaStarM * 100).toFixed(0);
    this.angle.value = String(st.fullCrossingAngleUrad);
    this.betaStar.addEventListener('change', () => c.setIR({ betaStarM: Number(this.betaStar.value) / 100 }));
    this.angle.addEventListener('change', () => c.setIR({ fullCrossingAngleUrad: Number(this.angle.value) }));
    const file = h('input', { type: 'file', accept: '.tfs,.txt,.dat' }) as HTMLInputElement;
    const msg = h('div', { class: 'hint' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        c.setImportedOptics(parseTfs(await f.text(), `TFS import: ${f.name}`));
        msg.textContent = `Imported ${f.name}. Shown dashed; displayed as-is (not validated against the model).`;
      } catch (e) {
        msg.textContent = `Import failed: ${(e as Error).message}`;
      }
    });
    this.el = section(
      'Interaction-region optics (β*, crossing angle)',
      h('div', { class: 'row' }, h('label', {}, 'β* [cm]'), this.betaStar),
      h('div', { class: 'row' }, h('label', {}, 'Full crossing angle θc [µrad]'), this.angle),
      h('div', { class: 'row' }, h('label', {}, 'IP'), select([{ value: 'IP1', label: 'IP1 ATLAS (vertical crossing)' }, { value: 'IP5', label: 'IP5 CMS (horizontal crossing)' }], st.ip, (v) => c.setIR({ ip: v }))),
      this.plot,
      this.info,
      h('div', { class: 'btn-row' }, h('button', { onclick: () => c.goTo('ir') }, 'Open IR scene'), h('button', { onclick: () => { c.setImportedOptics(null); msg.textContent = ''; } }, 'Clear import')),
      h('div', { class: 'hint' }, 'Import an externally computed optics table (MAD-X TFS: S, BETX, BETY, ALFX, ALFY):'),
      file,
      msg,
      h('div', { class: 'hint' }, 'Educational model: drift + inner triplet (thick quads), no matching section, dispersion or D1/D2. Not a MAD-X replacement.'),
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.optics !== p.optics) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    const ir = s.optics.ir;
    this.drawPlot(ir.table, s.optics.imported);
    const lr = ir.longRange[0];
    this.info.replaceChildren(
      kvTable([
        ['β*', `${(ir.betaStarM * 100).toFixed(1)} cm (waist at the IP, α* = 0)`],
        ['σ* = √(ε β*)', `${(ir.sigmaStarM * 1e6).toFixed(2)} µm, ε = ε_n/(βγ) = ${(ir.input.geometricEmittanceM * 1e9).toFixed(3)} nm`],
        ['β at Q1 (s = L*)', `${ir.betaAtQ1M.toFixed(0)} m  (β* + L*²/β*)`],
        ['β max in triplet', `${ir.maxBetaM.toFixed(0)} m`],
        ['Piwinski angle φ', `${ir.piwinskiAngle.toFixed(2)} → F = ${ir.piwinskiFactor.toFixed(3)} (geometric luminosity reduction)`],
        ['Long-range separation', lr ? `${(lr.separationM * 1e3).toFixed(2)} mm = ${lr.separationSigma.toFixed(1)} σ at s = ${lr.s.toFixed(2)} m (first parasitic encounter)` : '—'],
      ]),
    );
  }

  private drawPlot(t: OpticsTable, imported: OpticsTable | null): void {
    const g = this.plot.getContext('2d');
    if (!g) return;
    const W = this.plot.width, H = this.plot.height, padL = 38, padB = 18, padT = 8;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const s0 = t.s[0]!, s1 = t.s[t.s.length - 1]!;
    let bmax = 0;
    for (const b of [t.betx, t.bety]) for (const v of b) bmax = Math.max(bmax, v);
    // Log scale in β (spans 0.1 m … 10 km).
    const lmin = Math.log10(Math.max(0.05, Math.min(...t.betx, ...t.bety) * 0.8)), lmax = Math.log10(bmax * 1.2);
    const X = (s: number) => padL + ((s - s0) / (s1 - s0)) * (W - padL - 6);
    const Y = (b: number) => H - padB - ((Math.log10(Math.max(b, 1e-3)) - lmin) / (lmax - lmin)) * (H - padB - padT);
    const curve = (tab: OpticsTable, col: Float64Array, color: string, dash: number[]) => {
      g.strokeStyle = color;
      g.setLineDash(dash);
      g.beginPath();
      tab.s.forEach((s, i) => (i ? g.lineTo(X(s), Y(col[i]!)) : g.moveTo(X(s), Y(col[i]!))));
      g.stroke();
      g.setLineDash([]);
    };
    g.strokeStyle = '#2a3340';
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    for (let e = Math.ceil(lmin); e <= Math.floor(lmax); e++) {
      g.beginPath();
      g.moveTo(padL, Y(10 ** e));
      g.lineTo(W - 6, Y(10 ** e));
      g.stroke();
      g.fillText(`10^${e}`, 4, Y(10 ** e) + 3);
    }
    curve(t, t.betx, '#60a5fa', []);
    curve(t, t.bety, '#f87171', []);
    if (imported) {
      curve(imported, imported.betx, '#93c5fd', [4, 3]);
      curve(imported, imported.bety, '#fca5a5', [4, 3]);
    }
    g.fillStyle = '#60a5fa';
    g.fillText('βx', W - 60, 14);
    g.fillStyle = '#f87171';
    g.fillText('βy [m]', W - 40, 14);
    g.fillStyle = '#9aa4b2';
    g.fillText(`s [m] from IP: ${s0.toFixed(0)} … ${s1.toFixed(0)}`, padL, H - 4);
  }
}
