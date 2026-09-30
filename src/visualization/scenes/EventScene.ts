/**
 * COLLISION EVENT domain — origin at the nominal interaction point, beam axis = +z, 1 unit = 1 m.
 * Detector geometry is muted; physics objects dominate. What is drawn is decided solely by
 * the visualization-honesty policy of the current mode.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Group, Line, LineBasicNodeMaterial, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import type { TruthEvent } from '../../physics/events/Event';
import { getDetector } from '../../physics/EventProcessor';
import { PALETTES } from '../colors/PhysicsPalette';
import { buildDetector } from '../detector/DetectorRenderer';
import { CalorimeterRenderer } from '../detector/CalorimeterRenderer';
import { HitRenderer } from '../detector/HitRenderer';
import { buildFieldArrows } from '../overlays/FieldOverlay';
import { buildJetCones } from '../overlays/JetOverlay';
import { buildMETArrow } from '../overlays/METOverlay';
import { buildRichRings } from '../overlays/RichOverlay';
import { buildTrackFitOverlay, buildVertexMarkers } from '../overlays/TrackFitOverlay';
import { buildRecoLabels, buildTrackLabels } from '../overlays/PhysicsOverlay';
import { QUALITY_PRESETS } from '../QualityPresets';
import { TrackRenderer } from '../tracks/TrackRenderer';
import { policyFor, trajectoryVisibility } from '../VisualizationMode';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { standardLights } from './sceneUtils';

/** Display seconds per physical nanosecond for the educational slow motion (×10⁸ slowdown). */
export const SLOWMO_SECONDS_PER_NS = 0.1;
/** Time after which every track/hit is shown (outer muon system is reached in ~40–70 ns). */
const EVENT_DURATION_NS = 80;

export function secondsPerNs(state: SimulationState): number {
  const v = state.vis;
  if (v.timeScale === 'realtime') return 1e-9;
  if (v.timeScale === 'slowmo') return SLOWMO_SECONDS_PER_NS;
  return v.customSecondsPerNs;
}

export class EventScene extends SceneDomain {
  readonly id: SceneId = 'event';
  readonly title = 'Collision event';
  readonly scaleNote = '1 unit = 1 m · origin: nominal interaction point · beam axis = z';
  readonly portals: readonly Portal[] = [{ label: '← Back to detector', target: 'detector' }];

  private ctx!: DomainContext;
  private geometry: Group | null = null;
  private readonly tracks = new TrackRenderer();
  private readonly hits = new HitRenderer();
  private readonly calo = new CalorimeterRenderer();
  private readonly overlays = new Group();
  private readonly fieldGroup = new Group();
  private truth: TruthEvent | null = null;
  private truthKey = '';
  private generation = 0;
  private status = makeLabel('', 'STATUS', 'lbl-note');

  build(ctx: DomainContext): void {
    this.ctx = ctx;
    const s = this.scene;
    standardLights(s, ctx, { sky: '#dde6ef', ground: '#15191e', hemi: 0.6, sun: 0.9, sunPos: [15, 20, 12], envIntensity: 0.4 });
    this.camera.near = 0.01;
    this.camera.far = 300;
    this.camera.position.set(13, 7.5, 17);
    this.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.minDistance = 0.1;
    ctx.controls.maxDistance = 80;

    // Beam axis and interaction point (reference geometry).
    const axis = new BufferGeometry();
    axis.setAttribute('position', new Float32BufferAttribute([0, 0, -24, 0, 0, 24], 3));
    s.add(new Line(axis, new LineBasicNodeMaterial({ color: '#5b6b7c', transparent: true, opacity: 0.6 })));
    s.add(new Mesh(new SphereGeometry(0.015, 12, 8), new MeshBasicNodeMaterial({ color: '#ffffff' })));

    s.add(this.tracks.group, this.hits.group, this.calo.group, this.overlays, this.fieldGroup);
    this.status.position.set(0, 12.5, 0);
    s.add(this.status);
    const st = ctx.controller.state;
    this.rebuildGeometry(st);
    this.rebuildField(st);
    void this.rebuildEvent(st);
  }

  private rebuildGeometry(st: SimulationState): void {
    if (this.geometry) {
      this.geometry.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
      this.scene.remove(this.geometry);
    }
    const pol = policyFor(st.vis.mode);
    const q = QUALITY_PRESETS[st.vis.quality];
    this.geometry = buildDetector(getDetector(st.event.detectorId), {
      segments: Math.max(24, q.geometrySegments / 2),
      opacity: pol.geometryOpacity,
      cutaway: st.vis.cutaway,
      tint: PALETTES[st.vis.palette].geometry,
    });
    this.scene.add(this.geometry);
    this.scene.background = new Color(PALETTES[st.vis.palette].background);
  }

