/**
 * Left control panel: machine, beam, sandbox inputs, visualization and quality settings.
 * Only dispatches intents to the controller; performs no physics.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState, TimeScaleKind } from '../app/SimulationState';
import type { MachineId } from '../physics/accelerator/MachinePreset';
import { selectableBeamSpecies } from '../physics/particles/ParticleDatabase';
import { MACHINE_PRESETS } from '../machines';
import { COLOR_BY_LABEL, type ColorBy } from '../visualization/colors/ColorMode';
import { COLORMAP_LABEL, type ColormapId } from '../visualization/colors/Colormaps';
import { PALETTES, type PaletteId } from '../visualization/colors/PhysicsPalette';
import { QUALITY_IDS, QUALITY_PRESETS, type QualityId } from '../visualization/QualityPresets';
import { VIS_MODES, VIS_POLICIES, type VisMode } from '../visualization/VisualizationMode';
import { h, row, section, select } from './dom';

/** Energy slider range [GeV] (log): 1 GeV … 1 PeV per particle. */
const E_MIN_LOG = 0;
const E_MAX_LOG = 6;

export class ControlPanel {
  readonly el: HTMLElement;
  private readonly energyInput: HTMLInputElement;
  private readonly energySlider: HTMLInputElement;
  private readonly fieldInput: HTMLInputElement;
  private readonly tempInput: HTMLInputElement;
  private readonly quadInput: HTMLInputElement;
  private readonly sandboxBox: HTMLElement;
  private readonly machineSel: HTMLSelectElement;
  private readonly speciesSel: HTMLSelectElement;
  private readonly modeNote: HTMLElement;
  private modeSel!: HTMLSelectElement;

  constructor(private readonly c: SimulationController) {
    const st = c.state;
    this.machineSel = select(
      MACHINE_PRESETS.map((m) => ({ value: m.id, label: m.name + (m.status === 'concept' ? ' (concept)' : '') })),
      st.machine.machineId,
      (v) => c.setMachine(v as MachineId),
    );
    this.speciesSel = select(
      selectableBeamSpecies().map((s) => ({ value: s.id, label: s.label })),
      st.machine.speciesId,
      (v) => c.setSpecies(v),
    );
    this.energyInput = h('input', { type: 'number', step: 'any', min: '0', class: 'num' });
    this.energyInput.addEventListener('change', () => c.setEnergyGeV(parseFloat(this.energyInput.value) * 1000));
    this.energySlider = h('input', { type: 'range', min: String(E_MIN_LOG), max: String(E_MAX_LOG), step: '0.01' });
    this.energySlider.addEventListener('input', () => c.setEnergyGeV(10 ** parseFloat(this.energySlider.value)));

    this.fieldInput = h('input', { type: 'number', step: '0.01', class: 'num' });
    this.fieldInput.addEventListener('change', () => c.setSandbox({ sandboxFieldT: parseFloat(this.fieldInput.value) }));
    this.tempInput = h('input', { type: 'number', step: '0.1', class: 'num' });
    this.tempInput.addEventListener('change', () => c.setSandbox({ sandboxTemperatureK: parseFloat(this.tempInput.value) }));
    this.quadInput = h('input', { type: 'number', step: '1', class: 'num', placeholder: 'auto (tracks beam)' });
    this.quadInput.addEventListener('change', () => {
      const v = this.quadInput.value.trim();
      c.setSandbox({ sandboxQuadGradientTPerM: v === '' ? null : parseFloat(v) });
    });
    this.sandboxBox = h(
      'div',
      { class: 'sandbox-box' },
      h('div', { class: 'hint warn' }, 'SANDBOX: values are never clamped. The inspector reports the physical consequences.'),
      row('Dipole field B [T]', this.fieldInput),
      h('button', { class: 'small', onclick: () => c.matchSandboxField() }, 'Match B to beam rigidity'),
      row('Coil temperature [K]', this.tempInput),
      row('Arc quad gradient [T/m]', this.quadInput, 'Empty = scale with rigidity (design 90° phase advance).'),
      h('button', { class: 'small danger', onclick: () => c.triggerQuench() }, 'Simulate magnet quench'),
    );
    this.modeNote = h('div', { class: 'hint' });

    const vis = st.vis;
    const visSection = section(
      'Visualization',
      row(
        'Honesty mode',
        (this.modeSel = select(VIS_MODES.map((m) => ({ value: m, label: m, title: VIS_POLICIES[m].description })), vis.mode, (v) => c.setVis({ mode: v as VisMode }), { class: 'mode-select' })),
      ),
      row('Color by', select((Object.keys(COLOR_BY_LABEL) as ColorBy[]).map((k) => ({ value: k, label: COLOR_BY_LABEL[k] })), vis.colorBy, (v) => c.setVis({ colorBy: v as ColorBy }))),
      row('Palette', select((Object.keys(PALETTES) as PaletteId[]).map((k) => ({ value: k, label: PALETTES[k].label })), vis.palette, (v) => c.setVis({ palette: v as PaletteId }))),
      row('Track colormap', select((['viridis', 'inferno'] as ColormapId[]).map((k) => ({ value: k, label: COLORMAP_LABEL[k] })), vis.colormap, (v) => c.setVis({ colormap: v as ColormapId }))),
      row('Calorimeter colormap', select((['inferno', 'viridis'] as ColormapId[]).map((k) => ({ value: k, label: COLORMAP_LABEL[k] })), vis.caloColormap, (v) => c.setVis({ caloColormap: v as ColormapId }))),
      row(
        'Event time scale',
        select(
          [
            { value: 'slowmo', label: 'Educational slow motion (×10⁸)' },
            { value: 'realtime', label: 'Real time (instantaneous)' },
            { value: 'custom', label: 'Custom' },
          ],
          vis.timeScale,
          (v) => c.setVis({ timeScale: v as TimeScaleKind }),
        ),
      ),
      row('Custom: display s per ns', this.customSlider(vis.customSecondsPerNs)),
      h('label', { class: 'check' }, this.checkbox(vis.showBendFocusOverlay, (b) => c.setVis({ showBendFocusOverlay: b })), ' Dipole/quadrupole overlay'),
      h('label', { class: 'check' }, this.checkbox(vis.cutaway, (b) => c.setVis({ cutaway: b })), ' Detector cutaway'),
      h('label', { class: 'check' }, this.checkbox(vis.heliumVentingScenario, (b) => c.setVis({ heliumVentingScenario: b })), ' Quench scenario: helium venting'),
      h('div', { class: 'hint' }, 'Slow motion does not represent a human-visible timescale: particles cross ATLAS in ~40 ns.'),
    );

    const qualitySection = section(
      'Quality',
      row('Preset', select(QUALITY_IDS.map((q) => ({ value: q, label: QUALITY_PRESETS[q].label })), vis.quality, (v) => c.setVis({ quality: v as QualityId }))),
      h('div', { class: 'hint' }, 'Quality changes rendering cost only (post-processing, LOD, instance budgets) — never physics results.'),
    );

    this.el = h(
      'div',
      { class: 'panel-body' },
      section('Machine', row('Preset', this.machineSel), this.modeNote),
      section(
        'Beam',
        row('Species', this.speciesSel, 'Neutral particles cannot circulate and are not offered.'),
        row('Energy per particle [TeV]', this.energyInput),
        this.energySlider,
        this.sandboxBox,
      ),
      visSection,
      qualitySection,
    );
    this.sync(st);
    c.store.subscribe((s, p) => {
      if (s.machine !== p.machine || s.accelerator !== p.accelerator) this.sync(s);
      if (s.vis.mode !== p.vis.mode) this.modeSel.value = s.vis.mode;
    });
  }

