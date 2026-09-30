/**
 * PDG particle table (subset needed for Phase 1) and the beam-species list.
 * Masses from [PDG2024] via physicalConstants.ts; quark masses are indicative only
 * (current-quark / pole masses are scheme dependent and irrelevant for display).
 */
import {
  B_MESON_MASS_GEV,
  ELECTRON_MASS_GEV,
  HIGGS_MASS_GEV,
  KAON_CHARGED_MASS_GEV,
  KAON_NEUTRAL_MASS_GEV,
  LAMBDA_MASS_GEV,
  MUON_MASS_GEV,
  NEUTRON_MASS_GEV,
  PION_CHARGED_MASS_GEV,
  PION_NEUTRAL_MASS_GEV,
  PROTON_MASS_GEV,
  TOP_MASS_GEV,
  W_MASS_GEV,
  Z_MASS_GEV,
} from '../constants/physicalConstants';
import { IONS, ionToBeamSpecies } from './IonDefinition';
import type { BeamSpecies, ParticleDefinition, ResolvedParticle } from './ParticleDefinition';

const TAU_MASS_GEV = 1.776_86;
const MUON_LIFETIME_S = 2.196_981_1e-6;

const DEFS: readonly ParticleDefinition[] = [
  q(1, 'down quark', 'd', 'd̄', 0.0047, -1 / 3),
  q(2, 'up quark', 'u', 'ū', 0.0022, 2 / 3),
  q(3, 'strange quark', 's', 's̄', 0.093, -1 / 3),
  q(4, 'charm quark', 'c', 'c̄', 1.27, 2 / 3),
  q(5, 'bottom quark', 'b', 'b̄', 4.18, -1 / 3),
  q(6, 'top quark', 't', 't̄', TOP_MASS_GEV, 2 / 3),
  { pdgId: 21, name: 'gluon', symbol: 'g', antiSymbol: 'g', massGeV: 0, charge: 0, category: 'gluon', detectorStable: false },
  { pdgId: 11, name: 'electron', symbol: 'e⁻', antiSymbol: 'e⁺', massGeV: ELECTRON_MASS_GEV, charge: -1, category: 'charged-lepton', detectorStable: true },
  { pdgId: 12, name: 'electron neutrino', symbol: 'νₑ', antiSymbol: 'ν̄ₑ', massGeV: 0, charge: 0, category: 'neutrino', detectorStable: true },
  { pdgId: 13, name: 'muon', symbol: 'μ⁻', antiSymbol: 'μ⁺', massGeV: MUON_MASS_GEV, charge: -1, category: 'charged-lepton', detectorStable: true },
  { pdgId: 14, name: 'muon neutrino', symbol: 'ν_μ', antiSymbol: 'ν̄_μ', massGeV: 0, charge: 0, category: 'neutrino', detectorStable: true },
  { pdgId: 15, name: 'tau', symbol: 'τ⁻', antiSymbol: 'τ⁺', massGeV: TAU_MASS_GEV, charge: -1, category: 'charged-lepton', detectorStable: false },
  { pdgId: 16, name: 'tau neutrino', symbol: 'ν_τ', antiSymbol: 'ν̄_τ', massGeV: 0, charge: 0, category: 'neutrino', detectorStable: true },
  { pdgId: 22, name: 'photon', symbol: 'γ', antiSymbol: 'γ', massGeV: 0, charge: 0, category: 'photon', detectorStable: true },
  { pdgId: 23, name: 'Z boson', symbol: 'Z', antiSymbol: 'Z', massGeV: Z_MASS_GEV, charge: 0, category: 'gauge-boson', detectorStable: false },
  { pdgId: 24, name: 'W boson', symbol: 'W⁺', antiSymbol: 'W⁻', massGeV: W_MASS_GEV, charge: 1, category: 'gauge-boson', detectorStable: false },
  { pdgId: 25, name: 'Higgs boson', symbol: 'H', antiSymbol: 'H', massGeV: HIGGS_MASS_GEV, charge: 0, category: 'higgs', detectorStable: false },
  { pdgId: 111, name: 'neutral pion', symbol: 'π⁰', antiSymbol: 'π⁰', massGeV: PION_NEUTRAL_MASS_GEV, charge: 0, category: 'meson', detectorStable: false },
  { pdgId: 211, name: 'charged pion', symbol: 'π⁺', antiSymbol: 'π⁻', massGeV: PION_CHARGED_MASS_GEV, charge: 1, category: 'meson', detectorStable: true },
  { pdgId: 130, name: 'K-long', symbol: 'K⁰_L', antiSymbol: 'K⁰_L', massGeV: KAON_NEUTRAL_MASS_GEV, charge: 0, category: 'meson', detectorStable: true },
  { pdgId: 310, name: 'K-short', symbol: 'K⁰_S', antiSymbol: 'K⁰_S', massGeV: KAON_NEUTRAL_MASS_GEV, charge: 0, category: 'meson', detectorStable: false },
  { pdgId: 321, name: 'charged kaon', symbol: 'K⁺', antiSymbol: 'K⁻', massGeV: KAON_CHARGED_MASS_GEV, charge: 1, category: 'meson', detectorStable: true },
  { pdgId: 521, name: 'B meson', symbol: 'B⁺', antiSymbol: 'B⁻', massGeV: B_MESON_MASS_GEV, charge: 1, category: 'meson', detectorStable: false },
  { pdgId: 2212, name: 'proton', symbol: 'p', antiSymbol: 'p̄', massGeV: PROTON_MASS_GEV, charge: 1, category: 'baryon', detectorStable: true },
  { pdgId: 2112, name: 'neutron', symbol: 'n', antiSymbol: 'n̄', massGeV: NEUTRON_MASS_GEV, charge: 0, category: 'baryon', detectorStable: true },
  { pdgId: 3122, name: 'Lambda', symbol: 'Λ', antiSymbol: 'Λ̄', massGeV: LAMBDA_MASS_GEV, charge: 0, category: 'baryon', detectorStable: false },
];

