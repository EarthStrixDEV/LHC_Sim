import { describe, expect, it } from 'vitest';
import { loadDataset } from '../data-sources/DataSourceRegistry';
import { applyResponseConfig, channelHash, NOMINAL_RESPONSE, type ResponseConfig } from '../detector/response/ResponseConfig';
import { getDetector, processDatasetEvent } from '../physics/EventProcessor';
import { selectPair, type PairKind } from '../physics/reconstruction/InvariantMass';

async function masses(sample: string, kind: PairKind, response: ResponseConfig, n = 60): Promise<number[]> {
  const ds = await loadDataset(sample);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = selectPair(processDatasetEvent(ds, i, 'atlas', { response }).reco, kind);
    if (p) out.push(p.mass);
  }
  return out;
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const rms = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

describe('Configurable detector response', () => {
  it('nominal configuration is the identity; scales change only response parameters', () => {
    const d = getDetector('cms');
    expect(applyResponseConfig(d, NOMINAL_RESPONSE)).toBe(d);
    const s = applyResponseConfig(d, { ...NOMINAL_RESPONSE, hitEfficiencyScale: 0.5, caloResolutionScale: 2, trackerEtaMax: 1 });
    expect(s.trackerLayers[0]!.efficiency).toBeCloseTo(d.trackerLayers[0]!.efficiency * 0.5, 12);
    expect(s.ecal.stochastic).toBeCloseTo(2 * d.ecal.stochastic, 12);
    expect(s.trackerEtaMax).toBe(1);
    expect(s.geometry).toBe(d.geometry);
    expect(s.field).toBe(d.field);
  });

  it('lower hit efficiency → fewer tracker hits', async () => {
    const ds = await loadDataset('dijet');
    const a = processDatasetEvent(ds, 0, 'atlas').response.hits.count;
    const b = processDatasetEvent(ds, 0, 'atlas', { response: { ...NOMINAL_RESPONSE, hitEfficiencyScale: 0.6 } }).response.hits.count;
    expect(b / a).toBeGreaterThan(0.5);
    expect(b / a).toBeLessThan(0.7);
  });

  it('worse momentum resolution broadens the Z → μμ peak', async () => {
    const nom = await masses('zmumu', 'muon', NOMINAL_RESPONSE);
    const bad = await masses('zmumu', 'muon', { ...NOMINAL_RESPONSE, momentumResolutionScale: 4 });
    expect(rms(bad)).toBeGreaterThan(1.3 * rms(nom));
  });

  it('calorimeter energy scale shifts the H → γγ peak proportionally', async () => {
    const nom = await masses('hgg', 'photon', NOMINAL_RESPONSE);
    const low = await masses('hgg', 'photon', { ...NOMINAL_RESPONSE, caloEnergyScale: 0.95 });
    expect(mean(low) / mean(nom)).toBeCloseTo(0.95, 2);
  });

  it('dead channels remove hits and cells deterministically; noisy cells add truth-less cells', async () => {
    const ds = await loadDataset('dijet');
    const nom = processDatasetEvent(ds, 2, 'cms');
    const cfg = { ...NOMINAL_RESPONSE, deadFraction: 0.2 };
    const dead = processDatasetEvent(ds, 2, 'cms', { response: cfg });
    const again = processDatasetEvent(ds, 2, 'cms', { response: cfg });
    expect(dead.response.hits.count).toBeLessThan(nom.response.hits.count);
    expect(dead.response.ecal.length).toBeLessThan(nom.response.ecal.length);
    expect(again.response.hits.count).toBe(dead.response.hits.count);
    const noisy = processDatasetEvent(ds, 2, 'cms', { response: { ...NOMINAL_RESPONSE, noisyCellsPerEvent: 100, noiseMeanGeV: 1 } });
    const noiseOnly = noisy.response.ecal.filter((c) => c.contributors.length === 0);
    expect(noiseOnly.length).toBeGreaterThan(20);
    expect(nom.response.ecal.every((c) => c.contributors.length > 0)).toBe(true);
  });

  it('dead-channel map is a fixed, uniform hash', () => {
    let n = 0;
    for (let k = 0; k < 20000; k++) if (channelHash('cms', k) < 0.1) n++;
    expect(n / 20000).toBeCloseTo(0.1, 1);
    expect(channelHash('cms', 42)).toBe(channelHash('cms', 42));
  });
});
