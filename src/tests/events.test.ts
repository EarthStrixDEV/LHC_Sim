import { describe, expect, it } from 'vitest';
import { ETA_BEAM_AXIS, FourVector, invariantMass } from '../physics/events/FourVector';
import { EVENT_SAMPLES, sampleById } from '../physics/events/EventDatabase';
import { loadSample, parseEventSample, validateEvent, EventValidationError } from '../physics/events/EventLoader';
import type { EventRecord } from '../physics/events/EventSchema';
import { MUON_MASS_GEV } from '../physics/constants/physicalConstants';

describe('FourVector', () => {
  it('computes invariant mass of a particle at rest and in motion', () => {
    expect(new FourVector(5, 0, 0, 0).mass()).toBe(5);
    expect(FourVector.fromMassMomentum(0.1057, 30, -40, 120).mass()).toBeCloseTo(0.1057, 9);
  });

  it('adds Lorentz vectors component-wise; pair mass from back-to-back massless daughters', () => {
    const a = new FourVector(45, 45, 0, 0);
    const b = new FourVector(45, -45, 0, 0);
    const s = a.add(b);
    expect(s.toArray()).toEqual([90, 0, 0, 0]);
    expect(invariantMass(a, b)).toBeCloseTo(90, 12);
  });

  it('pair mass is invariant under boosts', () => {
    const a = FourVector.fromMassMomentum(MUON_MASS_GEV, 20, 5, -3);
    const b = FourVector.fromMassMomentum(MUON_MASS_GEV, -15, 10, 40);
    const m = invariantMass(a, b);
    const ab = a.boost(0.1, -0.4, 0.7);
    const bb = b.boost(0.1, -0.4, 0.7);
    expect(invariantMass(ab, bb)).toBeCloseTo(m, 9);
  });

  it('pT, φ and η', () => {
    const v = FourVector.fromMassMomentum(0, 3, 4, 0);
    expect(v.pt()).toBe(5);
    expect(v.phi()).toBeCloseTo(Math.atan2(4, 3), 12);
    expect(v.eta()).toBe(0);
    const w = FourVector.fromPtEtaPhiM(10, 1.5, -2.0, 0);
    expect(w.eta()).toBeCloseTo(1.5, 10);
    expect(w.phi()).toBeCloseTo(-2.0, 10);
    expect(w.pt()).toBeCloseTo(10, 10);
    // η = ½ ln((p + pz)/(p − pz)) cross-check
    const p = w.p();
    expect(0.5 * Math.log((p + w.pz) / (p - w.pz))).toBeCloseTo(1.5, 8);
  });

  it('handles numerical edge cases without NaN', () => {
    expect(new FourVector(10, 0, 0, 10).eta()).toBe(ETA_BEAM_AXIS);
    expect(new FourVector(10, 0, 0, -10).eta()).toBe(-ETA_BEAM_AXIS);
    expect(FourVector.ZERO.eta()).toBe(0);
    expect(FourVector.ZERO.phi()).toBe(0);
    expect(FourVector.ZERO.mass()).toBe(0);
    // Massless with rounding: tiny negative m² → 0
    expect(new FourVector(100, 100.0000000001, 0, 0).mass()).toBe(0);
    // Large η stays accurate (asinh form)
    expect(FourVector.fromPtEtaPhiM(1e-3, 8, 0, 0).eta()).toBeCloseTo(8, 8);
  });
});

describe('event samples', () => {
  it('registers all Phase 1 processes', () => {
    const ids = EVENT_SAMPLES.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['zmumu', 'hgg', 'zee', 'dijet', 'ttbar', 'pbpb']));
  });

  it.each(EVENT_SAMPLES.map((s) => s.id))('%s loads, validates and is labelled synthetic', async (id) => {
    const s = await loadSample(sampleById(id)!.source);
    expect(s.meta.synthetic).toBe(true);
    expect(s.records.length).toBeGreaterThan(0);
    expect(s.meta.notes.join(' ')).toMatch(/SYNTHETIC/);
  });

  it('loading is deterministic', async () => {
    const a = await loadSample(sampleById('zmumu')!.source);
    const b = await loadSample(sampleById('zmumu')!.source);
    expect(JSON.stringify(a.records[7])).toBe(JSON.stringify(b.records[7]));
    expect(a.event(7).particles.length).toBe(b.event(7).particles.length);
  });

  it('parent/child relationships are reciprocal and navigable', async () => {
    const s = await loadSample(sampleById('zmumu')!.source);
    const ev = s.event(0);
    const z = ev.particles.find((p) => p.pdgId === 23)!;
    const kids = ev.childrenOf(z.id);
    expect(kids.map((k) => Math.abs(k.pdgId)).sort()).toEqual([13, 13]);
    for (const k of kids) expect(ev.parentsOf(k.id).map((p) => p.id)).toContain(z.id);
    // Muons descend from the beam protons through the hard process.
    const anc = ev.ancestorsOf(kids[0]!.id).map((p) => p.pdgId);
    expect(anc).toContain(2212);
  });

  it('π⁰ decays into two photons at the production vertex', async () => {
    const s = await loadSample(sampleById('dijet')!.source);
    const ev = s.event(0);
    const pi0 = ev.particles.find((p) => p.pdgId === 111);
    expect(pi0).toBeDefined();
    const kids = ev.childrenOf(pi0!.id);
    expect(kids.map((k) => k.pdgId)).toEqual([22, 22]);
    expect(invariantMass(...kids.map((k) => k.p4))).toBeCloseTo(0.135, 2);
  });

  it('truth Z → μμ pair mass reproduces the generated resonance mass', async () => {
    const s = await loadSample(sampleById('zmumu')!.source);
    for (let i = 0; i < 20; i++) {
      const ev = s.event(i);
      const z = ev.particles.find((p) => p.pdgId === 23)!;
      const m = invariantMass(...ev.childrenOf(z.id).map((k) => k.p4));
      expect(m).toBeCloseTo(ev.truthInfo['resonanceMassGeV']!, 2);
    }
  });

  it('ttbar events contain displaced b-hadron vertices and a neutrino', async () => {
    const s = await loadSample(sampleById('ttbar')!.source);
    const ev = s.event(0);
    expect([...ev.vertices.values()].some((v) => v.kind === 'displaced')).toBe(true);
    expect(ev.particles.some((p) => p.isNeutrino && p.isFinal)).toBe(true);
  });

  it('validation rejects broken links', () => {
    const bad: EventRecord = {
      eventId: 0, process: 'x', seed: 0,
      vertices: [{ id: 0, kind: 'primary', x: 0, y: 0, z: 0, t: 0 }],
      particles: [
        { id: 0, pdg: 23, status: 2, charge: 0, p: [91, 0, 0, 0], m: 91, prodVtx: 0, decayVtx: 0, parents: [], children: [1] },
        { id: 1, pdg: 13, status: 1, charge: -1, p: [45, 45, 0, 0], m: 0.1, prodVtx: 0, decayVtx: null, parents: [], children: [] },
      ],
    };
    expect(() => validateEvent(bad)).toThrow(EventValidationError);
    expect(() => parseEventSample({ schema: 'nope', events: [] })).toThrow(EventValidationError);
  });
});
