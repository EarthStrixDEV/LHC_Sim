/**
 * TrackRenderer — turns physics-owned trajectories (TrackRecord samples) into three
 * batched GPU geometries by LOD tier. It never alters positions: curvature comes from
 * TrackPropagator only.
 *
 *   tier 1: tubes (merged, N radial segments)
 *   tier 2: crossed ribbons (two perpendicular quads per segment, merged)
 *   tier 3: line segments (1 px, merged)
 */
import { BufferAttribute, BufferGeometry, Group, LineSegments, Mesh, Vector3 } from 'three/webgpu';
import type { TrackRecord } from '../../physics/propagation/EventPropagation';
import { trackStyle, type ColorContext, type TrackStyle } from '../colors/ColorMode';
import type { QualityPreset } from '../QualityPresets';
import { assignTiers, type TrackTier } from './TrackLOD';
import { createTrackMaterial, TrackUniforms } from './TrackMaterial';

/** Visual widths [m] (world space) — presentation choice, not physics. */
const TUBE_RADIUS_M = 0.008;
const RIBBON_HALF_WIDTH_M = 0.004;

export interface TrackRenderOptions {
  readonly color: ColorContext;
  readonly quality: QualityPreset;
  readonly selectedParticleId: number | null;
  readonly includeNeutrinos: boolean;
  /** Restrict to these particle ids (e.g. reconstructed tracks); null = all. */
  readonly onlyParticles: ReadonlySet<number> | null;
  readonly additive: boolean;
  /** Decay-chain highlight: tracks outside this set are faded (null = no highlight). */
  readonly highlight: ReadonlySet<number> | null;
}

/** Opacity factor for tracks outside the highlighted decay chain. */
const FADED_OPACITY = 0.12;

class Builder {
  pos: number[] = [];
  col: number[] = [];
  time: number[] = [];
  track: number[] = [];
  arc: number[] = [];
  dash: number[] = [];
  alpha: number[] = [];
  index: number[] = [];

  vertex(x: number, y: number, z: number, s: TrackStyle, t: number, ti: number, a: number): number {
    this.pos.push(x, y, z);
    this.col.push(s.color[0], s.color[1], s.color[2]);
    this.time.push(t);
    this.track.push(ti);
    this.arc.push(a);
    this.dash.push(s.dash);
    this.alpha.push(s.opacity);
    return this.time.length - 1;
  }

  geometry(indexed: boolean): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aTime', new BufferAttribute(new Float32Array(this.time), 1));
    g.setAttribute('aTrack', new BufferAttribute(new Float32Array(this.track), 1));
    g.setAttribute('aArc', new BufferAttribute(new Float32Array(this.arc), 1));
    g.setAttribute('aDash', new BufferAttribute(new Float32Array(this.dash), 1));
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(this.alpha), 1));
    if (indexed) g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

export class TrackRenderer {
  readonly group = new Group();
  readonly uniforms = new TrackUniforms();
  /** Track index (aTrack) → particle id, for picking and selection. */
  particleIds: number[] = [];
  tiers: TrackTier[] = [];
  visibleCount = 0;
  private tracks: readonly TrackRecord[] = [];

  build(tracks: readonly TrackRecord[], o: TrackRenderOptions): void {
    this.dispose();
    this.tracks = tracks;
    const filtered = tracks.filter((t) => (o.includeNeutrinos || t.kind !== 'neutrino') && (!o.onlyParticles || o.onlyParticles.has(t.particleId)));
    this.tiers = assignTiers(filtered, o.quality, o.selectedParticleId);
    this.particleIds = filtered.map((t) => t.particleId);
    const b1 = new Builder(), b2 = new Builder(), b3 = new Builder();
    const segs = o.quality.tubeSegments;
    let visible = 0;
    filtered.forEach((t, ti) => {
      const tier = this.tiers[ti]!;
      if (tier === 0 || t.samples.count < 2) return;
      visible++;
      const base = trackStyle(t, o.color);
      const style = o.highlight && !o.highlight.has(t.particleId) ? { ...base, opacity: base.opacity * FADED_OPACITY } : base;
      if (tier === 1) addTube(b1, t, ti, style, segs);
      else if (tier === 2) addRibbons(b2, t, ti, style);
      else addLines(b3, t, ti, style);
    });
    this.visibleCount = visible;
    if (b1.time.length) this.group.add(new Mesh(b1.geometry(true), createTrackMaterial(this.uniforms, 'mesh', o.additive)));
    if (b2.time.length) this.group.add(new Mesh(b2.geometry(true), createTrackMaterial(this.uniforms, 'mesh', o.additive)));
    if (b3.time.length) this.group.add(new LineSegments(b3.geometry(false), createTrackMaterial(this.uniforms, 'line', o.additive)));
    for (const c of this.group.children) c.frustumCulled = false;
  }

  /** Track index of a particle in the current build (−1 if not drawn). */
  indexOf(particleId: number | null): number {
    return particleId === null ? -1 : this.particleIds.indexOf(particleId);
  }

