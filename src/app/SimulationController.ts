/**
 * SimulationController — the only place where user intents turn into physics calls.
 * UI components call these methods; they never compute scientific values themselves.
 */
import { computeAccelerator, designMomentumGeV, type AcceleratorState } from '../physics/accelerator/AcceleratorCore';
import type { MachineId } from '../physics/accelerator/MachinePreset';
import { computeBeamModel } from '../physics/beam/BeamModel';
import { loadDataset, registerSample } from '../data-sources/DataSourceRegistry';
import type { NormalizedDataset } from '../data-sources/NormalizedDataset';
import type { NormalizedSample } from '../data-sources/NormalizedEvent';
import type { TruthEvent } from '../physics/events/Event';
import { datasetTruth, type DetectorId, type FieldModel, type ProcessOptions } from '../physics/EventProcessor';
import type { PileUpConfig } from '../physics/pileup/PileUp';
import { defaultMenu, type TriggerItemId } from '../physics/trigger/Trigger';
import { selectPair } from '../physics/reconstruction/InvariantMass';
import { beamSpeciesById } from '../physics/particles/ParticleDatabase';
import { machineById } from '../machines';
import type { PerformanceMonitor } from '../utils/performance';
import { PhysicsWorkerClient } from './PhysicsWorkerClient';
import { defaultIRSettings, irOpticsFor, type IRSettings } from '../physics/optics/IRScenario';
import type { OpticsTable } from '../physics/optics/OpticsTable';
import { NOMINAL_RESPONSE, type ResponseConfig } from '../detector/response/ResponseConfig';
import { DEFAULT_JET_CONFIG, type JetConfig } from '../physics/reconstruction/AdvancedReconstruction';
import { DEFAULT_QUENCH_CONTROLS, quenchParamsFor, type QuenchControls } from '../physics/accelerator/QuenchScenario';
import { simulateQuenchV2 } from '../physics/accelerator/QuenchModelV2';
import type { ScanRow } from '../workers/scan';
import { Store, type MachineInputs, type SceneId, type SimulationState, type VisualState } from './SimulationState';

export class SimulationController {
  readonly store: Store;
  private readonly worker = new PhysicsWorkerClient();
  private eventRequest = 0;
  private sceneChangeHandler: ((id: SceneId) => void) | null = null;

  constructor(private readonly perf: PerformanceMonitor) {
    const machine: MachineInputs = {
      machineId: 'lhc',
      speciesId: 'proton',
      mode: 'physics',
      energy: { kind: 'totalEnergy', valueGeV: 6800 },
      sandboxFieldT: 8.33,
      sandboxTemperatureK: 1.9,
      sandboxQuadGradientTPerM: null,
    };
    const accelerator = computeAcc(machine);
    const irSettings = defaultIRSettings(accelerator);
    this.store = new Store({
      optics: { settings: irSettings, ir: irOpticsFor(accelerator, irSettings), imported: null },
      scene: 'surface',
      transitioning: false,
      machine,
      accelerator,
      beam: computeBeamModel(accelerator),
      vis: {
        mode: 'PHYSICAL',
        colorBy: 'particleType',
        palette: 'cern',
        colormap: 'viridis',
        caloColormap: 'inferno',
        quality: 'HIGH',
        timeScale: 'slowmo',
        customSecondsPerNs: 0.2,
        showBendFocusOverlay: true,
        heliumVentingScenario: false,
        cutaway: true,
        hiddenSubsystems: [],
      },
      event: {
        sampleId: 'zmumu',
        index: 0,
        detectorId: 'atlas',
        loading: false,
        error: null,
        meta: null,
        provenance: null,
        datasetSize: 0,
        pileUp: { enabled: false, mu: 20 },
        fieldModel: 'fieldmap',
        response: NOMINAL_RESPONSE,
        jets: DEFAULT_JET_CONFIG,
        triggerItems: { 'single-muon': true, 'single-electron': true, diphoton: true, jet: true, met: true },
        processed: null,
        selectedParticleId: null,
        selectedRecoId: null,
        pair: null,
        replayStartedAt: 0,
      },
      histogram: { sampleId: 'zmumu', masses: [], accumulating: false, processedEvents: 0 },
      quench: { active: false, startedAt: 0, playbackRate: 1, controls: DEFAULT_QUENCH_CONTROLS, sim: null },
      rendererBackend: 'initializing…',
    });
  }

