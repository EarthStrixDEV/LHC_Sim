import { describe, expect, it } from 'vitest';
import { computeAccelerator, designMomentumGeV } from '../physics/accelerator/AcceleratorCore';
import {
  bendingRadiusM,
  bendingSign,
  kinematicsFromTotalEnergy,
  magneticRigidityTm,
  requiredDipoleFieldT,
} from '../physics/accelerator/MagneticRigidity';
import { evaluateMagnet, LHC_MAIN_DIPOLE, quenchSnapshot, LHC_QUENCH_TIMELINE } from '../physics/accelerator/MagnetModel';
import { synchrotronLoss } from '../physics/accelerator/SynchrotronRadiation';
import { PROTON_MASS_GEV, ELECTRON_MASS_GEV, MUON_MASS_GEV } from '../physics/constants/physicalConstants';
import { beamSpeciesById, selectableBeamSpecies } from '../physics/particles/ParticleDatabase';
import { LHC_PRESET } from '../machines/lhc';
import { HL_LHC_PRESET } from '../machines/hlLhc';
import { SANDBOX_PRESET } from '../machines/sandbox';
import { FCC_HH_PRESET } from '../machines/fccHh';
import { gevToJoule, jouleToGeV, tevToGeV, lumiCm2ToM2, lumiM2ToCm2 } from '../utils/units';

const species = (id: string) => {
  const s = beamSpeciesById(id);
  if (!s) throw new Error(id);
  return s;
};

describe('magnetic rigidity', () => {
  it('7 TeV proton needs ≈8.33 T on the LHC bending radius', () => {
    const kin = kinematicsFromTotalEnergy(PROTON_MASS_GEV, 7000);
    const brho = magneticRigidityTm(kin.momentumGeV, 1);
    expect(brho).toBeCloseTo(23_349, -1); // 7000 / 0.299792458
    expect(requiredDipoleFieldT(brho, 2803.95)).toBeCloseTo(8.33, 2);
  });

  it('450 GeV injection proton needs ≈0.535 T', () => {
    const kin = kinematicsFromTotalEnergy(PROTON_MASS_GEV, 450);
    expect(requiredDipoleFieldT(magneticRigidityTm(kin.momentumGeV, 1), 2803.95)).toBeCloseTo(0.535, 3);
  });

  it('rigidity uses |q|: sign does not change Bρ but flips bending direction', () => {
    expect(magneticRigidityTm(1000, -1)).toBe(magneticRigidityTm(1000, 1));
    expect(bendingSign(1, 8)).toBe(1);
    expect(bendingSign(-1, 8)).toBe(-1);
    expect(bendingSign(0, 8)).toBe(0);
  });

  it('rigidity scales inversely with charge state for equal momentum', () => {
    expect(magneticRigidityTm(8200, 82)).toBeCloseTo(magneticRigidityTm(100, 1), 9);
  });

  it('neutral particles have infinite rigidity and radius', () => {
    expect(magneticRigidityTm(100, 0)).toBe(Infinity);
    expect(bendingRadiusM(10, 0)).toBe(Infinity);
  });

  it('p = 0.2998·B·ρ for B = 1 T, ρ = 1 m, q = 1', () => {
    expect(magneticRigidityTm(0.299792458, 1)).toBeCloseTo(1, 12);
  });
});

describe('units', () => {
  it('round-trips energy and luminosity', () => {
    expect(jouleToGeV(gevToJoule(123.4))).toBeCloseTo(123.4, 10);
    expect(tevToGeV(6.8)).toBe(6800);
    expect(lumiM2ToCm2(lumiCm2ToM2(1e34))).toBeCloseTo(1e34, -20);
    expect(lumiCm2ToM2(1e34)).toBe(1e38);
  });
  it('1 TeV ≈ 1.602e-7 J', () => {
    expect(gevToJoule(1000)).toBeCloseTo(1.602176634e-7, 15);
  });
});

