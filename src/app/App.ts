/**
 * Application shell: wires state → physics (controller), state → visualization (scene
 * manager) and state → UI. Owns the render loop and runtime profiling.
 */
import { PerformanceMonitor } from '../utils/performance';
import { RendererManager } from '../visualization/renderer/RendererManager';
import { SceneManager } from '../visualization/scenes/SceneManager';
import { QUALITY_PRESETS } from '../visualization/QualityPresets';
import { policyFor } from '../visualization/VisualizationMode';
import { ControlPanel } from '../ui/ControlPanel';
import { DynamicLegend } from '../ui/DynamicLegend';
import { EventInspector } from '../ui/EventInspector';
import { DataSourcePanel } from '../ui/DataSourcePanel';
import { generatorSection } from '../ui/GeneratorPanel';
import { ColliderPanel } from '../ui/ColliderPanel';
import { DetectorPanel } from '../ui/DetectorPanel';
import { PidPanel } from '../ui/PidPanel';
import { RecoPanel } from '../ui/RecoPanel';
import { HistogramPanel } from '../ui/HistogramPanel';
import { Hud } from '../ui/Hud';
import { PerformancePanel } from '../ui/PerformancePanel';
import { PhysicsInspector } from '../ui/PhysicsInspector';
import { h } from '../ui/dom';
import { SimulationController } from './SimulationController';

export class App {
  private readonly perf = new PerformanceMonitor();
  private readonly controller = new SimulationController(this.perf);
  private rm!: RendererManager;
  private sm!: SceneManager;
  private lastTime = performance.now();

  async start(root: HTMLElement): Promise<void> {
    const c = this.controller;
    const viewport = h('div', { class: 'viewport' });
    const hud = new Hud(c);
    const controls = new ControlPanel(c);
    const physics = new PhysicsInspector(c);
    const events = new EventInspector(c);
    const histogram = new HistogramPanel(c);
    const legend = new DynamicLegend(c);
    const perfPanel = new PerformancePanel(this.perf);

    const data = new DataSourcePanel(c, [generatorSection(c)]);

    const collider = new ColliderPanel(c);
    const detectorPanel = new DetectorPanel(c);
    type TabId = 'physics' | 'collider' | 'detector' | 'event' | 'data';
    const tabs = h('div', { class: 'tabs' });
    const bodies: Record<TabId, HTMLElement> = {
      physics: h('div', { class: 'tab-body' }, physics.el),
      collider: h('div', { class: 'tab-body' }, collider.el),
      detector: h('div', { class: 'tab-body' }, detectorPanel.el),
      event: h('div', { class: 'tab-body' }, events.el, new RecoPanel(c).el, new PidPanel(c).el, histogram.el),
      data: h('div', { class: 'tab-body' }, data.el),
    };
    const labels: Record<TabId, string> = { physics: 'Physics', collider: 'Collider', detector: 'Detector', event: 'Event', data: 'Data' };
    const setTab = (t: TabId) => {
      for (const [id, el] of Object.entries(bodies)) el.style.display = id === t ? '' : 'none';
      for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-tab') === t);
    };
    for (const id of Object.keys(bodies) as TabId[]) tabs.append(h('button', { 'data-tab': id, onclick: () => setTab(id) }, labels[id]));
    setTab('physics');
    c.store.subscribe((s, p) => {
      if (s.event.sampleId !== p.event.sampleId && s.event.provenance?.sourceType !== 'CURATED') setTab('event');
    });

    const left = h('aside', { class: 'side left' }, h('div', { class: 'brand' }, 'LHC Simulator ', h('span', { class: 'phase' }, 'Phase 2')), controls.el);
    const right = h('aside', { class: 'side right' }, tabs, ...Object.values(bodies));
    const bottomLeft = h('div', { class: 'bottom-left' }, legend.el);
    root.append(viewport, left, right, hud.top, hud.banner, hud.portals, bottomLeft, perfPanel.el);

    this.rm = new RendererManager(viewport);
    await this.rm.init();
    this.perf.backend = this.rm.backend;
    c.store.set({ rendererBackend: this.rm.backend });
    this.rm.applyQuality(QUALITY_PRESETS[c.state.vis.quality]);
    this.rm.renderer.info.autoReset = false;

    this.sm = new SceneManager(this.rm, c, this.perf, viewport);
    c.onSceneRequest((id) => {
      void this.sm.activate(id).then(() => {
        hud.setDomain(this.sm.active);
        if (id === 'event') setTab('event');
      });
    });
    await this.sm.activate('surface', false);
    hud.setDomain(this.sm.active);

    c.store.subscribe((s, p) => {
      if (s.vis.quality !== p.vis.quality) {
        this.rm.applyQuality(QUALITY_PRESETS[s.vis.quality]);
        if (s.scene !== 'event') void this.sm.rebuild().then(() => hud.setDomain(this.sm.active));
      }
      if (this.sm.active && !s.transitioning) this.sm.active.onState(s, p, this.sm.context());
      if (s.event.detectorId !== p.event.detectorId) hud.setDomain(this.sm.active);
    });
    window.addEventListener('resize', () => this.sm.resize());

    if (import.meta.env.DEV) {
      // Dev-only hook for automated smoke tests (hidden tabs do not run rAF).
      (window as unknown as Record<string, unknown>).__lhc = {
        controller: c,
        activate: async (id: Parameters<SceneManager['activate']>[0]) => {
          await this.sm.activate(id, false);
          hud.setDomain(this.sm.active);
        },
        renderOnce: () => this.frame(performance.now()),
        scene: () => this.sm.active?.scene,
      };
    }

    this.rm.renderer.setAnimationLoop(() => {
      const now = performance.now();
      this.frame(now);
      physics.tick(now);
      perfPanel.tick(now);
    });
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.perf.beginFrame(now);
    const d = this.sm.active;
    if (!d) return;
    const state = this.controller.state;
    const policy = policyFor(state.vis.mode);
    this.sm.controls.update();
    const info = this.rm.renderer.info;
    info.reset();
    const t0 = performance.now();
    d.update({ dt, time: now / 1000, state, policy });
    const t1 = performance.now();
    this.rm.render(d.scene, d.camera, { bloomScale: policy.bloomScale });
    const t2 = performance.now();
    this.perf.sceneUpdate.push(t1 - t0);
    this.perf.render.push(t2 - t1);
    this.perf.drawCalls = info.render.drawCalls;
    this.perf.triangles = info.render.triangles;
    this.perf.geometries = info.memory.geometries;
    this.perf.textures = info.memory.textures;
    this.perf.visibleTracks = d.stats.visibleTracks;
    this.perf.activeParticles = d.stats.activeParticles;
  }
}
