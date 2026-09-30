/**
 * Single source of application state. Scientific state (accelerator, beam, processed
 * event) is produced by physics modules; visual state (mode, palette, quality, camera
 * scene) is kept in a separate sub-object and never feeds back into physics.
 */
import type { AcceleratorState, EnergySpec, OperatingMode } from '../physics/accelerator/AcceleratorCore';
import type { MachineId } from '../physics/accelerator/MachinePreset';
import type { BeamModelState } from '../physics/beam/BeamModel';
import type { SampleMetadata } from '../physics/events/EventSchema';
import type { Provenance } from '../data-sources/NormalizedEvent';
import type { PileUpConfig } from '../physics/pileup/PileUp';
import type { IROptics } from '../physics/optics/InteractionRegionOptics';
import type { IRSettings } from '../physics/optics/IRScenario';
import type { OpticsTable } from '../physics/optics/OpticsTable';
import type { TriggerItemId } from '../physics/trigger/Trigger';
import type { DetectorId, FieldModel, ProcessedEvent } from '../physics/EventProcessor';
import type { PairResult } from '../physics/reconstruction/InvariantMass';
import type { ColormapId } from '../visualization/colors/Colormaps';
import type { ColorBy } from '../visualization/colors/ColorMode';
import type { PaletteId } from '../visualization/colors/PhysicsPalette';
import type { QualityId } from '../visualization/QualityPresets';
import type { VisMode } from '../visualization/VisualizationMode';
import type { Subsystem } from '../physics/detector/DetectorModel';
import type { ResponseConfig } from '../detector/response/ResponseConfig';
import type { JetConfig } from '../physics/reconstruction/AdvancedReconstruction';
import type { QuenchControls } from '../physics/accelerator/QuenchScenario';
import type { QuenchV2Result } from '../physics/accelerator/QuenchModelV2';

export type SceneId = 'surface' | 'ring' | 'tunnel' | 'ir' | 'cavern' | 'detector' | 'event';
export const SCENE_ORDER: readonly SceneId[] = ['surface', 'ring', 'tunnel', 'ir', 'cavern', 'detector', 'event'];

export type TimeScaleKind = 'realtime' | 'slowmo' | 'custom';

export interface MachineInputs {
  readonly machineId: MachineId;
  readonly speciesId: string;
  readonly mode: OperatingMode;
  readonly energy: EnergySpec;
  /** Sandbox-only independent inputs. */
  readonly sandboxFieldT: number;
  readonly sandboxTemperatureK: number;
  readonly sandboxQuadGradientTPerM: number | null;
}

export interface VisualState {
  readonly mode: VisMode;
  readonly colorBy: ColorBy;
  readonly palette: PaletteId;
  readonly colormap: ColormapId;
  readonly caloColormap: ColormapId;
  readonly quality: QualityId;
  readonly timeScale: TimeScaleKind;
  /** Display seconds per physical nanosecond for 'custom'. */
  readonly customSecondsPerNs: number;
  readonly showBendFocusOverlay: boolean;
  readonly heliumVentingScenario: boolean;
  readonly cutaway: boolean;
  /** Detector subsystems hidden in the detector view (exploration aid, visual only). */
  readonly hiddenSubsystems: readonly Subsystem[];
}

export interface EventState {
  readonly sampleId: string;
  readonly index: number;
  readonly detectorId: DetectorId;
  readonly loading: boolean;
  readonly error: string | null;
  readonly meta: SampleMetadata | null;
  /** Provenance of the current dataset — always shown with the event. */
  readonly provenance: Provenance | null;
  readonly datasetSize: number;
  /** Pile-up overlay applied to simulated (truth) events. */
  readonly pileUp: PileUpConfig;
  /** Magnetic-field representation used for propagation (Phase 2 default: field maps). */
  readonly fieldModel: FieldModel;
  /** Detector-response configuration (efficiency, resolution, dead/noisy channels). */
  readonly response: ResponseConfig;
  /** Phase 2 jet algorithm (generalized kT) configuration. */
  readonly jets: JetConfig;
  /** Enabled trigger-menu items. */
  readonly triggerItems: Readonly<Record<TriggerItemId, boolean>>;
  readonly processed: ProcessedEvent | null;
  readonly selectedParticleId: number | null;
  readonly selectedRecoId: string | null;
  readonly pair: PairResult | null;
  /** Animation start (performance.now) for time-of-flight replay. */
  readonly replayStartedAt: number;
}

export interface HistogramState {
  readonly sampleId: string;
  readonly masses: readonly number[];
  readonly accumulating: boolean;
  readonly processedEvents: number;
}

export interface QuenchState {
  readonly active: boolean;
  /** performance.now() at quench onset. */
  readonly startedAt: number;
  /** Simulation seconds per wall-clock second for the quench timeline. */
  readonly playbackRate: number;
  /** Quench V2 inputs and the simulated thermal/electrical evolution. */
  readonly controls: QuenchControls;
  readonly sim: QuenchV2Result | null;
}

export interface OpticsState {
  readonly settings: IRSettings;
  readonly ir: IROptics;
  /** Externally computed optics table (TFS import), displayed alongside the model. */
  readonly imported: OpticsTable | null;
}

export interface SimulationState {
  readonly scene: SceneId;
  readonly transitioning: boolean;
  readonly machine: MachineInputs;
  readonly accelerator: AcceleratorState;
  readonly beam: BeamModelState;
  readonly optics: OpticsState;
  readonly vis: VisualState;
  readonly event: EventState;
  readonly histogram: HistogramState;
  readonly quench: QuenchState;
  readonly rendererBackend: string;
}

type Listener = (s: SimulationState, prev: SimulationState) => void;

export class Store {
  private state: SimulationState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: SimulationState) {
    this.state = initial;
  }

  get(): SimulationState {
    return this.state;
  }

  set(patch: Partial<SimulationState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    for (const l of this.listeners) l(this.state, prev);
  }

  update<K extends 'vis' | 'event' | 'histogram' | 'quench' | 'machine' | 'optics'>(key: K, patch: Partial<SimulationState[K]>): void {
    this.set({ [key]: { ...this.state[key], ...patch } } as Partial<SimulationState>);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