  get state(): SimulationState {
    return this.store.get();
  }

  get usesWorker(): boolean {
    return this.worker.usesWorker;
  }

  // ---- Machine ------------------------------------------------------------------------------------

  setMachine(machineId: MachineId): void {
    const m = machineById(machineId);
    const cur = this.state.machine;
    const speciesId = m.allowedSpecies === 'any' || m.allowedSpecies.includes(cur.speciesId) ? cur.speciesId : 'proton';
    const species = beamSpeciesById(speciesId)!;
    const p = designMomentumGeV(m, species);
    const E = Math.hypot(p, species.massGeV);
    const requiredB = computeAccelerator({ machine: m, species, mode: 'physics', energy: { kind: 'totalEnergy', valueGeV: E } }).requiredDipoleFieldT;
    this.applyMachine({
      ...cur,
      machineId,
      speciesId,
      mode: machineId === 'sandbox' ? 'sandbox' : 'physics',
      energy: { kind: 'totalEnergy', valueGeV: E },
      sandboxFieldT: requiredB,
      sandboxTemperatureK: m.nominalTemperatureK,
      sandboxQuadGradientTPerM: null,
    });
  }

  setSpecies(speciesId: string): void {
    const species = beamSpeciesById(speciesId);
    if (!species) return;
    const m = machineById(this.state.machine.machineId);
    const cur = this.state.machine;
    // Keep the magnetic rigidity when switching species in Physics mode (same dipole field),
    // i.e. scale momentum with |q| — this is how the LHC runs ions.
    const p = designMomentumGeV(m, species);
    this.applyMachine({ ...cur, speciesId, energy: { kind: 'totalEnergy', valueGeV: Math.hypot(p, species.massGeV) } });
  }

  setEnergyGeV(valueGeV: number): void {
    if (!Number.isFinite(valueGeV)) return;
    this.applyMachine({ ...this.state.machine, energy: { kind: 'totalEnergy', valueGeV } });
  }

  setSandbox(patch: Partial<Pick<MachineInputs, 'sandboxFieldT' | 'sandboxTemperatureK' | 'sandboxQuadGradientTPerM'>>): void {
    this.applyMachine({ ...this.state.machine, ...patch });
  }

  /** Sandbox helper: set the field that matches the current beam rigidity. */
  matchSandboxField(): void {
    this.setSandbox({ sandboxFieldT: this.state.accelerator.requiredDipoleFieldT });
  }

  private applyMachine(machine: MachineInputs): void {
    const t0 = performance.now();
    const accelerator = computeAcc(machine);
    const beam = computeBeamModel(accelerator, machine.sandboxQuadGradientTPerM ?? undefined);
    this.perf.physics.push(performance.now() - t0);
    const prevMachine = this.state.accelerator.machine.id;
    const settings = prevMachine === accelerator.machine.id ? this.state.optics.settings : defaultIRSettings(accelerator);
    this.store.set({ machine, accelerator, beam, optics: { ...this.state.optics, settings, ir: irOpticsFor(accelerator, settings) } });
    const q = this.state.quench;
    if (accelerator.magnet.state === 'QUENCHED' && !q.active) this.triggerQuench();
    if (accelerator.magnet.state !== 'QUENCHED' && q.active && machine.mode === 'sandbox') {
      // Operator reset after returning into the superconducting envelope.
      this.store.update('quench', { active: false });
    }
  }

  setIR(patch: Partial<IRSettings>): void {
    const settings = { ...this.state.optics.settings, ...patch };
    if (!(settings.betaStarM > 0) || !(settings.fullCrossingAngleUrad >= 0)) return;
    this.store.update('optics', { settings, ir: irOpticsFor(this.state.accelerator, settings) });
  }

  setImportedOptics(table: OpticsTable | null): void {
    this.store.update('optics', { imported: table });
  }

