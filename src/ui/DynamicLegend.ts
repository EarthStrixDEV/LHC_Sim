/**
 * Legend that always states what color currently means, plus the epistemic categories
 * visible in the current honesty mode.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import { legendFor } from '../visualization/colors/ColorMode';
import { colormapGradientCss, COLORMAP_LABEL } from '../visualization/colors/Colormaps';
import { PALETTE_DISCLAIMER } from '../visualization/colors/PhysicsPalette';
import { CALO_ENERGY_RANGE } from '../visualization/detector/CalorimeterRenderer';
import { policyFor } from '../visualization/VisualizationMode';
import { h } from './dom';

export class DynamicLegend {
  readonly el = h('div', { class: 'legend' });

  constructor(c: SimulationController) {
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.vis !== p.vis || s.scene !== p.scene) this.render(s);
    });
  }

  private render(s: SimulationState): void {
    const pol = policyFor(s.vis.mode);
    const spec = legendFor({ colorBy: s.vis.colorBy, palette: s.vis.palette, colormap: s.vis.colormap });
    const nodes: Node[] = [h('div', { class: 'legend-title' }, spec.title)];
    const eventView = s.scene === 'event';
    if (eventView && (pol.showTruthTracks || pol.showRecoTracks)) {
      for (const e of spec.entries) {
        if (e.kind === 'swatch') {
          nodes.push(h('div', { class: 'legend-row' }, h('span', { class: 'sw', style: `background:${e.color}` }), h('span', { class: 'icon' }, e.icon ?? ''), ` ${e.label}`, e.note ? h('span', { class: 'hint' }, ` (${e.note})`) : null));
        } else {
          nodes.push(h('div', { class: 'legend-row' }, e.label), h('div', { class: 'grad', style: `background:${e.gradientCss}` }), h('div', { class: 'grad-labels' }, h('span', {}, e.minLabel), h('span', {}, e.maxLabel)));
        }
      }
    } else if (eventView) {
      nodes.push(h('div', { class: 'hint' }, 'No trajectories are drawn in this mode.'));
    }
    if (eventView && pol.showCaloDeposits) {
      if (s.vis.colorBy === 'subsystem') nodes.push(h('div', { class: 'hint' }, 'Calorimeter cells: subsystem colors (ECAL / HCAL).'));
      else {
        nodes.push(
          h('div', { class: 'legend-title' }, 'CALORIMETER DEPOSITED ENERGY'),
          h('div', { class: 'grad', style: `background:${colormapGradientCss(s.vis.caloColormap)}` }),
          h('div', { class: 'grad-labels' }, h('span', {}, `${CALO_ENERGY_RANGE.lo} GeV`), h('span', {}, `${COLORMAP_LABEL[s.vis.caloColormap]}, log`), h('span', {}, `${CALO_ENERGY_RANGE.hi}+ GeV`)),
        );
      }
    }
    if (!eventView) nodes.push(h('div', { class: 'hint' }, 'Event color legend applies in the Collision Event scene.'));
    nodes.push(h('div', { class: 'legend-title' }, `ON SCREEN (${s.vis.mode})`), h('div', { class: 'chips' }, ...pol.categories.map((c) => h('span', { class: `chip cat-${c.split(' ')[0]!.toLowerCase()}` }, c))));
    nodes.push(h('div', { class: 'disclaimer' }, PALETTE_DISCLAIMER));
    this.el.replaceChildren(...nodes);
  }
}
