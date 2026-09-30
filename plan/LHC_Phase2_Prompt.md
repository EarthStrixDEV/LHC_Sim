You are continuing an existing Phase 1 TypeScript + Vite + Three.js scientific LHC simulator.

DO NOT rebuild or replace Phase 1 architecture.

Extend the existing:

Machine
→ Beam
→ Event
→ Detector Response
→ Reconstruction
→ Visualization

pipeline.

Phase 2 is:

"REAL DATA & REAL PHYSICS"

============================================================
1. GOAL
============================================================

Transform the Phase 1 educational simulator into a data-driven particle/accelerator physics laboratory.

Phase 2 must add:

- CERN Open Data ingestion
- ROOT/JSROOT interoperability
- PYTHIA 8 event generation
- HepMC-like event interchange
- luminosity and pile-up modeling
- realistic bunch structure
- trigger concepts
- detailed CMS support
- simplified ALICE/LHCb support
- improved ATLAS/CMS magnetic fields
- interaction-region beam optics
- Twiss parameters and β*
- crossing angles
- improved superconducting magnet/quench model
- Kalman-like educational track fitting
- improved detector reconstruction
- scientific histograms and fits

Preserve Phase 1's scientific-honesty philosophy:

"Make invisible physics understandable without pretending it is visible."

============================================================
2. PREREQUISITES
============================================================

Phase 1 MUST:

- build
- typecheck
- pass tests
- maintain Physics ↔ Renderer separation
- support multi-scale scenes
- provide AcceleratorCore
- provide deterministic event loading
- provide detector response
- provide track propagation
- provide reconstruction
- provide Visualization Honesty modes
- provide Physics/Event inspectors
- meet reasonable interactive performance

Fix Phase 1 regressions before Phase 2 work.

Do NOT rewrite working Phase 1 modules merely to accommodate new features.

Extend interfaces where necessary.

============================================================
3. SCOPE
============================================================

IN SCOPE:

- CERN Open Data adapters
- ROOT-derived data
- JSROOT integration
- PYTHIA 8 backend generator
- optional experimental PYTHIA WASM worker
- HepMC-like normalized event schema
- luminosity
- bunches
- pile-up
- trigger visualization
- detailed CMS interactive model
- simplified ALICE/LHCb models
- improved detector material/response approximations
- magnetic field maps
- Twiss optics
- β functions
- β*
- crossing angle
- interaction-region optics
- improved track fitting
- vertex fitting
- improved calorimeter clustering
- improved MET
- improved jet reconstruction
- improved quench thermal model
- histogram fitting

OUT OF SCOPE:

- Geant4 replacement
- complete CERN reconstruction software
- exact experiment software stacks
- full detector CAD
- full accelerator digital twin
- exact superconducting multiphysics
- detector electronics simulation at production fidelity
- full distributed grid computing
- exact online LHC trigger implementation
- first-principles QFT simulation

============================================================
4. ARCHITECTURE CHANGES
============================================================

Preserve:

Machine
→ Beam
→ Event
→ Detector Response
→ Reconstruction
→ Visualization

Add adapter/service layers:

External Data
    ↓
Data Adapter
    ↓
Normalized Event Model
    ↓
Existing Event Pipeline

Add:

src/
  data-sources/
    cern/
      CERNOpenDataAdapter.ts
      DatasetRegistry.ts
    root/
      ROOTAdapter.ts
      JSROOTBridge.ts
    hepmc/
      HepMCAdapter.ts

  generators/
    EventGenerator.ts
    PythiaBackendClient.ts
    PythiaWasmWorker.ts

  physics/
    luminosity/
    bunches/
    pileup/
    trigger/
    optics/
    fitting/

  detector/
    fieldmaps/
    response/

  analysis/
    histograms/
    fitting/

Existing Phase 1 event samples must remain functional.

============================================================
5. NORMALIZED EVENT MODEL
============================================================

All event sources must convert into one internal representation.

Support:

- event metadata
- generator metadata
- run/event number where available
- particle PDG IDs
- status
- four-vectors
- vertices
- parent/child relationships
- event weights
- reconstructed objects
- detector-level data when available

Sources may include:

CURATED
PYTHIA
CERN_OPEN_DATA
ROOT_CONVERTED
HEPMC_LIKE

Never assume all datasets expose truth-level information.

The UI must clearly identify the provenance and data level:

SIMULATED TRUTH
SIMULATED RECONSTRUCTION
RECORDED COLLISION DATA

Never present reconstructed real data as Monte Carlo truth.

============================================================
6. CERN OPEN DATA
============================================================

Implement dataset adapters rather than hardcoding one dataset.

Support practical browser-friendly ingestion.

Preferred strategies:

1. preprocessed compact JSON/binary
2. ROOT-derived converted datasets
3. JSROOT-compatible workflows
4. server-side preprocessing where direct browser loading is impractical

Do not download multi-GB ROOT files into the browser without explicit user action.

Provide dataset metadata:

experiment
year
collision system
beam energy
data/simulation
integrated luminosity where applicable
provenance
license/source
processing notes

