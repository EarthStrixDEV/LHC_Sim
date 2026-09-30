/**
 * Shared scene helpers: restrained lighting rigs, value noise for procedural terrain.
 * Static architecture uses emissive fixtures + image-based light instead of many
 * shadow-casting lights (baked-light workflow placeholder, see docs/performance.md).
 */
import { Color, DirectionalLight, Fog, HemisphereLight, type Scene } from 'three/webgpu';
import { Rng } from '../../utils/math';
import type { DomainContext } from './SceneDomain';

export function standardLights(scene: Scene, ctx: DomainContext, o: { sky: string; ground: string; hemi: number; sun: number; sunPos: [number, number, number]; shadowExtent?: number; envIntensity?: number }): DirectionalLight {
  scene.add(new HemisphereLight(new Color(o.sky), new Color(o.ground), o.hemi));
  const sun = new DirectionalLight(0xffffff, o.sun);
  sun.position.set(...o.sunPos);
  if (ctx.quality.shadows && o.shadowExtent) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const e = o.shadowExtent;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: e * 6 });
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun);
  if (ctx.environment) {
    scene.environment = ctx.environment;
    scene.environmentIntensity = o.envIntensity ?? 0.4;
  }
  return sun;
}

export function maybeFog(scene: Scene, ctx: DomainContext, color: string, near: number, far: number): void {
  if (ctx.quality.fog) scene.fog = new Fog(new Color(color), near, far);
}

/** Seeded 2D value noise with fBm — deterministic procedural terrain (visual only). */
export class ValueNoise2D {
  private readonly perm: Uint8Array;
  private readonly vals: Float32Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [p[i], p[j]] = [p[j]!, p[i]!];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    for (let i = 0; i < 256; i++) this.vals[i] = rng.next() * 2 - 1;
  }

  private v(ix: number, iy: number): number {
    return this.vals[this.perm[(ix & 255) + this.perm[iy & 255]!]!]!;
  }

  noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.v(ix, iy), b = this.v(ix + 1, iy), c = this.v(ix, iy + 1), d = this.v(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  fbm(x: number, y: number, octaves = 4): number {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < octaves; i++) {
      s += amp * this.noise(x * f, y * f);
      f *= 2;
      amp *= 0.5;
    }
    return s;
  }
}

/** LHC interaction/access points in a schematic ring frame (θ measured from +x toward +z, i.e. clockwise from above). */
export const LHC_POINTS: ReadonlyArray<{ id: number; name: string; role: string; theta: number }> = [
  { id: 1, name: 'Point 1', role: 'ATLAS', theta: Math.PI / 4 },
  { id: 2, name: 'Point 2', role: 'ALICE · injection B1', theta: Math.PI / 2 },
  { id: 3, name: 'Point 3', role: 'Momentum cleaning', theta: (3 * Math.PI) / 4 },
  { id: 4, name: 'Point 4', role: 'RF cavities', theta: Math.PI },
  { id: 5, name: 'Point 5', role: 'CMS', theta: (5 * Math.PI) / 4 },
  { id: 6, name: 'Point 6', role: 'Beam dump', theta: (3 * Math.PI) / 2 },
  { id: 7, name: 'Point 7', role: 'Betatron cleaning', theta: (7 * Math.PI) / 4 },
  { id: 8, name: 'Point 8', role: 'LHCb · injection B2', theta: 0 },
];
