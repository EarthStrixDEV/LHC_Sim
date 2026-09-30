/**
 * Event Inspector: sample/event navigation, truth-particle table, selected-particle
 * details with parent/children links, a simple decay tree and reconstructed objects.
 */
import type { SimulationController } from '../app/SimulationController';
import type { SimulationState } from '../app/SimulationState';
import type { TruthEvent } from '../physics/events/Event';
import { listDatasets, onRegistryChange } from '../data-sources/DataSourceRegistry';
import type { TruthParticle } from '../physics/events/Particle';
import type { DetectorId, FieldModel } from '../physics/EventProcessor';
import type { RecoBase } from '../physics/reconstruction/ReconstructedObject';
import { h, kvTable, section, select } from './dom';
import { provenanceBanner, provenanceTable, SOURCE_LABEL } from './ProvenancePanel';

const MAX_TABLE_ROWS = 40;
const MAX_TREE_NODES = 120;

export class EventInspector {
  readonly el = h('div', { class: 'panel-body' });
  private readonly header = h('div');
  private readonly details = h('div');
  private readonly reco = h('div');
  private readonly table = h('div');
  private readonly tree = h('div', { class: 'tree' });
  private readonly sampleSel: HTMLSelectElement;
  private readonly detSel: HTMLSelectElement;
  private readonly fieldSel: HTMLSelectElement;
  private truth: TruthEvent | null = null;
  private renderGen = 0;

  constructor(private readonly c: SimulationController) {
    const e = c.state.event;
    this.sampleSel = select(datasetOptions(), e.sampleId, (v) => void c.loadEvent(v, 0));
    onRegistryChange(() => {
      const cur = this.sampleSel.value;
      this.sampleSel.replaceChildren(...datasetOptions().map((o) => h('option', { value: o.value }, o.label)));
      this.sampleSel.value = this.c.state.event.sampleId || cur;
    });
    this.detSel = select(
      [
        { value: 'atlas', label: 'ATLAS (regional field)' },
        { value: 'cms', label: 'CMS (3.8 T, detailed model)' },
        { value: 'alice', label: 'ALICE (0.5 T, heavy-ion, PID)' },
        { value: 'lhcb', label: 'LHCb (forward, dipole, RICH)' },
      ],
      e.detectorId,
      (v) => c.setDetector(v as DetectorId),
    );
    this.fieldSel = select(
      [
        { value: 'fieldmap', label: 'Field map (interpolated solenoid map, RK45)' },
        { value: 'regional', label: 'Regional analytic (Phase 1, RK4)' },
      ],
      e.fieldModel,
      (v) => c.setFieldModel(v as FieldModel),
    );
    const nav = h(
      'div',
      { class: 'btn-row' },
      h('button', { onclick: () => c.nextEvent(-1) }, '◀ Prev'),
      h('button', { onclick: () => c.nextEvent(1) }, 'Next ▶'),
      h('button', { onclick: () => c.replay() }, '↻ Replay'),
      h('button', { onclick: () => c.selectParticle(null) }, 'Clear selection'),
    );
    this.el.append(
      section(
        'Event sample',
        h('div', { class: 'row' }, h('label', {}, 'Dataset'), this.sampleSel),
        h('div', { class: 'row' }, h('label', {}, 'Detector / field'), this.detSel),
        h('div', { class: 'row' }, h('label', {}, 'Field model'), this.fieldSel), nav, this.header),
      section('Selected object', this.details),
      section('Reconstructed objects', this.reco),
      section('Decay tree (truth)', this.tree),
      section('Final-state particles (truth, by pT)', this.table),
    );
    void this.render(c.state);
    c.store.subscribe((s, p) => {
      if (s.event !== p.event) void this.render(s);
    });
  }

