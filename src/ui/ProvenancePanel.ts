/**
 * Provenance + data-level display. Every event view shows where the data came from and
 * whether it is simulated truth, simulated reconstruction or recorded collision data.
 */
import { DATA_LEVEL_LABEL, dataLevelsOf, type DataLevel, type NormalizedEvent, type Provenance, type SourceType } from '../data-sources/NormalizedEvent';
import { h, kvTable } from './dom';

const LEVEL_CLASS: Record<DataLevel, string> = {
  SIMULATED_TRUTH: 'lvl-truth',
  SIMULATED_RECONSTRUCTION: 'lvl-simreco',
  RECORDED_COLLISION_DATA: 'lvl-data',
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  CURATED: 'Curated (toy generator)',
  PYTHIA: 'PYTHIA 8',
  CERN_OPEN_DATA: 'CERN Open Data',
  ROOT_CONVERTED: 'ROOT-converted',
  HEPMC_LIKE: 'HepMC-like import',
};

export function dataLevelChip(level: DataLevel): HTMLElement {
  return h('span', { class: `chip lvl ${LEVEL_CLASS[level]}` }, DATA_LEVEL_LABEL[level]);
}

/** One-line banner summarizing provenance, used above event details. */
export function provenanceBanner(p: Provenance, ev: NormalizedEvent | null): HTMLElement {
  const levels = ev ? dataLevelsOf(p, ev) : [];
  const warning =
    p.sourceType === 'CURATED'
      ? 'SYNTHETIC / CURATED SAMPLE — toy generator, not PYTHIA/Geant4 or real data'
      : !p.isSimulation
        ? 'RECORDED COLLISION DATA — reconstructed objects from a real experiment; no generator truth exists'
        : null;
  return h(
    'div',
    { class: 'provenance' },
    h('div', { class: 'prov-chips' }, h('span', { class: 'chip prov-src' }, SOURCE_LABEL[p.sourceType]), ...levels.map(dataLevelChip)),
    warning ? h('div', { class: p.isSimulation ? 'synthetic' : 'recorded' }, warning) : null,
  );
}

export function provenanceTable(p: Provenance): HTMLElement {
  const rows: [string, string][] = [
    ['Dataset', `${p.title} (${p.datasetId})`],
    ['Type', p.isSimulation ? 'simulation' : 'recorded collision data'],
    ['Experiment', p.experiment ?? '—'],
    ['Year', p.year !== null ? String(p.year) : '—'],
    ['Collision system', `${p.collisionSystem}, ${p.collisionSystem === 'pp' ? '√s' : '√s_NN'} = ${(p.sqrtSGeV / 1000).toFixed(2)} TeV`],
    ['Integrated luminosity', p.integratedLuminosityInvPb !== null ? `${p.integratedLuminosityInvPb} pb⁻¹ (parent dataset)` : '—'],
  ];
  if (p.generator) {
    const g = p.generator;
    rows.push(['Generator', [g.name, g.version, g.tune ? `tune ${g.tune}` : null].filter(Boolean).join(' · ')]);
    if (g.process) rows.push(['Process', g.process]);
    if (g.seed !== null) rows.push(['Seed', String(g.seed)]);
  }
  rows.push(['Source', p.source.name], ['License', p.source.license]);
  if (p.source.doi) rows.push(['DOI', p.source.doi]);
  const link = p.source.url ? h('a', { href: p.source.url, target: '_blank', rel: 'noopener' }, p.source.url) : null;
  return h(
    'details',
    {},
    h('summary', {}, 'Provenance & processing notes'),
    kvTable(rows),
    link ? h('div', { class: 'hint' }, 'Record: ', link) : null,
    h('ul', {}, ...p.processingNotes.map((n) => h('li', {}, n))),
  );
}
