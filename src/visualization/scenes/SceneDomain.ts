/**
 * A scene domain is an independent coordinate system with its own origin, scale, camera,
 * LOD strategy and resource lifecycle. Only the active domain is resident on the GPU.
 */
import { Mesh, Object3D, PerspectiveCamera, Scene, type Material, type Texture } from 'three/webgpu';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import type { SimulationController } from '../../app/SimulationController';
import type { QualityPreset } from '../QualityPresets';
import type { VisPolicy } from '../VisualizationMode';

export interface DomainContext {
  readonly controller: SimulationController;
  readonly quality: QualityPreset;
  readonly controls: OrbitControls;
  readonly canvas: HTMLElement;
  /** Shared prefiltered HDR environment (owned by RendererManager; do not dispose). */
  readonly environment: Texture | null;
}

export interface Portal {
  readonly label: string;
  readonly target: SceneId;
}

export interface FrameInfo {
  readonly dt: number;
  readonly time: number;
  readonly state: SimulationState;
  readonly policy: VisPolicy;
}

export abstract class SceneDomain {
  abstract readonly id: SceneId;
  abstract get title(): string;
  /** One-line statement of scale / coordinate origin, shown in the HUD. */
  abstract readonly scaleNote: string;
  abstract readonly portals: readonly Portal[];

  readonly scene = new Scene();
  camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  /** Stats for the performance panel (visible tracks / active particles where relevant). */
  stats = { visibleTracks: 0, activeParticles: 0 };

  abstract build(ctx: DomainContext): void | Promise<void>;
  abstract update(frame: FrameInfo): void;
  /** Called when state changes; domains diff what they need. */
  onState(_state: SimulationState, _prev: SimulationState, _ctx: DomainContext): void {}
  /** Screen click in normalized device coords (−1..1). */
  onClick(_ndcX: number, _ndcY: number, _ctx: DomainContext): void {}

  /** Frees GPU resources and label DOM nodes. */
  dispose(): void {
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.scene.traverse((o: Object3D) => {
      if (o instanceof CSS2DObject) o.element.remove();
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) materials.add(x);
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v && (v as Texture).isTexture) textures.add(v as Texture);
      m.dispose();
    }
    for (const t of textures) t.dispose();
    this.scene.clear();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/** CSS2D label with a category chip (keeps every label honest about what it is). */
export function makeLabel(text: string, category?: string, cls = ''): CSS2DObject {
  const el = document.createElement('div');
  el.className = `scene-label ${cls}`;
  el.textContent = text;
  if (category) {
    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.textContent = category;
    el.appendChild(chip);
  }
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1.2);
  return obj;
}
