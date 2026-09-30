import { describe, expect, it } from 'vitest';
import { bunchTiming, buildFillingScheme, crossingTimesNs, interactionProbability, lhcLikeScheme, meanInteractionsPerCrossing } from '../physics/bunches/BunchStructure';
import { computeColliderOperation } from '../physics/luminosity/ColliderOperation';
import { CM2_PER_MB, eventRateHz, expectedYield, integratedLuminosityInvFb } from '../physics/luminosity/Luminosity';
import { overlayPileUp, poissonPmf, samplePoisson } from '../physics/pileup/PileUp';
import { defaultMenu, evaluateTrigger, triggerRates, type L1Inputs } from '../physics/trigger/Trigger';
import { validateEvent } from '../physics/events/EventLoader';
import { loadDataset } from '../data-sources/DataSourceRegistry';
import { datasetTruth, processDatasetEvent } from '../physics/EventProcessor';
import { computeAccelerator } from '../physics/accelerator/AcceleratorCore';
import { computeBeamModel } from '../physics/beam/BeamModel';
import { machineById } from '../machines';
import { beamSpeciesById } from '../physics/particles/ParticleDatabase';
import type { ReconstructedEvent } from '../physics/reconstruction/ReconstructedObject';
import { Rng } from '../utils/math';

describe('Luminosity and event rates', () => {
  it('R = L σ with explicit units', () => {
    // L = 2×10³⁴ cm⁻²s⁻¹, σ = 1 nb = 1000 pb → R = 2×10³⁴ × 10⁻³³ = 20 Hz.
    expect(eventRateHz(2e34, 1000)).toBeCloseTo(20, 10);
    // σ_inel = 80 mb → ≈ 1.6 GHz of inelastic collisions.
    expect(eventRateHz(2e34, 80e9)).toBeCloseTo(1.6e9, -5);
  });

  it('integrated yield N = L_int σ ε', () => {
    expect(expectedYield(1, 1)).toBe(1000); // 1 fb⁻¹ × 1 pb = 1000 events
    expect(expectedYield(140, 52.2 * 2.27e-3, 0.4)).toBeCloseTo(140e3 * 52.2 * 2.27e-3 * 0.4, 8);
    expect(() => expectedYield(1, 1, 1.5)).toThrow();
    // 10³⁴ cm⁻²s⁻¹ for 10⁵ s = 10³⁹ cm⁻² = 1 fb⁻¹.
    expect(integratedLuminosityInvFb(1e34, 1e5)).toBeCloseTo(1, 12);
  });
});

