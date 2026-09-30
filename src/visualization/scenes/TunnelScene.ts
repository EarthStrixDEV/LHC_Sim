/**
 * TUNNEL domain — a few FODO cells of an LHC arc. Origin: magnet axis at the start of the
 * first cell; the axis follows the true dipole bending radius (ρ = 2804 m). Magnet
 * positions come from the physics FODO lattice layout. Repeated structure is instanced.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import { LHC } from '../../physics/constants/acceleratorConstants';
import type { MagnetState } from '../../physics/accelerator/MagnetModel';
import { quenchV2Snapshot } from '../../physics/accelerator/QuenchModelV2';
import { Rng, seedFrom } from '../../utils/math';
import { buildEnvelopeTube, envelopeExaggeration, type ArcFrame } from '../beam/BeamEnvelopeRenderer';
import { logNorm, sampleColormap, type RGB } from '../colors/Colormaps';
import { quenchSimTime } from '../quenchPlayback';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { standardLights } from './sceneUtils';

const RHO = LHC.dipoleBendingRadius.value;
const TUNNEL_R = LHC.tunnelDiameter.value / 2;
const FLOOR_Y = -1.0;
/** Tunnel axis offset from the magnet axis toward the ring centre / upward [m]. */
const TUNNEL_LATERAL = 0.75;
const TUNNEL_Y = 0.3;
const CRYO_R = LHC.cryostatOuterDiameter.value / 2;
const APERTURE_HALF_SEP = LHC.dipoleApertureSeparation.value / 2;
const SEGMENT_M = 10;
/** Short straight section cryostat length [m] (quadrupole + correctors). */
const SSS_LENGTH_M = 6.6;
const DIPOLE_CRYO_EXTRA_M = 0.9;

const STATE_COLOR: Record<MagnetState, string> = { STABLE: '#22c55e', LOW_MARGIN: '#f59e0b', QUENCH_RISK: '#f97316', QUENCHED: '#ef4444' };

const frame: ArcFrame = {
  point(s, o) {
    o.x = RHO * Math.sin(s / RHO);
    o.y = 0;
    o.z = RHO * (1 - Math.cos(s / RHO));
  },
  lateral(s, o) {
    o.x = -Math.sin(s / RHO);
    o.y = 0;
    o.z = Math.cos(s / RHO);
  },
};

export class TunnelScene extends SceneDomain {
  readonly id: SceneId = 'tunnel';
  readonly title = 'LHC arc tunnel';
  readonly scaleNote = '1 unit = 1 m · origin: magnet axis at cell start · true 2804 m bending radius';
  readonly portals: readonly Portal[] = [
    { label: '← Back to ring', target: 'ring' },
    { label: 'Interaction-region optics →', target: 'ir' },
    { label: 'Point 1: ATLAS cavern →', target: 'cavern' },
  ];

  private totalLength = 0;
  private leds!: InstancedMesh;
  private ledCount = 0;
  private quenchMagnet!: Mesh;
  private quenchMat!: MeshStandardMaterial;
  private quenchLabel = makeLabel('', 'PHYSICS · EDUCATIONAL MODEL', 'lbl-quench');
  private augmented = new Group();
  private overlay = new Group();
  private vapor!: InstancedMesh;
  private vaporAge = new Float32Array(160).fill(-1);
  private vaporSeed = new Float32Array(160 * 3);
  private vaporLabel = makeLabel('Helium venting scenario — cold gas released into the tunnel condenses air humidity', 'PHYSICAL · SCENARIO', 'lbl-amp');
  private rng = new Rng(seedFrom('vapor'));
  private magnetState: MagnetState = "STABLE";
  private readonly cryoMats: MeshStandardMaterial[] = [];
  private cellKey = '';
  private ctx!: DomainContext;
  private readonly tmpM = new Matrix4();
  private readonly tmpV = new Vector3();
  private readonly tmpS = new Vector3();
  private readonly tmpQ = new Quaternion();

