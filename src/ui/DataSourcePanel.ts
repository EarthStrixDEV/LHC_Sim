/**
 * Data sources: CERN Open Data catalog (download on explicit request only), preprocessed
 * datasets, and local file import (normalized/ROOT-converted JSON, CMS CSV, HepMC3, ROOT).
 * The panel only collects user intent; adapters do the conversion, the controller registers.
 */
import type { SimulationController } from '../app/SimulationController';
import { CERN_DATASETS, fileUrl, recordUrl, type CernDatasetDescriptor } from '../data-sources/cern/DatasetRegistry';
import { DEFAULT_MAX_EVENTS, fetchCernCsv } from '../data-sources/cern/CERNOpenDataAdapter';
import { importFile, importJsonText, importKindOf, needsDeclaration, type DeclaredOrigin } from '../data-sources/ImportService';
import type { ExperimentId } from '../data-sources/NormalizedEvent';
import { h, section, select } from './dom';

interface PreprocessedEntry { id: string; title: string; file: string; events: number }

export class DataSourcePanel {
  readonly el = h('div', { class: 'panel-body' });
  private readonly status = h('div', { class: 'hint' });
  private readonly maxInput = h('input', { type: 'number', min: 10, max: 100000, step: 100, value: DEFAULT_MAX_EVENTS }) as HTMLInputElement;
  private readonly preprocessed = h('div');
  private abort: AbortController | null = null;

  constructor(private readonly c: SimulationController, extraSections: HTMLElement[] = []) {
    this.el.append(
      ...extraSections,
      section(
        'CERN Open Data (CMS outreach CSV)',
        h('div', { class: 'hint' }, 'Recorded 7 TeV pp collisions, CC0. Files are downloaded only when you press Download; conversion stops after the event cap. Requires the dev-server proxy (opendata.cern.ch has no CORS) — or use npm run fetch:cern.'),
        h('div', { class: 'row' }, h('label', {}, 'Max events'), this.maxInput),
        this.catalog(),
        this.status,
      ),
      section('Preprocessed datasets (public/datasets)', this.preprocessed),
      section('Import local file', this.importer()),
    );
    void this.loadPreprocessedIndex();
  }