  /**
   * Screen-space picking: nearest drawn sample within `maxPx` pixels. CPU work happens
   * only on click.
   */
  pick(project: (v: Vector3) => Vector3, ndcX: number, ndcY: number, width: number, height: number, maxPx = 10): number | null {
    let best: number | null = null;
    let bestD = maxPx;
    const v = new Vector3();
    const byId = new Map(this.tracks.map((t) => [t.particleId, t]));
    this.particleIds.forEach((pid, ti) => {
      if (this.tiers[ti] === 0) return;
      const t = byId.get(pid)!;
      const p = t.samples.positions;
      const step = Math.max(1, Math.floor(t.samples.count / 60));
      for (let i = 0; i < t.samples.count; i += step) {
        v.set(p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
        const s = project(v);
        if (s.z > 1) continue;
        const d = Math.hypot(((s.x - ndcX) * width) / 2, ((s.y - ndcY) * height) / 2);
        if (d < bestD) {
          bestD = d;
          best = pid;
        }
      }
    });
    return best;
  }

  dispose(): void {
    for (const c of this.group.children) {
      const m = c as Mesh;
      m.geometry.dispose();
      (m.material as { dispose(): void }).dispose();
    }
    this.group.clear();
  }
}

// ---- Geometry builders ---------------------------------------------------------------------------

const T = new Vector3(), N = new Vector3(), B = new Vector3(), P = new Vector3(), UP = new Vector3(0, 0, 1), ALT = new Vector3(1, 0, 0);

function frameAt(pos: Float32Array, count: number, i: number): void {
  const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
  T.set(pos[3 * b]! - pos[3 * a]!, pos[3 * b + 1]! - pos[3 * a + 1]!, pos[3 * b + 2]! - pos[3 * a + 2]!);
  if (T.lengthSq() < 1e-18) T.set(0, 0, 1);
  T.normalize();
  N.crossVectors(T, Math.abs(T.dot(UP)) > 0.95 ? ALT : UP).normalize();
  B.crossVectors(T, N).normalize();
}

function addTube(b: Builder, t: TrackRecord, ti: number, s: TrackStyle, segs: number): void {
  const { positions: pos, times, arcLengths, count } = t.samples;
  const base = b.time.length;
  for (let i = 0; i < count; i++) {
    frameAt(pos, count, i);
    P.set(pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!);
    // Radius grows mildly with distance from the IP so outer (muon) tracks stay legible.
    const r = TUBE_RADIUS_M * s.width * (1 + Math.hypot(P.x, P.y) / 3);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const c = Math.cos(a) * r, sn = Math.sin(a) * r;
      b.vertex(P.x + N.x * c + B.x * sn, P.y + N.y * c + B.y * sn, P.z + N.z * c + B.z * sn, s, times[i]!, ti, arcLengths[i]!);
    }
  }
  for (let i = 0; i + 1 < count; i++) {
    for (let k = 0; k < segs; k++) {
      const a = base + i * segs + k, bb = base + i * segs + ((k + 1) % segs);
      const c = a + segs, d = bb + segs;
      b.index.push(a, c, bb, bb, c, d);
    }
  }
}

function addRibbons(b: Builder, t: TrackRecord, ti: number, s: TrackStyle): void {
  const { positions: pos, times, arcLengths, count } = t.samples;
  const base = b.time.length;
  const w = RIBBON_HALF_WIDTH_M * s.width;
  for (let i = 0; i < count; i++) {
    frameAt(pos, count, i);
    P.set(pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!);
    const ww = w * (1 + Math.hypot(P.x, P.y) / 3);
    const ti0 = times[i]!, a0 = arcLengths[i]!;
    b.vertex(P.x - N.x * ww, P.y - N.y * ww, P.z - N.z * ww, s, ti0, ti, a0);
    b.vertex(P.x + N.x * ww, P.y + N.y * ww, P.z + N.z * ww, s, ti0, ti, a0);
    b.vertex(P.x - B.x * ww, P.y - B.y * ww, P.z - B.z * ww, s, ti0, ti, a0);
    b.vertex(P.x + B.x * ww, P.y + B.y * ww, P.z + B.z * ww, s, ti0, ti, a0);
  }
  for (let i = 0; i + 1 < count; i++) {
    const o = base + 4 * i, n = o + 4;
    b.index.push(o, n, o + 1, o + 1, n, n + 1);
    b.index.push(o + 2, n + 2, o + 3, o + 3, n + 2, n + 3);
  }
}

function addLines(b: Builder, t: TrackRecord, ti: number, s: TrackStyle): void {
  const { positions: pos, times, arcLengths, count } = t.samples;
  for (let i = 0; i + 1 < count; i++) {
    b.vertex(pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!, s, times[i]!, ti, arcLengths[i]!);
    b.vertex(pos[3 * i + 3]!, pos[3 * i + 4]!, pos[3 * i + 5]!, s, times[i + 1]!, ti, arcLengths[i + 1]!);
  }
}