  build(ctx: DomainContext): void {
    this.ctx = ctx;
    const s = this.scene;
    s.background = new Color('#0d0f12');
    standardLights(s, ctx, { sky: '#dfe6ee', ground: '#3a3a3a', hemi: 0.55, sun: 0.25, sunPos: [0, 30, 10], envIntensity: 0.35 });
    const cells = ctx.quality.tunnelCells;
    const cellL = ctx.controller.state.beam.cell.params.cellLengthM;
    this.totalLength = cells * cellL;

    this.camera.near = 0.05;
    this.camera.far = 900;
    const eye = this.at(14, TUNNEL_LATERAL + 0.6, FLOOR_Y + 1.65);
    this.camera.position.copy(eye);
    ctx.controls.target.copy(this.at(34, 0.2, 0));
    ctx.controls.minDistance = 0.5;
    ctx.controls.maxDistance = 80;
    this.camera.updateProjectionMatrix();

    this.buildTunnelShell();
    this.buildMagnets(ctx.controller.state);
    this.buildServices();
    this.buildVapor();
    s.add(this.augmented, this.overlay);
    this.rebuildAugmented(ctx.controller.state);
    s.add(this.quenchLabel, this.vaporLabel);
    this.onState(ctx.controller.state);
  }

  /** World position at arc length s with lateral (toward ring centre) and vertical offsets. */
  private at(s: number, lateral: number, y: number, out = new Vector3()): Vector3 {
    const P = { x: 0, y: 0, z: 0 }, L = { x: 0, y: 0, z: 0 };
    frame.point(s, P);
    frame.lateral(s, L);
    return out.set(P.x + L.x * lateral, y, P.z + L.z * lateral);
  }

  /** Rotation aligning local +y with the beam tangent at s. */
  private alongBeam(s: number, q: Quaternion): Quaternion {
    const t = new Vector3(Math.cos(s / RHO), 0, Math.sin(s / RHO));
    return q.setFromUnitVectors(new Vector3(0, 1, 0), t);
  }

