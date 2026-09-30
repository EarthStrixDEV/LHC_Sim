/**
 * Live Physics Inspector — presents values computed by AcceleratorCore / BeamModel /
 * MagnetModel. Formatting only; no physics is computed here.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { formatEnergyGeV, formatNumber, formatSI } from '../utils/units';
import { h, kvTable, section } from './dom';
import { renderWarnings } from './WarningPanel';
import { QuenchPanel } from './QuenchPanel';


export class PhysicsInspector {
  readonly el = h('div', { class: 'panel-body' });
  private readonly summary = h('div');
  private readonly warnings = h('div');
  private readonly fodoCanvas = h('canvas', { width: 330, height: 170, class: 'plot' });
  private readonly fodoInfo = h('div', { class: 'hint' });
  private readonly quenchPanel: QuenchPanel;

  constructor(private readonly c: SimulationController) {
    this.quenchPanel = new QuenchPanel(c);
    this.el.append(
      section('Physics inspector', this.summary),
      section('Warnings', this.warnings),
      section('Arc FODO optics (simplified)', this.fodoCanvas, this.fodoInfo),
      section('Magnet / quench V2 (lumped thermal–electrical model)', this.quenchPanel.el),
    );
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.accelerator !== p.accelerator || s.beam !== p.beam || s.quench !== p.quench) this.render(s);
    });
  }

  /** Called every frame; refreshes the quench readout at ~10 Hz while active. */
  tick(now: number): void {
    const s = this.c.state;
    if (s.quench.active) this.quenchPanel.tick(now);
  }

  private render(s: SimulationState): void {
    const a = s.accelerator;
    const b = s.beam;
    const k = a.kinematics;
    const feas = h('div', { class: `feas feas-${a.feasibility.toLowerCase()}` }, `Machine feasibility: ${a.feasibility.replace('_', '-')}`);
    const rows: Array<[string, string, string?]> = [
      ['Machine', `${a.machine.name} · ${a.mode === 'physics' ? 'Physics mode' : 'Sandbox'}`],
      ['Particle', `${a.species.label} (${a.species.symbol})`],
      ['Charge q', `${a.chargeE > 0 ? '+' : ''}${a.chargeE} e`],
      ['Mass m', formatEnergyGeV(a.massGeV) + '/c²'],
      ['Energy E', formatEnergyGeV(k.totalEnergyGeV)],
      ['Momentum p', formatEnergyGeV(k.momentumGeV) + '/c'],
      ['Lorentz γ', formatNumber(k.gamma, 5)],
      ['Velocity β', k.beta > 0.999 ? `1 − ${k.oneMinusBeta.toExponential(2)}` : formatNumber(k.beta, 6)],
      ['Operating B', `${a.operatingDipoleFieldT.toFixed(3)} T`, a.operatingDipoleFieldT > a.machine.dipoleFieldLimitT ? 'bad' : ''],
      ['Required B (design orbit)', `${a.requiredDipoleFieldT.toFixed(3)} T  (limit ${a.machine.dipoleFieldLimitT} T)`],
      ['Rigidity Bρ', `${formatNumber(a.rigidityTm, 6)} T·m`],
      ['Bending radius (beam)', Number.isFinite(a.beamBendingRadiusM) ? `${formatNumber(a.beamBendingRadiusM, 6)} m` : '∞ (no bending)'],
      ['Ring bending radius ρ', `${formatNumber(a.ringBendingRadiusM, 6)} m`],
      ['Energy / nucleon', a.energyPerNucleonGeV !== null ? formatEnergyGeV(a.energyPerNucleonGeV) : 'n/a (lepton)'],
      ['Momentum / nucleon', a.momentumPerNucleonGeV !== null ? formatEnergyGeV(a.momentumPerNucleonGeV) + '/c' : 'n/a'],
      ['√s (head-on, identical beams)', formatEnergyGeV(a.sqrtSGeV)],
      ['√s_NN', a.sqrtSNNGeV !== null ? formatEnergyGeV(a.sqrtSNNGeV) : 'n/a'],
      ['Synchrotron loss / turn U₀', formatEnergyGeV(a.synchrotron.energyLossPerTurnGeV), a.synchrotron.fractionalLossPerTurn > 1e-3 ? 'bad' : ''],
      ['U₀ / E', a.synchrotron.fractionalLossPerTurn.toExponential(2)],
      ['Critical photon energy', formatEnergyGeV(a.synchrotron.criticalPhotonEnergyGeV)],
      ['SR power (whole beam)', formatSI(b.synchrotronPowerW, "W")],
      ['Revolution frequency', formatSI(a.revolutionFrequencyHz, 'Hz')],
      ['Magnet temperature', `${a.temperatureK.toFixed(2)} K (nominal ${a.magnet.nominalTemperatureK} K)`],
      ['Operating margin', `${(a.magnet.margin * 100).toFixed(1)} % of short-sample limit (${a.magnet.shortSampleFieldT.toFixed(2)} T)`, a.magnet.margin < 0.1 ? 'bad' : ''],
      ['Magnet state', a.magnet.state, a.magnet.state !== 'STABLE' ? 'bad' : ''],
      ['Stored magnet energy', formatSI(a.magnet.storedEnergyJ, 'J') + ' per dipole'],
      ['Beam current', formatSI(b.beamCurrentA, 'A')],
      ['Stored beam energy', formatSI(b.storedBeamEnergyJ, 'J') + ' per beam'],
      ['β* / σ*', `${a.machine.interactionRegion.betaStarM} m / ${formatSI(b.sigmaStarM, 'm')}`],
      ['Luminosity (estimate)', b.luminosityCm2s > 0 ? `${b.luminosityCm2s.toExponential(2)} cm⁻²s⁻¹` : 'n/a'],
      [a.machine.luminosityLabel, `${a.machine.peakLuminosityCm2s.toExponential(1)} cm⁻²s⁻¹ (quoted)`],
    ];
    this.summary.replaceChildren(
      feas,
      h('div', { class: 'hint' }, a.machine.description),
      h('ul', { class: 'highlights' }, ...a.machine.highlights.map((x) => h('li', {}, x))),
      h('div', { class: 'hint' }, `IR: ${a.machine.interactionRegion.note}`),
      kvTable(rows),
      h('div', { class: 'hint' }, 'Luminosity estimate: round Gaussian beams, L = f n_b N²/(4πσ*²)·F. Levelling, hourglass and crab cavities not modelled.'),
    );
    this.warnings.replaceChildren(renderWarnings([...a.warnings, ...b.warnings]));
    this.drawFodo(s);
    this.renderQuench(s);
  }

  private drawFodo(s: SimulationState): void {
    const cv = this.fodoCanvas;
    const g = cv.getContext('2d');
    if (!g) return;
    const env = s.beam.envelope;
    const cell = s.beam.cell;
    const W = cv.width, H = cv.height, padL = 34, padB = 34, padT = 10;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);
    const L = cell.params.cellLengthM;
    const stable = env.stableX && env.stableY;
    let bMax = 1;
    if (stable) for (let i = 0; i < env.s.length; i++) bMax = Math.max(bMax, env.betaX[i]!, env.betaY[i]!);
    const x = (sv: number) => padL + (sv / L) * (W - padL - 8);
    const y = (b: number) => H - padB - (b / (bMax * 1.1)) * (H - padB - padT);
    // Axes
    g.strokeStyle = '#3a4350';
    g.beginPath();
    g.moveTo(padL, padT);
    g.lineTo(padL, H - padB);
    g.lineTo(W - 8, H - padB);
    g.stroke();
    g.fillStyle = '#8b97a6';
    g.font = '10px system-ui';
    g.fillText(`β [m]`, 2, padT + 8);
    g.fillText(`${Math.round(bMax)}`, 2, y(bMax) + 3);
    g.fillText('s [m] →', W - 44, H - padB + 12);
    // Element bar
    for (const e of cell.elements) {
      const x0 = x(e.sStartM), x1 = x(e.sStartM + e.lengthM);
      if (e.type === 'dipole') {
        g.fillStyle = '#3b82f6';
        g.fillRect(x0, H - padB + 18, x1 - x0, 6);
      } else if (e.type === 'quadF' || e.type === 'quadD') {
        g.fillStyle = '#f59e0b';
        g.fillRect(x0, e.type === 'quadF' ? H - padB + 10 : H - padB + 24, x1 - x0, 8);
      }
    }
    g.fillStyle = '#8b97a6';
    g.fillText('QF', x(0) + 2, H - 4);
    g.fillText('QD', x(L / 2) - 6, H - 4);
    if (!stable) {
      g.fillStyle = '#ef4444';
      g.font = '12px system-ui';
      g.fillText('Unstable: |Tr M / 2| ≥ 1 — no periodic solution', padL + 8, H / 2);
    } else {
      const plot = (arr: Float64Array, color: string) => {
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < env.s.length; i++) {
          const px = x(env.s[i]!), py = y(arr[i]!);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      };
      plot(env.betaX, '#4aa3ff');
      plot(env.betaY, '#ff9f0a');
      g.setLineDash([]);
      g.fillStyle = '#4aa3ff';
      g.fillText('β_x', W - 60, padT + 10);
      g.fillStyle = '#ff9f0a';
      g.fillText('β_y', W - 32, padT + 10);
    }
    this.fodoInfo.textContent = stable
      ? `Phase advance μx = ${env.phaseAdvanceXDeg.toFixed(1)}°, μy = ${env.phaseAdvanceYDeg.toFixed(1)}° per cell · k = G/Bρ = ${cell.k.toExponential(3)} m⁻² (G = ${s.beam.quadGradientTPerM.toFixed(1)} T/m, ${s.beam.gradientSource}) · σx,max = ${formatSI(Math.max(...env.sigmaX), 'm')}. A quadrupole that focuses x defocuses y; alternating F/D gives net focusing. Linear transfer matrices; dispersion, chromaticity and insertions omitted — not the complete LHC optics.`
      : 'The FODO cell has no stable periodic solution for this rigidity/gradient combination.';
  }

  private renderQuench(s: SimulationState): void {
    this.quenchPanel.render(s);
  }
}
