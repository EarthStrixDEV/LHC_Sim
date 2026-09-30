/**
 * Quench V2 panel: inputs (disturbance energy, heaters, energy extraction), stability numbers
 * (current-sharing temperature, minimum quench energy, propagation velocity) and the simulated
 * thermal/electrical evolution with a playback cursor. Values come from QuenchModelV2.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { minimumQuenchEnergyJ, currentSharingTemperature, propagationVelocity, quenchV2Snapshot, type QuenchPhaseV2, type QuenchV2Result } from '../physics/accelerator/QuenchModelV2';
import { quenchParamsFor } from '../physics/accelerator/QuenchScenario';
import { formatSI } from '../utils/units';
import { quenchPlaybackLabel, quenchSimTime } from '../visualization/quenchPlayback';
import { h, kvTable } from './dom';

const PHASES: readonly QuenchPhaseV2[] = ['resistive-transition', 'local-heating', 'current-decay', 'energy-extraction', 'cryogenic-recovery'];
const PHASE_TEXT: Record<QuenchPhaseV2, string> = {
  superconducting: 'Coil superconducting: zero resistance.',
  recovered: 'The disturbance stayed below the minimum quench energy: the conductor recovered without quenching.',
  'resistive-transition': 'A short length exceeded the current-sharing temperature: a normal zone forms and grows at the propagation velocity.',
  'local-heating': 'The resistive voltage passed the detection threshold; quench heaters are firing. Joule heating I²R raises the hot spot.',
  'current-decay': 'Heaters made the whole coil resistive: L dI/dt = −R I; the stored energy ½LI² is dissipated in the coil (bypass diode).',
  'energy-extraction': 'Current decays through the coil and the energy-extraction resistor; most energy ends up in the resistor.',
  'cryogenic-recovery': 'Current is off; the cryogenic system re-cools the magnet (hours).',
};

export class QuenchPanel {
  readonly el = h('div');
  private readonly plot = h('canvas', { width: 330, height: 150, class: 'plot' });
  private readonly live = h('div');
  private lastTick = 0;
  private drawnSim: QuenchV2Result | null = null;

  constructor(private readonly c: SimulationController) {}

  render(s: SimulationState): void {
    const q = s.quench;
    const p = quenchParamsFor(s.accelerator, q.controls);
    const dist = h('input', { type: 'range', min: -4, max: 1, step: 0.1, value: Math.log10(q.controls.disturbanceJ) }) as HTMLInputElement;
    const distOut = h('span', { class: 'tree-meta' }, formatSI(q.controls.disturbanceJ, 'J', 2));
    dist.addEventListener('input', () => (distOut.textContent = formatSI(10 ** Number(dist.value), 'J', 2)));
    dist.addEventListener('change', () => this.c.setQuenchControls({ disturbanceJ: 10 ** Number(dist.value) }));
    const dump = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: q.controls.dumpResistanceOhm }) as HTMLInputElement;
    const dumpOut = h('span', { class: 'tree-meta' }, `${q.controls.dumpResistanceOhm.toFixed(2)} Ω`);
    dump.addEventListener('input', () => (dumpOut.textContent = `${Number(dump.value).toFixed(2)} Ω`));
    dump.addEventListener('change', () => this.c.setQuenchControls({ dumpResistanceOhm: Number(dump.value) }));
    const heat = h('input', { type: 'checkbox' }) as HTMLInputElement;
    heat.checked = q.controls.heatersEnabled;
    heat.addEventListener('change', () => this.c.setQuenchControls({ heatersEnabled: heat.checked }));
    const mqe = minimumQuenchEnergyJ(p);
    this.el.replaceChildren(
      h('div', { class: 'hint' }, `State ${s.accelerator.magnet.state}: ${s.accelerator.magnet.operatingFieldT.toFixed(2)} T, ${s.accelerator.temperatureK.toFixed(2)} K, I = ${p.currentA.toFixed(0)} A, stored energy ${formatSI(0.5 * p.inductanceH * p.currentA ** 2, 'J')}.`),
      kvTable([
        ['Current-sharing temperature', `${currentSharingTemperature(p).toFixed(2)} K (T_c(B) − margin)`],
        ['Minimum quench energy', `${formatSI(mqe, 'J', 2)} in ${(p.disturbanceLengthM * 100).toFixed(0)} cm of cable`],
        ['Normal-zone propagation', `${propagationVelocity(p, p.currentA).toFixed(1)} m/s per front (Wilson, adiabatic)`],
      ]),
      h('div', { class: 'row' }, h('label', {}, 'Disturbance ΔE'), dist, distOut),
      h('div', { class: 'row' }, h('label', {}, 'Energy extraction R'), dump, dumpOut),
      h('label', { class: 'check' }, heat, ' Quench heaters (protection)'),
      h('div', { class: 'btn-row' }, h('button', { class: 'small danger', onclick: () => this.c.triggerQuench() }, q.active ? 'Re-run quench' : 'Simulate quench of one dipole'), q.active ? h('button', { class: 'small', onclick: () => this.c.resetQuench() }, 'Reset') : null),
      this.plot,
      this.live,
      h('div', { class: 'hint' }, 'Quench V2: lumped thermal/electrical model — P = I²R, C(T) dT/dt = P_Joule − P_cooling, E = ½LI². Educational; not a superconducting multiphysics simulation. A quench is a protected transition, not an explosion.'),
    );
    this.drawnSim = null;
    this.tick(performance.now(), true);
  }

  tick(now: number, force = false): void {
    const s = this.c.state;
    const q = s.quench;
    if (!force && (!q.active || now - this.lastTick < 100)) return;
    this.lastTick = now;
    const sim = q.sim;
    if (!q.active || !sim) {
      this.live.replaceChildren(h('div', { class: 'hint' }, 'No quench simulated yet.'));
      this.drawPlot(null, -1);
      return;
    }
    const wall = (now - q.startedAt) / 1000;
    const t = Math.min(quenchSimTime(wall), sim.t[sim.t.length - 1]!);
    const snap = quenchV2Snapshot(sim, t);
    this.drawPlot(sim, t);
    this.live.replaceChildren(
      h('div', { class: 'quench-steps' }, ...PHASES.map((p) => h('span', { class: p === snap.phase ? 'on' : '' }, p.replace('-', ' ')))),
      h('div', { class: 'hint' }, PHASE_TEXT[snap.phase]),
      kvTable([
        ['Simulated time', `${snap.timeS.toFixed(snap.timeS < 1 ? 3 : 2)} s (${quenchPlaybackLabel(wall)})`],
        ['Current I', `${snap.currentA.toFixed(0)} A (${(snap.currentFraction * 100).toFixed(1)} %)`],
        ['Normal zone', `${(snap.normalZoneFraction * 100).toFixed(snap.normalZoneFraction < 0.01 ? 3 : 1)} % of the conductor, R = ${snap.resistanceOhm < 0.01 ? formatSI(snap.resistanceOhm, 'Ω', 2) : `${snap.resistanceOhm.toFixed(3)} Ω`}`],
        ['Resistive voltage', `${snap.voltageV.toFixed(snap.voltageV < 10 ? 2 : 0)} V`],
        ['Hot spot / normal-zone mean', `${snap.hotspotTemperatureK.toFixed(0)} K / ${snap.normalZoneTemperatureK.toFixed(0)} K (max ${sim.maxHotSpotK.toFixed(0)} K)`],
        ['Energy: magnet / coil / resistor', `${formatSI(snap.energyMagnetJ, 'J', 2)} / ${formatSI(snap.energyCoilJ, 'J', 2)} / ${formatSI(snap.energyDumpJ, 'J', 2)}`],
        ['Detection / heaters', sim.quenched ? `${sim.detectionTimeS !== null ? `${(sim.detectionTimeS * 1e3).toFixed(1)} ms` : 'not reached'} / ${sim.heaterTimeS !== null ? `${(sim.heaterTimeS * 1e3).toFixed(1)} ms` : 'off'}` : 'no quench (recovered)'],
      ]),
    );
  }

  private drawPlot(sim: QuenchV2Result | null, tNow: number): void {
    const g = this.plot.getContext('2d');
    if (!g) return;
    const W = this.plot.width, H = this.plot.height, L = 30, B = 16, T = 10;
    if (sim !== this.drawnSim || tNow < 0) {
      this.drawnSim = sim;
    }
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    if (!sim) return;
    const tEnd = sim.t[sim.t.length - 1]!;
    const X = (t: number) => L + (t / tEnd) * (W - L - 8);
    const Tmax = Math.max(sim.maxHotSpotK, 10);
    const curve = (arr: Float64Array, scale: number, color: string) => {
      g.strokeStyle = color;
      g.beginPath();
      arr.forEach((v, i) => {
        const y = H - B - (v / scale) * (H - B - T);
        if (i) g.lineTo(X(sim.t[i]!), y);
        else g.moveTo(X(sim.t[i]!), y);
      });
      g.stroke();
    };
    curve(sim.current, sim.params.currentA, '#60a5fa');
    curve(sim.hotSpotK, Tmax, '#f87171');
    curve(sim.normalFraction, 1, '#a3e635');
    curve(sim.energyMagnet, sim.energyMagnet[0]!, '#fbbf24');
    if (tNow >= 0) {
      g.strokeStyle = '#e5e7eb';
      g.beginPath();
      g.moveTo(X(tNow), T);
      g.lineTo(X(tNow), H - B);
      g.stroke();
    }
    g.font = '10px sans-serif';
    const leg: [string, string][] = [['I/I₀', '#60a5fa'], [`T_hot (max ${Tmax.toFixed(0)} K)`, '#f87171'], ['normal fraction', '#a3e635'], ['½LI²', '#fbbf24']];
    let x = L;
    for (const [t, c] of leg) {
      g.fillStyle = c;
      g.fillText(t, x, 9);
      x += g.measureText(t).width + 8;
    }
    g.fillStyle = '#9aa4b2';
    g.fillText(`t [s] 0 … ${tEnd.toFixed(1)}`, L, H - 3);
  }
}
