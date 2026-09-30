import { WebGPURenderer } from 'three/webgpu';

/** True when the browser exposes WebGPU and grants an adapter. */
export async function webgpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** Preferred path: native WebGPU backend. */
export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const r = new WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
  await r.init();
  return r;
}
