/**
 * Generates the curated, synthetic Phase 1 event samples into src/data/events/.
 *
 *   npm run generate:events
 *
 * Deterministic: every event is seeded from (sample id, event index). Re-running the
 * script reproduces byte-identical files. See scripts/toygen.ts for the (toy) physics.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FourVector } from '../src/physics/events/FourVector';
import { EVENT_SCHEMA_ID, type EventRecord, type EventSampleFile, type SampleMetadata } from '../src/physics/events/EventSchema';
import {
  B_MESON_MASS_GEV,
  ELECTRON_MASS_GEV,
  HIGGS_MASS_GEV,
  LAMBDA_MASS_GEV,
  MUON_MASS_GEV,
  PROTON_MASS_GEV,
  TOP_MASS_GEV,
  TOP_WIDTH_GEV,
  W_MASS_GEV,
  W_WIDTH_GEV,
  Z_MASS_GEV,
  Z_WIDTH_GEV,
} from '../src/physics/constants/physicalConstants';
import { beamSpeciesById } from '../src/physics/particles/ParticleDatabase';
import { clamp, Rng, seedFrom, TWO_PI } from '../src/utils/math';
import { addSoft, beamSpotVertex, CTAU_B_MESON_M, EventBuilder, fragment, twoBody, addHadron } from './toygen';

const GENERATOR = 'lhcsim-toygen 1.0 (educational toy generator — not PYTHIA)';
const PP_SQRT_S = 13_600;
const PB = beamSpeciesById('Pb208')!;
const PB_ENERGY = PB.Z * 6_800; // proton-equivalent 6.8 TeV rigidity
const PBPB_SQRT_SNN = 2 * (PB_ENERGY / PB.A);
const B_QUARK_MASS = 4.8;
const HIGGS_WIDTH = 0.0041;

const COMMON_NOTES = [
  'SYNTHETIC / CURATED: produced by the lhcsim toy generator, not by PYTHIA, Geant4 or a real experiment.',
  'Kinematics are self-consistent (four-momentum conserved in decays) but spectra and rates are illustrative only.',
  'Underlying-event and pile-up particles carry no mother links in this toy record.',
  'pp samples contain 2 pile-up vertices (Run 3 has ⟨μ⟩ ≈ 50) for readability.',
];

// ---- Shared pieces -------------------------------------------------------------------------------

interface PPContext { b: EventBuilder; pv: number; beams: [number, number]; rng: Rng }

/** Pile-up is reduced far below Run 3 (⟨μ⟩ ≈ 50) so that the display stays readable. */
function ppEvent(sampleId: string, index: number, pileupVertices = 2): PPContext {
  const rng = new Rng(seedFrom(sampleId, index));
  const b = new EventBuilder();
  const pv = beamSpotVertex(b, 'primary', rng);
  const pBeam = Math.sqrt((PP_SQRT_S / 2) ** 2 - PROTON_MASS_GEV ** 2);
  const b1 = b.add(2212, 4, new FourVector(PP_SQRT_S / 2, 0, 0, pBeam), PROTON_MASS_GEV, pv);
  const b2 = b.add(2212, 4, new FourVector(PP_SQRT_S / 2, 0, 0, -pBeam), PROTON_MASS_GEV, pv);
  b.decayAt(b1, pv);
  b.decayAt(b2, pv);
  // Underlying event at the primary vertex, then pile-up vertices.
  addSoft(b, pv, 16, 2.7, 0.22, rng);
  for (let i = 0; i < pileupVertices; i++) {
    const v = beamSpotVertex(b, 'pileup', rng);
    addSoft(b, v, 6 + rng.int(0, 5), 2.7, 0.2, rng);
  }
  return { b, pv, beams: [b1, b2], rng };
}

