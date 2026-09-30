import type { PerformanceMonitor } from '../utils/performance';
import { FRAME_BUDGET_MS } from '../utils/performance';
import { h } from './dom';

/** Runtime profiling readout (updated ~4× per second). */
export class PerformancePanel {
  readonly el = h('div', { class: 'perf' });
  private last = 0;
  private collapsed = false;

  constructor(private readonly perf: PerformanceMonitor) {
    this.el.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.last = 0;
    });
  }

  tick(now: number): void {
    if (now - this.last < 250) return;
    this.last = now;
    const p = this.perf;
    const fps = p.fps();
    const frame = p.frame.mean();
    const cls = frame <= FRAME_BUDGET_MS.total * 1.05 ? 'ok' : frame < 33 ? 'mid' : 'bad';
    if (this.collapsed) {
      this.el.replaceChildren(h('span', { class: cls }, `${fps.toFixed(0)} FPS`));
      return;
    }
    const heap = p.heapMB();
    const rows: Array<[string, string]> = [
      ['Backend', p.backend],
      ['FPS / frame', `${fps.toFixed(0)} / ${frame.toFixed(2)} ms (budget ${FRAME_BUDGET_MS.total.toFixed(2)})`],
      ['CPU render submit', `${p.render.mean().toFixed(2)} ms`],
      ['Scene update', `${p.sceneUpdate.mean().toFixed(2)} ms (target ${FRAME_BUDGET_MS.sceneUpdate})`],
      ['Physics (main)', `${p.physics.mean().toFixed(2)} ms`],
      ['Physics (worker, last event)', `${p.workerMs.toFixed(1)} ms`],
      ['Draw calls', String(p.drawCalls)],
      ['Triangles', p.triangles.toLocaleString()],
      ['Geometries / textures', `${p.geometries} / ${p.textures}`],
      ['Visible tracks', String(p.visibleTracks)],
      ['Active particles', String(p.activeParticles)],
      ['Last scene transition', `${p.lastSceneTransitionMs.toFixed(0)} ms`],
      ['JS heap', heap !== null ? `${heap.toFixed(0)} MB` : 'n/a'],
    ];
    this.el.replaceChildren(
      h('div', { class: `perf-head ${cls}` }, `${fps.toFixed(0)} FPS`),
      h('table', {}, ...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
      h('div', { class: 'hint' }, 'GPU timing is not exposed portably; CPU submit time shown. Click to collapse.'),
    );
  }
}
