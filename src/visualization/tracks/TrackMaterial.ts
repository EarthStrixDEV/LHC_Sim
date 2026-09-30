/**
 * TSL materials for track rendering. All per-frame effects (time-of-flight reveal, dash
 * pattern, selection highlight, fade) run on the GPU from vertex attributes + uniforms, so
 * animating an event costs no CPU work and no buffer uploads.
 *
 * Attributes: color (vec3), aTime (ns), aTrack (track index), aArc (arc length, m),
 *             aDash (0 solid, 1 dashed, 2 dotted), aAlpha (base opacity).
 */
import { AdditiveBlending, LineBasicNodeMaterial, MeshBasicNodeMaterial, NormalBlending, DoubleSide } from 'three/webgpu';
import { abs, attribute, float, fract, max, mix, smoothstep, step, uniform, vec3 } from 'three/tsl';

export class TrackUniforms {
  /** Current event time [ns]; tracks are drawn where aTime ≤ time. */
  readonly time = uniform(1e9);
  /** Selected track index (−1: none). */
  readonly selected = uniform(-1);
  /** 1 → dim non-selected tracks. */
  readonly dim = uniform(0);
  /** Brightening of the moving "head" during animation (visual only). */
  readonly headGlow = uniform(0);
  /** Global opacity multiplier. */
  readonly opacity = uniform(1);
}

/** Dash lengths in metres of arc length. */
const DASH_PERIOD_M = 0.12;
const DOT_PERIOD_M = 0.06;

export function createTrackMaterial(u: TrackUniforms, kind: 'mesh' | 'line', additive: boolean): MeshBasicNodeMaterial | LineBasicNodeMaterial {
  const mat = kind === 'mesh' ? new MeshBasicNodeMaterial({ side: DoubleSide }) : new LineBasicNodeMaterial();
  const aTime = attribute('aTime', 'float');
  const aTrack = attribute('aTrack', 'float');
  const aArc = attribute('aArc', 'float');
  const aDash = attribute('aDash', 'float');
  const aAlpha = attribute('aAlpha', 'float');
  const col = attribute('color', 'vec3');

  const revealed = step(aTime, u.time);
  const isDashed = step(0.5, aDash).mul(step(aDash, 1.5));
  const isDotted = step(1.5, aDash);
  const dashOn = step(fract(aArc.div(DASH_PERIOD_M)), 0.6);
  const dotOn = step(fract(aArc.div(DOT_PERIOD_M)), 0.35);
  const pattern = mix(mix(float(1), dashOn, isDashed), dotOn, isDotted);
  const isSel = float(1).sub(step(0.5, abs(aTrack.sub(u.selected))));
  const dimFactor = mix(float(1), mix(float(0.12), float(1), isSel), u.dim);
  const head = smoothstep(u.time.sub(0.8), u.time, aTime).mul(u.headGlow);

  mat.colorNode = mix(col, vec3(1, 1, 1), max(isSel.mul(0.35), head.mul(0.6)));
  mat.opacityNode = aAlpha.mul(revealed).mul(pattern).mul(dimFactor).mul(u.opacity);
  mat.transparent = true;
  mat.depthWrite = false;
  mat.alphaTest = 0.01;
  mat.blending = additive ? AdditiveBlending : NormalBlending;
  return mat;
}