/** Incoming partons (status 3) carrying the longitudinal momentum of the hard system. */
function incomingPartons(ctx: PPContext, system: FourVector, pdg1: number, pdg2: number): [number, number] {
  const { b, pv, beams } = ctx;
  const x1 = clamp((system.e + system.pz) / PP_SQRT_S, 1e-6, 1);
  const x2 = clamp((system.e - system.pz) / PP_SQRT_S, 1e-6, 1);
  const e1 = (x1 * PP_SQRT_S) / 2;
  const e2 = (x2 * PP_SQRT_S) / 2;
  const p1 = b.add(pdg1, 3, new FourVector(e1, 0, 0, e1), 0, pv, [beams[0]]);
  const p2 = b.add(pdg2, 3, new FourVector(e2, 0, 0, -e2), 0, pv, [beams[1]]);
  b.decayAt(p1, pv);
  b.decayAt(p2, pv);
  return [p1, p2];
}

/** Recoil ISR parton balancing the boson transverse momentum, then fragmented. */
function recoilJet(ctx: PPContext, boson: FourVector, parents: number[]): void {
  const pt = boson.pt();
  const y = ctx.rng.gaussian(0, 1.8);
  const phi = boson.phi() + Math.PI;
  const g = ctx.b.add(21, 1, FourVector.fromPtYPhiM(pt, y, phi, 0), 0, ctx.pv, parents);
  fragment(ctx.b, g, ctx.pv, ctx.rng);
}

function finish(ctx: PPContext, eventId: number, process: string, seed: number, truthInfo?: Record<string, number>): EventRecord {
  const { vertices, particles } = ctx.b.toRecords();
  return { eventId, process, seed, vertices, particles, ...(truthInfo ? { truthInfo } : {}) };
}

// ---- Processes --------------------------------------------------------------------------------------

function dileptonEvent(sampleId: string, index: number, leptonPdg: 11 | 13): EventRecord {
  const ctx = ppEvent(sampleId, index);
  const { b, pv, rng } = ctx;
  const M = rng.breitWigner(Z_MASS_GEV, Z_WIDTH_GEV, 66, 116);
  const z4 = FourVector.fromPtYPhiM(rng.exponential(6) + 0.3, clamp(rng.gaussian(0, 1.2), -2.4, 2.4), rng.uniform(-Math.PI, Math.PI), M);
  const q = rng.pick([1, 2, 3, 4]);
  const partons = incomingPartons(ctx, z4, q, -q);
  const z = b.add(23, 2, z4, M, pv, partons);
  b.decayAt(z, pv);
  const ml = leptonPdg === 13 ? MUON_MASS_GEV : ELECTRON_MASS_GEV;
  const [l1, l2] = twoBody(z4, ml, ml, rng);
  b.add(leptonPdg, 1, l1, ml, pv, [z]);
  b.add(-leptonPdg, 1, l2, ml, pv, [z]);
  recoilJet(ctx, z4, partons);
  return finish(ctx, index, leptonPdg === 13 ? 'q q̄ → Z → μ⁺μ⁻' : 'q q̄ → Z → e⁺e⁻', seedFrom(sampleId, index), { resonanceMassGeV: M });
}

function diphotonEvent(sampleId: string, index: number): EventRecord {
  const ctx = ppEvent(sampleId, index);
  const { b, pv, rng } = ctx;
  const M = rng.breitWigner(HIGGS_MASS_GEV, HIGGS_WIDTH, HIGGS_MASS_GEV - 1, HIGGS_MASS_GEV + 1);
  const h4 = FourVector.fromPtYPhiM(rng.exponential(12) + 0.5, clamp(rng.gaussian(0, 1.3), -2.4, 2.4), rng.uniform(-Math.PI, Math.PI), M);
  const partons = incomingPartons(ctx, h4, 21, 21);
  const h = b.add(25, 2, h4, M, pv, partons);
  b.decayAt(h, pv);
  const [g1, g2] = twoBody(h4, 0, 0, rng);
  b.add(22, 1, g1, 0, pv, [h]);
  b.add(22, 1, g2, 0, pv, [h]);
  recoilJet(ctx, h4, partons);
  return finish(ctx, index, 'g g → H → γγ', seedFrom(sampleId, index), { resonanceMassGeV: M });
}

