/**
 * DETECTOR domain — the selected experiment (ATLAS, CMS, ALICE, LHCb) with hierarchical LOD,
 * a cutaway and per-subsystem visibility. Each model states its fidelity level on screen.
 * Origin: nominal interaction point; beam axis = +z; 1 unit = 1 m.
 */
import { Color, Group, Vector3 } from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import type { ExperimentDetectorId } from '../../physics/detector/DetectorModel';
import { getDetector } from '../../physics/EventProcessor';
import { PALETTES } from '../colors/PhysicsPalette';
import { buildDetector } from '../detector/DetectorRenderer';
import { buildFieldArrows } from '../overlays/FieldOverlay';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { standardLights } from './sceneUtils';

type LabelSpec = ReadonlyArray<[string, [number, number, number], string]>;

const LABELS: Record<ExperimentDetectorId, LabelSpec> = {
  atlas: [
    ['Inner detector: pixels, strips, straws (tracking)', [0.1, 0.9, 3.2], 'TRACKER'],
    ['Central solenoid 2 T', [0, 1.3, -3.0], 'MAGNET'],
    ['LAr EM calorimeter (e, γ)', [0, 1.9, 3.6], 'ECAL'],
    ['Tile hadronic calorimeter', [0, 3.6, -6.4], 'HCAL'],
    ['Forward calorimeter (FCal)', [0, 0.6, 5.5], 'HCAL'],
    ['Barrel toroid (8 coils)', [-7, 7, 0], 'MAGNET'],
    ['Muon spectrometer; New Small Wheel at z ≈ 7.4 m', [0, 10.4, 11], 'MUON'],
  ],
  cms: [
    ['Silicon tracker: pixels (BPix/FPix) + strips (TIB/TOB/TID/TEC)', [0.2, 0.9, 2.6], 'TRACKER'],
    ['PbWO₄ crystal ECAL (EB/EE) + preshower', [0, 1.45, 3.4], 'ECAL'],
    ['Brass/scintillator HCAL (HB/HE), HO outside the coil', [0, 2.5, -4.6], 'HCAL'],
    ['Forward calorimeter HF (3 < |η| < 5)', [0, 1.1, 12.0], 'HCAL'],
    ['Superconducting solenoid 3.8 T', [0, 3.3, -6.6], 'MAGNET'],
    ['Iron return yoke (3 barrel layers, end-cap disks)', [0, 6.8, 7.2], 'MAGNET'],
    ['Muon DT stations between the yoke layers; CSC on the end-caps', [0, 5.2, -9.5], 'MUON'],
  ],
  alice: [
    ['ITS2: 7 layers of silicon pixels (vertexing)', [0, 0.45, 1.0], 'TRACKER'],
    ['TPC: gas drift volume — tracking and dE/dx identification', [0, 2.6, 2.2], 'TRACKER'],
    ['TRD + TOF (time of flight → β → particle identity)', [0, 3.9, -3.2], 'PID'],
    ['EMCal (no hadronic calorimeter)', [0, 4.7, 3.0], 'ECAL'],
    ['L3 solenoid 0.5 T (large, low field for soft heavy-ion tracks)', [0, 6.8, 0], 'MAGNET'],
    ['Forward muon arm: absorber, dipole, stations (−4 < η < −2.5)', [0, 3.0, -10.5], 'MUON'],
  ],
  lhcb: [
    ['VELO: silicon pixels 5 mm from the beams (displaced vertices)', [0, 0.35, 0.3], 'TRACKER'],
    ['RICH1 (C₄F₁₀): Cherenkov angle → particle identity', [0, 1.2, 1.6], 'PID'],
    ['Dipole magnet ∫B dl ≈ 4 T·m', [0, 4.4, 5.5], 'MAGNET'],
    ['SciFi tracker T1–T3', [0, 3.3, 8.6], 'TRACKER'],
    ['RICH2 (CF₄)', [0, 3.1, 10.7], 'PID'],
    ['ECAL / HCAL', [0, 4.5, 13.5], 'CALO'],
    ['Muon stations M2–M5', [0, 5.5, 17.0], 'MUON'],
  ],
};

const CAMERA: Record<ExperimentDetectorId, { pos: [number, number, number]; target: [number, number, number]; max: number }> = {
  atlas: { pos: [22, 12, 26], target: [0, 0, 0], max: 90 },
  cms: { pos: [14, 8, 17], target: [0, 0, 0], max: 70 },
  alice: { pos: [14, 8, 14], target: [0, 0, -3], max: 70 },
  lhcb: { pos: [16, 7, -2], target: [0, 0, 9], max: 80 },
};