describe('ions', () => {
  it.each([
    ['Pb208', 82, 208],
    ['O16', 8, 16],
    ['Ne20', 10, 20],
  ])('%s has Z=%i, A=%i and nuclear mass ≈ A·u', (id, Z, A) => {
    const s = species(id);
    expect(s.Z).toBe(Z);
    expect(s.A).toBe(A);
    expect(s.chargeE).toBe(Z);
    expect(s.massGeV / A).toBeGreaterThan(0.93);
    expect(s.massGeV / A).toBeLessThan(0.94);
  });

  it('Pb-208 nuclear mass ≈ 193.69 GeV', () => {
    expect(species('Pb208').massGeV).toBeCloseTo(193.687, 2);
  });

  it('LHC Pb beam at proton-equivalent 7 TeV: E/A ≈ 2.76 TeV and √sNN ≈ 5.52 TeV', () => {
    const pb = species('Pb208');
    const st = computeAccelerator({
      machine: LHC_PRESET,
      species: pb,
      mode: 'physics',
      energy: { kind: 'momentum', valueGeV: designMomentumGeV(LHC_PRESET, pb) },
    });
    expect(st.requiredDipoleFieldT).toBeCloseTo(8.33, 2);
    expect(st.energyPerNucleonGeV! / 1000).toBeCloseTo(2.76, 2);
    expect(st.sqrtSNNGeV! / 1000).toBeCloseTo(5.52, 1);
    expect(st.feasibility).toBe('FEASIBLE');
  });

  it('Z/A scaling: same field gives E/A ∝ Z/A', () => {
    const run = (id: string) => {
      const s = species(id);
      return computeAccelerator({ machine: LHC_PRESET, species: s, mode: 'physics', energy: { kind: 'momentum', valueGeV: designMomentumGeV(LHC_PRESET, s) } });
    };
    const o = run('O16');
    const ne = run('Ne20');
    // O-16 and Ne-20 both have Z/A = 0.5 → same momentum per nucleon.
    expect(o.momentumPerNucleonGeV!).toBeCloseTo(ne.momentumPerNucleonGeV!, 6);
    expect(o.momentumPerNucleonGeV! / 7000).toBeCloseTo(0.5, 3);
    expect(o.requiredDipoleFieldT).toBeCloseTo(ne.requiredDipoleFieldT, 9);
  });
});

describe('beam species selection', () => {
  it('neutron is not selectable as a circulating beam', () => {
    expect(selectableBeamSpecies().some((s) => s.id === 'neutron')).toBe(false);
    for (const id of ['proton', 'Pb208', 'O16', 'Ne20']) {
      expect(selectableBeamSpecies().some((s) => s.id === id)).toBe(true);
    }
  });

  it('forcing a neutron into the core yields UNSUPPORTED CIRCULATING PARTICLE, even in Sandbox', () => {
    const st = computeAccelerator({ machine: SANDBOX_PRESET, species: species('neutron'), mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 7000 } });
    expect(st.warnings.some((w) => w.code === 'UNSUPPORTED_CIRCULATING_PARTICLE' && w.severity === 'error')).toBe(true);
    expect(st.feasibility).not.toBe('FEASIBLE');
  });
});

