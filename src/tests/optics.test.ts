import { describe, expect, it } from 'vitest';
import { drift, thickQuad, mul } from '../physics/beam/BeamOptics';
import { computeIROptics, LHC_IR_LAYOUT } from '../physics/optics/InteractionRegionOptics';
import { parseTfs, OpticsParseError, sampleColumn } from '../physics/optics/OpticsTable';
import { beamSize, driftFromWaist, geometricEmittance, normalizedEmittance, propagateTwiss, twiss, twissInvariant } from '../physics/optics/Twiss';
import { irOpticsFor, defaultIRSettings } from '../physics/optics/IRScenario';
import { computeAccelerator } from '../physics/accelerator/AcceleratorCore';
import { machineById } from '../machines';
import { beamSpeciesById } from '../physics/particles/ParticleDatabase';

const EPS = 2.5e-6 / 7247; // ε_n = 2.5 µm at 6.8 TeV
const base = { geometricEmittanceM: EPS, fullCrossingAngleRad: 320e-6, crossingPlane: 'y' as const, sigmaZM: 0.0755, bunchSpacingNs: 25 };

describe('Twiss consistency', () => {
  it('γ = (1 + α²)/β and βγ − α² = 1 is preserved through drifts and thick quads', () => {
    let t = twiss(12, -1.7);
    expect(t.gamma).toBeCloseTo((1 + 1.7 ** 2) / 12, 14);
    const m = mul(thickQuad(0.009, 6.37), mul(drift(8.5), thickQuad(-0.009, 5.5)));
    for (let i = 0; i < 20; i++) {
      t = propagateTwiss(m, t);
      expect(twissInvariant(t)).toBeCloseTo(1, 9);
      expect(t.beta).toBeGreaterThan(0);
    }
  });

  it('every sample of the IR table satisfies the invariant (numerically from β, α)', () => {
    const ir = computeIROptics({ betaStarM: 0.3, ...base });
    const t = ir.table;
    for (let i = 1; i < t.s.length - 1; i += 7) {
      // dβ/ds = −2α  (finite difference check of the α column)
      const ds = t.s[i + 1]! - t.s[i - 1]!;
      if (ds > 1e-6 && ds < 1) expect((t.betx[i + 1]! - t.betx[i - 1]!) / ds).toBeCloseTo(-2 * t.alfx[i]!, -1);
    }
  });
});

describe('Beam-size relation and emittance conversion', () => {
  it('σ = √(ε β) with ε = ε_n/(βγ); conversions are inverse', () => {
    const bg = 7247;
    const eps = geometricEmittance(2.5e-6, bg);
    expect(normalizedEmittance(eps, bg)).toBeCloseTo(2.5e-6, 18);
    expect(beamSize(eps, 0.3)).toBeCloseTo(Math.sqrt(eps * 0.3), 18);
    // LHC Run 3 at β* = 30 cm: σ* ≈ 10 µm.
    expect(beamSize(eps, 0.3) * 1e6).toBeCloseTo(10.2, 0);
  });

  it('IR scenario uses the machine emittance at the current energy', () => {
    const acc = computeAccelerator({ machine: machineById('lhc'), species: beamSpeciesById('proton')!, mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 6800 } });
    const ir = irOpticsFor(acc, defaultIRSettings(acc));
    expect(ir.input.geometricEmittanceM).toBeCloseTo(acc.machine.arcOptics.normalizedEmittanceM / acc.kinematics.betaGamma, 18);
  });
});

describe('β* behaviour', () => {
  it('drift from the waist: β(s) = β* + s²/β*, minimum at the IP', () => {
    for (const bs of [0.15, 0.3, 0.55, 2]) {
      const ir = computeIROptics({ betaStarM: bs, ...base });
      const t = ir.table;
      const iIP = t.s.findIndex((s) => s === 0);
      expect(t.betx[iIP]).toBeCloseTo(bs, 12);
      expect(Math.min(...t.betx.subarray(0, iIP + 20))).toBeCloseTo(bs, 12);
      expect(sampleColumn(t, t.betx, 10)).toBeCloseTo(driftFromWaist(bs, 10).beta, 1);
      expect(ir.betaAtQ1M).toBeCloseTo(bs + LHC_IR_LAYOUT.lStarM ** 2 / bs, 9);
      // Mirror symmetry about the IP.
      expect(sampleColumn(t, t.bety, -40)).toBeCloseTo(sampleColumn(t, t.bety, 40), 6);
    }
  });

  it('smaller β* → smaller σ* but larger triplet β (the squeeze trade-off)', () => {
    const a = computeIROptics({ betaStarM: 0.25, ...base });
    const b = computeIROptics({ betaStarM: 1.0, ...base });
    expect(a.sigmaStarM).toBeLessThan(b.sigmaStarM);
    expect(a.maxBetaM).toBeGreaterThan(b.maxBetaM);
    expect(a.maxBetaM).toBeGreaterThan(3000);
    expect(a.maxBetaM).toBeLessThan(20000);
  });

  it('crossing angle: Piwinski factor and long-range separation', () => {
    const ir = computeIROptics({ betaStarM: 0.3, ...base });
    expect(ir.piwinskiFactor).toBeGreaterThan(0.55);
    expect(ir.piwinskiFactor).toBeLessThan(0.75);
    expect(computeIROptics({ betaStarM: 0.3, ...base, fullCrossingAngleRad: 0 }).piwinskiFactor).toBe(1);
    // In the drift, d/σ → θc √(β*/ε) (independent of s far from the IP).
    const far = ir.longRange[ir.longRange.length - 1]!;
    expect(far.separationSigma).toBeCloseTo(320e-6 * Math.sqrt(0.3 / EPS), 0);
    // Orbit: beam 1 at +θc/2 · s in the crossing plane.
    const i = ir.table.s.findIndex((s) => s > 10);
    expect(ir.table.y![i]).toBeCloseTo(160e-6 * ir.table.s[i]!, 12);
    expect(ir.table.x![i]).toBe(0);
  });
});

describe('External optics tables (TFS)', () => {
  const TFS = `@ NAME %s "TWISS"
* NAME S BETX BETY ALFX ALFY X Y
$ %s %le %le %le %le %le %le
"IP1" 0 0.3 0.3 0 0 0 0
"MQXA.1R1" 23 1763.6 1763.6 -76.7 -76.7 0 0.00368
"END" 80 5000 4500 1 -1 0 0`;

  it('parses S, β, α and orbit columns and interpolates', () => {
    const t = parseTfs(TFS, 'test');
    expect(t.names).toEqual(['IP1', 'MQXA.1R1', 'END']);
    expect(t.betx[1]).toBe(1763.6);
    expect(t.y![1]).toBe(0.00368);
    expect(sampleColumn(t, t.betx, 51.5)).toBeCloseTo((1763.6 + 5000) / 2, 9);
  });

  it('rejects malformed tables', () => {
    expect(() => parseTfs('* S BETX\n0 1')).toThrow(OpticsParseError);
    expect(() => parseTfs('* S BETX BETY ALFX ALFY\n1 1 1 0 0\n0 1 1 0 0')).toThrow(/non-decreasing/);
    expect(() => parseTfs('* S BETX BETY ALFX ALFY\n0 -1 1 0 0')).toThrow(/positive/);
  });
});