  /** Runs the Quench V2 simulation for the current magnet state and starts playback. */
  triggerQuench(): void {
    const t0 = performance.now();
    const sim = simulateQuenchV2(quenchParamsFor(this.state.accelerator, this.state.quench.controls), this.state.quench.controls.heatersEnabled ? 2e-5 : 5e-5);
    this.perf.physics.push(performance.now() - t0);
    this.store.update('quench', { active: true, startedAt: performance.now(), sim });
  }

  setQuenchControls(patch: Partial<QuenchControls>): void {
    this.store.update('quench', { controls: { ...this.state.quench.controls, ...patch } });
  }

  resetQuench(): void {
    this.store.update('quench', { active: false });
  }

  // ---- Scenes & visual state ---------------------------------------------------------------------------

  onSceneRequest(handler: (id: SceneId) => void): void {
    this.sceneChangeHandler = handler;
  }

  goTo(scene: SceneId): void {
    if (scene === this.state.scene || this.state.transitioning) return;
    this.sceneChangeHandler?.(scene);
    if (scene === 'event' && !this.state.event.processed && !this.state.event.loading) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  setVis(patch: Partial<VisualState>): void {
    this.store.update('vis', patch);
  }

  // ---- Events --------------------------------------------------------------------------------------------

  dataset(id: string): Promise<NormalizedDataset> {
    return loadDataset(id);
  }

  /** The dataset of the current event (main-thread copy for inspection). */
  async currentDataset(): Promise<NormalizedDataset | null> {
    return this.state.event.meta ? this.dataset(this.state.event.sampleId) : null;
  }

  /**
   * Truth event for inspection (main-thread copy; physics results come from the worker).
   * Null when the dataset has no generator truth (e.g. recorded collision data).
   */
  async truthEvent(): Promise<TruthEvent | null> {
    const e = this.state.event;
    if (!e.meta) return null;
    return datasetTruth(await this.dataset(e.sampleId), e.index, e.pileUp).truth;
  }

  /** Pipeline options derived from the event state (pile-up, trigger menu). */
  processOptions(): ProcessOptions {
    const e = this.state.event;
    return { pileUp: e.pileUp, fieldModel: e.fieldModel, response: e.response, jets: e.jets, triggerMenu: defaultMenu().map((it) => ({ ...it, enabled: e.triggerItems[it.id] })) };
  }

  setPileUp(patch: Partial<PileUpConfig>): void {
    const pileUp = { ...this.state.event.pileUp, ...patch };
    this.store.update('event', { pileUp });
    if (this.state.histogram.processedEvents > 0) this.resetHistogram();
    if (this.state.event.meta) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  /** Runs the pipeline over dataset events and returns per-event trigger / pile-up summaries. */
  async scanDataset(count: number): Promise<ScanRow[]> {
    const e = this.state.event;
    return this.worker.scan(e.sampleId, e.detectorId, 0, count, this.processOptions());
  }

  setResponse(patch: Partial<ResponseConfig>): void {
    this.store.update('event', { response: { ...this.state.event.response, ...patch } });
    if (this.state.histogram.processedEvents > 0) this.resetHistogram();
    if (this.state.event.meta) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  setJets(patch: Partial<JetConfig>): void {
    this.store.update('event', { jets: { ...this.state.event.jets, ...patch } });
    if (this.state.event.meta) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  setFieldModel(fieldModel: FieldModel): void {
    this.store.update('event', { fieldModel });
    if (this.state.histogram.processedEvents > 0) this.resetHistogram();
    if (this.state.event.meta) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  setTriggerItem(id: TriggerItemId, enabled: boolean): void {
    this.store.update('event', { triggerItems: { ...this.state.event.triggerItems, [id]: enabled } });
    if (this.state.event.meta) void this.loadEvent(this.state.event.sampleId, this.state.event.index);
  }

  /** Adds a runtime dataset (generator output, imported file) on both threads and opens it. */
  async registerDataset(sample: NormalizedSample, label?: string): Promise<void> {
    const name = label ?? sample.provenance.title;
    const id = registerSample(sample, name);
    await this.worker.register(sample, name);
    // Show experiment data in its own detector model when one exists.
    const exp = sample.provenance.experiment;
    await this.loadEvent(id, 0, exp === 'CMS' ? 'cms' : exp === 'ATLAS' ? 'atlas' : this.state.event.detectorId);
  }

  async loadEvent(sampleId: string, index: number, detectorId: DetectorId = this.state.event.detectorId): Promise<void> {
    const req = ++this.eventRequest;
    let sample: NormalizedDataset;
    try {
      sample = await this.dataset(sampleId);
    } catch (e) {
      this.store.update('event', { loading: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (req !== this.eventRequest) return;
    const idx = sample.wrap(index);
    this.store.update('event', {
      sampleId,
      index: idx,
      detectorId,
      loading: true,
      error: null,
      meta: sample.meta,
      provenance: sample.provenance,
      datasetSize: sample.size,
      selectedParticleId: null,
      selectedRecoId: null,
    });
    try {
      const { result, workerMs } = await this.worker.process(sampleId, idx, detectorId, this.processOptions());
      if (req !== this.eventRequest) return; // superseded
      this.perf.workerMs = workerMs;
      const kind = sample.meta.analysisPair ?? 'muon';
      const pair = selectPair(result.reco, kind);
      this.store.update('event', { processed: result, loading: false, pair, replayStartedAt: performance.now() });
      if (this.state.histogram.sampleId !== sampleId) this.store.set({ histogram: { sampleId, masses: [], accumulating: false, processedEvents: 0 } });
    } catch (e) {
      if (req !== this.eventRequest) return;
      this.store.update('event', { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  nextEvent(delta: number): void {
    const e = this.state.event;
    void this.loadEvent(e.sampleId, e.index + delta);
  }

  setDetector(detectorId: DetectorId): void {
    const e = this.state.event;
    void this.loadEvent(e.sampleId, e.index, detectorId);
  }

  selectParticle(id: number | null): void {
    this.store.update('event', { selectedParticleId: id, selectedRecoId: null });
  }

  selectReco(id: string | null): void {
    const reco = this.state.event.processed?.reco;
    const all = reco ? [...reco.electrons, ...reco.muons, ...reco.photons, ...reco.jets, ...reco.tracks] : [];
    const obj = all.find((o) => o.id === id);
    // Source-reco events have no truth: select the display trajectory drawn from the object.
    const display = this.state.event.processed?.tracks.find((t) => t.recoId !== undefined && (t.recoId === id || t.recoId === (obj as { trackId?: string } | undefined)?.trackId));
    this.store.update('event', { selectedRecoId: id, selectedParticleId: obj?.truthParticleId ?? display?.particleId ?? this.state.event.selectedParticleId });
  }

  replay(): void {
    this.store.update('event', { replayStartedAt: performance.now() });
  }

  // ---- Histogram ---------------------------------------------------------------------------------------------

  async accumulateHistogram(count: number): Promise<void> {
    const e = this.state.event;
    const meta = e.meta;
    if (!meta?.analysisPair || this.state.histogram.accumulating) return;
    const sample = await this.dataset(e.sampleId);
    const h = this.state.histogram;
    const from = h.sampleId === e.sampleId ? h.processedEvents : 0;
    if (from >= sample.size) return;
    this.store.set({ histogram: { sampleId: e.sampleId, masses: h.sampleId === e.sampleId ? h.masses : [], accumulating: true, processedEvents: from } });
    await this.worker.accumulate(e.sampleId, e.detectorId, meta.analysisPair, from, from + count, (masses, processed) => {
      const cur = this.state.histogram;
      this.store.set({ histogram: { ...cur, masses: [...cur.masses, ...masses], processedEvents: cur.processedEvents + processed } });
    }, this.processOptions());
    this.store.update('histogram', { accumulating: false });
  }

  resetHistogram(): void {
    this.store.set({ histogram: { sampleId: this.state.event.sampleId, masses: [], accumulating: false, processedEvents: 0 } });
  }
}

function computeAcc(m: MachineInputs): AcceleratorState {
  const machine = machineById(m.machineId);
  const species = beamSpeciesById(m.speciesId)!;
  return computeAccelerator({
    machine,
    species,
    mode: m.mode,
    energy: m.energy,
    dipoleFieldT: m.mode === 'sandbox' ? m.sandboxFieldT : undefined,
    temperatureK: m.mode === 'sandbox' ? m.sandboxTemperatureK : undefined,
  });
}