  private async render(s: SimulationState): Promise<void> {
    const gen = ++this.renderGen;
    const e = s.event;
    this.sampleSel.value = e.sampleId;
    this.detSel.value = e.detectorId;
    this.fieldSel.value = e.fieldModel;
    if (!e.meta) {
      this.header.replaceChildren(h('div', { class: 'hint' }, 'No event loaded — open the Event scene or pick a sample.'));
      return;
    }
    const ds = await this.c.currentDataset();
    this.truth = await this.c.truthEvent();
    if (gen !== this.renderGen || !ds || !e.provenance) return;
    const nev = ds.event(e.index);
    const ev = this.truth;
    const idRow: [string, string] = nev.run !== null ? ['Run / event', `${nev.run} / ${nev.eventNumber}${nev.lumiBlock !== null ? ` (lumi block ${nev.lumiBlock})` : ''}`] : ['Event', ev ? `${e.index} of ${e.datasetSize} (seed ${ev.seed})` : `${e.index} of ${e.datasetSize}`];
    this.header.replaceChildren(
      provenanceBanner(e.provenance, nev),
      kvTable([
        ['Process', ev?.process ?? e.meta.process],
        idRow,
        ['System', `${e.meta.collisionSystem}, ${e.meta.collisionSystem === 'pp' ? '√s' : '√s_NN'} = ${(e.meta.sqrtSGeV / 1000).toFixed(2)} TeV`],
        ev ? ['Particles / vertices', `${ev.particles.length} / ${ev.vertices.size}`] : ['Truth record', 'not available in this dataset (none is manufactured)'],
        ...(nev.weights.length > 1 || nev.weights[0] !== 1 ? [['Weights', nev.weights.map((w) => w.toPrecision(4)).join(', ')] as [string, string]] : []),
        ['Status', e.loading ? 'processing…' : e.error ? `error: ${e.error}` : 'ready'],
      ]),
      provenanceTable(e.provenance),
    );
    this.renderReco(s);
    if (ev) {
      this.renderDetails(s, ev);
      this.renderTree(s, ev);
      this.renderTable(s, ev);
    } else {
      const none = () => h('div', { class: 'hint' }, 'No generator truth in this dataset. Select reconstructed objects above.');
      this.details.replaceChildren(none());
      this.tree.replaceChildren(none());
      this.table.replaceChildren(none());
    }
  }

  private link(p: TruthParticle): HTMLElement {
    return h('a', { href: '#', class: 'plink', onclick: (ev: Event) => { ev.preventDefault(); this.c.selectParticle(p.id); } }, `${p.symbol} #${p.id}`);
  }

  private renderDetails(s: SimulationState, ev: TruthEvent): void {
    const id = s.event.selectedParticleId;
    const p = id !== null ? ev.particle(id) : undefined;
    if (!p) {
      this.details.replaceChildren(h('div', { class: 'hint' }, 'Click a trajectory in the 3D view or a row below.'));
      return;
    }
    const v = ev.vertices.get(p.productionVertex);
    const dv = p.decayVertex !== null ? ev.vertices.get(p.decayVertex) : undefined;
    const statusText: Record<number, string> = { 1: 'final state', 2: 'decayed / fragmented', 3: 'hard process', 4: 'beam' };
    this.details.replaceChildren(
      h('div', { class: 'sel-title' }, `${p.symbol}  ${p.name}`),
      kvTable([
        ['PDG ID', String(p.pdgId)],
        ['Charge', `${p.charge > 0 ? '+' : ''}${Number.isInteger(p.charge) ? p.charge : p.charge.toFixed(2)}`],
        ['pT', `${p.pt.toFixed(2)} GeV`],
        ['η', Math.abs(p.eta) > 50 ? 'beam axis' : p.eta.toFixed(3)],
        ['φ', p.phi.toFixed(3)],
        ['Energy', `${p.p4.e.toFixed(2)} GeV`],
        ['(px, py, pz)', `(${p.p4.px.toFixed(2)}, ${p.p4.py.toFixed(2)}, ${p.p4.pz.toFixed(2)}) GeV`],
        ['Mass', `${p.mass.toFixed(4)} GeV`],
        ['Status', statusText[p.status] ?? String(p.status)],
        ['Vertex', v ? `${v.kind} #${v.id} at (${(v.x * 1e3).toFixed(2)}, ${(v.y * 1e3).toFixed(2)}, ${(v.z * 1e3).toFixed(1)}) mm` : '—'],
        ['Decay vertex', dv ? `${dv.kind} #${dv.id}, r = ${(Math.hypot(dv.x, dv.y) * 1e3).toFixed(2)} mm` : '—'],
      ]),
      h('div', { class: 'links' }, h('b', {}, 'Parents: '), ...(ev.parentsOf(p.id).map((x) => this.link(x)) as Node[]), ev.parentsOf(p.id).length ? '' : 'none'),
      h('div', { class: 'links' }, h('b', {}, 'Children: '), ...(ev.childrenOf(p.id).slice(0, 30).map((x) => this.link(x)) as Node[]), ev.childrenOf(p.id).length ? '' : 'none'),
    );
  }

