/**
 * Adapter: ROOT-derived columnar data → normalized reconstructed-level events.
 *
 * Input is one plain object per tree entry (branch name → number | number[]), obtained either
 *  - in the browser from a ROOT file via JSROOT (JSROOTBridge.readTreeEntries), or
 *  - from "ROOT-converted" JSON written server-side (e.g. uproot `tree.arrays().to_list()`):
 *      { "format": "lhcsim-root-columns/1", "schema": "cms-nanoaod", "provenance": {...}, "entries": [...] }
 *
 * Supported column schemas (only branches listed here are read):
 *   cms-nanoaod     — run, luminosityBlock, event, nMuon, Muon_{pt,eta,phi,mass,charge},
 *                     nElectron, Electron_{…}, nPhoton, Photon_{pt,eta,phi,mass},
 *                     nJet, Jet_{pt,eta,phi,mass}, MET_{pt,phi}, PV_{x,y,z} [cm], PV_npvs.
 *   atlas-opendata-13tev — runNumber, eventNumber, mcWeight, lep_n, lep_{pt,eta,phi,E,charge,type}
 *                     [MeV], jet_n, jet_{pt,eta,phi,E}, photon_n, photon_{pt,eta,phi,E},
 *                     met_et, met_phi [MeV].
 * Missing optional branches simply yield fewer objects; nothing is filled in.
 */
import { EventValidationError } from '../../physics/events/EventLoader';
import { NORMALIZED_SCHEMA_ID, validateNormalizedSample, type NormalizedEvent, type NormalizedSample, type Provenance, type RecoObjectKind, type RecoObjectRecord } from '../NormalizedEvent';
import type { PairKind } from '../../physics/reconstruction/InvariantMass';

export type RootSchemaId = 'cms-nanoaod' | 'atlas-opendata-13tev';
export type RootEntry = Readonly<Record<string, number | readonly number[] | undefined>>;

export const ROOT_COLUMNS_FORMAT = 'lhcsim-root-columns/1';

export interface RootColumnsFile {
  readonly format: typeof ROOT_COLUMNS_FORMAT;
  readonly schema: RootSchemaId;
  readonly provenance: Provenance;
  readonly analysisPair?: PairKind;
  readonly entries: readonly RootEntry[];
}

interface CollectionSpec {
  readonly kind: RecoObjectKind;
  readonly prefix: string;
  /** Energy-like column used when no mass column exists (ATLAS): m = √(E² − p²). */
  readonly energy?: string;
  readonly mass?: string;
  readonly charge?: string;
  /** For mixed lepton collections: column with |PDG id| (11 or 13). */
  readonly typeColumn?: string;
  readonly jetR?: number;
}

interface SchemaSpec {
  readonly branches: readonly string[];
  readonly run: string;
  readonly event: string;
  readonly lumi?: string;
  readonly weight?: string;
  /** Multiply momenta/energies by this to get GeV. */
  readonly energyScale: number;
  readonly collections: readonly CollectionSpec[];
  readonly met?: { readonly pt: string; readonly phi: string };
  readonly pv?: { readonly x: string; readonly y: string; readonly z: string; readonly lengthToM: number; readonly n?: string };
}

export const ROOT_SCHEMAS: Record<RootSchemaId, SchemaSpec> = {
  'cms-nanoaod': {
    branches: [
      'run', 'luminosityBlock', 'event',
      'Muon_pt', 'Muon_eta', 'Muon_phi', 'Muon_mass', 'Muon_charge',
      'Electron_pt', 'Electron_eta', 'Electron_phi', 'Electron_mass', 'Electron_charge',
      'Photon_pt', 'Photon_eta', 'Photon_phi', 'Photon_mass',
      'Jet_pt', 'Jet_eta', 'Jet_phi', 'Jet_mass',
      'MET_pt', 'MET_phi', 'PV_x', 'PV_y', 'PV_z', 'PV_npvs',
    ],
    run: 'run',
    event: 'event',
    lumi: 'luminosityBlock',
    energyScale: 1,
    collections: [
      { kind: 'muon', prefix: 'Muon', mass: 'Muon_mass', charge: 'Muon_charge' },
      { kind: 'electron', prefix: 'Electron', mass: 'Electron_mass', charge: 'Electron_charge' },
      { kind: 'photon', prefix: 'Photon', mass: 'Photon_mass' },
      { kind: 'jet', prefix: 'Jet', mass: 'Jet_mass', jetR: 0.4 },
    ],
    met: { pt: 'MET_pt', phi: 'MET_phi' },
    pv: { x: 'PV_x', y: 'PV_y', z: 'PV_z', lengthToM: 1e-2, n: 'PV_npvs' },
  },
  'atlas-opendata-13tev': {
    branches: [
      'runNumber', 'eventNumber', 'mcWeight',
      'lep_pt', 'lep_eta', 'lep_phi', 'lep_E', 'lep_charge', 'lep_type',
      'jet_pt', 'jet_eta', 'jet_phi', 'jet_E',
      'photon_pt', 'photon_eta', 'photon_phi', 'photon_E',
      'met_et', 'met_phi',
    ],
    run: 'runNumber',
    event: 'eventNumber',
    weight: 'mcWeight',
    energyScale: 1e-3,
    collections: [
      { kind: 'muon', prefix: 'lep', energy: 'lep_E', charge: 'lep_charge', typeColumn: 'lep_type' },
      { kind: 'photon', prefix: 'photon', energy: 'photon_E' },
      { kind: 'jet', prefix: 'jet', energy: 'jet_E', jetR: 0.4 },
    ],
    met: { pt: 'met_et', phi: 'met_phi' },
  },
};

