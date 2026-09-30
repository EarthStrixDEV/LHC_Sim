import { describe, expect, it } from 'vitest';
import { apply, det, drift, periodicTwiss, thickQuad, thinQuad } from '../physics/beam/BeamOptics';
import { buildFodoCell, gradientForPhaseAdvance } from '../physics/beam/FODOLattice';
import { computeEnvelope, trackThroughCells } from '../physics/beam/BeamEnvelope';
import { computeBeamModel } from '../physics/beam/BeamModel';
import { computeAccelerator } from '../physics/accelerator/AcceleratorCore';
import { LHC_PRESET } from '../machines/lhc';
import { SANDBOX_PRESET } from '../machines/sandbox';
import { beamSpeciesById } from '../physics/particles/ParticleDatabase';

const RIGIDITY_7TEV = 7000 / 0.299792458;

describe('transfer matrices', () => {
  it('are symplectic (det = 1)', () => {
    expect(det(drift(5))).toBeCloseTo(1, 12);
    expect(det(thickQuad(0.01, 3))).toBeCloseTo(1, 12);
    expect(det(thickQuad(-0.01, 3))).toBeCloseTo(1, 12);
  });

  it('a quadrupole focusing x defocuses y', () => {
    const k = 0.0095;
    const [, xpX] = apply(thickQuad(k, 3.1), 1e-3, 0);
    const [, xpY] = apply(thickQuad(-k, 3.1), 1e-3, 0);
    expect(xpX).toBeLessThan(0); // kicked back toward the axis
    expect(xpY).toBeGreaterThan(0); // kicked away from the axis
  });

  it('thin lens deflects by −x/f', () => {
    const [, xp] = apply(thinQuad(10), 0.002, 0);
    expect(xp).toBeCloseTo(-0.0002, 12);
  });
});

describe('FODO cell', () => {
  const G = gradientForPhaseAdvance(106.9, 3.1, RIGIDITY_7TEV, Math.PI / 2);
  const cell = buildFodoCell({ cellLengthM: 106.9, quadLengthM: 3.1, quadGradientTPerM: G, rigidityTm: RIGIDITY_7TEV, dipolesPerHalfCell: 3, dipoleLengthM: 14.3 });

  it('design gradient for 90° is below the 223 T/m LHC MQ rating', () => {
    expect(G).toBeGreaterThan(150);
    expect(G).toBeLessThan(223);
  });

  it('is stable in both planes with phase advance near 90°', () => {
    const env = computeEnvelope(cell, 3.75e-6, 7000 / 0.938272);
    expect(env.stableX).toBe(true);
    expect(env.stableY).toBe(true);
    expect(env.phaseAdvanceXDeg).toBeGreaterThan(80);
    expect(env.phaseAdvanceXDeg).toBeLessThan(100);
  });

  it('β_x peaks at the focusing quad, β_y at the defocusing quad (alternating focusing)', () => {
    const env = computeEnvelope(cell, 3.75e-6, 7460);
    const n = env.s.length;
    const mid = env.s.findIndex((s) => s >= 106.9 / 2);
    expect(env.betaX[0]!).toBeGreaterThan(env.betaX[mid]!);
    expect(env.betaY[mid]!).toBeGreaterThan(env.betaY[0]!);
    // Periodicity: matched solution returns to itself.
    expect(env.betaX[n - 1]!).toBeCloseTo(env.betaX[0]!, 6);
    // LHC arc β_max ≈ 180 m, β_min ≈ 30 m.
    expect(env.betaX[0]!).toBeGreaterThan(150);
    expect(env.betaX[0]!).toBeLessThan(200);
  });

  it('LHC 7 TeV rms beam size in arcs is sub-millimetre', () => {
    const env = computeEnvelope(cell, 3.75e-6, 7000 / 0.938272);
    expect(Math.max(...env.sigmaX)).toBeGreaterThan(1e-4);
    expect(Math.max(...env.sigmaX)).toBeLessThan(1e-3);
  });

  it('over-focusing (f < L/4 in thin-lens terms) is unstable', () => {
    const strong = buildFodoCell({ cellLengthM: 106.9, quadLengthM: 3.1, quadGradientTPerM: 5000, rigidityTm: RIGIDITY_7TEV, dipolesPerHalfCell: 0, dipoleLengthM: 0 });
    expect(periodicTwiss(strong.matrixX).stable).toBe(false);
  });

  it('a tracked particle stays bounded in a stable lattice', () => {
    const tr = trackThroughCells(cell, 50, 1e-4, 0, 1);
    expect(Math.max(...Array.from(tr.x, Math.abs))).toBeLessThan(1e-3);
  });

  it('BeamModel reproduces LHC design luminosity ~1e34 cm⁻²s⁻¹', () => {
    const acc = computeAccelerator({ machine: LHC_PRESET, species: beamSpeciesById('proton')!, mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 7000 } });
    const bm = computeBeamModel(acc);
    expect(bm.luminosityCm2s).toBeGreaterThan(0.8e34);
    expect(bm.luminosityCm2s).toBeLessThan(1.3e34);
    // Stored beam energy ≈ 362 MJ per beam.
    expect(bm.storedBeamEnergyJ / 1e6).toBeCloseTo(362, -1);
  });

  it('Sandbox with fixed quads and raised energy loses focusing strength (k = G/Bρ)', () => {
    const acc = computeAccelerator({ machine: SANDBOX_PRESET, species: beamSpeciesById('proton')!, mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 14000 }, dipoleFieldT: 16.66 });
    const bm = computeBeamModel(acc, 200);
    expect(bm.envelope.phaseAdvanceXDeg).toBeLessThan(60);
  });
});
