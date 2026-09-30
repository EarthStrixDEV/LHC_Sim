/**
 * Experiments: choose ATLAS / CMS / ALICE / LHCb, see each model's fidelity level, toggle
 * subsystems in the detector view, and read the field / response parameters.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import type { Subsystem } from '../physics/detector/DetectorModel';
import { DETECTOR_IDS, getDetector, type DetectorId } from '../physics/EventProcessor';
import { h, kvTable, section, select } from './dom';
import { ResponsePanel } from './ResponsePanel';

const SUBSYSTEM_LABEL: Record<Subsystem, string> = {
  beampipe: 'Beam pipe', pixel: 'Pixel / vertex detector', strip: 'Silicon strips / fibres', trt: 'TRT / TRD', tpc: 'TPC',
  tof: 'Time of flight', rich: 'RICH', solenoid: 'Solenoid', toroid: 'Toroids', dipole: 'Dipole magnet', yoke: 'Return yoke',
  ecal: 'EM calorimeter', hcal: 'Hadronic calorimeter', muon: 'Muon system', absorber: 'Absorbers',
};

export class DetectorPanel {
  readonly el = h('div', { class: 'panel-body' });
  private readonly body = h('div');
  private readonly sel: HTMLSelectElement;

  constructor(private readonly c: SimulationController) {
    this.sel = select(DETECTOR_IDS.map((id) => ({ value: id, label: getDetector(id).name })), c.state.event.detectorId, (v) => c.setDetector(v as DetectorId));
    this.el.append(
      section('Experiment', h('div', { class: 'row' }, h('label', {}, 'Detector'), this.sel), h('div', { class: 'btn-row' }, h('button', { onclick: () => c.goTo('detector') }, 'Explore in 3D'), h('button', { onclick: () => c.goTo('event') }, 'Event display'))),
      this.body,
      new ResponsePanel(c).el,
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.event.detectorId !== p.event.detectorId || s.vis.hiddenSubsystems !== p.vis.hiddenSubsystems || s.event.fieldModel !== p.event.fieldModel) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    this.sel.value = s.event.detectorId;
    const d = getDetector(s.event.detectorId, s.event.fieldModel);
    const subs = [...new Set(d.geometry.map((g) => g.subsystem))];
    const hidden = new Set(s.vis.hiddenSubsystems);
    const toggles = subs.map((sub) => {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !hidden.has(sub);
      cb.addEventListener('change', () => {
        const next = new Set(this.c.state.vis.hiddenSubsystems);
        if (cb.checked) next.delete(sub);
        else next.add(sub);
        this.c.setVis({ hiddenSubsystems: [...next] });
      });
      return h('label', { class: 'check' }, cb, ` ${SUBSYSTEM_LABEL[sub]}`);
    });
    const pid = d.pid;
    const pidRows: [string, string][] = [];
    if (pid?.dEdx) pidRows.push([pid.dEdx.name, `σ/⟨dE/dx⟩ = ${(pid.dEdx.relResolution * 100).toFixed(1)} %`]);
    if (pid?.tof) pidRows.push([pid.tof.name, `r = ${pid.tof.radiusM} m, σ_t = ${(pid.tof.timeResolutionNs * 1000).toFixed(0)} ps`]);
    for (const r of pid?.rich ?? []) pidRows.push([r.name, `${r.radiator}, n = ${r.n}, σ_θ = ${(r.angleResolutionRad * 1e3).toFixed(1)} mrad`]);
    this.body.replaceChildren(
      section(
        'Fidelity',
        h('div', { class: `fidelity fid-${d.fidelity.level.split(' ')[0]}` }, d.fidelity.level.toUpperCase()),
        h('div', { class: 'hint' }, d.fidelity.summary),
        h('div', { class: 'hint' }, 'Models are not equally detailed; none is the experiment’s own geometry or simulation.'),
      ),
      section('Subsystems (visual only)', ...toggles),
      section(
        'Parameters',
        kvTable([
          ['Field model', `${d.field.label}`],
          ['Tracking acceptance', `|η| < ${d.trackerEtaMax}${d.ecal.etaRange ? ` (forward: ${d.ecal.etaRange[0]} < η < ${d.ecal.etaRange[1]})` : ''}`],
          ['Tracker layers', String(d.trackerLayers.length)],
          ['σ(pT)/pT', `${(d.trackResolution.a * 100).toFixed(3)} %·pT ⊕ ${(d.trackResolution.b * 100).toFixed(1)} %`],
          ['ECAL', `${d.ecal.name}: ${(d.ecal.stochastic * 100).toFixed(1)} %/√E ⊕ ${(d.ecal.constant * 100).toFixed(1)} %`],
          ['HCAL', d.hcal.present === false ? d.hcal.name : `${d.hcal.name}: ${(d.hcal.stochastic * 100).toFixed(0)} %/√E ⊕ ${(d.hcal.constant * 100).toFixed(0)} %`],
          ['Muon stations', String(d.muonStations.length)],
          ...pidRows,
        ]),
        h('div', { class: 'hint' }, d.field.description),
        h('ul', {}, ...d.notes.map((n) => h('li', {}, n))),
      ),
    );
  }
}
