/**
 * Collider operation: luminosity vs cross section vs rate vs yield, bunch filling scheme,
 * pile-up (Poisson μ) and the educational trigger. Numbers come from physics modules.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { computeColliderOperation, type ColliderOperation } from '../physics/luminosity/ColliderOperation';
import { expectedYield, integratedLuminosityInvFb } from '../physics/luminosity/Luminosity';
import { defaultMenu, TRIGGER_BUDGETS, triggerRates } from '../physics/trigger/Trigger';
import { formatSI } from '../utils/units';
import { h, kvTable, section } from './dom';
import { OpticsPanel } from './OpticsPanel';

const SECONDS_PER_YEAR_OF_PHYSICS = 5e6; // order of magnitude of LHC "physics seconds" per year (VERIFY)

export class ColliderPanel {
  readonly el = h('div', { class: 'panel-body' });
  private readonly lumi = h('div');
  private readonly fill = h('canvas', { width: 330, height: 46, class: 'plot' });
  private readonly pmf = h('canvas', { width: 330, height: 120, class: 'plot' });
  private readonly pileInfo = h('div');
  private readonly trig = h('div');
  private readonly scanOut = h('div', { class: 'hint' });
  private op: ColliderOperation | null = null;

  constructor(private readonly c: SimulationController) {
    const pu = c.state.event.pileUp;
    const enable = h('input', { type: 'checkbox' }) as HTMLInputElement;
    enable.checked = pu.enabled;
    enable.addEventListener('change', () => c.setPileUp({ enabled: enable.checked }));
    const mu = h('input', { type: 'range', min: 0, max: 200, step: 1, value: pu.mu }) as HTMLInputElement;
    const muLabel = h('span', {}, String(pu.mu));
    mu.addEventListener('input', () => (muLabel.textContent = mu.value));
    mu.addEventListener('change', () => c.setPileUp({ mu: Number(mu.value) }));
    const useMachine = h('button', { onclick: () => { if (this.op) { const m = Math.min(200, Math.round(this.op.mu)); mu.value = String(m); muLabel.textContent = String(m); c.setPileUp({ mu: m }); } } }, 'Use machine μ');

    const menu = h('div');
    for (const it of defaultMenu()) {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = c.state.event.triggerItems[it.id];
      cb.addEventListener('change', () => c.setTriggerItem(it.id, cb.checked));
      menu.append(h('label', { class: 'check', title: `${it.l1} → ${it.hlt}` }, cb, ` ${it.label}: ${it.l1} → ${it.hlt}`));
    }

    this.el.append(
      section('Luminosity, cross section, rate, yield', this.lumi),
      section('Bunch structure', this.fill, h('div', { class: 'hint', id: 'fill-info' })),
      new OpticsPanel(c).el,
      section(
        'Pile-up',
        h('div', { class: 'hint' }, 'Additional inelastic pp interactions in the same bunch crossing, n ~ Poisson(μ): P(n; μ) = e^−μ μⁿ / n!. Overlaid on simulated events only — recorded data already contains its real pile-up.'),
        h('label', { class: 'check' }, enable, ' Overlay pile-up on simulated events (compare truth vs with pile-up)'),
        h('div', { class: 'row' }, h('label', {}, 'μ (overlay)'), mu, muLabel, useMachine),
        this.pmf,
        this.pileInfo,
      ),
      section(
        'Trigger (educational)',
        h('div', { class: 'hint' }, 'Bunch crossing → detector activity → Level-1 (coarse towers, coarse muon pT) → HLT (reconstructed objects) → recorded. Thresholds are illustrative, not an experiment’s menu.'),
        menu,
        this.trig,
        h('div', { class: 'btn-row' }, h('button', { onclick: () => void this.scan(100) }, 'Run trigger on 100 events')),
        this.scanOut,
      ),
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.beam !== p.beam || s.accelerator !== p.accelerator || s.event !== p.event) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    const op = computeColliderOperation(s.accelerator, s.beam);
    this.op = op;
    const L = op.luminosityCm2s;
    const yearLumi = integratedLuminosityInvFb(L, SECONDS_PER_YEAR_OF_PHYSICS);
    const rows = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Process'), h('th', {}, 'σ'), h('th', {}, 'R = Lσ (produced)'), h('th', {}, 'N per fb⁻¹ (ε = 1)')));
    for (const r of op.rates) rows.append(h('tr', { title: 'Reference value — VERIFY' }, h('td', {}, r.label), h('td', {}, formatSI(r.sigmaPb * 1e-12, 'b', 3)), h('td', {}, formatSI(r.rateHz, 'Hz', 3)), h('td', {}, r.yieldPerInvFb.toExponential(2))));
    this.lumi.replaceChildren(
      kvTable([
        ['Instantaneous L', L > 0 ? `${L.toExponential(2)} cm⁻² s⁻¹ (from beam model)` : 'no luminosity (beam infeasible)'],
        ['Integrated L_int', L > 0 ? `≈ ${yearLumi.toFixed(0)} fb⁻¹ per 5×10⁶ s of collisions (order of magnitude)` : '—'],
        ['Inelastic rate', formatSI(op.inelasticRateHz, 'Hz', 3)],
        ['Example yield', L > 0 ? `H→γγ: N = L_int σ ε ≈ ${expectedYield(yearLumi, 52.2 * 2.27e-3, 0.4).toFixed(0)} events for ε = 0.4` : '—'],
      ]),
      rows,
      h('div', { class: 'hint' }, 'R counts collisions produced, not recorded: the trigger keeps ~1 kHz of the crossings. Cross sections are reference values (flagged VERIFY).'),
    );
    this.drawFill(op);
    this.drawPmf(op, s);
    this.renderTrigger(s);
  }

  private drawFill(op: ColliderOperation): void {
    const g = this.fill.getContext('2d');
    if (!g) return;
    const W = this.fill.width, H = this.fill.height, n = op.scheme.pattern.length;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#4aa3ff';
    for (let s = 0; s < n; s++) if (op.scheme.pattern[s]) g.fillRect((s / n) * W, 8, Math.max(W / n, 0.6), H - 22);
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    g.fillText(`${n} slots × ${op.timing.slotSpacingNs.toFixed(2)} ns · one turn = ${(1e6 / op.timing.revolutionFrequencyHz).toFixed(2)} µs`, 2, H - 3);
    const info = this.el.querySelector('#fill-info');
    if (info)
      info.textContent = `${op.scheme.filled} colliding bunches in ${op.scheme.trains} trains (educational scheme: trains of 48, abort gap ${op.scheme.spec.abortGap} slots). f_rev = ${op.timing.revolutionFrequencyHz.toFixed(1)} Hz → mean crossing rate ${formatSI(op.timing.meanCrossingRateHz, 'Hz', 3)} (40 MHz clock if every slot were filled: ${formatSI(op.timing.slotRateHz, 'Hz', 3)}). P(≥1 interaction per crossing) = ${(op.interactionProbability * 100).toFixed(1)} %.`;
  }

  private drawPmf(op: ColliderOperation, s: SimulationState): void {
    const g = this.pmf.getContext('2d');
    if (!g) return;
    const W = this.pmf.width, H = this.pmf.height;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const pmf = op.pileUpPmf;
    const max = Math.max(...pmf, 1e-12);
    const bw = (W - 10) / pmf.length;
    g.fillStyle = '#a78bfa';
    pmf.forEach((p, n) => g.fillRect(5 + n * bw, H - 14 - (p / max) * (H - 24), Math.max(bw - 0.5, 0.5), (p / max) * (H - 24)));
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    g.fillText(`P(n; μ = ${op.mu.toFixed(1)}) from the machine (n = 0 … ${pmf.length - 1})`, 5, H - 3);
    const pe = s.event.processed;
    this.pileInfo.replaceChildren(
      kvTable([
        ['Machine μ = Lσ_inel/(n_b f_rev)', op.mu.toFixed(1)],
        ['This event', pe?.pileUp ? `${pe.pileUp.n} pile-up vertices overlaid (μ = ${pe.pileUp.mu}) — use Color by: Origin Vertex` : s.event.provenance && !s.event.provenance.isSimulation ? 'recorded data: pile-up is real, not overlaid' : 'no overlay (hard scatter only)'],
      ]),
    );
  }

  private renderTrigger(s: SimulationState): void {
    const pe = s.event.processed;
    if (!pe) return void this.trig.replaceChildren(h('div', { class: 'hint' }, 'Load an event to see the trigger decision.'));
    if (!pe.trigger) return void this.trig.replaceChildren(h('div', { class: 'hint' }, 'Recorded collision data was already selected by the experiment’s real trigger; the educational trigger is not re-applied.'));
    const t = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'L1'), h('th', {}, 'HLT'), h('th', {}, 'Why')));
    for (const d of pe.trigger.items) t.append(h('tr', {}, h('td', {}, d.id), h('td', {}, d.l1 ? '✔' : '✖'), h('td', {}, d.hlt ? '✔' : '✖'), h('td', {}, d.reason)));
    this.trig.replaceChildren(h('div', { class: pe.trigger.hltAccept ? 'hint ok' : 'hint warn' }, `This event: ${pe.trigger.reason}`), t);
  }

  private async scan(n: number): Promise<void> {
    this.scanOut.textContent = 'Running the pipeline in the worker…';
    const rows = await this.c.scanDataset(n);
    const nL1 = rows.filter((r) => r.l1).length, nH = rows.filter((r) => r.hlt).length;
    const input = this.op?.timing.meanCrossingRateHz ?? 0;
    const rates = triggerRates(input, rows.length, nL1, nH);
    this.scanOut.textContent =
      `${rows.length} events: L1 accepted ${nL1}, HLT accepted ${nH}, rejected ${rows.length - nH}. ` +
      `If this sample were the whole input stream (${formatSI(input, 'Hz', 3)} crossings): L1 ${formatSI(rates.l1RateHz, 'Hz', 3)}, recorded ${formatSI(rates.hltRateHz, 'Hz', 3)}, rejected ${formatSI(rates.rejectedRateHz, 'Hz', 3)}. ` +
      `Signal samples are far from representative of real crossings (mostly soft inelastic collisions), which is why real budgets are ≈ ${formatSI(TRIGGER_BUDGETS.l1OutputHz, 'Hz', 2)} (L1) and ≈ ${formatSI(TRIGGER_BUDGETS.hltOutputHz, 'Hz', 2)} (recorded).`;
  }
}