describe('synchrotron radiation', () => {
  const base = { bendingRadiusM: 2803.95, circumferenceM: 26_658.883 };
  const loss = (m: number, E: number, q = 1) => {
    const k = kinematicsFromTotalEnergy(m, E);
    return synchrotronLoss({ chargeE: q, gamma: k.gamma, beta: k.beta, totalEnergyGeV: E, ...base }).energyLossPerTurnGeV;
  };

  it('LHC 7 TeV proton loses ≈6.7 keV per turn', () => {
    expect(loss(PROTON_MASS_GEV, 7000) * 1e6).toBeCloseTo(6.7, 0);
  });

  it('electron at 1 GeV on ρ = 1 m loses ≈88.5 keV (C_γ check)', () => {
    const k = kinematicsFromTotalEnergy(ELECTRON_MASS_GEV, 1);
    const U = synchrotronLoss({ chargeE: -1, gamma: k.gamma, beta: k.beta, totalEnergyGeV: 1, bendingRadiusM: 1, circumferenceM: 2 * Math.PI });
    expect(U.energyLossPerTurnGeV * 1e6).toBeCloseTo(88.5, 0);
  });

  it('scales as E⁴ in the ultra-relativistic limit', () => {
    const ratio = loss(PROTON_MASS_GEV, 7000) / loss(PROTON_MASS_GEV, 3500);
    expect(ratio).toBeCloseTo(16, 3);
  });

  it('scales as m⁻⁴: electron ≫ muon ≫ proton at equal energy', () => {
    const e = loss(ELECTRON_MASS_GEV, 100);
    const mu = loss(MUON_MASS_GEV, 100);
    const p = loss(PROTON_MASS_GEV, 100);
    // Ratio is (m_p/m_e)⁴ up to the proton's β³ ≈ 1 − 1.3e-4 at 100 GeV.
    expect((e / p) / (PROTON_MASS_GEV / ELECTRON_MASS_GEV) ** 4).toBeCloseTo(1, 3);
    expect(e).toBeGreaterThan(mu);
    expect(mu).toBeGreaterThan(p);
    expect(e / p).toBeGreaterThan(1e13);
  });

  it('scales as 1/ρ', () => {
    const k = kinematicsFromTotalEnergy(PROTON_MASS_GEV, 7000);
    const a = synchrotronLoss({ chargeE: 1, gamma: k.gamma, beta: k.beta, totalEnergyGeV: 7000, bendingRadiusM: 1000, circumferenceM: 1e4 });
    const b = synchrotronLoss({ chargeE: 1, gamma: k.gamma, beta: k.beta, totalEnergyGeV: 7000, bendingRadiusM: 2000, circumferenceM: 1e4 });
    expect(a.energyLossPerTurnGeV / b.energyLossPerTurnGeV).toBeCloseTo(2, 9);
  });

  it('multi-TeV electrons in an LHC-sized ring trigger severe warnings', () => {
    const st = computeAccelerator({ machine: SANDBOX_PRESET, species: species('electron'), mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 7000 } });
    const codes = st.warnings.map((w) => w.code);
    expect(codes).toContain('SYNCHROTRON_LOSS_DOMINANT');
    expect(st.synchrotron.energyLossPerTurnGeV).toBeGreaterThan(st.kinematics.totalEnergyGeV);
    expect(st.feasibility).toBe('NON_PHYSICAL');
  });

  it('LEP-like 100 GeV electrons are dominated by radiation but below beam energy', () => {
    const st = computeAccelerator({ machine: SANDBOX_PRESET, species: species('electron'), mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 100 } });
    // LEP2 lost ~2–3 GeV/turn on ρ ≈ 3.1 km; here ρ ≈ 2.8 km.
    expect(st.synchrotron.energyLossPerTurnGeV).toBeGreaterThan(2);
    expect(st.synchrotron.energyLossPerTurnGeV).toBeLessThan(5);
  });
});