function multijetEvent(sampleId: string, index: number): EventRecord {
  const ctx = ppEvent(sampleId, index);
  const { b, pv, rng } = ctx;
  const pt1 = 60 + rng.exponential(80);
  const phi1 = rng.uniform(-Math.PI, Math.PI);
  const jets: FourVector[] = [];
  let recoilX = 0, recoilY = 0;
  if (rng.bernoulli(0.45)) {
    const pt3 = 25 + rng.exponential(25);
    const phi3 = phi1 + rng.uniform(0.8, 2.2) * (rng.bernoulli(0.5) ? 1 : -1);
    const j3 = FourVector.fromPtYPhiM(pt3, rng.uniform(-2.3, 2.3), phi3, 0);
    jets.push(j3);
    recoilX += j3.px; recoilY += j3.py;
  }
  const j1 = FourVector.fromPtYPhiM(pt1, rng.uniform(-2.2, 2.2), phi1, 0);
  // Second jet balances the transverse momentum of the others (exact pT balance).
  const bx = -(j1.px + recoilX), by = -(j1.py + recoilY);
  const j2 = FourVector.fromPtYPhiM(Math.hypot(bx, by), rng.uniform(-2.2, 2.2), Math.atan2(by, bx), 0);
  jets.unshift(j1, j2);
  const flav = () => (rng.bernoulli(0.6) ? 21 : rng.pick([1, 2, -1, -2, 3]));
  const partons = incomingPartons(ctx, FourVector.sum(jets), flav(), flav());
  for (const j of jets) {
    const id = b.add(flav(), 1, j, 0, pv, partons);
    fragment(b, id, pv, rng);
  }
  return finish(ctx, index, jets.length === 3 ? 'pp → 3 jets' : 'pp → 2 jets', seedFrom(sampleId, index), { leadingPartonPtGeV: pt1 });
}

function ttbarEvent(sampleId: string, index: number): EventRecord {
  const ctx = ppEvent(sampleId, index);
  const { b, pv, rng } = ctx;
  const mt1 = rng.breitWigner(TOP_MASS_GEV, TOP_WIDTH_GEV, 165, 180);
  const mt2 = rng.breitWigner(TOP_MASS_GEV, TOP_WIDTH_GEV, 165, 180);
  const pt = rng.exponential(70) + 10;
  const phi = rng.uniform(-Math.PI, Math.PI);
  const y1 = clamp(rng.gaussian(0, 1), -2.2, 2.2);
  const y2 = clamp(rng.gaussian(0.5 * y1, 1), -2.2, 2.2);
  const t4 = FourVector.fromPtYPhiM(pt, y1, phi, mt1);
  const tb4 = FourVector.fromPtYPhiM(pt, y2, phi + Math.PI, mt2);
  const partons = incomingPartons(ctx, t4.add(tb4), 21, 21);
  const leptonicTop = rng.bernoulli(0.5); // true: t → W⁺ → μ⁺ν ; false: t̄ → W⁻ → μ⁻ν̄
  const wMasses: number[] = [];

  const decayTop = (topPdg: 6 | -6, top4: FourVector, mt: number): void => {
    const top = b.add(topPdg, 2, top4, mt, pv, partons);
    b.decayAt(top, pv);
    const mW = rng.breitWigner(W_MASS_GEV, W_WIDTH_GEV, 60, Math.min(100, mt - B_QUARK_MASS - 1));
    wMasses.push(mW);
    const [w4, b4] = twoBody(top4, mW, B_QUARK_MASS, rng);
    const sign = Math.sign(topPdg);
    const w = b.add(24 * sign, 2, w4, mW, pv, [top]);
    b.decayAt(w, pv);
    const bq = b.add(5 * sign, 1, b4, B_QUARK_MASS, pv, [top]);
    // b → B̄ hadron (b ū = B⁻, pdg −521); b̄ → B⁺.
    fragment(b, bq, pv, rng, { leading: { pdg: -521 * sign, mass: B_MESON_MASS_GEV, zMean: 0.75, ctauM: CTAU_B_MESON_M } });
    const leptonic = (sign > 0) === leptonicTop;
    if (leptonic) {
      const [l4, n4] = twoBody(w4, MUON_MASS_GEV, 0, rng);
      b.add(-13 * sign, 1, l4, MUON_MASS_GEV, pv, [w]); // W⁺ → μ⁺ ν_μ
      b.add(14 * sign, 1, n4, 0, pv, [w]);
    } else {
      const [q4, qb4] = twoBody(w4, 0, 0, rng);
      const q = b.add(sign > 0 ? 2 : 1, 1, q4, 0, pv, [w]); // W⁺ → u d̄ ; W⁻ → d ū
      const qb = b.add(sign > 0 ? -1 : -2, 1, qb4, 0, pv, [w]);
      fragment(b, q, pv, rng);
      fragment(b, qb, pv, rng);
    }
  };
  decayTop(6, t4, mt1);
  decayTop(-6, tb4, mt2);
  return finish(ctx, index, 'g g → t t̄ → (W b)(W b̄) → μ ν b + q q̄′ b̄', seedFrom(sampleId, index), {
    topMassGeV: mt1,
    antiTopMassGeV: mt2,
    wMassLeptonicGeV: wMasses[leptonicTop ? 0 : 1]!,
  });
}

