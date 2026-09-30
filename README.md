# LHC Simulator — Phase 2: Real Data & Real Physics

A scientifically grounded, interactive 3D Large Hadron Collider simulator for the web
(TypeScript · Vite · Three.js WebGPURenderer · TSL).

> *Make invisible physics understandable without pretending it is visible.*

Everything on screen is labelled with what it is: physical infrastructure, detector
measurement, simulation truth, reconstructed data, analysis overlay or cinematic
enhancement. Since Phase 2, every event also states its **provenance** and **data level**:
SIMULATED TRUTH · SIMULATED RECONSTRUCTION · RECORDED COLLISION DATA.
See [docs/visualization-honesty.md](docs/visualization-honesty.md).

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL (default `http://localhost:5173`). WebGPU is used when available;
otherwise the same node materials run on the WebGL 2 backend (`?renderer=webgl` forces it).

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (also proxies CERN Open Data and the PYTHIA backend) |
| `npm run build` | Typecheck + production build (`dist/`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run generate:events` | Regenerate the curated synthetic event samples (deterministic) |
| `npm run fetch:cern -- --list` | List CERN Open Data files known to the adapters (sizes, URLs) |
| `npm run fetch:cern -- <id> [--max N]` | Download and preprocess one dataset into `public/datasets/` |

Optional PYTHIA 8 backend (needs Python ≥ 3.9):

```bash
pip install pythia8mc
```

```bash
python server/pythia_server.py
```

## What Phase 2 adds

- **Normalized event model + adapters** — curated samples, PYTHIA 8 (backend), CERN Open Data
  (CMS outreach CSV), ROOT files via JSROOT (CMS NanoAOD, ATLAS 13 TeV Open Data), HepMC3 ASCII,
  ROOT-converted JSON. Truth is never manufactured; recorded data can never carry truth.
- **Collider operation** — R = Lσ and N = L_int σ ε, LHC-like filling scheme and crossing timing,
  Poisson pile-up overlaid on simulated events (Color by Origin Vertex), an educational
  two-level trigger with rates.
- **Interaction-region optics** — Twiss β/α/γ through an inner-triplet model, β*, crossing angle,
  Piwinski factor, long-range separation, TFS import, and an IR scene.
- **Field maps** — interpolated (r, z) and 3D grid maps (finite-solenoid physics), zero/clamp/fallback
  boundaries, RK4 or adaptive Dormand–Prince integration.
- **Experiments** — upgraded ATLAS, detailed CMS, simplified ALICE (TPC dE/dx, TOF) and LHCb
  (forward dipole, VELO, RICH), each with a stated fidelity level.
- **Detector response** — configurable efficiency, resolutions, energy scale, dead/noisy channels.
- **Reconstruction** — educational Kalman-like track fit (truth vs hits vs seed vs fit, residuals,
  uncertainty), primary/pile-up/displaced vertices, topo-clusters, generalized-kT jets (p = −1/0/1),
  cluster MET.
- **Quench V2** — lumped thermal/electrical model: P = I²R, C(T) dT/dt, E = ½LI², MQE, propagation,
  detection, heaters, energy extraction.
- **Analysis** — binned likelihood fits (Gaussian, signal + background), JSROOT drawing with native
  fallback, ROOT TH1 loading, TH1D export.

This is still **not** Geant4, a full PYTHIA integration, MAD-X, experiment software or a digital
twin. Approximations are listed in [docs/known-approximations.md](docs/known-approximations.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Data sources (CERN Open Data, PYTHIA, ROOT, HepMC)](docs/data-sources.md)
- [Physics model](docs/physics-model.md)
- [Visualization honesty](docs/visualization-honesty.md)
- [Performance](docs/performance.md)
- [Known approximations](docs/known-approximations.md)

## Source notes

Physical constants: CODATA 2018, PDG 2024, AME 2020. Machine parameters: LHC Design Report
(CERN-2004-003), HL-LHC TDR (CERN-2020-010), FCC-hh CDR / Feasibility Study. Detector layouts:
ATLAS JINST 3 S08003, CMS JINST 3 S08004, ALICE JINST 3 S08002, LHCb JINST 3 S08005 (and their
Run-3 upgrade papers). Values that need re-verification are flagged "VERIFY" in the code.
CERN Open Data records 545 and 700 are CC0.