  private rebuildField(st: SimulationState): void {
    for (const c of [...this.fieldGroup.children]) {
      const m = c as Mesh;
      m.geometry?.dispose();
      (m.material as { dispose?: () => void } | undefined)?.dispose?.();
      if ('element' in c) (c as unknown as { element: HTMLElement }).element.remove();
    }
    this.fieldGroup.clear();
    const det = getDetector(st.event.detectorId, st.event.fieldModel);
    const arrows = buildFieldArrows(det.field, { r: det.envelope.rMax - 0.5, z: Math.min(det.envelope.zMax, 13) }, 1.0);
    if (arrows) this.fieldGroup.add(arrows);
    const l = makeLabel(`${det.field.label}: ${det.field.description}`, 'AUGMENTED · FIELD MODEL', 'lbl-field');
    l.position.set(0, -det.envelope.rMax * 0.7, 0);
    this.fieldGroup.add(l);
  }

  private async truthFor(st: SimulationState): Promise<TruthEvent | null> {
    const key = `${st.event.sampleId}#${st.event.index}`;
    if (key !== this.truthKey) {
      this.truthKey = key;
      this.truth = await this.ctx.controller.truthEvent();
    }
    return this.truth;
  }

  /** Decay chain of the selected particle: itself, its descendants and its direct parents. */
  private highlightSet(st: SimulationState, truth: TruthEvent | null): Set<number> | null {
    const id = st.event.selectedParticleId;
    if (id === null || !truth) return null;
    const set = new Set<number>([id]);
    for (const d of truth.descendantsOf(id)) set.add(d.id);
    for (const p of truth.parentsOf(id)) {
      set.add(p.id);
      // Siblings from the same decay (e.g. the other muon of a Z)
      for (const sib of truth.childrenOf(p.id)) set.add(sib.id);
    }
    return set;
  }