function heavyIonEvent(sampleId: string, index: number, dNchDeta: number, label: string): EventRecord {
  const rng = new Rng(seedFrom(sampleId, index));
  const b = new EventBuilder();
  const pv = b.addVertex('primary', rng.gaussian(0, 12e-6), rng.gaussian(0, 12e-6), rng.gaussian(0, 0.05), rng.gaussian(0, 0.2));
  const pPb = Math.sqrt(PB_ENERGY ** 2 - PB.massGeV ** 2);
  const n1 = b.add(PB.pdgId, 4, new FourVector(PB_ENERGY, 0, 0, pPb), PB.massGeV, pv);
  const n2 = b.add(PB.pdgId, 4, new FourVector(PB_ENERGY, 0, 0, -pPb), PB.massGeV, pv);
  b.decayAt(n1, pv);
  b.decayAt(n2, pv);

  const etaMax = 2.7;
  const chargedFraction = 0.7; // charged share of the toy hadron mix (see HADRON_TABLE)
  const nHadrons = Math.round((dNchDeta * 2 * etaMax) / chargedFraction);
  addSoft(b, pv, nHadrons, etaMax, 0.28, rng, { v2: 0.08, psi: rng.uniform(0, TWO_PI) });

  // A few Λ baryons (strangeness enhancement) — secondary vertices.
  for (let i = 0; i < Math.round(dNchDeta / 40); i++) {
    const pdg = rng.bernoulli(0.5) ? 3122 : -3122;
    const p4 = FourVector.fromPtEtaPhiM(0.5 + rng.exponential(1), rng.uniform(-2.4, 2.4), rng.uniform(-Math.PI, Math.PI), LAMBDA_MASS_GEV);
    addHadron(b, pdg, p4, LAMBDA_MASS_GEV, pv, [], rng);
  }

  // Embedded hard dijet (jets are quenched in the QGP; not modelled — toy only).
  const pt = 50 + rng.exponential(40);
  const phi = rng.uniform(-Math.PI, Math.PI);
  for (const [ptj, phij] of [[pt, phi], [pt * rng.uniform(0.55, 0.9), phi + Math.PI]] as const) {
    const g = b.add(21, 1, FourVector.fromPtYPhiM(ptj, rng.uniform(-2, 2), phij, 0), 0, pv, [n1, n2]);
    fragment(b, g, pv, rng);
  }
  const { vertices, particles } = b.toRecords();
  return { eventId: index, process: `Pb–Pb ${label} (dN_ch/dη ≈ ${dNchDeta}) + embedded dijet`, seed: seedFrom(sampleId, index), vertices, particles };
}

// ---- Samples -----------------------------------------------------------------------------------------

interface SampleSpec {
  meta: Omit<SampleMetadata, 'synthetic' | 'generator' | 'seed' | 'notes'> & { notes?: string[] };
  count: number;
  make: (index: number) => EventRecord;
}