============================================================
7. PYTHIA 8
============================================================

Preferred architecture:

Browser
→ EventGenerator interface
→ backend API
→ PYTHIA 8
→ normalized HepMC-like response

Support configuration such as:

collision system
√s
process
event count
seed

Initial processes:

minimum bias
Drell-Yan / Z
Higgs-like samples
QCD jets
ttbar

PYTHIA generation must be reproducible using explicit seeds.

Experimental:

PythiaWasmWorker

Only implement WASM if technically practical.

It must run outside the rendering thread.

Do NOT make Phase 2 dependent on WASM success.

============================================================
8. LUMINOSITY / EVENT RATE
============================================================

Implement:

R = L σ

where:

R = event rate
L = instantaneous luminosity
σ = process cross section

Support integrated luminosity:

N ≈ L_int σ ε

where ε may represent simplified acceptance/efficiency.

Clearly distinguish:

instantaneous luminosity
integrated luminosity
cross section
event rate
observed/reconstructed yield

Do not imply every collision is recorded.

============================================================
9. BUNCH STRUCTURE
============================================================

Represent:

- bunches
- bunch spacing
- bunch population
- revolution frequency
- bunch crossing
- interaction probability

Model collision timing based on bunch crossings.

Visualization may show bunch packets only in AUGMENTED mode.

Physical mode must not show glowing bunches.

============================================================
10. PILE-UP
============================================================

Implement educational pile-up.

Use Poisson sampling where appropriate:

P(n; μ) = exp(-μ) μ^n / n!

Allow μ to depend on machine/scenario configuration.

Generate/display:

primary interaction
additional interactions
multiple vertices

Color-by Vertex from Phase 1 must work naturally with pile-up.

Allow users to compare:

Truth
With Pile-Up
Reconstructed

============================================================
11. TRIGGER CONCEPT
============================================================

Implement an educational trigger pipeline.

Conceptually:

Bunch Crossing
→ Detector Activity
→ Fast Selection
→ Higher-Level Selection
→ Recorded Event

Do NOT claim exact current ATLAS/CMS trigger implementation unless using verified configuration.

Show:

input event rate
accepted rate
rejected rate
trigger reason

Provide simple configurable trigger examples:

single muon
single electron
diphoton
jet
MET

============================================================
12. BEAM OPTICS / INTERACTION REGION
============================================================

Extend Phase 1 FODO optics.

Add:

Twiss parameters:
β(s)
α(s)
γ(s)

with:

γ = (1 + α²) / β

Beam size:

σ = sqrt(ε β)

Use normalized/geometric emittance conversion consistently.

Visualize:

βx(s)
βy(s)
beam envelope
waist at IP
β*
crossing angle
beam separation

Provide an IR optics scene around ATLAS/CMS.

Do not claim complete MAD-X equivalence.

Allow future import of externally calculated optics tables.

============================================================
13. MAGNETIC FIELD MAPS
============================================================

Extend:

UniformField
RegionalField

with:

FieldMap

API:

B = field.sample(position)

Support:
- interpolated 3D grids
- detector-specific field maps
- fallback analytic fields

TrackPropagator must remain unaware of rendering.

Use numerical integration where analytic helix propagation is insufficient.

Provide configurable integrators, e.g.:

RK4
adaptive integration if practical

Validate conservation/trajectory behavior within documented tolerances.

============================================================
14. DETECTORS
============================================================

ATLAS:
upgrade Phase 1 representation.

CMS:
implement a detailed interactive model containing major systems:

Tracker
ECAL
HCAL
Solenoid
Muon system

Support its approximately 3.8 T central solenoid appropriately.

ALICE:
simplified educational model emphasizing heavy-ion physics.

LHCb:
simplified forward detector model emphasizing:
- forward geometry
- displaced vertices
- particle identification
- RICH concept

Do not imply equal fidelity across experiments.

Display fidelity level in UI.

============================================================
15. IMPROVED DETECTOR RESPONSE
============================================================

Add parameterized:

tracking efficiency
momentum resolution
energy resolution
acceptance
calorimeter smearing
hit uncertainty
dead/noisy channels as optional scenarios

Use configurable detector-response parameters.

Separate:

Truth
Hits
Clusters
Tracks
Reconstructed Objects

============================================================
16. KALMAN-LIKE EDUCATIONAL TRACK FIT
============================================================

Implement an educational sequential track estimator inspired by Kalman filtering.

State concept:

x_k

Prediction:

x_k^- = F_k x_(k-1)

Covariance:

P_k^- = F_k P_(k-1) F_k^T + Q_k

Measurement update:

K_k = P_k^- H_k^T
      (H_k P_k^- H_k^T + R_k)^-1

x_k = x_k^- + K_k(z_k - H_k x_k^-)

P_k = (I - K_k H_k) P_k^-

Visualize:

truth trajectory
detector hits
initial estimate
fitted track
residuals
uncertainty

Do not call this production ATLAS/CMS reconstruction.

============================================================
17. RECONSTRUCTION
============================================================

