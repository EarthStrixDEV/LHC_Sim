# Architecture

## Pipeline

```
Machine ─▶ Beam ─▶ Event ─▶ Detector Response ─▶ Reconstruction ─▶ Visualization
(AcceleratorCore) (BeamModel) (EventLoader) (DetectorResponse) (ReconstructionEngine) (scenes/renderers)
```

Physics state never depends on Three.js. `src/physics/**` imports nothing from
`three`, `src/visualization/**` or `src/ui/**` — enforced by a unit test
(`visualization.test.ts › physics modules never import visualization/quality code`).
The renderer consumes visualization-ready data (typed arrays, plain objects) and is never the
source of physics truth: track curvature comes only from `TrackPropagator`.

## Layout

| Folder | Responsibility |
|---|---|
| `src/utils` | SI units & conversions, deterministic PRNG (`Rng`, `seedFrom`), profiling |
| `src/physics/constants` | Sourced physical and accelerator constants (with VERIFY flags) |
| `src/physics/particles` | PDG table, ions, beam species (neutrons non-circulatable) |
| `src/physics/accelerator` | `AcceleratorCore`, rigidity, synchrotron radiation, magnet/quench model, validator, presets schema |
| `src/machines` | LHC, HL-LHC, FCC-hh concept, Sandbox presets |
| `src/physics/beam` | Transfer matrices, FODO cell, envelope, `BeamModel` (current, energy, luminosity) |
| `src/physics/events` | Four-vectors, schema, truth event, loader (`EventSource` interface), sample registry |
| `src/physics/propagation` | `MagneticField`, `UniformField`, `RegionalField`, RK4 `TrackPropagator`, event propagation |
| `src/physics/detector` | Generic `DetectorModel`, hits, calorimeter cells, parameterized response |
| `src/physics/reconstruction` | Reco objects, anti-kT, MET, invariant mass, histogram; Phase 2: generalized kT, topo-clusters, vertexing, `AdvancedReconstruction`, source-reco pass-through |
| `src/physics/{luminosity,bunches,pileup,trigger,optics,fitting}` | Phase 2: R = Lσ and yields, filling scheme/timing, Poisson pile-up overlay, educational trigger, IR Twiss optics + TFS tables, Kalman-like track fit |
| `src/physics/accelerator/QuenchModelV2.ts` | Lumped thermal/electrical quench model (+ `QuenchScenario` from the machine state) |
| `src/physics/EventProcessor.ts` | Full pipeline: truth (+pile-up) → propagation → response → reco → Phase 2 reco, PID, trigger; `processDatasetEvent` entry point |
| `src/detectors/{atlas,cms,alice,lhcb}` | Detector descriptions (with fidelity statements), analytic field models |
| `src/detector/fieldmaps` | Finite-solenoid physics, (r, z) and 3D grid field maps, composite fields, per-detector maps |
| `src/detector/response` | Configurable response (`ResponseConfig`, dead/noisy channels), particle identification (dE/dx, TOF, RICH) |
| `src/data-sources` | Normalized event model, provenance, registry; adapters: curated, CERN Open Data (CSV), ROOT/JSROOT, HepMC3, file import |
| `src/generators` | `EventGenerator` interface, PYTHIA 8 backend client and record adapter, WASM decision stub |
| `src/analysis/fitting` | Binned Poisson-likelihood histogram fits |
| `server/pythia_server.py` | Optional local PYTHIA 8 backend (Python, stdlib HTTP) |
| `src/workers/physics.worker.ts` | Off-main-thread event processing / histogram accumulation |
| `src/app` | `SimulationState` store, `SimulationController` (only place turning intents into physics calls), `App` shell |
| `src/visualization` | Renderer abstraction, post-processing, scene domains, track/hit/calo renderers, overlays, colors, honesty policy, quality presets |
| `src/ui` | DOM panels (no framework): controls, inspectors, legend, histogram, HUD, performance |
| `src/data/events` | Generated synthetic samples (JSON) |
| `scripts` | Offline event generator, decoder copy step |

Machine presets and the particle table are TypeScript modules rather than JSON so they are
type-checked and can carry source metadata next to each value.

## State flow

`Store` holds a single immutable `SimulationState`. UI components call
`SimulationController` methods; the controller runs physics (`computeAccelerator`,
`computeBeamModel`, worker `processEvent`) and writes results into the store. Scene domains and
panels subscribe and diff what they need. Visual state (`vis`) is a separate sub-object and is
never read by physics.

## Rendering

- `RendererManager` prefers native WebGPU and falls back to three.js' WebGL 2 backend of the
  same `WebGPURenderer` (classic `WebGLRenderer` cannot run TSL node materials). `?renderer=webgl`
  forces the fallback.
- `PostProcessing` builds a TSL `RenderPipeline`: scene pass → optional bloom → output transform →
  optional FXAA. Bloom strength = quality base × honesty-mode multiplier.
- Image-based lighting from a prefiltered procedural `RoomEnvironment` (shared, created once).
- CSS2D labels carry a category chip (TRUTH, RECONSTRUCTED, ANALYSIS, AUGMENTED, …).

## Scene domains

Each `SceneDomain` owns a `Scene`, camera, origin and LOD strategy. `SceneManager.activate()`
fades out, **disposes** the previous domain (geometries, materials, textures, label DOM nodes),
builds the next and fades in. No global coordinate space spans the domains.

| Domain | Origin / scale | Strategy |
|---|---|---|
| Surface | ring centre on the ground, m | procedural terrain, instanced buildings, dashed ring projection |
| Ring | ring centre, m (tunnel drawn wider, labelled) | schematic torus, instanced magnet ticks, augmented bunches & SR photons |
| Tunnel | magnet axis at cell start, m, true 2804 m curvature | instanced shells/services; magnets placed from the physics FODO layout |
| Cavern | cavern floor centre, m | static architecture, emissive fixtures, low-LOD ATLAS |
| Detector | IP, m, beam = z | ATLAS with `LOD` levels and cutaway, field overlay |
| Event | IP, m | GPU track tiers, instanced hits/cells, analysis overlays |

## Phase 2 data flow

```
External data ─▶ adapter ─▶ NormalizedSample ─▶ DataSourceRegistry (main thread + worker)
                                                   │
SimulationController.processOptions() ─────────────┤ pile-up, field model, response config, jets, trigger menu
                                                   ▼
             physics.worker: processDatasetEvent ─▶ ProcessedEvent { tracks, response, reco, advanced, pid, trigger, pileUp }
```

Runtime datasets (PYTHIA output, downloads, imports) are registered on the main thread and
forwarded to the worker (`register` message), so both resolve the same dataset ids. Bulk scans
(histograms, trigger rates) run the pipeline without the Phase 2 reconstruction layer to stay fast.
The `Detector` scene shows whichever experiment is selected; the new `IR optics` scene sits
between the tunnel and the cavern.

## Future integration points

- New sources: implement an adapter that returns a validated `NormalizedSample`.
- `PythiaWasmWorker`: must emit `lhcsim-pythia-record/1` from a Worker.
- Official field maps: load them into `GridFieldMap3D` / `AxisymmetricFieldMap`.
- `DetectorModel` + `DetectorResponse`: swap in Geant4-derived hits.
- Full-ring optics: import MAD-X TFS tables (`parseTfs`) instead of the IR model.
- Pattern recognition (hit-to-track assignment is currently simulation bookkeeping).