  private async rebuildEvent(st: SimulationState): Promise<void> {
    const gen = ++this.generation;
    const pe = st.event.processed;
    const truth = pe ? await this.truthFor(st) : null;
    if (gen !== this.generation) return; // superseded by a newer rebuild
    const pol = policyFor(st.vis.mode);
    const pal = PALETTES[st.vis.palette];
    const q = QUALITY_PRESETS[st.vis.quality];
    this.tracks.dispose();
    this.hits.dispose();
    this.calo.dispose();
    for (const c of [...this.overlays.children]) {
      c.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void }; element?: HTMLElement };
        m.geometry?.dispose();
        m.material?.dispose();
        m.element?.remove();
      });
    }
    this.overlays.clear();
    this.stats = { visibleTracks: 0, activeParticles: 0 };
    if (!pe || pe.detectorId !== st.event.detectorId) return;
    const det = getDetector(pe.detectorId);

    const recoTrackIds = new Set(pe.reco.tracks.map((t) => t.truthParticleId!).filter((x) => x !== null));
    // Source-reco events: trajectories are RECONSTRUCTED DATA, never shown as simulation truth.
    const fromReco = pe.trajectorySource === 'reco';
    const visibility = trajectoryVisibility(pol, pe.trajectorySource);
    if (visibility !== 'none') {
      this.tracks.build(pe.tracks, {
        color: { colorBy: st.vis.colorBy, palette: st.vis.palette, colormap: st.vis.colormap },
        quality: q,
        selectedParticleId: st.event.selectedParticleId,
        includeNeutrinos: pol.showNeutrinos,
        onlyParticles: visibility === 'all' ? null : recoTrackIds,
        additive: st.vis.mode === 'CINEMATIC',
        highlight: this.highlightSet(st, truth),
      });
    }
    this.hits.build(pe.response.hits, pe.response.muonHits, st.vis.palette, pol.showTrackerHits, pol.showMuonSegments);
    if (pol.showCaloDeposits) {
      const caloOpts = { colormap: st.vis.caloColormap, categorical: st.vis.colorBy === 'subsystem', palette: st.vis.palette };
      this.calo.build(pe.response.ecal, det.ecal, caloOpts);
      this.calo.build(pe.response.hcal, det.hcal, caloOpts);
    }
    if (pol.showTrackerHits && pe.pid.some((m) => m.rich?.length)) this.overlays.add(buildRichRings(pe.pid, det, pal.subsystem.tracker));
    const adv = pe.advanced;
    if (pol.showJetCones) {
      const jets = adv ? adv.jets.map((j) => ({ radius: adv.jetConfig.R, eta: j.eta, phi: j.phi, pt: j.pt })) : pe.reco.jets;
      this.overlays.add(buildJetCones(jets, pal.object.jet, pol.showParticleLabels));
    }
    if (adv && pol.showRecoObjects) this.overlays.add(buildVertexMarkers(adv.vertices, adv.displaced, { pv: pal.origin.primary, pu: pal.origin.pileup, sv: pal.origin.displaced }));
    const fitSel = adv && (pol.showRecoObjects || pol.showTruthTracks) ? adv.fits.find((f) => f.particleId === st.event.selectedParticleId) : undefined;
    if (fitSel && adv) this.overlays.add(buildTrackFitOverlay(fitSel, adv.bz, { fit: pal.collection.reco, seed: '#9ca3af' }));
    if (pol.showMET && st.event.meta?.collisionSystem === 'pp' && !pe.reco.met.unavailable) this.overlays.add(buildMETArrow(pe.reco.met, pal.object.met));
    if (pol.showParticleLabels && pol.showTruthTracks && !fromReco) this.overlays.add(buildTrackLabels(pe.tracks, 8));
    if (pol.showRecoObjects) this.overlays.add(buildRecoLabels(pe.reco, pol.showInvariantMass ? st.event.pair : null));

    this.stats = { visibleTracks: this.tracks.visibleCount, activeParticles: pe.tracks.length };
    const sel = this.tracks.indexOf(st.event.selectedParticleId);
    this.tracks.uniforms.selected.value = sel;
    this.tracks.uniforms.dim.value = 0;
  }

  override onState(st: SimulationState, prev: SimulationState): void {
    const v = st.vis, pv = prev.vis;
    if (v.mode !== pv.mode || v.palette !== pv.palette || v.cutaway !== pv.cutaway || st.event.detectorId !== prev.event.detectorId || v.quality !== pv.quality) {
      this.rebuildGeometry(st);
    }
    if (st.event.detectorId !== prev.event.detectorId || st.event.fieldModel !== prev.event.fieldModel) this.rebuildField(st);
    if (
      st.event.processed !== prev.event.processed ||
      st.event.selectedParticleId !== prev.event.selectedParticleId ||
      st.event.pair !== prev.event.pair ||
      v.mode !== pv.mode || v.colorBy !== pv.colorBy || v.palette !== pv.palette || v.colormap !== pv.colormap ||
      v.caloColormap !== pv.caloColormap || v.quality !== pv.quality
    ) {
      void this.rebuildEvent(st);
    }
  }

  override onClick(x: number, y: number, ctx: DomainContext): void {
    const rect = ctx.canvas.getBoundingClientRect();
    const tmp = new Vector3();
    const pid = this.tracks.pick((v) => tmp.copy(v).project(this.camera), x, y, rect.width, rect.height);
    const recoId = pid !== null ? ctx.controller.state.event.processed?.tracks.find((t) => t.particleId === pid)?.recoId : undefined;
    if (recoId) ctx.controller.selectReco(recoId);
    else ctx.controller.selectParticle(pid);
  }

  update(f: FrameInfo): void {
    const st = f.state;
    const pol = f.policy;
    this.fieldGroup.visible = pol.showFieldOverlay;
    const e = st.event;
    const spn = secondsPerNs(st);
    const elapsed = (performance.now() - e.replayStartedAt) / 1000;
    const tNs = st.vis.timeScale === 'realtime' ? 1e9 : elapsed / spn;
    const animating = tNs < EVENT_DURATION_NS;
    const shownTime = animating ? tNs : 1e9;
    this.tracks.uniforms.time.value = shownTime;
    this.tracks.uniforms.headGlow.value = animating && pol.amplifiedEffects ? 1 : 0;
    this.hits.time.value = shownTime;
    this.calo.time.value = shownTime;
    const slow = st.vis.timeScale === 'realtime' ? 'real time: the whole event lasts ~50 ns (instantaneous to the eye)' : `t = ${Math.min(tNs, EVENT_DURATION_NS).toFixed(1)} ns · slowed ×${(spn * 1e9).toExponential(0)}`;
    const recoOnly = e.processed?.trajectorySource === 'reco';
    const level = e.provenance ? (e.provenance.isSimulation ? (recoOnly ? 'SIMULATED RECONSTRUCTION' : 'SIMULATION') : 'RECORDED COLLISION DATA') : '';
    const hint = recoOnly && !pol.showRecoTracks ? ' · reconstructed objects only (no truth, no hits) — shown in ANALYSIS mode' : '';
    const txt = e.loading ? 'Processing event…' : e.error ? `Error: ${e.error}` : e.meta ? `[${level}] ${e.meta.title} · event ${e.index} · ${slow}${hint}${this.calo.hiddenCells ? ` · ${this.calo.hiddenCells} cells < 0.5 GeV hidden (display only)` : ""}` : "";
    const el = this.status.element.firstChild!;
    if (el.textContent !== txt) el.textContent = txt;
  }

  override dispose(): void {
    this.tracks.dispose();
    this.hits.dispose();
    this.calo.dispose();
    super.dispose();
  }
}