  private checkbox(v: boolean, on: (b: boolean) => void): HTMLInputElement {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = v;
    cb.addEventListener('change', () => on(cb.checked));
    return cb;
  }

  private customSlider(v: number): HTMLInputElement {
    const s = h('input', { type: 'range', min: '-2', max: '0.5', step: '0.01', value: String(Math.log10(v)) });
    s.addEventListener('input', () => this.c.setVis({ customSecondsPerNs: 10 ** parseFloat(s.value), timeScale: 'custom' }));
    return s;
  }

  private sync(s: SimulationState): void {
    const m = s.machine;
    this.machineSel.value = m.machineId;
    this.speciesSel.value = m.speciesId;
    const E = s.accelerator.kinematics.totalEnergyGeV;
    if (document.activeElement !== this.energyInput) this.energyInput.value = (E / 1000).toPrecision(5);
    if (document.activeElement !== this.energySlider) this.energySlider.value = String(Math.log10(Math.max(E, 1)));
    this.sandboxBox.style.display = m.mode === 'sandbox' ? '' : 'none';
    if (document.activeElement !== this.fieldInput) this.fieldInput.value = m.sandboxFieldT.toFixed(3);
    if (document.activeElement !== this.tempInput) this.tempInput.value = m.sandboxTemperatureK.toFixed(2);
    if (document.activeElement !== this.quadInput) this.quadInput.value = m.sandboxQuadGradientTPerM === null ? '' : String(m.sandboxQuadGradientTPerM);
    this.modeNote.textContent =
      m.mode === 'physics'
        ? 'PHYSICS MODE: dipole field follows the requested energy; machine limits are enforced (violations are reported, the beam is flagged infeasible).'
        : 'SANDBOX MODE: energy, field, temperature and focusing are independent inputs.';
  }
}
