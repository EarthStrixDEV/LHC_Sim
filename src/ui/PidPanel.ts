/**
 * Particle identification view: measured dE/dx, TOF β or RICH θ_c versus momentum for the
 * tracks of the current event, over the expected curves of each species. The curves come
 * from the same physics functions that produced the (smeared) measurements.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { cherenkovAngle, dEdxMean, SPECIES_MASS, velocityBeta, type PidMeasurement, type Species } from '../detector/response/PID';
import { getDetector } from '../physics/EventProcessor';
import { h, section } from './dom';

const COLORS: Record<Species, string> = { e: '#facc15', mu: '#22d3ee', pi: '#a3e635', K: '#f472b6', p: '#fb923c' };
type Quantity = 'dEdx' | 'tof' | 'rich';

export class PidPanel {
  readonly el: HTMLElement;
  private readonly canvas = h('canvas', { width: 330, height: 190, class: 'plot' });
  private readonly info = h('div', { class: 'hint' });

  constructor(c: SimulationController) {
    this.el = section('Particle identification', this.canvas, this.info);
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.event.processed !== p.event.processed) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    const pe = s.event.processed;
    const det = getDetector(s.event.detectorId);
    const pid = pe?.pid ?? [];
    this.el.style.display = det.pid ? '' : 'none';
    if (!det.pid) return;
    const q: Quantity = det.pid.dEdx ? 'dEdx' : det.pid.tof ? 'tof' : 'rich';
    this.draw(pid, q, det.pid.rich?.[0]?.n ?? 1.0014);
    const withHyp = pid.filter((m) => m.hypothesis && m.trueSpecies);
    const correct = withHyp.filter((m) => m.hypothesis === m.trueSpecies).length;
    this.info.textContent = pe
      ? `${pid.length} identified tracks. Most-likely hypothesis agrees with simulation truth for ${correct}/${withHyp.length} (e, μ, π, K, p). Curves: expected values per species; points: smeared measurements (DETECTOR MEASUREMENT).`
      : 'Load an event with ALICE (TPC dE/dx, TOF) or LHCb (RICH).';
  }

  private draw(pid: readonly PidMeasurement[], q: Quantity, n: number): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const W = this.canvas.width, H = this.canvas.height, L = 36, B = 20, T = 8;
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const pMin = 0.1, pMax = 20;
    const X = (p: number) => L + (Math.log10(p / pMin) / Math.log10(pMax / pMin)) * (W - L - 6);
    const range = q === 'dEdx' ? [0.5, 6] : q === 'tof' ? [0.3, 1.05] : [0, 0.06];
    const Y = (v: number) => H - B - ((v - range[0]!) / (range[1]! - range[0]!)) * (H - B - T);
    const value = (sp: Species, p: number): number | null => (q === 'dEdx' ? dEdxMean(p, SPECIES_MASS[sp]) : q === 'tof' ? velocityBeta(p, SPECIES_MASS[sp]) : cherenkovAngle(p, SPECIES_MASS[sp], n));
    for (const sp of Object.keys(COLORS) as Species[]) {
      g.strokeStyle = COLORS[sp];
      g.globalAlpha = 0.6;
      g.beginPath();
      let started = false;
      for (let i = 0; i <= 200; i++) {
        const p = pMin * (pMax / pMin) ** (i / 200);
        const v = value(sp, p);
        if (v === null) { started = false; continue; }
        if (!started) g.moveTo(X(p), Y(v)); else g.lineTo(X(p), Y(v));
        started = true;
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    for (const m of pid) {
      const v = q === 'dEdx' ? m.dEdx?.value : q === 'tof' ? m.tof?.beta : m.rich?.[0]?.angleRad ?? undefined;
      if (v === undefined || v === null || m.p < pMin || m.p > pMax) continue;
      g.fillStyle = m.hypothesis ? COLORS[m.hypothesis] : '#e5e7eb';
      g.fillRect(X(m.p) - 1.5, Y(v) - 1.5, 3, 3);
    }
    g.fillStyle = '#9aa4b2';
    g.font = '10px sans-serif';
    g.fillText(q === 'dEdx' ? 'dE/dx / MIP' : q === 'tof' ? 'TOF β' : 'RICH1 θc [rad]', 2, 12);
    g.fillText('p [GeV] (log) 0.1 … 20', L, H - 5);
    let x = W - 120;
    for (const sp of Object.keys(COLORS) as Species[]) {
      g.fillStyle = COLORS[sp];
      g.fillText(sp === 'mu' ? 'μ' : sp === 'pi' ? 'π' : sp, x, 12);
      x += 18;
    }
  }
}
