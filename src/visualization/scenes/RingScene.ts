/**
 * LHC RING domain — schematic underground ring, origin at the ring centre, 1 unit = 1 m.
 * The tunnel is drawn much wider than its real 3.8 m so it is visible at this scale.
 */
import { BoxGeometry, Color, GridHelper, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3 } from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import { LHC } from '../../physics/constants/acceleratorConstants';
import { formatEnergyGeV, gevToEV } from '../../utils/units';
import { BeamRenderer, DISPLAY_REVOLUTION_S } from '../beam/BeamRenderer';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { LHC_POINTS, standardLights } from './sceneUtils';

const R = LHC.circumference.value / (2 * Math.PI);
const TUNNEL_DRAW_RADIUS_M = 22;
const CELLS_PER_ARC = 23;
/** Arc occupies this fraction of each octant (2.45 km arc of 3.33 km octant). */
const ARC_FRACTION = 0.735;

export class RingScene extends SceneDomain {
  readonly id: SceneId = 'ring';
  readonly title = 'LHC ring (schematic)';
  readonly scaleNote = `1 unit = 1 m · origin: ring centre · tunnel drawn ×${Math.round((2 * TUNNEL_DRAW_RADIUS_M) / LHC.tunnelDiameter.value)} wider`;
  readonly portals: readonly Portal[] = [
    { label: 'Enter arc tunnel (sector 3-4) →', target: 'tunnel' },
    { label: 'Point 1: ATLAS cavern →', target: 'cavern' },
    { label: '↑ Back to surface', target: 'surface' },
  ];

  private beams!: BeamRenderer;
  private overlay = new Group();
  private beamLabel = makeLabel('Beam 1 (blue) · Beam 2 (red) — positions only; bunches are invisible to the eye', 'AUGMENTED');
  private photonLabel = makeLabel('Synchrotron photons — Visualization amplified', 'AUGMENTED · AMPLIFIED', 'lbl-amp');
  private infoLabel = makeLabel('', 'PHYSICS');

  build(ctx: DomainContext): void {
    const s = this.scene;
    s.background = new Color('#0b0f14');
    standardLights(s, ctx, { sky: '#9fb3c8', ground: '#1a1f26', hemi: 0.8, sun: 1.2, sunPos: [3000, 8000, 2000], envIntensity: 0.25 });
    this.camera.near = 5;
    this.camera.far = 60_000;
    this.camera.position.set(0, 7200, 7600);
    this.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.minDistance = 300;
    ctx.controls.maxDistance = 25_000;

    const grid = new GridHelper(12_000, 24, 0x2a3440, 0x161c24);
    grid.position.y = -60;
    s.add(grid);

    const tunnel = new Mesh(new TorusGeometry(R, TUNNEL_DRAW_RADIUS_M, 12, 256), new MeshStandardMaterial({ color: '#8b95a1', roughness: 0.7, metalness: 0.2 }));
    tunnel.rotation.x = Math.PI / 2;
    s.add(tunnel);

    const cavMat = new MeshStandardMaterial({ color: '#c4b7a1', roughness: 0.8 });
    for (const pt of LHC_POINTS) {
      const x = Math.cos(pt.theta) * R, z = Math.sin(pt.theta) * R;
      const exp = ['ATLAS', 'ALICE', 'CMS', 'LHCb'].some((e) => pt.role.startsWith(e));
      const box = new Mesh(new BoxGeometry(exp ? 180 : 110, exp ? 110 : 70, exp ? 180 : 110), cavMat);
      box.position.set(x, 0, z);
      box.rotation.y = -pt.theta;
      s.add(box);
      const l = makeLabel(`${pt.name} · ${pt.role}`);
      l.position.set(x * 1.07, 120, z * 1.07);
      s.add(l);
    }

    this.buildMagnetOverlay();
    s.add(this.overlay);

    this.beams = new BeamRenderer(R, 34);
    s.add(this.beams.group);
    this.beamLabel.position.set(0, 400, R + 400);
    this.photonLabel.position.set(R * 0.7, 500, -R * 0.7);
    this.infoLabel.position.set(0, 300, 0);
    s.add(this.beamLabel, this.photonLabel, this.infoLabel);
    this.onState(ctx.controller.state);
  }

  /** Arc cells: 6 dipoles + 2 quadrupoles per cell (schematic ticks). */
  private buildMagnetOverlay(): void {
    const nCells = 8 * CELLS_PER_ARC;
    const dip = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#3b82f6', emissive: '#1d4ed8', emissiveIntensity: 0.4 }), nCells * 6);
    const quad = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#f59e0b', emissive: '#b45309', emissiveIntensity: 0.5 }), nCells * 2);
    const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), yAxis = new Vector3(0, 1, 0);
    let id = 0, iq = 0;
    for (let oct = 0; oct < 8; oct++) {
      const octStart = (oct / 8) * Math.PI * 2 + Math.PI / 8; // arcs lie between the points
      const arcSpan = (Math.PI / 4) * ARC_FRACTION;
      const a0 = octStart - arcSpan / 2;
      for (let c = 0; c < CELLS_PER_ARC; c++) {
        for (let k = 0; k < 8; k++) {
          const a = a0 + ((c + k / 8 + 1 / 16) / CELLS_PER_ARC) * arcSpan;
          q.setFromAxisAngle(yAxis, -a);
          p.set(Math.cos(a) * R, 0, Math.sin(a) * R);
          const isQuad = k === 0 || k === 4;
          m4.compose(p, q, isQuad ? sc.set(46, 46, 16) : sc.set(34, 34, 60));
          if (isQuad) quad.setMatrixAt(iq++, m4);
          else dip.setMatrixAt(id++, m4);
        }
      }
    }
    this.overlay.add(dip, quad);
    const l1 = makeLabel('DIPOLE = BENDING (blue)', 'OVERLAY', 'lbl-dipole');
    l1.position.set(Math.cos((3 * Math.PI) / 8) * R * 1.12, 200, Math.sin((3 * Math.PI) / 8) * R * 1.12);
    const l2 = makeLabel('QUADRUPOLE = FOCUSING (orange)', 'OVERLAY', 'lbl-quad');
    l2.position.set(Math.cos((3 * Math.PI) / 8) * R * 0.86, 200, Math.sin((3 * Math.PI) / 8) * R * 0.86);
    this.overlay.add(l1, l2);
  }

  override onState(state: SimulationState): void {
    const acc = state.accelerator;
    this.overlay.visible = state.vis.showBendFocusOverlay;
    this.beams.photonRate = BeamRenderer.rateForLoss(gevToEV(acc.synchrotron.energyLossPerTurnGeV));
    const slow = acc.revolutionFrequencyHz * DISPLAY_REVOLUTION_S;
    this.infoLabel.element.firstChild!.textContent =
      `${acc.species.label} · E = ${formatEnergyGeV(acc.kinematics.totalEnergyGeV)} · B = ${acc.operatingDipoleFieldT.toFixed(2)} T · U₀ = ${formatEnergyGeV(acc.synchrotron.energyLossPerTurnGeV)}/turn · animation slowed ×${slow.toExponential(1)}`;
  }

  update(f: FrameInfo): void {
    const p = f.policy;
    this.beams.group.visible = p.showBeam;
    this.beamLabel.visible = p.showBeam;
    this.beams.showPhotons = p.showSynchrotronPhotons && p.amplifiedEffects;
    this.photonLabel.visible = this.beams.showPhotons && this.beams.photonRate > 0;
    if (p.showBeam) this.beams.update(f.dt);
  }

  override dispose(): void {
    this.beams?.dispose();
    super.dispose();
  }
}
