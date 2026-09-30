/**
 * Post-processing chain (TSL): scene pass → optional bloom → tone mapping/output → optional FXAA.
 * Bloom strength = quality base × visualization-mode multiplier, so PHYSICAL/ANALYSIS stay
 * restrained and CINEMATIC is visibly (and labelledly) enhanced.
 */
import { RenderPipeline, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu';
import { pass, renderOutput, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type { QualityPreset } from '../QualityPresets';

export interface PostSettings {
  readonly quality: QualityPreset;
  readonly bloomScale: number;
}

export class PostProcessing {
  private pipeline: RenderPipeline | null = null;
  private readonly bloomStrength = uniform(0);
  private key = '';

  constructor(private readonly renderer: WebGPURenderer) {}

  /** (Re)builds the chain when scene/camera or the enabled passes change. */
  configure(scene: Scene, camera: Camera, s: PostSettings): void {
    const strength = s.quality.bloom ? s.quality.bloomStrength * s.bloomScale : 0;
    const useBloom = strength > 0.001;
    const key = `${scene.uuid}|${camera.uuid}|${useBloom}|${s.quality.fxaa}`;
    this.bloomStrength.value = strength;
    if (key === this.key && this.pipeline) return;
    this.dispose();
    this.key = key;
    const scenePass = pass(scene, camera);
    let color: Node<'vec4'> = scenePass.getTextureNode('output');
    if (useBloom) color = color.add(bloom(color, this.bloomStrength, 0.4, 0.8));
    const pipeline = new RenderPipeline(this.renderer);
    if (s.quality.fxaa) {
      pipeline.outputColorTransform = false;
      pipeline.outputNode = fxaa(renderOutput(color));
    } else {
      pipeline.outputNode = color;
    }
    this.pipeline = pipeline;
  }

  render(): void {
    this.pipeline?.render();
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.key = '';
  }
}
