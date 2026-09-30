/**
 * Detector-response controls: presets and individual parameters. Changing them re-runs the
 * detector simulation and reconstruction for the current event (in the worker).
 */
import type { SimulationController } from '../app/SimulationController';
import { isNominal, NOMINAL_RESPONSE, RESPONSE_PRESETS, type ResponseConfig } from '../detector/response/ResponseConfig';
import { h, section, select } from './dom';

type NumKey = Exclude<keyof ResponseConfig, 'trackerEtaMax'>;

const SLIDERS: ReadonlyArray<{ key: NumKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
  { key: 'hitEfficiencyScale', label: 'Hit efficiency ×', min: 0.5, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'hitResolutionScale', label: 'Hit resolution ×', min: 0.5, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) },
  { key: 'momentumResolutionScale', label: 'Momentum resolution ×', min: 0.5, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) },
  { key: 'caloResolutionScale', label: 'Calorimeter smearing ×', min: 0.5, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) },
  { key: 'caloEnergyScale', label: 'Calorimeter energy scale', min: 0.8, max: 1.2, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'deadFraction', label: 'Dead channels (scenario)', min: 0, max: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
  { key: 'noisyCellsPerEvent', label: 'Noisy cells / event (scenario)', min: 0, max: 200, step: 5, fmt: (v) => v.toFixed(0) },
];

export class ResponsePanel {
  readonly el: HTMLElement;
  private readonly inputs = new Map<NumKey, [HTMLInputElement, HTMLElement]>();
  private readonly status = h('div', { class: 'hint' });
  private readonly preset: HTMLSelectElement;

  constructor(private readonly c: SimulationController) {
    this.preset = select([...Object.entries(RESPONSE_PRESETS).map(([k, p]) => ({ value: k, label: p.label })), { value: 'custom', label: 'Custom' }], 'nominal', (v) => {
      const p = RESPONSE_PRESETS[v];
      if (p) c.setResponse(p.config);
    });
    const rows = SLIDERS.map((s) => {
      const inp = h('input', { type: 'range', min: s.min, max: s.max, step: s.step }) as HTMLInputElement;
      const out = h('span', { class: 'tree-meta' });
      inp.addEventListener('input', () => (out.textContent = s.fmt(Number(inp.value))));
      inp.addEventListener('change', () => c.setResponse({ [s.key]: Number(inp.value) }));
      this.inputs.set(s.key, [inp, out]);
      return h('div', { class: 'row' }, h('label', {}, s.label), inp, out);
    });
    this.el = section(
      'Detector response (parameterized)',
      h('div', { class: 'row' }, h('label', {}, 'Preset'), this.preset),
      ...rows,
      h('div', { class: 'btn-row' }, h('button', { onclick: () => c.setResponse(NOMINAL_RESPONSE) }, 'Reset to nominal')),
      this.status,
      h('div', { class: 'hint' }, 'Scales multiply each detector’s nominal efficiencies and resolutions. Dead channels form a fixed map (same "bad run" for every event); noisy cells are random per event. Truth → hits → clusters → tracks → objects stay separate collections.'),
    );
    this.render();
    c.store.subscribe((s, p) => {
      if (s.event.response !== p.event.response) this.render();
    });
  }

  private render(): void {
    const r = this.c.state.event.response;
    for (const s of SLIDERS) {
      const [inp, out] = this.inputs.get(s.key)!;
      inp.value = String(r[s.key]);
      out.textContent = s.fmt(r[s.key]);
    }
    const match = Object.entries(RESPONSE_PRESETS).find(([, p]) => (Object.keys(p.config) as (keyof ResponseConfig)[]).every((k) => p.config[k] === r[k]));
    this.preset.value = match ? match[0] : 'custom';
    this.status.textContent = isNominal(r) ? 'Nominal response.' : 'Modified response — reconstructed quantities (resolutions, efficiencies, masses) change accordingly.';
    this.status.className = isNominal(r) ? 'hint' : 'hint warn';
  }
}
