/**
 * RendererManager — owns the GPU renderer and the label overlay. Prefers WebGPU and
 * falls back to the WebGL 2 backend. Knows nothing about physics.
 */
import { ACESFilmicToneMapping, PCFShadowMap, PMREMGenerator, SRGBColorSpace, type Camera, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWebGLRenderer } from './WebGLRendererBackend';
import { createWebGPURenderer, webgpuAvailable } from './WebGPURendererBackend';
import { PostProcessing, type PostSettings } from '../post/PostProcessing';
import { AssetManager } from '../assets/AssetManager';
import type { QualityPreset } from '../QualityPresets';

export type BackendName = 'WebGPU' | 'WebGL 2 (fallback)';

export class RendererManager {
  renderer!: WebGPURenderer;
  backend: BackendName = 'WebGL 2 (fallback)';
  readonly labels = new CSS2DRenderer();
  post!: PostProcessing;
  environment: Texture | null = null;
  /** GLTF + KTX2 + meshopt loader shared by all domains. */
  assets!: AssetManager;
  private quality: QualityPreset | null = null;

  constructor(private readonly container: HTMLElement) {}

  async init(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.className = 'gl-canvas';
    this.container.appendChild(canvas);
    let r: WebGPURenderer | null = null;
    // `?renderer=webgl` forces the fallback path (testing / problematic drivers).
    const forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl';
    if (!forceWebGL && (await webgpuAvailable())) {
      try {
        r = await createWebGPURenderer(canvas);
      } catch (e) {
        console.warn('[renderer] WebGPU init failed, using WebGL 2 fallback', e);
      }
    }
    if (!r) r = await createWebGLRenderer(canvas);
    this.renderer = r;
    const isWebGPU = (r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
    this.backend = isWebGPU ? 'WebGPU' : 'WebGL 2 (fallback)';
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.type = PCFShadowMap;
    this.post = new PostProcessing(r);
    this.assets = new AssetManager(r);
    // Image-based lighting: procedural "room" HDR environment prefiltered once and shared by
    // all domains (not disposed on scene transitions).
    try {
      this.environment = new PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    } catch (e) {
      console.warn('[renderer] environment map unavailable', e);
    }

    this.labels.domElement.className = 'label-layer';
    this.container.appendChild(this.labels.domElement);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality(q: QualityPreset): void {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.resize();
  }

  get size(): { width: number; height: number } {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  resize(): void {
    const { width, height } = this.size;
    if (!this.renderer || width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.labels.setSize(width, height);
  }

  render(scene: Scene, camera: Camera, post: Omit<PostSettings, 'quality'>): void {
    if (!this.quality) return;
    this.post.configure(scene, camera, { quality: this.quality, bloomScale: post.bloomScale });
    this.post.render();
    this.labels.render(scene, camera);
  }

  get info(): { drawCalls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { drawCalls: i.render.drawCalls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