function q(pdgId: number, name: string, symbol: string, antiSymbol: string, massGeV: number, charge: number): ParticleDefinition {
  return { pdgId, name, symbol, antiSymbol, massGeV, charge, category: 'quark', detectorStable: false };
}

const BY_PDG = new Map<number, ParticleDefinition>(DEFS.map((d) => [d.pdgId, d]));

/** Particles that are their own antiparticle — a negative code is invalid for these. */
const SELF_CONJUGATE = new Set([21, 22, 23, 25, 111, 130, 310]);

export const ParticleDatabase = {
  all(): readonly ParticleDefinition[] {
    return DEFS;
  },

  has(pdgId: number): boolean {
    return BY_PDG.has(Math.abs(pdgId)) || isNucleusCode(pdgId);
  },

  /** Resolves a signed PDG code (antiparticles flip charge and symbol). */
  lookup(pdgId: number): ResolvedParticle {
    if (isNucleusCode(pdgId)) return resolveNucleus(pdgId);
    const def = BY_PDG.get(Math.abs(pdgId));
    if (!def) {
      return { pdgId, name: `unknown (${pdgId})`, symbol: `?${pdgId}`, massGeV: 0, charge: 0, category: 'meson', detectorStable: false };
    }
    const anti = pdgId < 0 && !SELF_CONJUGATE.has(def.pdgId);
    return {
      pdgId,
      name: anti ? `anti-${def.name}` : def.name,
      symbol: anti ? def.antiSymbol : def.symbol,
      massGeV: def.massGeV,
      charge: anti ? -def.charge : def.charge,
      category: def.category,
      detectorStable: def.detectorStable,
    };
  },
};

function isNucleusCode(pdgId: number): boolean {
  return Math.abs(pdgId) >= 1_000_000_000;
}

function resolveNucleus(pdgId: number): ResolvedParticle {
  const code = Math.abs(pdgId);
  const Z = Math.floor((code % 10_000_000) / 10_000);
  const A = Math.floor((code % 10_000) / 10);
  const ion = IONS.find((i) => i.Z === Z && i.A === A);
  const species = ion ? ionToBeamSpecies(ion) : undefined;
  return {
    pdgId,
    name: species ? species.label : `nucleus Z=${Z} A=${A}`,
    symbol: species ? species.symbol : `(${Z},${A})`,
    massGeV: species ? species.massGeV : 0,
    charge: Z,
    category: 'nucleus',
    detectorStable: true,
  };
}

// ---- Beam species ------------------------------------------------------------------------

export const BEAM_SPECIES: readonly BeamSpecies[] = [
  {
    id: 'proton', label: 'Proton', symbol: 'p', kind: 'hadron', massGeV: PROTON_MASS_GEV,
    chargeE: 1, Z: 1, A: 1, pdgId: 2212, circulatable: true, source: 'PDG2024',
  },
  ...IONS.map(ionToBeamSpecies),
  {
    id: 'antiproton', label: 'Antiproton', symbol: 'p̄', kind: 'hadron', massGeV: PROTON_MASS_GEV,
    chargeE: -1, Z: 1, A: 1, pdgId: -2212, circulatable: true, source: 'PDG2024',
  },
  {
    id: 'electron', label: 'Electron', symbol: 'e⁻', kind: 'lepton', massGeV: ELECTRON_MASS_GEV,
    chargeE: -1, Z: 0, A: 0, pdgId: 11, circulatable: true, source: 'PDG2024',
  },
  {
    id: 'positron', label: 'Positron', symbol: 'e⁺', kind: 'lepton', massGeV: ELECTRON_MASS_GEV,
    chargeE: 1, Z: 0, A: 0, pdgId: -11, circulatable: true, source: 'PDG2024',
  },
  {
    id: 'muon', label: 'Muon (μ⁺)', symbol: 'μ⁺', kind: 'lepton', massGeV: MUON_MASS_GEV,
    chargeE: 1, Z: 0, A: 0, pdgId: -13, circulatable: true, properLifetimeS: MUON_LIFETIME_S, source: 'PDG2024',
  },
  {
    id: 'neutron', label: 'Neutron', symbol: 'n', kind: 'neutral', massGeV: NEUTRON_MASS_GEV,
    chargeE: 0, Z: 0, A: 1, pdgId: 2112, circulatable: false,
    notCirculatableReason:
      'Neutrons carry no electric charge, so dipole magnets cannot bend them onto a closed orbit ' +
      '(Lorentz force qv×B = 0). They appear only as nuclear constituents or collision products.',
    source: 'PDG2024',
  },
];

export function beamSpeciesById(id: string): BeamSpecies | undefined {
  return BEAM_SPECIES.find((s) => s.id === id);
}

/** Species that may be offered in the beam selector. Neutral species are excluded. */
export function selectableBeamSpecies(): readonly BeamSpecies[] {
  return BEAM_SPECIES.filter((s) => s.circulatable);
}
