/**
 * EXPERIMENTAL CAVERN domain (UX15 at Point 1). Origin: cavern floor centre, 1 unit = 1 m,
 * x = along the beam. Static architecture with emissive fixtures (baked-light style);
 * ATLAS shown at low LOD. Dimensions approximate: 53 m × 30 m × 35 m.
 */
import { BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three/webgpu';
import type { SceneId, SimulationState } from '../../app/SimulationState';
import { getDetector } from '../../physics/EventProcessor';
import { PALETTES } from '../colors/PhysicsPalette';
import { buildDetector } from '../detector/DetectorRenderer';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { maybeFog, standardLights } from './sceneUtils';

const L = 53, W = 30, H = 35;
const BEAM_HEIGHT_M = 12.5;

export class CavernScene extends SceneDomain {
  readonly id: SceneId = 'cavern';
  readonly title = 'ATLAS cavern UX15 (Point 1)';
  readonly scaleNote = '1 unit = 1 m · origin: cavern floor centre · ~100 m below ground';
  readonly portals: readonly Portal[] = [
    { label: 'Approach the detector →', target: 'detector' },
    { label: '← Back to tunnel', target: 'tunnel' },
    { label: '↑ Back to ring', target: 'ring' },
  ];

  build(ctx: DomainContext): void {
    const s = this.scene;
    const state = ctx.controller.state;
    s.background = new Color('#101317');
    maybeFog(s, ctx, '#15191e', 60, 160);
    standardLights(s, ctx, { sky: '#e6eef6', ground: '#2a2a2a', hemi: 0.6, sun: 1.0, sunPos: [10, 60, 20], shadowExtent: ctx.quality.shadows ? 40 : 0, envIntensity: 0.5 });
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.position.set(-46, 22, 44);
    this.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, BEAM_HEIGHT_M, 0);
    ctx.controls.minDistance = 6;
    ctx.controls.maxDistance = 120;

    const concrete = new MeshStandardMaterial({ color: '#8f8b84', roughness: 0.95 });
    const floor = new Mesh(new PlaneGeometry(L, W), new MeshStandardMaterial({ color: '#5c5a57', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // Walls (far side and ends left closed; near side open for viewing).
    const back = new Mesh(new PlaneGeometry(L, H), concrete);
    back.position.set(0, H / 2, -W / 2);
    const endA = new Mesh(new PlaneGeometry(W, H), concrete);
    endA.position.set(-L / 2, H / 2, 0);
    endA.rotation.y = Math.PI / 2;
    const endB = endA.clone();
    endB.position.x = L / 2;
    endB.rotation.y = -Math.PI / 2;
    s.add(back, endA, endB);

    // Wall ribs and crane rails (instanced).
    const ribs = new InstancedMesh(new BoxGeometry(0.8, H, 0.8), concrete, 12);
    const m4 = new Matrix4();
    for (let i = 0; i < 12; i++) {
      m4.makeTranslation(-L / 2 + 2 + i * ((L - 4) / 11), H / 2, -W / 2 + 0.4);
      ribs.setMatrixAt(i, m4);
    }
    s.add(ribs);
    const rail = new Mesh(new BoxGeometry(L, 1.2, 0.8), new MeshStandardMaterial({ color: '#c9a227', roughness: 0.5, metalness: 0.6 }));
    rail.position.set(0, H - 6, -W / 2 + 1.5);
    const rail2 = rail.clone();
    rail2.position.z = W / 2 - 1.5;
    const bridge = new Mesh(new BoxGeometry(2, 1.6, W - 3), rail.material);
    bridge.position.set(-12, H - 5.5, 0);
    s.add(rail, rail2, bridge);

    // Access shafts PX14 (Ø18 m) and PX16 (Ø12.6 m) opening into the vault.
    const shaftMat = new MeshStandardMaterial({ color: '#6c6a66', roughness: 1, side: DoubleSide });
    for (const [x, d] of [[-9, 18], [14, 12.6]] as const) {
      const shaft = new Mesh(new CylinderGeometry(d / 2, d / 2, 30, 48, 1, true), shaftMat);
      shaft.position.set(x, H + 15, 0);
      s.add(shaft);
      const ring = new Mesh(new CylinderGeometry(d / 2 + 0.5, d / 2 + 0.5, 0.6, 48, 1, true), new MeshStandardMaterial({ color: '#fff7e0', emissive: '#fff1c1', emissiveIntensity: 1.5 }));
      ring.position.set(x, H - 0.5, 0);
      s.add(ring);
    }
    const shaftLabel = makeLabel('Access shaft PX14 (Ø 18 m) — ATLAS was lowered in pieces', 'INFRASTRUCTURE');
    shaftLabel.position.set(-9, H - 2, 0);
    s.add(shaftLabel);

    // Ceiling light panels (emissive; no per-panel light sources).
    const panels = new InstancedMesh(new BoxGeometry(3, 0.2, 1), new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff8e8', emissiveIntensity: 2 }), 16);
    for (let i = 0; i < 16; i++) {
      m4.makeTranslation(-L / 2 + 4 + (i % 8) * 6.4, H - 1, i < 8 ? -8 : 8);
      panels.setMatrixAt(i, m4);
    }
    s.add(panels);

    // ATLAS (low LOD), beam axis along cavern x.
    const atlas = buildDetector(getDetector('atlas'), { segments: 32, opacity: 1, cutaway: false, tint: PALETTES[state.vis.palette].geometry });
    atlas.rotation.y = Math.PI / 2;
    atlas.position.y = BEAM_HEIGHT_M;
    atlas.traverse((o) => {
      o.castShadow = ctx.quality.shadows;
      o.receiveShadow = ctx.quality.shadows;
    });
    s.add(atlas);
    // Support feet
    const feet = new InstancedMesh(new BoxGeometry(2, BEAM_HEIGHT_M - 9, 3), new MeshStandardMaterial({ color: '#4b5563', roughness: 0.6, metalness: 0.5 }), 6);
    for (let i = 0; i < 6; i++) {
      m4.makeTranslation(-15 + i * 6, (BEAM_HEIGHT_M - 9) / 2, i % 2 ? 5 : -5);
      feet.setMatrixAt(i, m4);
    }
    s.add(feet);

    // Human figures for scale (1.8 m).
    const people = new InstancedMesh(new CapsuleGeometry(0.25, 1.3, 4, 8), new MeshStandardMaterial({ color: '#f97316', roughness: 0.6 }), 4);
    const spots: Array<[number, number]> = [[-20, 10], [-17, 11], [22, -9], [5, 12.5]];
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.9, z);
      people.setMatrixAt(i, m4);
    });
    s.add(people);
    const pl = makeLabel('People for scale (1.8 m)');
    pl.position.set(-18.5, 2.5, 10.5);
    const al = makeLabel('ATLAS — 44 m long, 25 m diameter, ~7000 t (simplified geometry)', 'SIMPLIFIED MODEL');
    al.position.set(0, BEAM_HEIGHT_M + 14, 0);
    s.add(pl, al);
    this.statusLabel.position.set(22, 3, 13);
    s.add(this.statusLabel);
    this.onState(state);
  }

  private statusLabel = makeLabel('', 'STATUS');

  override onState(state: SimulationState): void {
    const acc = state.accelerator;
    const txt = `Beam: ${acc.species.label} ${(acc.kinematics.totalEnergyGeV / 1000).toFixed(2)} TeV · Magnets ${acc.magnet.state}`;
    this.statusLabel.element.firstChild!.textContent = txt;
  }

  update(_f: FrameInfo): void {}
}

