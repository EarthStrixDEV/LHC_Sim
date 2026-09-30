import { WebGPURenderer } from 'three/webgpu';

/**
 * Fallback path: three.js WebGPURenderer running its WebGL 2 backend.
 *
 * We deliberately do not use the classic WebGLRenderer: all materials are node/TSL
 * materials, which only the WebGPURenderer family can compile. With `forceWebGL` the
 * same materials are translated to GLSL, so both paths render identical content.
 */
export async function createWebGLRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const r = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await r.init();
  return r;
}
