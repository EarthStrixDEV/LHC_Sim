# Performance

Target: 60 FPS (16.7 ms). Budget guidance: physics ≤ 2–3 ms on the main thread, scene update
~2 ms, render 4–5 ms, post 3–4 ms, remaining headroom.

## Strategies in Phase 1

- **Physics off the main thread**: `physics.worker.ts` runs propagation, detector response and
  reconstruction; typed arrays are transferred zero-copy. Measured (desktop, Node 22):
  pp events 1–3 ms, Pb–Pb semi-central ~250 ms (once per event load).
- **Only one scene domain resident**: transitions dispose all GPU resources of the previous domain.
- **Instancing** for repeated structure: tunnel shells, floor, lights, services, cryostats,
  city buildings, magnet ticks, detector coils/chambers, hits, calorimeter cells, field arrows,
  bunch markers, SR photons, vapour.
- **Track tiers** (`TrackLOD.ts`): tubes for important tracks, crossed ribbons for normal tracks,
  1-px line segments for the soft background, and omission of the softest tracks in dense events
  at lower presets. Each tier is one merged geometry → ≤ 3 draw calls for all tracks.
- **GPU-side animation**: time-of-flight reveal, dash patterns, selection and fading are TSL
  shader logic driven by uniforms; animating an event uploads nothing.
- **Dense calorimeter declutter** (render-only): with > 2500 cells, cells < 0.5 GeV are hidden and
  the count is reported on screen.
- **No per-frame allocations** in hot paths (ring buffers for stats, preallocated pools for
  photons/vapour, reused matrices).
- **Lighting**: emissive fixtures + one image-based environment + one directional light instead of
  many shadow-casting lights (the baked-lightmap workflow is prepared for GLTF assets: static
  architecture should ship with a lightmap in a second UV set; see below).

## Quality presets

| | Ultra | High | Medium | Scientific |
|---|---|---|---|---|
| Pixel ratio cap | 2 | 1.5 | 1 | 2 |
| Shadows | ✓ | ✓ | – | – |
| Bloom (× mode) | 0.35 | 0.25 | – | – |
| FXAA | ✓ | ✓ | – | ✓ |
| Tube segments | 8 | 6 | 4 | 6 |
| Max tube / ribbon tracks | 60 / 2500 | 40 / 1500 | 20 / 600 | 100 / 6000 |
| Dense-event pT floor | 0 | 0.2 GeV | 0.4 GeV | 0 |
| City buildings | 6000 | 4000 | 2000 | 1500 |
| Tunnel FODO cells | 6 | 4 | 3 | 4 |

Presets change rendering cost only; tests verify physics results are identical.

## Runtime profiling

The performance panel shows FPS, frame time vs budget, CPU render-submit time, scene-update
time, main-thread physics time, last worker time, draw calls, triangles, geometries/textures,
visible tracks, active particles, last transition time and JS heap (Chrome). Portable GPU timers
are not available in all browsers, so GPU time is not reported.

## Asset pipeline

`AssetManager` (GLTFLoader + KTX2Loader + MeshoptDecoder, reference-counted per URL) is created
with the renderer. GLTF/GLB assets should be compressed with meshopt and KTX2 (Basis) textures. The Basis
transcoder is copied to `public/decoders/basis` on `npm install` (`scripts/copy-decoders.mjs`).
Phase 1 scenes are procedural placeholders, so no binary assets ship yet.

## Notes

- The first frame of a new scene includes shader compilation (hundreds of ms on the WebGL 2
  path); subsequent frames are fast.
- Hidden browser tabs pause `requestAnimationFrame`; the FPS readout then shows 0.

## Phase 2 measurements

Worker pipeline time per event (Node 22, desktop CPU, after warm-up; includes the Phase 2
reconstruction layer unless stated):

| Event | Time | Notes |
|---|---|---|
| Z→μμ, ATLAS field map (RK45) | ~15 ms | regional field + RK4: ~10 ms |
| Multijet, CMS field map | ~21 ms | |
| Z→μμ + pile-up μ = 50, CMS | ~450 ms | ~2400 trajectories; once per event load |
| tt̄, LHCb | ~23 ms | no Kalman fit (dipole spectrometer) |
| Pb–Pb, ALICE | ~200 ms | 42k hits (TPC), ~1400 PID measurements |
| Pb–Pb, ATLAS | ~250 ms | generalized-kT over ~3000 topo-clusters |

- All of this runs in the physics worker; the render loop never waits for it. PYTHIA generation
  runs in a separate backend process; downloads stream and stop at the event cap.
- Bulk scans (histogram accumulation, trigger rates) skip the Phase 2 reconstruction layer.
- Field maps are built once per detector and cached (CMS r–z map: ~10k cel evaluations).
- JSROOT (~2.4 MB chunk) and the ROOT/CSV adapters are loaded lazily, only when used.
- Quench V2 integration (2.5 s simulated, dt = 20 µs): ~30 ms on the main thread, once per trigger.
