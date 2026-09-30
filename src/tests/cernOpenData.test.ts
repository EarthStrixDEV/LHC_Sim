import { describe, expect, it } from 'vitest';
import { parseCmsOutreachCsv } from '../data-sources/cern/CERNOpenDataAdapter';
import { cernDataset } from '../data-sources/cern/DatasetRegistry';
import { importCsvText, importJsonText } from '../data-sources/ImportService';
import { NormalizedDataset } from '../data-sources/NormalizedDataset';
import { entryToEvent, ROOT_COLUMNS_FORMAT, rootColumnsToSample } from '../data-sources/root/ROOTAdapter';
import { processDatasetEvent } from '../physics/EventProcessor';
import { selectPair } from '../physics/reconstruction/InvariantMass';
import { MUON_MASS_GEV } from '../physics/constants/physicalConstants';

// Header + first data row of each file, copied verbatim from opendata.cern.ch (CC0).
const ZMUMU = `Run,Event,pt1,eta1,phi1,Q1,dxy1,iso1,pt2,eta2,phi2,Q2,dxy2,iso2
165617,74969122,54.7055,-0.4324,2.5742,1,-0.0745,0.4999,34.2464,-0.9885,-0.4987,-1,0.0712,3.4221`;
const ZEE = `Run,Event,pt1,eta1,phi1,Q1,type1,sigmaEtaEta1,HoverE1,isoTrack1,isoEcal1,isoHcal1,pt2,eta2,phi2,Q2,type2,sigmaEtaEta2,HoverE2,isoTrack2,isoEcal2,isoHcal2
163286,109060857,37.5667,2.2892,2.0526,-1,EE,0.0251,0.0090,0.0000,0.5329,0.6423,45.4315,1.4706,-1.1630,1,EB,0.0008,0.0000,0.0000,1.0190,0.0000`;
const WMUNU = `Run,Event,pt,eta,phi,Q,chiSq,dxy,iso,MET,phiMET
173389,489963747,29.3153,-0.1393,1.3561,1,0.8456,-0.0600,0.0000,30.6670,-2.1308`;
const MU2010 = `Run,Event,Type1,E1,px1 ,py1,pz1,pt1,eta1,phi1,Q1,Type2,E2,px2,py2,pz2,pt2,eta2,phi2,Q2,M
146436,90830792,G,19.1712,3.81713,9.04323,-16.4673,9.81583,-1.28942,1.17139,1,T,5.43984,-0.362592,2.62699,-4.74849,2.65189,-1.34587,1.70796,1,2.73205`;

describe('CERN Open Data — CMS outreach CSV adapter', () => {
  it('converts dimuon rows into recorded, truth-free normalized events with provenance', () => {
    const { sample } = parseCmsOutreachCsv(ZMUMU, cernDataset('cms2011-zmumu')!);
    expect(sample.provenance.sourceType).toBe('CERN_OPEN_DATA');
    expect(sample.provenance.isSimulation).toBe(false);
    expect(sample.provenance.experiment).toBe('CMS');
    expect(sample.provenance.source.license).toContain('CC0');
    expect(sample.provenance.source.url).toBe('https://opendata.cern.ch/record/545');
    const ev = sample.events[0]!;
    expect(ev.truth).toBeNull();
    expect(ev.run).toBe(165617);
    expect(ev.eventNumber).toBe(74969122);
    expect(ev.reco!.objects).toHaveLength(2);
    expect(ev.reco!.objects[0]).toMatchObject({ kind: 'muon', pt: 54.7055, charge: 1, attrs: { dxy: -0.0745, iso: 0.4999 } });
    expect(ev.reco!.met).toBeNull();
  });

  it('reproduces the dimuon mass published in the file (record 700 column M)', () => {
    const { sample } = parseCmsOutreachCsv(MU2010, cernDataset('cms2010-dimuon')!);
    const o = sample.events[0]!.reco!.objects;
    expect(o[0]!.attrs).toMatchObject({ isGlobalMuon: 1, E: 19.1712, px: 3.81713 });
    expect(o[1]!.attrs).toMatchObject({ isGlobalMuon: 0 });
    const pe = processDatasetEvent(new NormalizedDataset(sample), 0, 'cms');
    // Same-sign pair in this row: select without charge requirement by recomputing directly.
    const p = (x: (typeof o)[number]) => {
      const px = x.pt * Math.cos(x.phi), py = x.pt * Math.sin(x.phi), pz = x.pt * Math.sinh(x.eta);
      return [Math.sqrt(px * px + py * py + pz * pz + MUON_MASS_GEV ** 2), px, py, pz];
    };
    const a = p(o[0]!), b = p(o[1]!);
    const m = Math.sqrt((a[0]! + b[0]!) ** 2 - (a[1]! + b[1]!) ** 2 - (a[2]! + b[2]!) ** 2 - (a[3]! + b[3]!) ** 2);
    expect(m).toBeCloseTo(2.73205, 3);
    expect(pe.reco.muons).toHaveLength(2);
  });

  it('maps electron categories and single-lepton + MET files', () => {
    const zee = parseCmsOutreachCsv(ZEE, cernDataset('cms2011-zee')!).sample;
    const e = zee.events[0]!.reco!.objects;
    expect(e[0]).toMatchObject({ kind: 'electron', charge: -1, attrs: { isEndcap: 1, sigmaEtaEta: 0.0251 } });
    expect(e[1]!.attrs).toMatchObject({ isEndcap: 0 });
    const pair = selectPair(processDatasetEvent(new NormalizedDataset(zee), 0, 'cms').reco, 'electron');
    expect(pair!.mass).toBeGreaterThan(60);
    expect(pair!.mass).toBeLessThan(120);

    const w = parseCmsOutreachCsv(WMUNU, cernDataset('cms2011-wmunu')!).sample;
    expect(w.events[0]!.reco!.objects).toHaveLength(1);
    expect(w.events[0]!.reco!.met).toEqual({ met: 30.667, phi: -2.1308, sumEt: null });
    const pe = processDatasetEvent(new NormalizedDataset(w), 0, 'cms');
    expect(pe.reco.met.unavailable).toBeUndefined();
    expect(pe.reco.met.met).toBeCloseTo(30.667, 6);
  });

  it('honours the event cap, drops partial trailing lines and rejects foreign CSVs', () => {
    const body = ZMUMU.split('\n')[1]!;
    const text = [ZMUMU.split('\n')[0], body, body, body, body.slice(0, 20)].join('\n');
    const capped = parseCmsOutreachCsv(text, cernDataset('cms2011-zmumu')!, 2);
    expect(capped.sample.events).toHaveLength(2);
    expect(capped.truncated).toBe(true);
    const partial = parseCmsOutreachCsv(text, cernDataset('cms2011-zmumu')!, 100, false);
    expect(partial.sample.events).toHaveLength(3);
    expect(() => parseCmsOutreachCsv('a,b\n1,2', cernDataset('cms2011-zmumu')!)).toThrow(/Run\/Event/);
    expect(() => importCsvText(ZMUMU, 'mystery.csv', 10)).toThrow(/unknown CSV/);
    expect(importCsvText(ZMUMU, 'Zmumu.csv', 10).provenance.datasetId).toBe('cms2011-zmumu');
  });

  it('round-trips through preprocessed normalized JSON unchanged', () => {
    const { sample } = parseCmsOutreachCsv(ZMUMU, cernDataset('cms2011-zmumu')!);
    const back = importJsonText(JSON.stringify(sample), 'x.json', 100);
    expect(back).toEqual(sample);
  });
});

