/**
 * Heads-up display: scale breadcrumbs, domain title/scale note, honesty-mode badge,
 * renderer backend chip and the active domain's portals.
 */
import type { SimulationController } from '../app/SimulationController';
import { SCENE_ORDER, type SceneId, type SimulationState } from '../app/SimulationState';
import type { SceneDomain } from '../visualization/scenes/SceneDomain';
import { policyFor, VIS_MODES, type VisMode } from '../visualization/VisualizationMode';
import { h } from './dom';

const SCENE_LABEL: Record<SceneId, string> = {
  surface: 'City / Surface',
  ring: 'LHC Ring',
  tunnel: 'Tunnel Sector',
  ir: 'IR Optics',
  cavern: 'Experimental Cavern',
  detector: 'Detector',
  event: 'Collision Event',
};

const MODE_BANNER: Partial<Record<VisMode, string>> = {
  AUGMENTED: 'AUGMENTED — invisible quantities (trajectories, fields, beam envelopes) made visible. Not what the eye would see.',
  ANALYSIS: 'ANALYSIS — reconstructed objects and analysis constructs (jet cones, MET arrows are not matter).',
  CINEMATIC: 'CINEMATIC — enhanced visualization: bloom and amplified effects are presentation, not physics.',
  DETECTOR: 'DETECTOR — what the apparatus records: hits, energy deposits, muon segments.',
  PHYSICAL: 'PHYSICAL — approximately what a human observer could see. Beams and particle tracks are invisible.',
};

export class Hud {
  readonly top = h('div', { class: 'hud-top' });
  readonly portals = h('div', { class: 'hud-portals' });
  readonly banner = h('div', { class: 'hud-banner' });
  private readonly crumbs = h('nav', { class: 'crumbs' });
  private readonly title = h('div', { class: 'hud-title' });
  private readonly note = h('div', { class: 'hud-note' });
  private readonly backend = h('span', { class: 'chip backend' });
  private readonly modes = h('div', { class: 'mode-switch' });

  constructor(private readonly c: SimulationController) {
    for (const id of SCENE_ORDER) {
      this.crumbs.append(h('button', { 'data-id': id, onclick: () => c.goTo(id) }, SCENE_LABEL[id]));
    }
    for (const m of VIS_MODES) this.modes.append(h('button', { 'data-mode': m, title: policyFor(m).description, onclick: () => c.setVis({ mode: m }) }, m));
    this.top.append(this.crumbs, h('div', { class: 'hud-row' }, this.title, this.backend), this.note, this.modes);
    this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.scene !== p.scene || s.vis.mode !== p.vis.mode || s.rendererBackend !== p.rendererBackend || s.transitioning !== p.transitioning) this.render(s);
    });
  }

  setDomain(d: SceneDomain | null): void {
    this.title.textContent = d ? d.title : '';
    this.note.textContent = d ? d.scaleNote : '';
    this.portals.replaceChildren(...(d?.portals ?? []).map((p) => h('button', { class: 'portal', onclick: () => this.c.goTo(p.target) }, p.label)));
  }

  private render(s: SimulationState): void {
    for (const b of this.crumbs.querySelectorAll('button')) {
      const id = b.getAttribute('data-id') as SceneId;
      b.classList.toggle('active', id === s.scene);
      b.disabled = s.transitioning;
    }
    for (const b of this.modes.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-mode') === s.vis.mode);
    this.backend.textContent = `Renderer: ${s.rendererBackend}`;
    this.banner.textContent = MODE_BANNER[s.vis.mode] ?? '';
    this.banner.className = `hud-banner mode-${s.vis.mode.toLowerCase()}`;
  }
}
