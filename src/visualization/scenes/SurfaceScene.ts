/**
 * SURFACE / CITY domain — local origin at the ring centre on the surface, 1 unit = 1 m,
 * x = east, z = south. Schematic landscape (Jura foothills to the NW, lake and city to
 * the SE); NOT a geographic digital twin.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Line,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { SceneId } from '../../app/SimulationState';
import { LHC } from '../../physics/constants/acceleratorConstants';
import { Rng, seedFrom } from '../../utils/math';
import { makeLabel, SceneDomain, type DomainContext, type FrameInfo, type Portal } from './SceneDomain';
import { LHC_POINTS, maybeFog, standardLights, ValueNoise2D } from './sceneUtils';

const RING_RADIUS_M = LHC.circumference.value / (2 * Math.PI);
const TERRAIN_SIZE_M = 18_000;
/** Ring depth varies 50–175 m (the tunnel plane is tilted ~1.4 %). */
const RING_DEPTH_LABEL = '≈ 50–175 m underground';

export class SurfaceScene extends SceneDomain {
  readonly id: SceneId = 'surface';
  readonly title = 'Surface — Geneva basin (schematic)';
  readonly scaleNote = `1 unit = 1 m · origin: ring centre at ground level · ring radius ${(RING_RADIUS_M / 1000).toFixed(2)} km`;
  readonly portals: readonly Portal[] = [{ label: 'Descend to the LHC ring ↓', target: 'ring' }];

  build(ctx: DomainContext): void {
    const s = this.scene;
    s.background = new Color('#9fb7cc');
    maybeFog(s, ctx, '#a8bccd', 9_000, 30_000);
    standardLights(s, ctx, { sky: '#dfe9f3', ground: '#4d5a3a', hemi: 0.9, sun: 2.0, sunPos: [6000, 9000, 3000], shadowExtent: ctx.quality.shadows ? 9000 : 0, envIntensity: 0.3 });

    this.camera.near = 10;
    this.camera.far = 80_000;
    this.camera.position.set(-2500, 7500, 13_500);
    this.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.maxPolarAngle = Math.PI * 0.47;
    ctx.controls.minDistance = 800;
    ctx.controls.maxDistance = 40_000;

    const noise = new ValueNoise2D(seedFrom('surface-terrain'));
    const height = (x: number, z: number): number => {
      // NW → Jura ridge (toward −x, −z); gentle rolling plain elsewhere.
      const nw = (-(x + z) / Math.SQRT2 - 5000) / 3000;
      const jura = nw > 0 ? 700 * (1 - Math.exp(-nw * nw)) : 0;
      return 25 * noise.fbm(x / 2500, z / 2500) + jura * (0.8 + 0.2 * noise.fbm(x / 900, z / 900));
    };

    // Terrain
    const seg = Math.min(256, ctx.quality.geometrySegments * 2);
    const tg = new PlaneGeometry(TERRAIN_SIZE_M, TERRAIN_SIZE_M, seg, seg);
    tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position!;
    const colors: number[] = [];
    const grass = new Color('#5f7446'), rock = new Color('#7c7a6f'), c = new Color();
    for (let i = 0; i < tp.count; i++) {
      const h = height(tp.getX(i), tp.getZ(i));
      tp.setY(i, h);
      c.copy(grass).lerp(rock, Math.min(1, Math.max(0, (h - 150) / 400)));
      colors.push(c.r, c.g, c.b);
    }
    tg.setAttribute('color', new Float32BufferAttribute(colors, 3));
    tg.computeVertexNormals();
    const terrain = new Mesh(tg, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    terrain.receiveShadow = true;
    s.add(terrain);

    // Lake (schematic ellipse to the SE)
    const lake = new Mesh(new CircleGeometry(1, 64), new MeshStandardMaterial({ color: '#3d6f8e', roughness: 0.15, metalness: 0.1 }));
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(6000, 2200, 1);
    lake.rotation.z = Math.PI / 5;
    lake.position.set(9200, 30, 7600);
    s.add(lake);

    // City blocks: Geneva (SE) + Meyrin/CERN site near Point 1, instanced.
    const n = ctx.quality.cityBuildings;
    const rng = new Rng(seedFrom('surface-city'));
    const bGeo = new BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const bMat = new MeshStandardMaterial({ color: '#c9c2b5', roughness: 0.85 });
    const city = new InstancedMesh(bGeo, bMat, n);
    const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
    const p1 = new Vector3(Math.cos(LHC_POINTS[0]!.theta) * RING_RADIUS_M, 0, Math.sin(LHC_POINTS[0]!.theta) * RING_RADIUS_M);
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const geneva = rng.bernoulli(0.7);
      const cx = geneva ? 6200 : p1.x, cz = geneva ? 5200 : p1.z;
      const spread = geneva ? 2200 : 700;
      const x = cx + rng.gaussian(0, spread), z = cz + rng.gaussian(0, spread);
      if (x > 6500 && z > 5500 && Math.hypot((x - 9200) / 6000, (z - 7600) / 2200) < 1.1) continue; // not in the lake
      const h = geneva ? 8 + rng.exponential(12) : 6 + rng.exponential(5);
      q.setFromAxisAngle(new Vector3(0, 1, 0), rng.uniform(0, Math.PI));
      m4.compose(p.set(x, height(x, z) - 1, z), q, sc.set(rng.uniform(15, 45), h, rng.uniform(15, 45)));
      city.setMatrixAt(placed++, m4);
    }
    city.count = placed;
    city.castShadow = ctx.quality.shadows;
    city.receiveShadow = ctx.quality.shadows;
    s.add(city);

    // Ring footprint projected onto the surface (dashed = underground).
    const ringPts: number[] = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      const x = Math.cos(a) * RING_RADIUS_M, z = Math.sin(a) * RING_RADIUS_M;
      ringPts.push(x, height(x, z) + 25, z);
    }
    const rg = new BufferGeometry();
    rg.setAttribute('position', new Float32BufferAttribute(ringPts, 3));
    const ring = new Line(rg, new LineDashedMaterial({ color: '#ffcc33', dashSize: 180, gapSize: 120 }));
    ring.computeLineDistances();
    s.add(ring);
    const rl = makeLabel(`LHC ring footprint — tunnel ${RING_DEPTH_LABEL}`, 'SCHEMATIC PROJECTION');
    rl.position.set(0, 600, -RING_RADIUS_M);
    s.add(rl);

    // Surface sites at the eight access points.
    const siteMat = new MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.6 });
    for (const pt of LHC_POINTS) {
      const x = Math.cos(pt.theta) * RING_RADIUS_M, z = Math.sin(pt.theta) * RING_RADIUS_M;
      const hall = new Mesh(new BoxGeometry(120, 30, 70), siteMat);
      hall.position.set(x, height(x, z) + 15, z);
      hall.castShadow = ctx.quality.shadows;
      s.add(hall);
      const l = makeLabel(`${pt.name} · ${pt.role}`);
      l.position.set(x, height(x, z) + 260, z);
      s.add(l);
    }
    const note = makeLabel('Schematic landscape — not a geographic digital twin', 'SCHEMATIC', 'lbl-note');
    note.position.set(0, 2500, 0);
    s.add(note);
  }

  update(_f: FrameInfo): void {}
}