export class DetectorScene extends SceneDomain {
  readonly id: SceneId = 'detector';
  readonly scaleNote = '1 unit = 1 m · origin: nominal interaction point · beam axis = z';
  readonly portals: readonly Portal[] = [
    { label: 'Show a collision event →', target: 'event' },
    { label: '← Back to cavern', target: 'cavern' },
  ];

  private field = new Group();
  private labels = new Group();
  private geo: Group | null = null;
  private ctx!: DomainContext;
  private detId: ExperimentDetectorId = 'atlas';

  get title(): string {
    return getDetector(this.detId).name;
  }

  build(ctx: DomainContext): void {
    this.ctx = ctx;
    const s = this.scene;
    s.background = new Color('#0a0d11');
    standardLights(s, ctx, { sky: '#e5edf5', ground: '#1d2126', hemi: 0.7, sun: 1.4, sunPos: [20, 30, 25], shadowExtent: 0, envIntensity: 0.55 });
    this.camera.near = 0.05;
    this.camera.far = 300;
    s.add(this.field, this.labels);
    this.rebuildAll(ctx.controller.state, true);
  }

  private rebuildAll(state: SimulationState, moveCamera: boolean): void {
    this.detId = state.event.detectorId;
    const det = getDetector(this.detId, state.event.fieldModel);
    if (moveCamera) {
      const cam = CAMERA[this.detId];
      this.camera.position.set(...cam.pos);
      this.camera.updateProjectionMatrix();
      this.ctx.controls.target.set(...cam.target);
      this.ctx.controls.minDistance = 0.3;
      this.ctx.controls.maxDistance = cam.max;
    }
    for (const g of [this.field, this.labels]) {
      g.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void }; element?: HTMLElement };
        m.geometry?.dispose();
        m.material?.dispose();
        m.element?.remove();
      });
      g.clear();
    }
    for (const [text, pos, cat] of LABELS[this.detId]) {
      const l = makeLabel(text, cat);
      l.position.copy(new Vector3(...pos));
      this.labels.add(l);
    }
    const note = makeLabel(`${det.fidelity.level.toUpperCase()} MODEL — ${det.fidelity.summary}`, 'FIDELITY', 'lbl-note');
    note.position.set(0, det.envelope.rMax + 1.5, this.detId === 'lhcb' ? 9 : 0);
    this.labels.add(note);
    const arrows = buildFieldArrows(det.field, { r: det.envelope.rMax - 0.5, z: Math.min(det.envelope.zMax, 13) }, 1.0);
    if (arrows) this.field.add(arrows);
    const fl = makeLabel(`${det.field.label} (color |B|, Viridis 0–4 T)`, 'AUGMENTED', 'lbl-field');
    fl.position.set(0, -2, 12);
    this.field.add(fl);
    this.rebuildGeometry(state);
  }

  private rebuildGeometry(state: SimulationState): void {
    if (this.geo) {
      this.geo.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
      this.scene.remove(this.geo);
    }
    this.geo = buildDetector(getDetector(this.detId), { segments: this.ctx.quality.geometrySegments, opacity: 1, cutaway: state.vis.cutaway, tint: PALETTES[state.vis.palette].geometry }, true);
    this.applyVisibility(state);
    this.scene.add(this.geo);
  }

  private applyVisibility(state: SimulationState): void {
    const hidden = new Set(state.vis.hiddenSubsystems);
    for (const c of this.geo?.children ?? []) c.visible = !hidden.has(c.userData.subsystem as never);
  }

  override onState(state: SimulationState, prev: SimulationState): void {
    if (state.event.detectorId !== prev.event.detectorId || state.event.fieldModel !== prev.event.fieldModel) this.rebuildAll(state, state.event.detectorId !== prev.event.detectorId);
    else if (state.vis.cutaway !== prev.vis.cutaway || state.vis.palette !== prev.vis.palette) this.rebuildGeometry(state);
    else if (state.vis.hiddenSubsystems !== prev.vis.hiddenSubsystems) this.applyVisibility(state);
  }

  update(f: FrameInfo): void {
    this.field.visible = f.policy.showFieldOverlay;
  }
}