  private get maxEvents(): number {
    const v = Math.floor(Number(this.maxInput.value));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 100_000) : DEFAULT_MAX_EVENTS;
  }

  private catalog(): HTMLElement {
    const t = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Dataset'), h('th', {}, 'File'), h('th', {}, '')));
    for (const d of CERN_DATASETS) {
      t.append(
        h(
          'tr',
          {},
          h('td', { title: d.selection }, d.title, h('br'), h('a', { href: recordUrl(d), target: '_blank', rel: 'noopener', class: 'tree-meta' }, `record ${d.recordId}`)),
          h('td', { class: 'tree-meta' }, `${d.fileName}`, h('br'), `${(d.sizeBytes / 1e6).toFixed(1)} MB max`),
          h('td', {}, h('button', { onclick: () => void this.download(d) }, 'Download')),
        ),
      );
    }
    return t;
  }

  private async download(d: CernDatasetDescriptor): Promise<void> {
    this.abort?.abort();
    const ac = new AbortController();
    this.abort = ac;
    const cancel = h('button', { onclick: () => ac.abort() }, 'Cancel');
    const msg = h('span', {}, `Downloading ${fileUrl(d)} …`);
    this.status.replaceChildren(msg, ' ', cancel);
    try {
      const conv = await fetchCernCsv(d, { maxEvents: this.maxEvents, signal: ac.signal, onProgress: (b) => (msg.textContent = `Downloading ${d.fileName}: ${(b / 1e6).toFixed(2)} MB`) });
      await this.c.registerDataset(conv.sample);
      this.status.textContent = `Loaded ${conv.sample.events.length} recorded events from ${d.fileName}${conv.truncated ? ' (capped)' : ''}. Open the Event scene in ANALYSIS mode.`;
    } catch (e) {
      this.status.textContent = ac.signal.aborted ? 'Download cancelled.' : `Failed: ${(e as Error).message}`;
    } finally {
      if (this.abort === ac) this.abort = null;
    }
  }

  private async loadPreprocessedIndex(): Promise<void> {
    let list: PreprocessedEntry[] = [];
    try {
      const r = await fetch('/datasets/index.json');
      if (r.ok && r.headers.get('content-type')?.includes('json')) list = (await r.json()) as PreprocessedEntry[];
    } catch {
      /* no preprocessed datasets */
    }
    if (list.length === 0) {
      this.preprocessed.replaceChildren(h('div', { class: 'hint' }, 'None. Create with: npm run fetch:cern -- <dataset-id> (see --list).'));
      return;
    }
    this.preprocessed.replaceChildren(
      ...list.map((e) =>
        h('div', { class: 'row' }, h('label', {}, `${e.title} (${e.events} ev.)`), h('button', { onclick: () => void this.openPreprocessed(e) }, 'Open')),
      ),
    );
  }

  private async openPreprocessed(e: PreprocessedEntry): Promise<void> {
    try {
      const text = await (await fetch(`/datasets/${e.file}`)).text();
      await this.c.registerDataset(importJsonText(text, e.file, this.maxEvents));
      this.status.textContent = `Opened preprocessed dataset ${e.title}.`;
    } catch (err) {
      this.status.textContent = `Failed: ${(err as Error).message}`;
    }
  }

  private importer(): HTMLElement {
    const file = h('input', { type: 'file', accept: '.json,.csv,.hepmc,.hepmc3,.root' }) as HTMLInputElement;
    let origin: 'simulation' | 'data' = 'simulation';
    let experiment: ExperimentId | 'none' = 'none';
    const sqrtS = h('input', { type: 'number', value: 13600, min: 100, step: 100 }) as HTMLInputElement;
    const year = h('input', { type: 'number', value: '', placeholder: 'optional' }) as HTMLInputElement;
    const license = h('input', { type: 'text', value: '', placeholder: 'required for ROOT / HepMC' }) as HTMLInputElement;
    const declare = h(
      'div',
      { class: 'declare' },
      h('div', { class: 'row' }, h('label', {}, 'Content is'), select([{ value: 'simulation', label: 'simulation' }, { value: 'data', label: 'recorded collision data' }], origin, (v) => (origin = v))),
      h('div', { class: 'row' }, h('label', {}, 'Experiment'), select([{ value: 'none', label: '—' }, { value: 'ATLAS', label: 'ATLAS' }, { value: 'CMS', label: 'CMS' }, { value: 'ALICE', label: 'ALICE' }, { value: 'LHCb', label: 'LHCb' }], experiment, (v) => (experiment = v))),
      h('div', { class: 'row' }, h('label', {}, '√s [GeV] (pp)'), sqrtS),
      h('div', { class: 'row' }, h('label', {}, 'Year'), year),
      h('div', { class: 'row' }, h('label', {}, 'License / terms'), license),
    );
    const out = h('div', { class: 'hint' });
    const refresh = () => {
      const k = file.files?.[0] ? importKindOf(file.files[0].name) : null;
      declare.style.display = k && needsDeclaration(k) ? '' : 'none';
    };
    file.addEventListener('change', refresh);
    refresh();
    const go = async () => {
      const f = file.files?.[0];
      if (!f) return;
      const kind = importKindOf(f.name);
      if (kind && needsDeclaration(kind) && !license.value.trim()) {
        out.textContent = 'Please state the license / terms of use of this file.';
        return;
      }
      const declared: DeclaredOrigin = {
        isSimulation: origin === 'simulation',
        experiment: experiment === 'none' ? null : experiment,
        collisionSystem: 'pp',
        sqrtSGeV: Number(sqrtS.value) || 13600,
        year: year.value ? Number(year.value) : null,
        license: license.value.trim() || 'unspecified',
      };
      out.textContent = `Reading ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`;
      try {
        const sample = await importFile(f, { maxEvents: this.maxEvents, declared });
        await this.c.registerDataset(sample);
        out.textContent = `Imported ${sample.events.length} events from ${f.name}.`;
      } catch (e) {
        out.textContent = `Import failed: ${(e as Error).message}`;
      }
    };
    return h(
      'div',
      {},
      h('div', { class: 'hint' }, 'Accepted: lhcsim normalized JSON, ROOT-converted JSON (lhcsim-root-columns/1), CMS outreach CSV, HepMC3 ASCII, ROOT files (CMS NanoAOD "Events" or ATLAS 13 TeV Open Data "mini" trees via JSROOT). Only the event cap is read.'),
      file,
      declare,
      h('div', { class: 'btn-row' }, h('button', { onclick: () => void go() }, 'Import')),
      out,
    );
  }
}