  private renderReco(s: SimulationState): void {
    const pe = s.event.processed;
    if (!pe) {
      this.reco.replaceChildren(h('div', { class: 'hint' }, s.event.loading ? 'Reconstructing…' : '—'));
      return;
    }
    const r = pe.reco;
    const line = (o: RecoBase, name: string) =>
      h('tr', { class: o.id === s.event.selectedRecoId ? 'sel' : '', onclick: () => this.c.selectReco(o.id) }, h('td', {}, name), h('td', {}, o.pt.toFixed(1)), h('td', {}, o.eta.toFixed(2)), h('td', {}, o.phi.toFixed(2)));
    const t = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Object'), h('th', {}, 'pT [GeV]'), h('th', {}, 'η'), h('th', {}, 'φ')));
    for (const m of r.muons) t.append(line(m, `μ${m.charge > 0 ? '⁺' : '⁻'}`));
    for (const e of r.electrons) t.append(line(e, `e${e.charge > 0 ? '⁺' : '⁻'}`));
    for (const g of r.photons) t.append(line(g, 'γ'));
    for (const j of r.jets.slice(0, 10)) t.append(line(j, `jet (R=${j.radius})`));
    const pair = s.event.pair;
    const sys = s.event.meta?.collisionSystem;
    this.reco.replaceChildren(
      t,
      kvTable([
        ['E_T^miss', r.met.unavailable ? 'not provided by the source' : sys === 'pp' ? `${r.met.met.toFixed(1)} GeV at φ = ${r.met.phi.toFixed(2)} (inferred imbalance)` : 'not meaningful for this heavy-ion display'],
        ['Reconstructed tracks', String(r.tracks.length)],
        [
          'Invariant mass',
          pair ? `m(${pair.kind === 'muon' ? 'μμ' : pair.kind === 'electron' ? 'ee' : 'γγ'}) = ${pair.mass.toFixed(2)} GeV  from (P₁+P₂)²` : 'no candidate pair in this event',
        ],
        ['Timing', `propagation ${pe.timings.propagationMs.toFixed(1)} ms · response ${pe.timings.responseMs.toFixed(1)} ms · reco ${pe.timings.recoMs.toFixed(1)} ms`],
      ]),
      h(
        'div',
        { class: 'hint' },
        pe.recoProducer === 'source'
          ? 'Reconstructed objects exactly as provided by the data source. Drawn trajectories are helices computed from their reconstructed momenta in the lhcsim field model.'
          : 'Simplified lhcsim reconstruction: truth-seeded tracks with resolution smearing, sliding-window EM clusters, anti-kT R=0.4 jets, track soft-term MET.',
      ),
    );
  }

  private renderTree(s: SimulationState, ev: TruthEvent): void {
    let count = 0;
    const sel = s.event.selectedParticleId;
    const node = (p: TruthParticle, depth: number): HTMLElement | null => {
      if (count++ > MAX_TREE_NODES) return null;
      const kids = ev.childrenOf(p.id);
      const li = h('li', { class: p.id === sel ? 'sel' : '' }, this.link(p), h('span', { class: 'tree-meta' }, ` pT ${p.pt.toFixed(1)}`));
      if (kids.length && depth < 6) {
        const ul = h('ul');
        const shown = kids.length > 12 ? kids.slice(0, 8) : kids;
        for (const k of shown) {
          const n = node(k, depth + 1);
          if (n) ul.append(n);
        }
        if (shown.length < kids.length) ul.append(h('li', { class: 'tree-meta' }, `… ${kids.length - shown.length} more`));
        li.append(ul);
      }
      return li;
    };
    // Roots: the hard-process chain below the beams (skip UE/pile-up roots).
    const beams = ev.particles.filter((p) => p.status === 4);
    const roots = beams.flatMap((b) => ev.childrenOf(b.id)).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
    const ul = h('ul');
    for (const r of roots.slice(0, 6)) {
      const n = node(r, 0);
      if (n) ul.append(n);
    }
    this.tree.replaceChildren(roots.length ? ul : h('div', { class: 'hint' }, 'No hard-process record.'));
  }

  private renderTable(s: SimulationState, ev: TruthEvent): void {
    const finals = ev.finalState().sort((a, b) => b.pt - a.pt).slice(0, MAX_TABLE_ROWS);
    const t = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Particle'), h('th', {}, 'pT'), h('th', {}, 'η'), h('th', {}, 'φ'), h('th', {}, 'origin')));
    for (const p of finals) {
      t.append(
        h('tr', { class: p.id === s.event.selectedParticleId ? 'sel' : '', onclick: () => this.c.selectParticle(p.id) }, h('td', {}, `${p.symbol}`), h('td', {}, p.pt.toFixed(2)), h('td', {}, Math.abs(p.eta) > 50 ? '∞' : p.eta.toFixed(2)), h('td', {}, p.phi.toFixed(2)), h('td', {}, p.origin)),
      );
    }
    this.table.replaceChildren(t, h('div', { class: 'hint' }, `Showing ${finals.length} of ${ev.finalState().length} final-state particles.`));
  }
}

function datasetOptions(): { value: string; label: string }[] {
  return listDatasets().map((d) => ({ value: d.id, label: `[${SOURCE_LABEL[d.sourceType]}] ${d.label}` }));
}
