/**
 * SceneManager — controlled transitions between domains. The previous domain is disposed
 * before the next is built, so GPU memory never holds more than one scale at a time.
 */
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneId } from '../../app/SimulationState';
import type { SimulationController } from '../../app/SimulationController';
import type { PerformanceMonitor } from '../../utils/performance';
import type { RendererManager } from '../renderer/RendererManager';
import { QUALITY_PRESETS } from '../QualityPresets';
import type { DomainContext, SceneDomain } from './SceneDomain';
import { SurfaceScene } from './SurfaceScene';
import { RingScene } from './RingScene';
import { TunnelScene } from './TunnelScene';
import { CavernScene } from './CavernScene';
import { DetectorScene } from './DetectorScene';
import { EventScene } from './EventScene';
import { IRScene } from './IRScene';

const FACTORIES: Record<SceneId, () => SceneDomain> = {
  surface: () => new SurfaceScene(),
  ring: () => new RingScene(),
  tunnel: () => new TunnelScene(),
  ir: () => new IRScene(),
  cavern: () => new CavernScene(),
  detector: () => new DetectorScene(),
  event: () => new EventScene(),
};

const FADE_MS = 280;

export class SceneManager {
  active: SceneDomain | null = null;
  readonly controls: OrbitControls;
  private readonly fade: HTMLDivElement;

  constructor(
    private readonly rm: RendererManager,
    private readonly controller: SimulationController,
    private readonly perf: PerformanceMonitor,
    container: HTMLElement,
  ) {
    this.controls = new OrbitControls(this.placeholderCamera(), rm.labels.domElement);
    this.controls.enableDamping = true;
    this.fade = document.createElement('div');
    this.fade.className = 'scene-fade';
    container.appendChild(this.fade);
    // Treat as a click only if the pointer barely moved (otherwise it was an orbit drag).
    let down: { x: number; y: number } | null = null;
    rm.labels.domElement.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
    rm.labels.domElement.addEventListener('pointerup', (ev) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) this.onClick(ev);
      down = null;
    });
  }

  private placeholderCamera() {
    // Replaced on first activation; OrbitControls needs a camera at construction.
    return FACTORIES.surface().camera;
  }

  context(): DomainContext {
    return {
      controller: this.controller,
      quality: QUALITY_PRESETS[this.controller.state.vis.quality],
      controls: this.controls,
      canvas: this.rm.labels.domElement,
      environment: this.rm.environment,
    };
  }

  async activate(id: SceneId, fade = true): Promise<void> {
    const store = this.controller.store;
    store.set({ transitioning: true });
    const t0 = performance.now();
    if (fade) {
      this.fade.classList.add('on');
      await wait(FADE_MS);
    }
    this.active?.dispose();
    this.active = null;
    const domain = FACTORIES[id]();
    this.controls.object = domain.camera;
    this.controls.minDistance = 0;
    this.controls.maxDistance = Infinity;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.enabled = true;
    const { width, height } = this.rm.size;
    domain.resize(width / Math.max(height, 1));
    await domain.build(this.context());
    this.controls.update();
    this.active = domain;
    store.set({ scene: id, transitioning: false });
    this.perf.lastSceneTransitionMs = performance.now() - t0 - (fade ? FADE_MS : 0);
    if (fade) this.fade.classList.remove('on');
  }

  /** Rebuild the active domain (e.g. after a quality change that alters geometry budgets). */
  async rebuild(): Promise<void> {
    if (this.active) await this.activate(this.active.id, false);
  }

  resize(): void {
    const { width, height } = this.rm.size;
    this.active?.resize(width / Math.max(height, 1));
  }

  private onClick(ev: MouseEvent): void {
    if (!this.active) return;
    const rect = this.rm.labels.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.active.onClick(x, y, this.context());
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