describe('Bunch structure', () => {
  const acc = computeAccelerator({ machine: machineById('lhc'), species: beamSpeciesById('proton')!, mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 6800 } });

  it('fills trains up to the requested bunch count, respecting the abort gap', () => {
    const s = lhcLikeScheme(2808);
    expect(s.filled).toBe(2808);
    expect(s.pattern.slice(3564 - 119).every((x) => x === 0)).toBe(true);
    const small = buildFillingScheme({ slots: 20, bunches: 5, trainLength: 2, trainGap: 1, abortGap: 3 });
    expect([...small.pattern]).toEqual([1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(small.trains).toBe(3);
  });

  it('LHC timing: f_rev ≈ 11.245 kHz, 24.95 ns slots, crossings at filled slots', () => {
    const t = bunchTiming(acc.circumferenceM, acc.kinematics.beta, lhcLikeScheme(2808));
    expect(t.revolutionFrequencyHz).toBeCloseTo(11245.5, 0);
    expect(t.slotSpacingNs).toBeCloseTo(24.95, 2);
    expect(t.slotRateHz / 1e6).toBeCloseTo(40.08, 1);
    const times = crossingTimesNs(buildFillingScheme({ slots: 10, bunches: 2, trainLength: 1, trainGap: 3, abortGap: 0 }), { ...t, slotSpacingNs: 25, revolutionFrequencyHz: 4e6 }, 4);
    expect(times).toEqual([0, 100, 250, 350]);
  });

  it('μ = L σ_inel / (n_b f_rev) ≈ 50 for Run-3-like conditions', () => {
    const mu = meanInteractionsPerCrossing(2e34, 80 * CM2_PER_MB, 2808, 11245);
    expect(mu).toBeCloseTo(50.7, 0);
    expect(interactionProbability(0)).toBe(0);
    expect(interactionProbability(mu)).toBeCloseTo(1, 12);
    const op = computeColliderOperation(acc, computeBeamModel(acc));
    expect(op.mu).toBeGreaterThan(0);
    expect(op.pileUpPmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe('Pile-up Poisson statistics', () => {
  it.each([0.5, 5, 50])('sample mean and variance ≈ μ = %f over 40 000 crossings', (mu) => {
    const rng = new Rng(7);
    const N = 40_000;
    const counts = new Map<number, number>();
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      const n = samplePoisson(rng, mu);
      s += n;
      s2 += n * n;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const mean = s / N, variance = s2 / N - mean * mean;
    const se = Math.sqrt(mu / N);
    expect(Math.abs(mean - mu)).toBeLessThan(5 * se);
    expect(variance / mu).toBeGreaterThan(0.95);
    expect(variance / mu).toBeLessThan(1.05);
    // Frequency of the most probable value agrees with P(n; μ).
    const mode = Math.floor(mu);
    const f = (counts.get(mode) ?? 0) / N, p = poissonPmf(mode, mu);
    expect(Math.abs(f - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / N));
  });

  it('overlay adds Poisson-many pile-up vertices deterministically and keeps the record valid', async () => {
    const ds = await loadDataset('zmumu');
    const hard = ds.event(0).truth!;
    const a = overlayPileUp(hard, 20, new Rng(99));
    const b = overlayPileUp(hard, 20, new Rng(99));
    expect(a).toEqual(b);
    expect(() => validateEvent(a.event)).not.toThrow();
    const puVertices = a.event.vertices.filter((v) => v.kind === 'pileup').length - hard.vertices.filter((v) => v.kind === 'pileup').length;
    expect(puVertices).toBe(a.nPileUp);
    expect(a.event.particles.length).toBeGreaterThan(hard.particles.length);
    // Pipeline integration: pile-up appears in processed tracks, hard-scatter muons survive.
    const opts = { pileUp: { enabled: true, mu: 20 } };
    const pe = processDatasetEvent(ds, 0, 'atlas', opts);
    expect(pe.pileUp!.n).toBe(datasetTruth(ds, 0, opts.pileUp).nPileUp);
    expect(pe.tracks.filter((t) => t.origin === 'pileup').length).toBeGreaterThan(processDatasetEvent(ds, 0, 'atlas').tracks.filter((t) => t.origin === 'pileup').length);
    expect(pe.reco.muons.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Trigger', () => {
  const emptyReco = (patch: Partial<ReconstructedEvent> = {}): ReconstructedEvent => ({
    tracks: [], electrons: [], muons: [], photons: [], jets: [],
    met: { id: 'met', kind: 'met', p4: [0, 0, 0, 0], pt: 0, eta: 0, phi: 0, charge: 0, truthParticleId: null, met: 0, sumEt: 0, softTermPt: 0 },
    ...patch,
  });
  const muon = (pt: number, iso: number) => ({ id: `m${pt}`, kind: 'muon' as const, p4: [pt, pt, 0, 0] as [number, number, number, number], pt, eta: 0, phi: 0, charge: 1, truthParticleId: null, trackId: 't', stations: 3, isolation: iso });
  const l1 = (p: Partial<L1Inputs>): L1Inputs => ({ emTowersEt: [], jetWindowsEt: [], metEt: 0, muonPts: [], ...p });

  it('accepts an isolated high-pT muon and gives the reason', () => {
    const d = evaluateTrigger(defaultMenu(), l1({ muonPts: [40] }), emptyReco({ muons: [muon(40, 0.02)] }));
    expect(d.l1Accept && d.hltAccept).toBe(true);
    expect(d.reason).toContain('Single muon');
  });

  it('rejects at L1 below threshold and at HLT for non-isolated muons', () => {
    expect(evaluateTrigger(defaultMenu(), l1({ muonPts: [10] }), emptyReco({ muons: [muon(10, 0)] })).reason).toContain('Level-1');
    const d = evaluateTrigger(defaultMenu(), l1({ muonPts: [40] }), emptyReco({ muons: [muon(40, 0.5)] }));
    expect(d.l1Accept).toBe(true);
    expect(d.hltAccept).toBe(false);
    expect(d.reason).toContain('HLT');
  });

  it('disabled items never fire; rates scale the input rate', () => {
    const menu = defaultMenu().map((m) => ({ ...m, enabled: m.id !== 'single-muon' }));
    expect(evaluateTrigger(menu, l1({ muonPts: [40] }), emptyReco({ muons: [muon(40, 0)] })).hltAccept).toBe(false);
    const r = triggerRates(40e6, 1000, 10, 1);
    expect(r.l1RateHz).toBeCloseTo(4e5, 6);
    expect(r.hltRateHz).toBeCloseTo(4e4, 6);
    expect(r.rejectedRateHz).toBeCloseTo(40e6 - 4e4, 3);
  });

  it('Z → μμ simulated events mostly pass the single-muon trigger; recorded data is not re-triggered', async () => {
    const ds = await loadDataset('zmumu');
    let pass = 0;
    for (let i = 0; i < 20; i++) if (processDatasetEvent(ds, i, 'atlas').trigger!.items.find((x) => x.id === 'single-muon')!.hlt) pass++;
    expect(pass).toBeGreaterThan(10);
  });
});