Improve:

- track fitting
- primary vertex estimation
- displaced vertices
- electron/photon reconstruction
- muon reconstruction
- calorimeter clustering
- jet reconstruction
- MET

Where practical implement an educational sequential-recombination jet algorithm.

For generalized kT:

d_ij =
min(kTi^(2p), kTj^(2p))
× ΔRij² / R²

d_iB = kTi^(2p)

with:

p = -1 → anti-kT
p = 0  → Cambridge/Aachen
p = 1  → kT

ΔR² = Δη² + Δφ²

Document simplifications.

============================================================
18. QUENCH MODEL V2
============================================================

Replace the Phase 1 margin-only approximation with a simplified lumped thermal/electrical model.

Conceptually include:

P_Joule = I²R

thermal evolution:

C(T) dT/dt =
P_Joule - P_cooling

with configurable effective:

heat capacity
resistance
cooling
critical surface approximation

Simulate:

quench initiation
normal-zone growth approximation
current decay
energy extraction
temperature rise

Magnetic stored energy:

E = 1/2 L I²

This remains educational.

Do not claim detailed superconducting multiphysics accuracy.

============================================================
19. JSROOT / ANALYSIS
============================================================

Integrate JSROOT where useful.

Support:

histograms
ROOT-derived histograms
interactive plots
fits

Implement basic fitting capability for educational analysis:

Gaussian-like peaks
signal + background examples

Examples:

Z → μμ invariant mass
H → γγ educational sample

Preserve Phase 1 native histogram support as fallback.

============================================================
20. TESTS
============================================================

Add tests for:

DATA INGESTION
- normalized schema consistency
- missing truth information
- provenance preservation

PYTHIA
- deterministic seed behavior
- valid normalized events

LUMINOSITY
- R = Lσ
- integrated yield

PILE-UP
- Poisson statistics over large sample

OPTICS
- Twiss consistency
- beam-size relation
- β* behavior

FIELD MAP
- interpolation
- boundary behavior
- charge-sign response

TRACK FITTING
- fitted track improves over noisy measurements
- uncertainty behaves sensibly

JET CLUSTERING
- deterministic clustering
- known synthetic configurations

QUENCH
- Joule heating
- energy decay
- temperature response

============================================================
21. ACCEPTANCE CRITERIA
============================================================

Phase 2 is complete when:

1. All Phase 1 tests still pass.
2. Existing Phase 1 events still work.
3. CERN-derived events can enter the normalized pipeline.
4. Data provenance is always visible.
5. Real data is never mislabeled as simulation truth.
6. PYTHIA backend can generate deterministic events.
7. Browser rendering never waits synchronously for PYTHIA.
8. Luminosity and cross sections produce event-rate estimates.
9. Bunch crossings are represented.
10. Pile-up generates multiple vertices.
11. Trigger concept can accept/reject events.
12. Twiss/β/β* visualization works.
13. Crossing angle is visualized.
14. Field maps can drive TrackPropagator.
15. CMS is independently explorable.
16. Simplified ALICE/LHCb scenes work.
17. Educational Kalman-like fitting works.
18. Truth/hits/fitted track can be compared.
19. Improved reconstruction works on representative events.
20. Quench V2 demonstrates thermal/electrical evolution.
21. JSROOT or equivalent analysis integration works.
22. Scientific-honesty modes remain valid.
23. Interactive scenes remain performant.

============================================================
22. MILESTONES
============================================================

M1 — Data architecture
Normalized events + provenance + adapters.

M2 — CERN Open Data
Browser-friendly dataset pipeline.

M3 — PYTHIA
Backend generator + deterministic API + optional WASM experiment.

M4 — Collider operation
Luminosity + bunches + pile-up + trigger concepts.

M5 — Optics
Twiss + β* + crossing angle + IR visualization.

M6 — Fields
FieldMap + numerical propagation.

M7 — Experiments
Detailed CMS + upgraded ATLAS + simplified ALICE/LHCb.

M8 — Detector response
Resolution + efficiency + uncertainty.

M9 — Reconstruction
Track fitting + vertices + clustering + jets + MET.

M10 — Engineering
Quench thermal/electrical V2.

M11 — Analysis
JSROOT + histograms + fitting.

M12 — Validation/performance
Regression tests + profiling + scientific review.

============================================================
23. DEVELOPMENT RULES
============================================================

Follow ALL Phase 1 development rules.

Additionally:

- Do not rewrite stable Phase 1 architecture.
- External data must enter through adapters.
- Preserve provenance.
- Never manufacture unavailable truth information.
- Keep generator, detector, reconstruction, and rendering conceptually separate.
- Expensive generation/parsing must not block rendering.
- Prefer backend PYTHIA; WASM is optional.
- Real data and simulated data must remain distinguishable.
- Every higher-fidelity model must document remaining approximations.
- Verify machine/detector constants before treating them as authoritative.
- Performance optimizations must not alter physics results.
- Preserve deterministic workflows wherever possible.

Implement milestones sequentially and keep the application usable after every milestone.
