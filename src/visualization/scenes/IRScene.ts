/**
 * INTERACTION REGION domain — ±80 m around a high-luminosity IP (ATLAS / CMS type).
 * Origin: interaction point; beam axis = z (= s); 1 unit = 1 m along s.
 *
 * PHYSICAL: beam pipe, inner-triplet cryostats, experiment envelope (for scale).
 * AUGMENTED / CINEMATIC: both beam envelopes (±1σ) and their crossing orbits from the physics
 * IR model. Transverse sizes AND orbit offsets are multiplied by the same stated factor, so
 * the drawing stays geometrically consistent; longitudinal positions are true.
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Line, LineBasicNodeMaterial, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import type { IROptics } from '../../physics/optics/InteractionRegionOptics';
import { beamSize } from '../../physics/optics/Twiss';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { standardLights } from './sceneUtils';

/** Transverse exaggeration (σ and orbit offsets) — stated on screen. */
export const IR_TRANSVERSE_EXAGGERATION = 1000;
const RING = 20;

export class IRScene extends SceneDomain {
  readonly id: SceneId = 'ir';
  readonly title = 'Interaction region optics';
  readonly scaleNote = `1 unit = 1 m along the beam (s) · origin: IP · transverse beam size & orbit ×${IR_TRANSVERSE_EXAGGERATION} in AUGMENTED`;
  readonly portals: readonly Portal[] = [
    { label: '← Back to tunnel', target: 'tunnel' },
    { label: 'Experimental cavern →', target: 'cavern' },
  ];

  private beams = new Group();
  private magnets = new Group();
  private key = '';

  build(ctx: DomainContext): void {
    const s = this.scene;
    s.background = new Color('#0b0e13');
    standardLights(s, ctx, { sky: '#dfe7f0', ground: '#1a1d22', hemi: 0.8, sun: 1.1, sunPos: [30, 40, 20], shadowExtent: 0, envIntensity: 0.5 });
    this.camera.near = 0.05;
    this.camera.far = 600;
    this.camera.position.set(38, 16, 55);
    this.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.minDistance = 1;
    ctx.controls.maxDistance = 250;

    // Beam pipe (true radius is ~2–3 cm; drawn thin for visibility of the envelopes).
    const pipe = new Mesh(new CylinderGeometry(0.03, 0.03, 160, 12, 1, true), new MeshStandardNodeMaterial({ color: '#8a939e', metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.35, side: DoubleSide }));
    pipe.rotation.x = Math.PI / 2;
    s.add(pipe);
    // Experiment envelope for scale (ATLAS ≈ 44 m × 25 m).
    const exp = new Mesh(new BoxGeometry(25, 25, 44), new MeshBasicNodeMaterial({ color: '#3b82f6', transparent: true, opacity: 0.05, depthWrite: false }));
    s.add(exp);
    const el = makeLabel('Experiment envelope (ATLAS-sized, for scale)', 'PHYSICALLY VISIBLE', 'lbl-note');
    el.position.set(0, 13.5, 0);
    s.add(el);
    s.add(this.magnets, this.beams);
    this.rebuild(ctx.controller.state);
  }

  private rebuild(st: SimulationState): void {
    const key = `${st.optics.ir.betaStarM}|${st.optics.ir.input.fullCrossingAngleRad}|${st.optics.ir.input.geometricEmittanceM}|${st.optics.settings.ip}`;
    if (key === this.key) return;
    this.key = key;
    for (const g of [this.magnets, this.beams]) {
      g.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void }; element?: HTMLElement };
        m.geometry?.dispose();
        m.material?.dispose();
        m.element?.remove();
      });
      g.clear();
    }
    const ir = st.optics.ir;
    for (const side of [-1, 1]) {
      for (const e of ir.layout.elements) {
        const m = new Mesh(new CylinderGeometry(0.3, 0.3, e.length, 24), new MeshStandardNodeMaterial({ color: e.polarity > 0 ? '#c2410c' : '#1d4ed8', metalness: 0.3, roughness: 0.6 }));
        m.rotation.x = Math.PI / 2;
        m.position.z = side * (e.start + e.length / 2);
        this.magnets.add(m);
        if (side > 0) {
          const l = makeLabel(`${e.name} (${e.polarity > 0 ? 'F' : 'D'} in x)`, 'MAGNET');
          l.position.set(0, 0.9, e.start + e.length / 2);
          this.magnets.add(l);
        }
      }
    }
    const triplet = makeLabel(`Inner triplet: ${ir.layout.gradientTPerM} T/m (educational layout, VERIFY)`, 'SIMPLIFIED MODEL', 'lbl-note');
    triplet.position.set(0, 3, 40);
    this.magnets.add(triplet);

    this.beams.add(envelopeTube(ir, +1, '#60a5fa'), envelopeTube(ir, -1, '#f87171'));
    const w = makeLabel(`IP waist: β* = ${(ir.betaStarM * 100).toFixed(1)} cm, σ* = ${(ir.sigmaStarM * 1e6).toFixed(1)} µm`, 'SIMULATION TRUTH');
    w.position.set(0, 2.2, 0);
    const x = makeLabel(`Crossing angle θc = ${(ir.input.fullCrossingAngleRad * 1e6).toFixed(0)} µrad (${ir.input.crossingPlane}-plane) · Piwinski F = ${ir.piwinskiFactor.toFixed(2)}`, 'SIMULATION TRUTH');
    x.position.set(0, -2.2, 18);
    const ex = makeLabel(`Beam envelopes ±1σ and orbits ×${IR_TRANSVERSE_EXAGGERATION} transverse — beams are invisible in reality`, 'AUGMENTED', 'lbl-note');
    ex.position.set(0, 6, -40);
    this.beams.add(w, x, ex);
  }

  override onState(st: SimulationState, prev: SimulationState): void {
    if (st.optics !== prev.optics) this.rebuild(st);
  }

  update(f: FrameInfo): void {
    this.beams.visible = f.policy.showBeamEnvelope;
  }
}

/** Elliptical ±1σ tube around beam `b` (+1 / −1) following the crossing orbit. */
function envelopeTube(ir: IROptics, b: 1 | -1, color: string): Group {
  const t = ir.table;
  const eps = ir.input.geometricEmittanceM;
  const K = IR_TRANSVERSE_EXAGGERATION;
  const n = t.s.length;
  const pos = new Float32Array(n * RING * 3);
  const idx: number[] = [];
  const axis = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Beam 2 has the mirrored optics (x ↔ y focusing swapped) and the opposite orbit angle.
    const sx = beamSize(eps, b > 0 ? t.betx[i]! : t.bety[i]!) * K;
    const sy = beamSize(eps, b > 0 ? t.bety[i]! : t.betx[i]!) * K;
    const ox = b * (t.x?.[i] ?? 0) * K;
    const oy = b * (t.y?.[i] ?? 0) * K;
    axis.set([ox, oy, t.s[i]!], i * 3);
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      pos.set([ox + sx * Math.cos(a), oy + sy * Math.sin(a), t.s[i]!], (i * RING + j) * 3);
      if (i + 1 < n) {
        const a0 = i * RING + j, a1 = i * RING + ((j + 1) % RING), b0 = a0 + RING, b1 = a1 + RING;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  const tube = new Mesh(g, new MeshBasicNodeMaterial({ color, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }));
  const lg = new BufferGeometry();
  lg.setAttribute('position', new BufferAttribute(axis, 3));
  const orbit = new Line(lg, new LineBasicNodeMaterial({ color }));
  const grp = new Group();
  grp.add(tube, orbit);
  return grp;
}