  private buildTunnelShell(): void {
    const n = Math.ceil(this.totalLength / SEGMENT_M) + 2;
    const shellGeo = new CylinderGeometry(TUNNEL_R, TUNNEL_R, SEGMENT_M + 0.02, 32, 1, true);
    const shell = new InstancedMesh(shellGeo, new MeshStandardMaterial({ color: '#b9b3a7', roughness: 0.95, side: BackSide }), n);
    const floor = new InstancedMesh(new BoxGeometry(0.12, SEGMENT_M + 0.02, 3.3), new MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 }), n);
    const light = new InstancedMesh(new BoxGeometry(0.05, 1.2, 0.12), new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dd', emissiveIntensity: 2.2 }), n);
    const q = new Quaternion(), p = new Vector3();
    for (let i = 0; i < n; i++) {
      const sMid = (i - 1) * SEGMENT_M + SEGMENT_M / 2;
      this.alongBeam(sMid, q);
      this.tmpM.compose(this.at(sMid, TUNNEL_LATERAL, TUNNEL_Y, p), q, this.tmpS.set(1, 1, 1));
      shell.setMatrixAt(i, this.tmpM);
      this.tmpM.compose(this.at(sMid, TUNNEL_LATERAL, FLOOR_Y - 0.06, p), q, this.tmpS.set(1, 1, 1));
      floor.setMatrixAt(i, this.tmpM);
      this.tmpM.compose(this.at(sMid, TUNNEL_LATERAL + 0.2, TUNNEL_Y + TUNNEL_R - 0.12, p), q, this.tmpS.set(1, 1, 1));
      light.setMatrixAt(i, this.tmpM);
    }
    this.scene.add(shell, floor, light);
  }

  private buildMagnets(state: SimulationState): void {
    const cell = state.beam.cell;
    const L = cell.params.cellLengthM;
    const cells = this.ctx.quality.tunnelCells;
    const dipoles: number[] = [];
    const quads: Array<{ s: number; focusing: boolean }> = [];
    for (let c = 0; c < cells; c++) {
      for (const e of cell.elements) {
        const mid = c * L + e.sStartM + e.lengthM / 2;
        if (e.type === 'dipole') dipoles.push(mid);
        if (e.type === 'quadD') quads.push({ s: mid, focusing: false });
      }
      quads.push({ s: c * L, focusing: true });
    }
    quads.push({ s: cells * L, focusing: true });
    this.cellKey = `${cells}|${L}`;

    const cryoMat = new MeshStandardMaterial({ color: "#2f6fd0", roughness: 0.45, metalness: 0.35 });
    this.cryoMats.push(cryoMat);
    const dipLen = cell.params.dipoleLengthM + DIPOLE_CRYO_EXTRA_M;
    // The first dipole is the one that can be quenched: separate mesh with its own material.
    this.quenchMat = cryoMat.clone();
    this.cryoMats.push(this.quenchMat);
    this.quenchMat.emissive = new Color('#000000');
    const dipGeo = new CylinderGeometry(CRYO_R, CRYO_R, dipLen, 28);
    const dips = new InstancedMesh(dipGeo, cryoMat, Math.max(dipoles.length - 1, 1));
    const q = new Quaternion(), p = new Vector3();
    dipoles.forEach((s, i) => {
      this.alongBeam(s, q);
      this.tmpM.compose(this.at(s, 0, 0, p), q, this.tmpS.set(1, 1, 1));
      if (i === 0) {
        this.quenchMagnet = new Mesh(dipGeo, this.quenchMat);
        this.quenchMagnet.applyMatrix4(this.tmpM);
        this.scene.add(this.quenchMagnet);
      } else dips.setMatrixAt(i - 1, this.tmpM);
    });
    dips.count = Math.max(dipoles.length - 1, 0);
    this.scene.add(dips);

    const sss = new InstancedMesh(new CylinderGeometry(CRYO_R, CRYO_R, SSS_LENGTH_M, 28), cryoMat, quads.length);
    const bandF = new InstancedMesh(new CylinderGeometry(CRYO_R + 0.02, CRYO_R + 0.02, 0.5, 28), new MeshStandardMaterial({ color: '#f59e0b', emissive: '#b45309', emissiveIntensity: 0.6 }), quads.length);
    quads.forEach((qd, i) => {
      this.alongBeam(qd.s, q);
      this.tmpM.compose(this.at(qd.s, 0, 0, p), q, this.tmpS.set(1, 1, 1));
      sss.setMatrixAt(i, this.tmpM);
      bandF.setMatrixAt(i, this.tmpM);
    });
    this.scene.add(sss);
    this.overlay.add(bandF);

    // Dipole bands (overlay) and labels
    const bandD = new InstancedMesh(new CylinderGeometry(CRYO_R + 0.02, CRYO_R + 0.02, 0.35, 28), new MeshStandardMaterial({ color: '#60a5fa', emissive: '#1d4ed8', emissiveIntensity: 0.6 }), dipoles.length);
    dipoles.forEach((s, i) => {
      this.alongBeam(s, q);
      this.tmpM.compose(this.at(s, 0, 0, p), q, this.tmpS.set(1, 1, 1));
      bandD.setMatrixAt(i, this.tmpM);
    });
    this.overlay.add(bandD);
    const ld = makeLabel('DIPOLE = BENDING — 8.3 T vertical field steers the beam around the ring', 'OVERLAY', 'lbl-dipole');
    ld.position.copy(this.at(dipoles[1] ?? 20, 0, 0.9));
    const lq = makeLabel(quads[1]?.focusing === false ? 'QUADRUPOLE (QD) = FOCUSING — focuses y, defocuses x' : 'QUADRUPOLE = FOCUSING', 'OVERLAY', 'lbl-quad');
    lq.position.copy(this.at(quads[1]?.s ?? 50, 0, 1.15));
    const lq2 = makeLabel('QUADRUPOLE (QF) = FOCUSING — focuses x, defocuses y', 'OVERLAY', 'lbl-quad');
    lq2.position.copy(this.at(quads[2]?.s ?? 100, 0, 0.9));
    this.overlay.add(ld, lq, lq2);

    // Status LEDs (PHYSICALLY VISIBLE): one per magnet, color = magnet state.
    const all = [...dipoles, ...quads.map((x) => x.s)];
    this.ledCount = all.length;
    this.leds = new InstancedMesh(new SphereGeometry(0.035, 10, 8), new MeshBasicNodeMaterial({ color: 0xffffff }), all.length);
    all.forEach((s, i) => {
      this.tmpM.makeTranslation(this.at(s - 1.2, -0.3, CRYO_R + 0.06, p));
      this.leds.setMatrixAt(i, this.tmpM);
    });
    this.scene.add(this.leds);
  }

  private buildServices(): void {
    const n = Math.ceil(this.totalLength / SEGMENT_M) + 2;
    const qrl = new InstancedMesh(new CylinderGeometry(0.28, 0.28, SEGMENT_M, 16), new MeshStandardMaterial({ color: '#9aa39a', roughness: 0.5, metalness: 0.5 }), n);
    const tray = new InstancedMesh(new BoxGeometry(0.08, SEGMENT_M, 0.5), new MeshStandardMaterial({ color: '#6b6f75', roughness: 0.7, metalness: 0.4 }), n * 2);
    const q = new Quaternion(), p = new Vector3();
    for (let i = 0; i < n; i++) {
      const sMid = (i - 1) * SEGMENT_M + SEGMENT_M / 2;
      this.alongBeam(sMid, q);
      this.tmpM.compose(this.at(sMid, -0.75, 1.25, p), q, this.tmpS.set(1, 1, 1));
      qrl.setMatrixAt(i, this.tmpM);
      for (let k = 0; k < 2; k++) {
        this.tmpM.compose(this.at(sMid, TUNNEL_LATERAL + 1.55, 0.4 + k * 0.45, p), q, this.tmpS.set(1, 1, 1));
        tray.setMatrixAt(2 * i + k, this.tmpM);
      }
    }
    this.scene.add(qrl, tray);
    const l = makeLabel('Cryogenic distribution line (QRL) — superfluid helium at 1.9 K', 'EQUIPMENT');
    l.position.copy(this.at(26, -0.75, 1.7));
    this.scene.add(l);
  }

  private buildVapor(): void {
    this.vapor = new InstancedMesh(new SphereGeometry(0.25, 8, 6), new MeshBasicNodeMaterial({ color: '#eef3f7', transparent: true, opacity: 0.22, depthWrite: false }), this.vaporAge.length);
    this.vapor.count = 0;
    this.vapor.frustumCulled = false;
    this.scene.add(this.vapor);
    this.vaporLabel.position.copy(this.at(9, -0.75, 2.2));
  }

  private rebuildAugmented(state: SimulationState): void {
    for (const c of [...this.augmented.children]) {
      const m = c as Mesh;
      m.geometry?.dispose();
      (m.material as { dispose?: () => void } | undefined)?.dispose?.();
      if ('element' in c) (c as unknown as { element: HTMLElement }).element.remove();
    }
    this.augmented.clear();
    const env = state.beam.envelope;
    const L = state.beam.cell.params.cellLengthM;
    const cells = this.ctx.quality.tunnelCells;
    const ex = envelopeExaggeration(env);
    if (ex > 0 && env.stableX && env.stableY) {
      this.augmented.add(buildEnvelopeTube(env, frame, L, cells, +APERTURE_HALF_SEP, ex, '#4aa3ff', false));
      this.augmented.add(buildEnvelopeTube(env, frame, L, cells, -APERTURE_HALF_SEP, ex, '#ff6b5e', true));
      const l = makeLabel(`Beam envelope ±1σ — transverse size ×${ex.toFixed(0)} (σ_max ${(Math.max(...env.sigmaX) * 1e3).toFixed(2)} mm), μ = ${env.phaseAdvanceXDeg.toFixed(0)}°/cell`, 'AUGMENTED · EXAGGERATED', 'lbl-amp');
      l.position.copy(this.at(22, 0, 0.55));
      this.augmented.add(l);
    } else {
      const l = makeLabel('No bounded beam envelope: optics unstable for this configuration', 'AUGMENTED', 'lbl-amp');
      l.position.copy(this.at(22, 0, 0.55));
      this.augmented.add(l);
    }
    // Dipole field arrows: opposite vertical fields in the two apertures.
    const arrows = new InstancedMesh(new ConeGeometry(0.03, 0.22, 8), new MeshBasicNodeMaterial({ color: '#a7f3d0' }), 64);
    const q = new Quaternion(), p = new Vector3();
    let k = 0;
    for (const e of state.beam.cell.elements) {
      if (e.type !== 'dipole' || k >= 60) continue;
      for (let c = 0; c < Math.min(cells, 2); c++) {
        const s = c * L + e.sStartM + e.lengthM / 2;
        const sign = Math.sign(state.accelerator.operatingDipoleFieldT || 1);
        for (const [lat, dir] of [[+APERTURE_HALF_SEP, sign], [-APERTURE_HALF_SEP, -sign]] as const) {
          q.setFromAxisAngle(new Vector3(1, 0, 0), dir > 0 ? 0 : Math.PI);
          this.tmpM.compose(this.at(s, lat, 0, p), q, this.tmpS.set(1, 1, 1));
          arrows.setMatrixAt(k++, this.tmpM);
        }
      }
    }
    arrows.count = k;
    this.augmented.add(arrows);
    const lf = makeLabel('B field (vertical, opposite in the two apertures for counter-rotating beams)', 'AUGMENTED', 'lbl-field');
    lf.position.copy(this.at(state.beam.cell.elements.find((e) => e.type === 'dipole')!.sStartM + 7, 0, -0.55));
    this.augmented.add(lf);
  }

  override onState(state: SimulationState, prev?: SimulationState): void {
    this.overlay.visible = state.vis.showBendFocusOverlay;
    this.magnetState = state.accelerator.magnet.state;
    if (prev && prev.beam !== state.beam) {
      const key = `${this.ctx.quality.tunnelCells}|${state.beam.cell.params.cellLengthM}`;
      if (key === this.cellKey) this.rebuildAugmented(state);
    }
  }

  update(f: FrameInfo): void {
    const p = f.policy;
    const st = f.state;
    this.augmented.visible = p.showBeamEnvelope;
    // X-ray view of the cryostats so the (augmented) beam envelope inside is visible.
    const xray = p.showBeamEnvelope;
    for (const m of this.cryoMats) {
      if (m.transparent !== xray) {
        m.transparent = xray;
        m.depthWrite = !xray;
        m.needsUpdate = true;
      }
      m.opacity = xray ? 0.22 : 1;
    }

    // Status LEDs
    const quench = st.quench.active;
    const wall = quench ? (performance.now() - st.quench.startedAt) / 1000 : 0;
    const snap = quench && st.quench.sim ? quenchV2Snapshot(st.quench.sim, quenchSimTime(wall)) : null;
    const blink = Math.sin(f.time * 8) > 0;
    const base = new Color(STATE_COLOR[this.magnetState]);
    const off = new Color('#1b1b1b');
    for (let i = 0; i < this.ledCount; i++) {
      const isQuenched = quench && i === 0;
      const c = isQuenched ? (blink ? new Color(STATE_COLOR.QUENCHED) : off) : this.magnetState === 'QUENCH_RISK' && !blink ? off : base;
      this.leds.setColorAt(i, c);
    }
    if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    this.leds.visible = p.showStatusLights;

    // Quench: coil hot-spot heat map (AUGMENTED) — no explosion, no flames.
    if (snap && (p.showFieldOverlay || p.amplifiedEffects)) {
      const rgb: RGB = [0, 0, 0];
      sampleColormap('inferno', logNorm(snap.hotspotTemperatureK, 2, 300), rgb);
      this.quenchMat.emissive.setRGB(rgb[0], rgb[1], rgb[2]);
      this.quenchMat.emissiveIntensity = 0.2 + 1.3 * snap.normalZoneFraction;
    } else {
      this.quenchMat.emissive.setRGB(0, 0, 0);
    }
    this.quenchLabel.visible = !!snap;
    if (snap) {
      this.quenchLabel.element.firstChild!.textContent = `QUENCH t = ${snap.timeS.toFixed(snap.timeS < 1 ? 3 : 1)} s · ${snap.phase} · I/I₀ = ${(snap.currentFraction * 100).toFixed(0)} % · hot spot ${snap.hotspotTemperatureK.toFixed(0)} K`;
      this.quenchLabel.position.copy(this.at(6, 0, 1.0));
    }

    // Helium venting scenario (PHYSICALLY VISIBLE only as an explicit scenario).
    const venting = !!snap && st.vis.heliumVentingScenario && snap.timeS > 0.05 && snap.timeS < 90;
    this.vaporLabel.visible = venting;
    this.updateVapor(f.dt, venting);
  }

  private updateVapor(dt: number, emit: boolean): void {
    if (emit) {
      for (let k = 0; k < 3; k++) {
        const slot = this.vaporAge.indexOf(-1);
        if (slot < 0) break;
        this.vaporAge[slot] = 0;
        this.vaporSeed[3 * slot] = this.rng.uniform(-0.3, 0.3);
        this.vaporSeed[3 * slot + 1] = this.rng.uniform(0.3, 0.9);
        this.vaporSeed[3 * slot + 2] = this.rng.uniform(-1, 1);
      }
    }
    let alive = 0;
    for (let i = 0; i < this.vaporAge.length; i++) {
      if (this.vaporAge[i]! < 0) continue;
      this.vaporAge[i]! += dt;
      const a = this.vaporAge[i]!;
      if (a > 4) {
        this.vaporAge[i] = -1;
        continue;
      }
      // Cold dense gas: spreads along the tunnel and sinks slightly (visual approximation).
      this.at(8 + this.vaporSeed[3 * i + 2]! * a * 1.5, -0.75 + this.vaporSeed[3 * i]! * a, 1.5 - this.vaporSeed[3 * i + 1]! * a * 0.4, this.tmpV);
      this.tmpM.compose(this.tmpV, this.tmpQ.identity(), this.tmpS.setScalar(0.6 + a * 0.9));
      this.vapor.setMatrixAt(alive++, this.tmpM);
    }
    this.vapor.count = alive;
    this.vapor.instanceMatrix.needsUpdate = true;
  }
}
