/**
 * Event generation on request (PYTHIA 8 backend). Asynchronous: the scene keeps rendering
 * while the backend works; the result is registered as a PYTHIA-provenance dataset.
 */
import type { SimulationController } from '../app/SimulationController';
import { MAX_EVENTS_PER_REQUEST, MAX_SEED, PROCESS_LABEL, type GenProcess } from '../generators/EventGenerator';
import { PythiaBackendClient } from '../generators/PythiaBackendClient';
import { pythiaWasmStatus } from '../generators/PythiaWasmWorker';
import { h, section, select } from './dom';

export function generatorSection(c: SimulationController): HTMLElement {
  const gen = new PythiaBackendClient();
  const statusEl = h('div', { class: 'hint' }, 'Checking PYTHIA backend…');
  let process: GenProcess = 'drell-yan-z';
  let record: 'compact' | 'full' = 'compact';
  const sqrtS = h('input', { type: 'number', value: 13600, min: 100, max: 100000, step: 100 }) as HTMLInputElement;
  const nEv = h('input', { type: 'number', value: 50, min: 1, max: MAX_EVENTS_PER_REQUEST }) as HTMLInputElement;
  const seed = h('input', { type: 'number', value: 12345, min: 1, max: MAX_SEED }) as HTMLInputElement;
  const out = h('div', { class: 'hint' });
  let ac: AbortController | null = null;

  const refresh = async () => {
    const s = await gen.status();
    statusEl.textContent = s.available ? `✔ ${s.name} ${s.version ?? ''} backend reachable.` : `✖ ${s.detail}`;
    statusEl.className = s.available ? 'hint ok' : 'hint warn';
  };

  const run = async () => {
    ac?.abort();
    ac = new AbortController();
    const req = { system: 'pp' as const, sqrtSGeV: Number(sqrtS.value), process, nEvents: Math.floor(Number(nEv.value)), seed: Math.floor(Number(seed.value)), record };
    out.textContent = `Generating ${req.nEvents} events with PYTHIA (seed ${req.seed})… the view stays interactive.`;
    const t0 = performance.now();
    try {
      const sample = await gen.generate(req, { signal: ac.signal });
      await c.registerDataset(sample);
      out.textContent = `Generated ${sample.events.length} events in ${((performance.now() - t0) / 1000).toFixed(1)} s. Same seed ⇒ same events.`;
    } catch (e) {
      out.textContent = ac.signal.aborted ? 'Cancelled.' : `Failed: ${(e as Error).message}`;
    }
  };

  void refresh();
  return section(
    'Event generator — PYTHIA 8',
    statusEl,
    h('div', { class: 'row' }, h('label', {}, 'Process'), select((Object.keys(PROCESS_LABEL) as GenProcess[]).map((p) => ({ value: p, label: PROCESS_LABEL[p] })), process, (v) => (process = v))),
    h('div', { class: 'row' }, h('label', {}, '√s [GeV] (pp)'), sqrtS),
    h('div', { class: 'row' }, h('label', {}, 'Events'), nEv),
    h('div', { class: 'row' }, h('label', {}, 'Seed'), seed),
    h('div', { class: 'row' }, h('label', {}, 'Record'), select([{ value: 'compact', label: 'compact (final state + ancestry)' }, { value: 'full', label: 'full PYTHIA record' }], record, (v) => (record = v))),
    h('div', { class: 'btn-row' }, h('button', { onclick: () => void run() }, 'Generate'), h('button', { onclick: () => ac?.abort() }, 'Cancel'), h('button', { onclick: () => void refresh() }, 'Re-check backend')),
    out,
    h('div', { class: 'hint' }, `Backend: python server/pythia_server.py (pip install pythia8mc). ${pythiaWasmStatus().detail}`),
  );
}
