/**
 * Calorimeter energy deposits (DETECTOR MEASUREMENT) as projective towers.
 * Height ∝ log(1 + E) (clamped to the calorimeter depth); color = continuous energy
 * colormap (default Inferno) or categorical ECAL/HCAL family when coloring by subsystem.
 */
import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { float, instancedBufferAttribute, step, uniform } from 'three/tsl';
import type { CaloCell } from '../../physics/detector/CalorimeterDeposit';
import { cellPlacement } from '../../physics/detector/CalorimeterDeposit';
import type { CalorimeterSpec } from '../../physics/detector/DetectorModel';
import { logNorm, sampleColormap, type ColormapId, type RGB } from '../colors/Colormaps';
import { PALETTES, type PaletteId } from '../colors/PhysicsPalette';

/** Energy range of the color scale [GeV], log. */
export const CALO_ENERGY_RANGE = { lo: 0.05, hi: 100 } as const;
const DENSE_CELL_COUNT = 2500;
const DENSE_MIN_DISPLAY_GEV = 0.5;

export interface CaloRenderOptions {
  readonly colormap: ColormapId;
  readonly categorical: boolean;
  readonly palette: PaletteId;
}

export class CalorimeterRenderer {
  readonly group = new Group();
  readonly time = uniform(1e9);
  count = 0;
  /** Cells omitted from display by the dense-event declutter. */
  hiddenCells = 0;

  build(allCells: readonly CaloCell[], spec: CalorimeterSpec, o: CaloRenderOptions): void {
    // Render-only declutter for dense (heavy-ion) events: hide the softest cells. Physics unchanged.
    const minE = allCells.length > DENSE_CELL_COUNT ? DENSE_MIN_DISPLAY_GEV : 0;
    const cells = minE > 0 ? allCells.filter((c) => c.energy >= minE) : allCells;
    this.hiddenCells += allCells.length - cells.length;
    if (cells.length === 0) return;
    const mat = new MeshBasicNodeMaterial({ color: 0xffffff, transparent: true });
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, cells.length);
    const times = new Float32Array(cells.length);
    const m4 = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3();
    const zAxis = new Vector3(0, 0, 1);
    const rgb: RGB = [0, 0, 0];
    const cat = new Color(o.categorical ? PALETTES[o.palette].subsystem[spec.kind] : '#ffffff');
    const col = new Color();
    const depthMax = Math.log1p(CALO_ENERGY_RANGE.hi);

    cells.forEach((c, i) => {
      const place = cellPlacement(spec, c.eta);
      const depth = place.outer - place.inner;
      const h = Math.max(0.02, depth * Math.min(1, Math.log1p(c.energy) / depthMax));
      const sinhEta = Math.sinh(c.eta), coshEta = Math.cosh(c.eta);
      if (place.region === 'barrel') {
        const r = place.inner + h / 2;
        pos.set(r * Math.cos(c.phi), r * Math.sin(c.phi), r * sinhEta);
        // local X = φ̂, Y = r̂ (height), Z = ẑ
        q.setFromAxisAngle(zAxis, c.phi - Math.PI / 2);
        scl.set(place.inner * spec.cellDPhi * 0.92, h, place.inner * spec.cellDEta * coshEta * 0.92);
      } else {
        const zAbs = place.inner + h / 2;
        const z = Math.sign(c.eta) * zAbs;
        const r = zAbs / Math.abs(sinhEta);
        pos.set(r * Math.cos(c.phi), r * Math.sin(c.phi), z);
        q.setFromAxisAngle(zAxis, c.phi - Math.PI / 2);
        const dr = (place.inner * spec.cellDEta * coshEta) / (sinhEta * sinhEta);
        // local X = φ̂, Y = r̂ (radial extent), Z = ẑ (height)
        scl.set(r * spec.cellDPhi * 0.92, Math.max(dr * 0.92, 0.01), h);
      }
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      if (o.categorical) mesh.setColorAt(i, cat);
      else {
        sampleColormap(o.colormap, logNorm(c.energy, CALO_ENERGY_RANGE.lo, CALO_ENERGY_RANGE.hi), rgb);
        mesh.setColorAt(i, col.setRGB(rgb[0], rgb[1], rgb[2]));
      }
      times[i] = c.time;
    });
    mat.opacityNode = step(instancedBufferAttribute(new InstancedBufferAttribute(times, 1)), this.time).mul(float(0.7));
    mat.alphaTest = 0.01;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.count += cells.length;
  }

  dispose(): void {
    for (const c of this.group.children) {
      const m = c as InstancedMesh;
      m.geometry.dispose();
      (m.material as MeshBasicNodeMaterial).dispose();
      m.dispose();
    }
    this.group.clear();
    this.count = 0;
    this.hiddenCells = 0;
  }
}