const SAMPLES: SampleSpec[] = [
  {
    meta: {
      id: 'zmumu', title: 'Z → μ⁺μ⁻', process: 'q q̄ → Z/γ* → μ⁺μ⁻ (Z only)', collisionSystem: 'pp', sqrtSGeV: PP_SQRT_S,
      description: 'Drell–Yan Z boson decaying to a muon pair, with a recoil jet, underlying event and 3 pile-up vertices.',
      intendedMassGeV: Z_MASS_GEV, analysisPair: 'muon',
      notes: ['Z line shape: Breit–Wigner (91.1876 GeV, Γ = 2.4952 GeV) truncated to 66–116 GeV; γ* interference omitted.'],
    },
    count: 100,
    make: (i) => dileptonEvent('zmumu', i, 13),
  },
  {
    meta: {
      id: 'hgg', title: 'H → γγ', process: 'g g → H → γγ', collisionSystem: 'pp', sqrtSGeV: PP_SQRT_S,
      description: 'Higgs-like scalar at 125.2 GeV decaying to two photons (signal only — no γγ continuum background).',
      intendedMassGeV: HIGGS_MASS_GEV, analysisPair: 'photon',
      notes: ['Natural width 4.1 MeV; the observed peak width comes from the simulated ECAL resolution.'],
    },
    count: 100,
    make: (i) => diphotonEvent('hgg', i),
  },
  {
    meta: {
      id: 'zee', title: 'Z → e⁺e⁻', process: 'q q̄ → Z → e⁺e⁻', collisionSystem: 'pp', sqrtSGeV: PP_SQRT_S,
      description: 'Drell–Yan Z boson decaying to an electron pair.',
      intendedMassGeV: Z_MASS_GEV, analysisPair: 'electron',
      notes: ['Bremsstrahlung in tracker material is not simulated.'],
    },
    count: 60,
    make: (i) => dileptonEvent('zee', i, 11),
  },
  {
    meta: {
      id: 'dijet', title: 'Multijet', process: 'pp → 2/3 jets (QCD)', collisionSystem: 'pp', sqrtSGeV: PP_SQRT_S,
      description: 'Hard QCD scattering producing two or three high-pT jets from toy parton fragmentation.',
      notes: ['Toy fragmentation conserves parton 3-momentum; no parton shower or hadronization model.'],
    },
    count: 25,
    make: (i) => multijetEvent('dijet', i),
  },
  {
    meta: {
      id: 'ttbar', title: 'tt̄ (lepton + jets)', process: 'g g → t t̄ → μ ν b q q̄′ b̄', collisionSystem: 'pp', sqrtSGeV: PP_SQRT_S,
      description: 'Educational top-pair sample: one W decays to μν (MET from the neutrino), the other to two quarks; b-hadrons decay at displaced vertices.',
      notes: ['Spin correlations and top polarization ignored; W decays to μ only.'],
    },
    count: 15,
    make: (i) => ttbarEvent('ttbar', i),
  },
  {
    meta: {
      id: 'pbpb', title: 'Pb–Pb (simplified)', process: 'Pb–Pb bulk + embedded dijet', collisionSystem: 'PbPb', sqrtSGeV: PBPB_SQRT_SNN,
      description: 'Simplified high-multiplicity heavy-ion event: thermal-like soft spectrum with elliptic flow (v₂) and an embedded dijet.',
      notes: [
        'Multiplicities reduced relative to 0–5 % central Pb–Pb (dN_ch/dη ≈ 2000) to keep the display usable.',
        'No jet quenching, no collective radial flow, no spectator fragments.',
      ],
    },
    count: 2,
    make: (i) => (i === 0 ? heavyIonEvent('pbpb', 0, 350, 'semi-central') : heavyIonEvent('pbpb', 1, 120, 'peripheral')),
  },
];

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/events');
mkdirSync(outDir, { recursive: true });

for (const spec of SAMPLES) {
  const events = Array.from({ length: spec.count }, (_, i) => spec.make(i));
  const file: EventSampleFile = {
    schema: EVENT_SCHEMA_ID,
    sample: {
      ...spec.meta,
      synthetic: true,
      generator: GENERATOR,
      seed: seedFrom(spec.meta.id),
      notes: [...COMMON_NOTES, ...(spec.meta.notes ?? [])],
    },
    events,
  };
  const path = resolve(outDir, `${spec.meta.id}.json`);
  const json = JSON.stringify(file);
  writeFileSync(path, json);
  const nPart = events.reduce((a, e) => a + e.particles.length, 0);
  console.log(`${spec.meta.id}: ${events.length} events, ${nPart} particles, ${(json.length / 1024).toFixed(0)} KiB`);
}