describe('AcceleratorCore modes', () => {
  it('Physics mode flags energies above the LHC field limit', () => {
    const st = computeAccelerator({ machine: LHC_PRESET, species: species('proton'), mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 9000 } });
    expect(st.requiredDipoleFieldT).toBeGreaterThan(10);
    expect(st.warnings.find((w) => w.code === 'FIELD_LIMIT_EXCEEDED')?.severity).toBe('error');
    expect(st.feasibility).toBe('INFEASIBLE');
  });

  it('Sandbox never clamps: user field is used as-is and mismatch is reported', () => {
    const st = computeAccelerator({ machine: SANDBOX_PRESET, species: species('proton'), mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 7000 }, dipoleFieldT: 5 });
    expect(st.operatingDipoleFieldT).toBe(5);
    expect(st.beamBendingRadiusM).toBeGreaterThan(st.ringBendingRadiusM);
    expect(st.warnings.some((w) => w.code === 'INSUFFICIENT_MAGNETIC_RIGIDITY')).toBe(true);
  });

  it('Sandbox over-bending is reported as orbit mismatch', () => {
    const st = computeAccelerator({ machine: SANDBOX_PRESET, species: species('proton'), mode: 'sandbox', energy: { kind: 'totalEnergy', valueGeV: 7000 }, dipoleFieldT: 9 });
    expect(st.warnings.some((w) => w.code === 'ORBIT_MISMATCH')).toBe(true);
  });

  it('electrons are unsupported in LHC Physics mode', () => {
    const st = computeAccelerator({ machine: LHC_PRESET, species: species('electron'), mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 100 } });
    expect(st.warnings.some((w) => w.code === 'UNSUPPORTED_CIRCULATING_PARTICLE' && w.severity === 'error')).toBe(true);
  });

  it('HL-LHC keeps LHC-class arc dipoles (not an 11 T ring)', () => {
    expect(HL_LHC_PRESET.nominalDipoleFieldT).toBe(LHC_PRESET.nominalDipoleFieldT);
    expect(HL_LHC_PRESET.dipoleBendingRadiusM).toBe(LHC_PRESET.dipoleBendingRadiusM);
    expect(HL_LHC_PRESET.interactionRegion.quadTechnology).toBe('Nb3Sn');
    expect(HL_LHC_PRESET.interactionRegion.betaStarM).toBeLessThan(LHC_PRESET.interactionRegion.betaStarM);
  });

  it('FCC-hh design energy is consistent with its field and radius', () => {
    const st = computeAccelerator({ machine: FCC_HH_PRESET, species: species('proton'), mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: FCC_HH_PRESET.designEnergyPerBeamGeV } });
    expect(st.requiredDipoleFieldT).toBeLessThanOrEqual(FCC_HH_PRESET.dipoleFieldLimitT + 0.05);
    expect(st.sqrtSGeV / 1000).toBeCloseTo(85, 0);
  });

  it('√s = 2E for symmetric pp at 6.8 TeV', () => {
    const st = computeAccelerator({ machine: LHC_PRESET, species: species('proton'), mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: 6800 } });
    expect(st.sqrtSGeV).toBeCloseTo(13_600, 6);
  });
});

describe('magnet model', () => {
  it('LHC dipole at 8.33 T, 1.9 K has ≈14 % margin and is STABLE', () => {
    const op = evaluateMagnet(LHC_MAIN_DIPOLE, 8.33, 1.9);
    expect(op.margin).toBeCloseTo(0.14, 2);
    expect(op.state).toBe('STABLE');
    expect(op.storedEnergyJ / 1e6).toBeCloseTo(6.9, 0);
  });

  it('warming to 4.5 K at 8.33 T drives the Nb-Ti dipole into quench', () => {
    expect(evaluateMagnet(LHC_MAIN_DIPOLE, 8.33, 4.5).state).toBe('QUENCHED');
  });

  it('margin decreases monotonically with field and temperature', () => {
    const a = evaluateMagnet(LHC_MAIN_DIPOLE, 7, 1.9).margin;
    const b = evaluateMagnet(LHC_MAIN_DIPOLE, 8, 1.9).margin;
    const c = evaluateMagnet(LHC_MAIN_DIPOLE, 8, 2.5).margin;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('quench sequence goes transition → heating → decay with decaying current', () => {
    const t0 = quenchSnapshot(LHC_QUENCH_TIMELINE, 0.001, 1.9);
    const t1 = quenchSnapshot(LHC_QUENCH_TIMELINE, 0.02, 1.9);
    const t2 = quenchSnapshot(LHC_QUENCH_TIMELINE, 0.2, 1.9);
    expect(t0.phase).toBe('resistive-transition');
    expect(t1.phase).toBe('local-heating');
    expect(t2.phase).toBe('current-decay');
    expect(t2.currentFraction).toBeLessThan(t1.currentFraction);
    expect(t2.hotspotTemperatureK).toBeGreaterThan(t0.hotspotTemperatureK);
  });
});
