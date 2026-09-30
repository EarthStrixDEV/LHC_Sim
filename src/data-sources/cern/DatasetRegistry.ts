/**
 * Catalog of CERN Open Data datasets the adapters know how to read. Nothing here is bundled:
 * files are fetched only on explicit user action (size shown first), converted by an
 * adapter, and registered as normalized datasets.
 *
 * Record metadata verified against opendata.cern.ch (records 545 and 700, retrieved
 * 2026-09-30). Selections are quoted from the record pages. Integrated luminosities are not
 * stated on these records and are therefore left null.
 */
import type { CollisionSystem } from '../../physics/events/EventSchema';
import type { PairKind } from '../../physics/reconstruction/InvariantMass';
import type { ExperimentId, RecoObjectKind } from '../NormalizedEvent';

export type CernFormat =
  /** CMS outreach CSV: Run, Event, then per-lepton columns suffixed 1/2 (or unsuffixed for one lepton). */
  'cms-outreach-csv';

export interface CernDatasetDescriptor {
  readonly id: string;
  readonly title: string;
  readonly experiment: ExperimentId;
  readonly recordId: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly year: number;
  readonly collisionSystem: CollisionSystem;
  readonly sqrtSGeV: number;
  readonly isSimulation: boolean;
  readonly format: CernFormat;
  /** Object kind of the lepton columns. */
  readonly lepton: Extract<RecoObjectKind, 'muon' | 'electron'>;
  readonly analysisPair: PairKind | null;
  readonly intendedMassGeV?: number;
  readonly doi: string | null;
  readonly license: string;
  readonly selection: string;
}

const CC0 = 'Creative Commons Zero v1.0 Universal (CC0-1.0)';
const R545 = 'CMS Run2011A outreach CSV (record 545): selected for education and outreach, a subset of the event information; not suitable for a full physics analysis.';

export const CERN_DATASETS: readonly CernDatasetDescriptor[] = [
  {
    id: 'cms2011-zmumu', title: 'CMS 2011 Z → μμ candidates', experiment: 'CMS', recordId: 545, fileName: 'Zmumu.csv', sizeBytes: 970_550,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: 'muon', intendedMassGeV: 91.19,
    doi: null, license: CC0, selection: 'Two muons with pT > 20 GeV and |η| < 2.1, invariant mass between 60 and 120 GeV.',
  },
  {
    id: 'cms2011-zee', title: 'CMS 2011 Z → ee candidates', experiment: 'CMS', recordId: 545, fileName: 'Zee.csv', sizeBytes: 1_445_651,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'electron', analysisPair: 'electron', intendedMassGeV: 91.19,
    doi: null, license: CC0, selection: 'Two electrons with pT > 25 GeV, invariant mass between 60 and 120 GeV.',
  },
  {
    id: 'cms2011-jpsimumu', title: 'CMS 2011 J/ψ → μμ candidates', experiment: 'CMS', recordId: 545, fileName: 'Jpsimumu.csv', sizeBytes: 2_639_302,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: 'muon', intendedMassGeV: 3.0969,
    doi: null, license: CC0, selection: 'Opposite-sign dimuons, |η| < 2.4, at least one global muon, invariant mass between 2 and 5 GeV.',
  },
  {
    id: 'cms2011-ymumu', title: 'CMS 2011 Υ → μμ candidates', experiment: 'CMS', recordId: 545, fileName: 'Ymumu.csv', sizeBytes: 2_599_212,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: 'muon', intendedMassGeV: 9.46,
    doi: null, license: CC0, selection: 'Opposite-sign dimuons selected around the Υ mass region (see record 545).',
  },
  {
    id: 'cms2011-wmunu', title: 'CMS 2011 W → μν candidates', experiment: 'CMS', recordId: 545, fileName: 'Wmunu.csv', sizeBytes: 7_969_331,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: null,
    doi: null, license: CC0, selection: 'Exactly one global muon with pT > 25 GeV and |η| < 2.1; includes MET.',
  },
  {
    id: 'cms2011-wenu', title: 'CMS 2011 W → eν candidates', experiment: 'CMS', recordId: 545, fileName: 'Wenu.csv', sizeBytes: 9_992_209,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'electron', analysisPair: null,
    doi: null, license: CC0, selection: 'One electron with pT > 25 GeV; events with a second electron of pT > 20 GeV rejected; includes MET.',
  },
  {
    id: 'cms2011-dimuon', title: 'CMS 2011 dimuon spectrum (DoubleMu)', experiment: 'CMS', recordId: 545, fileName: 'Dimuon_DoubleMu.csv', sizeBytes: 13_935_840,
    year: 2011, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: 'muon',
    doi: null, license: CC0, selection: 'Opposite-sign dimuons, |η| < 2.4, at least one global muon, invariant mass between 0.3 and 300 GeV.',
  },
  {
    id: 'cms2010-dimuon', title: 'CMS 2010 dimuon events (Run2010B Mu, 10k subset)', experiment: 'CMS', recordId: 700, fileName: 'MuRun2010B_0.csv', sizeBytes: 1_515_458,
    year: 2010, collisionSystem: 'pp', sqrtSGeV: 7000, isSimulation: false, format: 'cms-outreach-csv', lepton: 'muon', analysisPair: 'muon',
    doi: '10.7483/OPENDATA.CMS.CB8H.MFFA', license: CC0, selection: 'Exactly two muons with invariant mass between 2 and 110 GeV, at least one a global muon (charges not required opposite).',
  },
];

export function cernDataset(id: string): CernDatasetDescriptor | undefined {
  return CERN_DATASETS.find((d) => d.id === id);
}

export function recordUrl(d: CernDatasetDescriptor): string {
  return `https://opendata.cern.ch/record/${d.recordId}`;
}

/** Public file URL on the portal. */
export function fileUrl(d: CernDatasetDescriptor): string {
  return `${recordUrl(d)}/files/${d.fileName}`;
}

export function recordNote(d: CernDatasetDescriptor): string {
  return d.recordId === 545 ? R545 : 'CMS Run2010B dimuon outreach CSV (record 700).';
}