function arr(e: RootEntry, k: string): readonly number[] {
  const v = e[k];
  return v === undefined ? [] : typeof v === 'number' ? [v] : v;
}
function scalar(e: RootEntry, k: string | undefined): number | null {
  if (!k) return null;
  const v = e[k];
  if (v === undefined) return null;
  const x = typeof v === 'number' ? v : v[0];
  return x === undefined ? null : Number(x);
}

export function entryToEvent(e: RootEntry, schema: RootSchemaId): NormalizedEvent {
  const s = ROOT_SCHEMAS[schema];
  const k = s.energyScale;
  const objects: RecoObjectRecord[] = [];
  for (const c of s.collections) {
    const pt = arr(e, `${c.prefix}_pt`), eta = arr(e, `${c.prefix}_eta`), phi = arr(e, `${c.prefix}_phi`);
    for (let i = 0; i < pt.length; i++) {
      const ptG = pt[i]! * k;
      let m = c.mass ? (arr(e, c.mass)[i] ?? 0) * k : 0;
      if (c.energy) {
        const E = (arr(e, c.energy)[i] ?? 0) * k;
        const p = ptG * Math.cosh(eta[i] ?? 0);
        m = E > p ? Math.sqrt(E * E - p * p) : 0;
      }
      let kind = c.kind;
      if (c.typeColumn) {
        const t = Math.abs(arr(e, c.typeColumn)[i] ?? 0);
        if (t !== 11 && t !== 13) continue;
        kind = t === 11 ? 'electron' : 'muon';
      }
      objects.push({
        kind,
        pt: ptG,
        eta: eta[i] ?? 0,
        phi: phi[i] ?? 0,
        m: Math.max(m, 0),
        charge: c.charge ? (arr(e, c.charge)[i] ?? 0) : 0,
        ...(c.jetR ? { attrs: { R: c.jetR } } : {}),
      });
    }
  }
  const metPt = s.met ? scalar(e, s.met.pt) : null;
  const metPhi = s.met ? scalar(e, s.met.phi) : null;
  const pvx = s.pv ? scalar(e, s.pv.x) : null;
  const run = scalar(e, s.run);
  const evn = scalar(e, s.event);
  if (evn === null) throw new EventValidationError(`ROOT entry without ${s.event}`);
  const w = scalar(e, s.weight);
  return {
    eventNumber: evn,
    run,
    lumiBlock: scalar(e, s.lumi),
    weights: [w ?? 1],
    truth: null,
    reco: {
      objects,
      met: metPt !== null && metPhi !== null ? { met: metPt * k, phi: metPhi, sumEt: null } : null,
      primaryVertex: s.pv && pvx !== null ? { x: pvx * s.pv.lengthToM, y: scalar(e, s.pv.y)! * s.pv.lengthToM, z: scalar(e, s.pv.z)! * s.pv.lengthToM } : null,
      nPrimaryVertices: s.pv?.n ? scalar(e, s.pv.n) : null,
    },
  };
}

export function rootColumnsToSample(file: RootColumnsFile): NormalizedSample {
  if (file.format !== ROOT_COLUMNS_FORMAT) throw new EventValidationError(`Unsupported ROOT-converted format ${file.format}`);
  if (!ROOT_SCHEMAS[file.schema]) throw new EventValidationError(`Unknown ROOT column schema ${file.schema}`);
  const p = file.provenance;
  const notes = [...p.processingNotes, `Converted from ROOT branches using the "${file.schema}" column schema; objects are the source's reconstructed collections.`];
  const provenance: Provenance = { ...p, processingNotes: notes };
  return validateNormalizedSample({
    schema: NORMALIZED_SCHEMA_ID,
    provenance,
    meta: {
      id: p.datasetId,
      title: p.title,
      process: p.title,
      collisionSystem: p.collisionSystem,
      sqrtSGeV: p.sqrtSGeV,
      synthetic: false,
      generator: p.generator?.name ?? (p.isSimulation ? 'unspecified simulation' : 'none (recorded collision data)'),
      description: p.title,
      seed: p.generator?.seed ?? 0,
      ...(file.analysisPair ? { analysisPair: file.analysisPair } : {}),
      notes,
    },
    events: file.entries.map((e) => entryToEvent(e, file.schema)),
  });
}
