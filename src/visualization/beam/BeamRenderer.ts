/**
 * Ring-scale beam visualization — AUGMENTED only.
 *  - Bunch positions of the two counter-rotating beams (bunches themselves are invisible
 *    to the eye; markers are hugely enlarged and the motion is slowed).
 *  - Synchrotron photons emitted tangentially (radiation cone ~1/γ) — rate derived from
 *    the physics U₀ on a log scale: "Visualization amplified".
 * All per-frame updates reuse preallocated buffers.
 */
import { Color, Group, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, SphereGeometry, Vector3 } from 'three/webgpu';
import { Rng, seedFrom } from '../../utils/math';

const BUNCH_MARKERS_PER_BEAM = 72;
const PHOTON_POOL = 500;
/** Photon marker travel distance before fading [m] (schematic scale). */
const PHOTON_TRAVEL_M = 900;
const PHOTON_LIFETIME_S = 1.2;
/** Schematic display: one revolution takes this many wall-clock seconds. */
export const DISPLAY_REVOLUTION_S = 24;

export class BeamRenderer {
  readonly group = new Group();
  private readonly bunches: InstancedMesh;
  private readonly photons: InstancedMesh;
  private readonly pAge = new Float32Array(PHOTON_POOL).fill(-1);
  private readonly pOrigin = new Float32Array(PHOTON_POOL * 3);
  private readonly pDir = new Float32Array(PHOTON_POOL * 3);
  private readonly rng = new Rng(seedFrom('sr-photons'));
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private phase = 0;
  private emitAcc = 0;
  /** Photons per second (display), set from U₀. */
  photonRate = 0;
  showPhotons = false;

  constructor(private readonly radius: number, markerSize: number) {
    this.bunches = new InstancedMesh(new SphereGeometry(markerSize, 10, 8), new MeshBasicNodeMaterial({ color: 0xffffff }), BUNCH_MARKERS_PER_BEAM * 2);
    const c1 = new Color('#4aa3ff'), c2 = new Color('#ff6b5e');
    for (let i = 0; i < BUNCH_MARKERS_PER_BEAM * 2; i++) this.bunches.setColorAt(i, i < BUNCH_MARKERS_PER_BEAM ? c1 : c2);
    this.photons = new InstancedMesh(new SphereGeometry(markerSize * 0.45, 6, 4), new MeshBasicNodeMaterial({ color: '#e9d8ff', transparent: true, opacity: 0.85 }), PHOTON_POOL);
    this.photons.count = 0;
    this.bunches.frustumCulled = false;
    this.photons.frustumCulled = false;
    this.group.add(this.bunches, this.photons);
  }

  /**
   * Log-scale mapping from U₀ [eV/turn] to a display emission rate. Protons at 7 TeV
   * (~7 keV) give a trickle; multi-TeV electrons saturate the pool.
   */
  static rateForLoss(u0eV: number): number {
    if (!(u0eV > 0)) return 0;
    return Math.min(600, Math.max(0, (Math.log10(u0eV) - 2) * 40));
  }

  update(dt: number): void {
    this.phase = (this.phase + dt / DISPLAY_REVOLUTION_S) % 1;
    const n = BUNCH_MARKERS_PER_BEAM;
    for (let b = 0; b < 2; b++) {
      for (let i = 0; i < n; i++) {
        // Bunch trains fill ~3/4 of the ring (abort gap left empty).
        const frac = (i / n) * 0.76;
        const a = (b === 0 ? this.phase + frac : -this.phase - frac) * Math.PI * 2;
        const r = this.radius + (b === 0 ? -8 : 8);
        this.m4.makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r);
        this.bunches.setMatrixAt(b * n + i, this.m4);
      }
    }
    this.bunches.instanceMatrix.needsUpdate = true;

    if (this.showPhotons && this.photonRate > 0) {
      this.emitAcc += this.photonRate * dt;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        this.emit();
      }
    }
    let alive = 0;
    for (let i = 0; i < PHOTON_POOL; i++) {
      if (this.pAge[i]! < 0) continue;
      this.pAge[i]! += dt;
      if (this.pAge[i]! > PHOTON_LIFETIME_S || !this.showPhotons) {
        this.pAge[i] = -1;
        continue;
      }
      const d = (this.pAge[i]! / PHOTON_LIFETIME_S) * PHOTON_TRAVEL_M;
      this.v.set(this.pOrigin[3 * i]! + this.pDir[3 * i]! * d, 0, this.pOrigin[3 * i + 2]! + this.pDir[3 * i + 2]! * d);
      this.m4.compose(this.v, this.q, this.s.setScalar(1 - this.pAge[i]! / PHOTON_LIFETIME_S));
      this.photons.setMatrixAt(alive++, this.m4);
    }
    this.photons.count = alive;
    this.photons.instanceMatrix.needsUpdate = true;
  }

  private emit(): void {
    const slot = this.pAge.indexOf(-1);
    if (slot < 0) return;
    const beam = this.rng.bernoulli(0.5) ? 0 : 1;
    const i = this.rng.int(0, BUNCH_MARKERS_PER_BEAM);
    const frac = (i / BUNCH_MARKERS_PER_BEAM) * 0.76;
    const a = (beam === 0 ? this.phase + frac : -this.phase - frac) * Math.PI * 2;
    const r = this.radius + (beam === 0 ? -8 : 8);
    this.pOrigin[3 * slot] = Math.cos(a) * r;
    this.pOrigin[3 * slot + 2] = Math.sin(a) * r;
    // Tangent along the direction of motion (beam 1 increasing a, beam 2 decreasing).
    const sgn = beam === 0 ? 1 : -1;
    this.pDir[3 * slot] = -Math.sin(a) * sgn;
    this.pDir[3 * slot + 2] = Math.cos(a) * sgn;
    this.pAge[slot] = 0;
  }

  dispose(): void {
    this.bunches.geometry.dispose();
    (this.bunches.material as MeshBasicNodeMaterial).dispose();
    this.photons.geometry.dispose();
    (this.photons.material as MeshBasicNodeMaterial).dispose();
  }
}