describe('ROOT-converted columns', () => {
  it('converts CMS NanoAOD branches (GeV, cm)', () => {
    const ev = entryToEvent(
      { run: 1, luminosityBlock: 5, event: 99, Muon_pt: [40, 30], Muon_eta: [0.1, -0.4], Muon_phi: [1, -2], Muon_mass: [0.1057, 0.1057], Muon_charge: [1, -1], Jet_pt: [55], Jet_eta: [2], Jet_phi: [0], Jet_mass: [8], MET_pt: 12, MET_phi: 0.5, PV_x: 0.01, PV_y: -0.02, PV_z: 3, PV_npvs: 17 },
      'cms-nanoaod',
    );
    expect(ev.lumiBlock).toBe(5);
    expect(ev.reco!.objects.map((o) => o.kind)).toEqual(['muon', 'muon', 'jet']);
    expect(ev.reco!.primaryVertex!.z).toBeCloseTo(0.03, 12);
    expect(ev.reco!.nPrimaryVertices).toBe(17);
    expect(ev.reco!.met).toEqual({ met: 12, phi: 0.5, sumEt: null });
  });

  it('converts ATLAS 13 TeV Open Data branches (MeV → GeV, mixed lepton flavours)', () => {
    const ev = entryToEvent(
      { runNumber: 284500, eventNumber: 7, mcWeight: 0.8, lep_pt: [45000, 40000, 20000], lep_eta: [0, 0.5, 1], lep_phi: [0, 3, 1], lep_E: [45000, 45140, 30862], lep_charge: [1, -1, 1], lep_type: [11, 11, 15], met_et: 20000, met_phi: 1 },
      'atlas-opendata-13tev',
    );
    expect(ev.weights).toEqual([0.8]);
    const leps = ev.reco!.objects;
    expect(leps).toHaveLength(2); // lep_type 15 is not a supported lepton → skipped
    expect(leps.every((o) => o.kind === 'electron')).toBe(true);
    expect(leps[0]!.pt).toBeCloseTo(45, 12);
    expect(ev.reco!.met!.met).toBeCloseTo(20, 12);
  });

  it('keeps the declared provenance and never adds truth', () => {
    const s = rootColumnsToSample({
      format: ROOT_COLUMNS_FORMAT,
      schema: 'cms-nanoaod',
      provenance: {
        sourceType: 'ROOT_CONVERTED', isSimulation: false, experiment: 'CMS', datasetId: 'root-test', title: 'root test', year: 2012,
        collisionSystem: 'pp', sqrtSGeV: 8000, integratedLuminosityInvPb: null, generator: null,
        source: { name: 'test', url: null, doi: null, license: 'test' }, processingNotes: [],
      },
      analysisPair: 'muon',
      entries: [{ run: 1, event: 2, Muon_pt: [10], Muon_eta: [0], Muon_phi: [0], Muon_mass: [0.1], Muon_charge: [1] }],
    });
    expect(s.events[0]!.truth).toBeNull();
    expect(s.provenance.sourceType).toBe('ROOT_CONVERTED');
    expect(s.meta.generator).toContain('recorded');
  });
});
