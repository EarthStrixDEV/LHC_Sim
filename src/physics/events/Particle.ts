/**
 * Truth particle (Monte-Carlo truth) — resolved from a ParticleRecord.
 */
import { ParticleDatabase } from '../particles/ParticleDatabase';
import type { ParticleCategory } from '../particles/ParticleDefinition';
import { FourVector } from './FourVector';
import type { ParticleRecord, ParticleStatus, VertexKind } from './EventSchema';

export class TruthParticle {
  readonly id: number;
  readonly pdgId: number;
  readonly status: ParticleStatus;
  readonly charge: number;
  readonly p4: FourVector;
  readonly mass: number;
  readonly productionVertex: number;
  readonly decayVertex: number | null;
  readonly parents: readonly number[];
  readonly children: readonly number[];
  readonly symbol: string;
  readonly name: string;
  readonly category: ParticleCategory;
  /** Origin category of the production vertex (filled by TruthEvent). */
  origin: VertexKind = 'primary';

  constructor(rec: ParticleRecord) {
    this.id = rec.id;
    this.pdgId = rec.pdg;
    this.status = rec.status;
    this.charge = rec.charge;
    this.p4 = FourVector.fromArray(rec.p);
    this.mass = rec.m;
    this.productionVertex = rec.prodVtx;
    this.decayVertex = rec.decayVtx;
    this.parents = rec.parents;
    this.children = rec.children;
    const def = ParticleDatabase.lookup(rec.pdg);
    this.symbol = def.symbol;
    this.name = def.name;
    this.category = def.category;
  }

  get isFinal(): boolean {
    return this.status === 1;
  }

  get isCharged(): boolean {
    return this.charge !== 0;
  }

  get pt(): number {
    return this.p4.pt();
  }

  get eta(): number {
    return this.p4.eta();
  }

  get phi(): number {
    return this.p4.phi();
  }

  get isNeutrino(): boolean {
    return this.category === 'neutrino';
  }
}
