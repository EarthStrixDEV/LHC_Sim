/**
 * GLTF/GLB asset pipeline with KTX2 (Basis) textures and meshopt geometry compression.
 * Phase 1 scenes are procedural placeholders; later art assets load through here.
 * Loaded assets are reference-counted per URL so domains can release them on transition.
 */
import type { Group, WebGPURenderer } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Basis transcoder copied into public/ by scripts/copy-decoders.mjs. */
const BASIS_PATH = '/decoders/basis/';

export class AssetManager {
  private readonly loader: GLTFLoader;
  private readonly ktx2: KTX2Loader;
  private readonly cache = new Map<string, { gltf: Promise<GLTF>; refs: number }>();

  constructor(renderer: WebGPURenderer) {
    this.ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH);
    this.ktx2.detectSupport(renderer);
    this.loader = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
  }

  /** Loads (or reuses) a GLTF and returns a clone of its scene. */
  async load(url: string): Promise<Group> {
    let entry = this.cache.get(url);
    if (!entry) {
      entry = { gltf: this.loader.loadAsync(url), refs: 0 };
      this.cache.set(url, entry);
    }
    entry.refs++;
    return (await entry.gltf).scene.clone(true);
  }

  /** Drops one reference; frees GPU resources when unused. */
  async release(url: string): Promise<void> {
    const entry = this.cache.get(url);
    if (!entry || --entry.refs > 0) return;
    this.cache.delete(url);
    (await entry.gltf).scene.traverse((o) => {
      const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      m.geometry?.dispose();
      m.material?.dispose();
    });
  }

  dispose(): void {
    this.ktx2.dispose();
    this.cache.clear();
  }
}
