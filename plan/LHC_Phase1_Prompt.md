You are a senior graphics/physics software engineer specializing in Three.js, WebGPU, scientific visualization, accelerator physics, and high-performance browser applications.

Build Phase 1 of a scientifically grounded, interactive 3D Large Hadron Collider (LHC) simulator for the web.

The application must balance:
1. Scientific correctness
2. Realistic engineering visualization
3. Interactive educational value
4. Cinematic visual quality
5. Stable real-time performance

Do NOT turn this into a sci-fi particle visualizer. Any invisible physical quantity that is made visible must be explicitly presented as augmented scientific visualization rather than something visible to the human eye.

============================================================
1. GOAL
============================================================

Create a functional Phase 1 prototype that lets users explore the accelerator across multiple spatial scales:

City / Surface
    ↓
LHC Ring
    ↓
Tunnel Sector
    ↓
Experimental Cavern
    ↓
ATLAS Detector
    ↓
Collision Event

The simulator must allow users to:

- Explore an approximate LHC environment in 3D.
- Inspect accelerator magnets and beam parameters.
- Select different particles/ions and machine presets.
- Understand magnetic rigidity and beam bending.
- Visualize simplified FODO focusing and beam envelopes.
- Load prerecorded particle-collision event samples.
- Propagate charged particles through detector magnetic fields.
- Inspect reconstructed physics objects.
- Calculate quantities such as invariant mass.
- Build invariant-mass histograms over multiple events.
- Switch between physically visible, detector-level, augmented, analysis, and cinematic representations.
- Experiment with physically invalid configurations in Sandbox mode while receiving scientifically meaningful warnings.

The architecture must be designed so that later phases can integrate:
- CERN Open Data
- ROOT/JSROOT
- PYTHIA-generated events
- WebAssembly event generation
- detailed detector geometry
- detailed accelerator lattice
- magnetic field maps
- additional experiments such as CMS, ALICE, and LHCb

Phase 1 must NOT depend on these future components.

============================================================
2. TECHNOLOGY STACK
============================================================

Required:

- TypeScript
- Vite
- Three.js
- WebGPURenderer as the preferred renderer
- Three.js TSL where appropriate
- WebGL fallback where practical
- GLTF/GLB asset pipeline
- KTX2 texture support
- meshopt support
- InstancedMesh / GPU instancing
- Web Workers where CPU-heavy physics calculations would otherwise block rendering

Avoid framework lock-in unless clearly justified.

Keep physics and rendering independent.

The renderer MUST NOT be the source of physics truth.

Use SI internally wherever practical, with explicit conversion utilities for:
- eV / GeV / TeV
- meters
- Tesla
- GeV/c
- Kelvin
- seconds / ns
- luminosity units

Do not scatter unexplained magic numbers through the codebase.

============================================================
3. PHASE 1 SCOPE
============================================================

IN SCOPE:

- Multi-scale scene system
- Surface/city representation
- simplified LHC ring
- reusable tunnel sector
- experimental cavern
- simplified but recognizable ATLAS detector
- accelerator physics core
- machine presets
- particle/ion database
- magnetic rigidity
- synchrotron-radiation estimate
- magnet operating margin model
- simplified FODO lattice
- beam-envelope visualization
- prerecorded event samples
- truth particle hierarchy
- charged-track propagation
- simplified detector response
- reconstructed physics objects
- invariant-mass calculation
- histogram
- scientific inspector
- visualization honesty modes
- multiple color mappings
- accessibility palette
- performance quality presets

OUT OF SCOPE:

- Full 27 km photorealistic geometry
- full Geant4 detector simulation
- complete Standard Model/QFT calculation
- live PYTHIA generation
- full ROOT analysis environment
- FEM magnet simulation
- full LHC lattice optics
- exact material interaction simulation
- exact hadronic shower simulation
- radiation transport
- complete CERN infrastructure
- accurate Geneva digital twin
- complete ATLAS/CMS geometry
- real-time CFD/cryogenic simulation

Use approximations explicitly and document them.

============================================================
4. CORE ARCHITECTURE
============================================================

Maintain this conceptual pipeline:

Machine
    ↓
Beam
    ↓
Event
    ↓
Detector Response
    ↓
Reconstruction
    ↓
Visualization

Physics state must remain independent from Three.js objects.

Suggested high-level interfaces:

MachineModel
BeamModel
EventModel
DetectorModel
DetectorResponse
ReconstructionEngine
VisualizationAdapter

Three.js consumes visualization-ready state produced by these systems.

Do NOT calculate scientific values inside UI components or shaders unless the calculation is explicitly visual-only.

============================================================
5. SUGGESTED FOLDER STRUCTURE
============================================================

src/
  app/
    App.ts
    SimulationController.ts
    SimulationState.ts

  physics/
    constants/
      physicalConstants.ts
      acceleratorConstants.ts

    particles/
      ParticleDefinition.ts
      ParticleDatabase.ts
      IonDefinition.ts

    accelerator/
      AcceleratorCore.ts
      MagneticRigidity.ts
      SynchrotronRadiation.ts
      MagnetModel.ts
      MachinePreset.ts
      MachineValidator.ts

    beam/
      BeamModel.ts
      BeamOptics.ts
      FODOLattice.ts
      BeamEnvelope.ts

    events/
      Event.ts
      Particle.ts
      FourVector.ts
      EventLoader.ts
      EventDatabase.ts

    propagation/
      TrackPropagator.ts
      MagneticField.ts
      UniformField.ts
      RegionalField.ts

    detector/
      DetectorModel.ts
      DetectorHit.ts
      CalorimeterDeposit.ts
      DetectorResponse.ts

    reconstruction/
      ReconstructedObject.ts
      ReconstructionEngine.ts
      InvariantMass.ts
      JetModel.ts
      MissingET.ts

  machines/
    lhc.ts
    hlLhc.ts
    fccHh.ts
    sandbox.ts

  detectors/
    atlas/
      ATLASDetector.ts
      ATLASField.ts
      ATLASGeometry.ts

    cms/
      CMSDetector.ts
      CMSField.ts

  visualization/
    renderer/
      RendererManager.ts
      WebGPURendererBackend.ts
      WebGLRendererBackend.ts

    scenes/
      SceneManager.ts
      SurfaceScene.ts
      RingScene.ts
      TunnelScene.ts
      CavernScene.ts
      DetectorScene.ts
      EventScene.ts

    tracks/
      TrackRenderer.ts
      TrackLOD.ts
      TrackMaterial.ts

    beam/
      BeamRenderer.ts
      BeamEnvelopeRenderer.ts

    detector/
      DetectorRenderer.ts
      HitRenderer.ts
      CalorimeterRenderer.ts

    overlays/
      FieldOverlay.ts
      JetOverlay.ts
      METOverlay.ts
      PhysicsOverlay.ts

    post/
      PostProcessing.ts

    colors/
      ColorMode.ts
      PhysicsPalette.ts
      ColorblindPalette.ts
      Colormaps.ts

  ui/
    ControlPanel.ts
    PhysicsInspector.ts
    EventInspector.ts
    DynamicLegend.ts
    HistogramPanel.ts
    WarningPanel.ts
    PerformancePanel.ts

  data/
    particles.json
    machine-presets.json
    events/

  workers/
    physics.worker.ts

  utils/
    units.ts
    math.ts
    performance.ts

  tests/

The exact structure may be adjusted when technically justified, but preserve the architectural boundaries.

============================================================
6. ACCELERATOR CORE
============================================================

Implement AcceleratorCore independently of Three.js.

It must accept:

- machine preset
- particle/ion species
- beam energy or momentum
- magnetic field
- temperature
- optional user overrides

Return:

- charge
- mass
- momentum
- total energy
- gamma
- beta
- magnetic rigidity Bρ
- required dipole field
- bending radius
- energy per nucleon
- center-of-mass quantities where applicable
- synchrotron energy loss per turn
- approximate magnet operating margin
- feasibility state
- warnings/errors

Core magnetic rigidity relation:

p [GeV/c] ≈ 0.299792458 × |q/e| × B[T] × ρ[m]

Therefore:

Bρ [T·m] = p[GeV/c] / (0.299792458 × |q/e|)

Do not hardcode proton assumptions into this calculation.

For ions:

q = Z e

Use:
- atomic number Z
- mass number A
- ion mass

Expose:
- total beam energy
- energy per nucleon
- momentum per nucleon

Examples must include:
- proton
- Pb-208, Z=82
- O-16, Z=8
- Ne-20, Z=10

Neutrons must NOT be selectable as circulating LHC beams.

They may exist as:
- nuclear constituents
- collision products
- secondary particles

============================================================
7. SYNCHROTRON RADIATION
============================================================

Implement a documented synchrotron-radiation approximation.

The implementation must correctly reproduce the qualitative scaling:

U0 ∝ E^4 / (m^4 ρ)

Equivalent formulations may be used if dimensions and constants are handled correctly.

The purpose is primarily educational comparison between:
- electrons
- muons
- protons
- ions

Electron beams at multi-TeV energies in an LHC-sized ring must generate severe synchrotron-radiation warnings.

Do NOT render synchrotron radiation as a continuously glowing visible electron beam.

In Augmented mode, radiation may be visualized as exaggerated photon emission with an explicit:
"Visualization amplified"
label.

============================================================
8. MACHINE PRESETS
============================================================

Implement:

LHC
HL-LHC
FCC-hh Concept
Sandbox

Important:

HL-LHC must NOT simply be modeled as an 11 T LHC ring.

The main LHC arc dipoles remain approximately LHC-class fields.

HL-LHC differences in Phase 1 should primarily communicate:
- upgraded interaction-region magnets
- stronger final focusing
- higher luminosity-related concepts
- Nb3Sn technology where relevant

FCC-hh is conceptual/future.

Sandbox removes normal operating restrictions but still evaluates physics feasibility.

Separate:

PHYSICS MODE
- user selects particle and desired energy
- system computes required rigidity/field
- machine constraints are respected
- invalid configurations are clearly identified

SANDBOX MODE
- user may independently alter energy, B, temperature, etc.
- do NOT silently clamp physically invalid values
- display consequences and warnings

============================================================
9. MAGNET MODEL / QUENCH MARGIN
============================================================

Phase 1 needs an educational engineering approximation, NOT a superconducting FEM simulation.

Expose:

- operating field
- configured field limit
- coil temperature
- nominal temperature
- approximate operating margin
- magnet state

States:

STABLE
LOW_MARGIN
QUENCH_RISK
QUENCHED

LHC nominal cryogenic temperature should use approximately 1.9 K where relevant.

If temperature/field/current exceed the simplified allowed operating envelope:
- generate warning
- reduce displayed margin
- optionally enter simulated quench state

Quench visualization must communicate:

superconducting
→ resistive transition
→ local heating
→ current decay
→ protection/energy extraction

Do NOT automatically depict every quench as an explosion.

Visible helium vapor should only represent external helium release/venting scenarios.

Clearly document that Phase 1 quench margin is an educational approximation.

============================================================
10. PHYSICS INSPECTOR
============================================================

Create a live Physics Inspector.

Display relevant values such as:

Particle
Charge
Mass
Energy
Momentum
Gamma
Beta
B
Bρ
Bending radius
Energy/nucleon
√s
√sNN
Synchrotron loss/turn
Magnet temperature
Operating margin
Machine feasibility

Warnings may include:

FIELD LIMIT EXCEEDED
INSUFFICIENT MAGNETIC RIGIDITY
SYNCHROTRON LOSS DOMINANT
CRYOGENIC MARGIN EXCEEDED
UNSUPPORTED CIRCULATING PARTICLE
MACHINE CONFIGURATION NON-PHYSICAL

Warnings must contain a short explanation, not just an error code.

============================================================
11. FODO / BEAM OPTICS
============================================================

Include simplified accelerator focusing in Phase 1.

Implement an educational FODO lattice:

Focusing quadrupole
→ drift
→ defocusing quadrupole
→ drift

Show that a quadrupole focusing one transverse plane defocuses the orthogonal plane.

Use a simplified linear transfer-matrix model.

Represent:

[x, x']
[y, y']

using standard drift and thin-lens or simplified thick-lens quadrupole matrices.

Visualize:

- reference orbit
- horizontal beam envelope
- vertical beam envelope
- alternating focusing behavior

Provide an optional overlay:

DIPOLE = BENDING
QUADRUPOLE = FOCUSING

Do not claim this is the complete LHC optics model.

Detailed Twiss parameter/lattice integration can be added later.

============================================================
12. MULTI-SCALE SCENES
============================================================

Do NOT put the entire world in one giant coordinate system.

Implement independent scene/coordinate domains:

Surface / City
LHC Ring
Tunnel
Experimental Cavern
Detector
Collision Event

Use controlled transitions/portals between domains.

Each domain should have:
- local origin
- own scale
- own LOD strategy
- own asset lifecycle

Unload or strongly reduce previous scene resources when entering deeper levels.

Suggested rendering strategy:

CITY:
terrain + simplified urban geometry + instancing/impostors

RING:
schematic underground LHC ring representation

TUNNEL:
repeated tunnel segments via InstancedMesh

CAVERN:
baked/static geometry where practical

ATLAS:
hierarchical LOD

EVENT:
GPU-oriented procedural scientific visualization

============================================================
13. DETECTOR PHASE 1
============================================================

Primary detailed detector:
ATLAS

CMS support may initially exist primarily for magnetic-field comparison/testing.

ATLAS should visually communicate major layers:

- inner detector/tracker
- electromagnetic calorimeter
- hadronic calorimeter
- magnet systems
- muon spectrometer

Do not pretend simplified geometry is engineering CAD.

ATLAS FIELD:

Do NOT propagate every particle using one uniform 2 T field.

Approximate ATLAS using regions:

- central solenoid region ≈ 2 T
- calorimeter/intermediate regions as appropriate
- outer muon region influenced by toroidal magnetic system

Create a RegionalField implementation so this can later be replaced with proper field maps.

CMS FIELD:

Provide a test/demo configuration using approximately uniform 3.8 T central solenoidal field where appropriate.

============================================================
14. EVENT DATA
============================================================

Use prerecorded deterministic event samples.

Create a clean event schema containing:

event ID
process
particles
PDG ID
status
charge
four-momentum
production vertex
decay vertex
parent IDs
child IDs

At minimum include curated/demo samples for:

Z → μ+ μ-
H → γ γ
Z → e+ e-
a jet-containing pp event
a ttbar-like educational sample
a simplified high-multiplicity heavy-ion event

These events do NOT need to be generated in the browser.

Clearly label synthetic/curated samples as such.

Design EventLoader so CERN Open Data / PYTHIA / HepMC-like sources can be integrated later.

============================================================
15. FOUR-VECTORS AND INVARIANT MASS
============================================================

Implement reusable Lorentz four-vectors.

Use natural units where appropriate:

c = 1

Four-vector:

P = (E, px, py, pz)

Invariant mass:

m² = E² - px² - py² - pz²

For two objects:

m12² = (P1 + P2)²

Support:

pT = sqrt(px² + py²)

φ = atan2(py, px)

η = 0.5 ln((p + pz)/(p - pz))

Handle numerical edge cases safely.

For Z → μμ samples, reconstructed invariant mass should cluster around the expected Z mass.

For H → γγ samples, reconstructed invariant mass should cluster around the sample's intended Higgs-like mass.

Do not hardcode histogram results.

============================================================
16. TRACK PROPAGATION
============================================================

Physics owns trajectories.

Rendering must NOT invent track curvature.

Implement TrackPropagator operating on:

- charge
- momentum
- initial position
- magnetic field model

Start with analytic/numerical propagation sufficient to reproduce helical charged-particle motion in a uniform solenoidal field.

Conceptually:

dp/dt = q(v × B)

Neutral particles must not bend from magnetic Lorentz force.

Provide:

UniformField
RegionalField

Track samples should be generated independently of Three.js and passed to the visualization layer.

Important/high-pT tracks may receive more samples.

Low-importance tracks may use fewer samples.

Time-of-flight data should be available for animation.

Since relativistic particles cross detectors extremely quickly, provide:

Real-time
Educational slow motion
Custom time scale

Do not imply that slow-motion animation represents real human-visible timescales.

============================================================
17. DETECTOR RESPONSE
============================================================

Phase 1 detector response is educational and parameterized.

Separate:

TRUTH
HITS
ENERGY DEPOSITS
RECONSTRUCTED OBJECTS

Tracker:
- hit/cluster representation

ECAL:
- electromagnetic energy deposits

HCAL:
- hadronic energy deposits

Muon system:
- muon hits/segments

Do not claim this is Geant4-level response.

The architecture must permit future replacement with detailed simulation data.

============================================================
18. RECONSTRUCTION
============================================================

Implement simplified reconstructed objects:

Electron
Muon
Photon
Jet
MissingET

Jets are reconstructed/algorithmic objects.

Do NOT depict a jet cone as a physical cone of matter.

The cone is an ANALYSIS overlay.

MET is also an inferred transverse momentum imbalance and should be displayed as an analysis arrow/vector, not as a physical particle.

============================================================
19. VISUALIZATION HONESTY MODES
============================================================

Implement five explicit visualization modes:

1. PHYSICAL
2. DETECTOR
3. AUGMENTED
4. ANALYSIS
5. CINEMATIC

PHYSICAL:
Show approximately what a human observer could physically see:
- tunnel
- equipment
- detector
- status lights

Do NOT show visible proton beams or glowing particle tracks.

DETECTOR:
Show:
- detector hits
- clusters
- calorimeter deposits
- muon segments

AUGMENTED:
Show scientifically useful invisible quantities:
- particle trajectories
- magnetic fields
- beam envelope
- synchrotron photons
- particle labels

ANALYSIS:
Show:
- reconstructed objects
- jet cones
- MET
- invariant masses
- decay tree
- analysis annotations

CINEMATIC:
May use:
- stronger bloom
- volumetric lighting
- enhanced particle readability
- visually amplified effects

Anything physically exaggerated must be identifiable as enhanced visualization.

============================================================
20. TRACK RENDERING
============================================================

Do NOT use TubeGeometry for every track.

Implement track rendering with performance tiers.

Tier 1:
selected/high-pT/important particles
- high-quality GPU ribbon or tube-like representation

Tier 2:
normal tracks
- screen-space thick polylines / efficient line rendering

Tier 3:
heavy-ion background
- lightweight GPU line segments / procedural representation

Track geometry should come from TrackPropagator samples.

Use GPU buffers and shaders/TSL for:
- width
- opacity
- selection
- fade
- time animation

For high-multiplicity events:
- preserve important/high-pT tracks
- simplify low-pT tracks
- aggregate or omit extremely low-importance tracks at distance

============================================================
21. COLOR SYSTEM
============================================================

Do NOT claim that particles possess these visible colors.

Default preset:

"CERN-inspired Event Display"

Suggested initial visual language:

Muon:
red

Electron:
green

Photon:
purple

Generic charged track:
orange

Jet:
yellow/orange translucent analysis cone

MET:
magenta/purple arrow

ECAL:
green/cyan family

HCAL:
yellow/orange family

The UI must state:

"CERN-inspired visualization palette. Colors represent visualization metadata, not physical particle colors."

Support Color By:

- Particle Type
- Charge
- pT
- Energy
- Origin Vertex
- Detector Subsystem
- Collection

For origin:

Primary vertex
Pile-up vertex
Secondary vertex
Displaced vertex

Use opacity/saturation as an additional encoding where useful.

Do NOT rely solely on hue.

============================================================
22. ACCESSIBILITY
============================================================

Provide:

CERN-inspired
Colorblind-safe
Monochrome

palettes.

Avoid relying exclusively on red/green differentiation.

Use redundant encoding:

- line thickness
- dash pattern
- icons
- labels
- outlines
- opacity

Physics objects should visually dominate detector geometry.

Detector geometry should generally be more muted than event information.

============================================================
23. SCIENTIFIC COLORMAPS
============================================================

For continuous scalar values use perceptually meaningful colormaps.

Provide at least:

Inferno
Viridis

Default calorimeter energy heatmap:
Inferno

Do not use rainbow/jet as the default scientific colormap.

Keep separate concepts:

EVENT DISPLAY COLORS
= categorical/subsystem/object semantics

ENERGY HEATMAP
= continuous scalar mapping

Track pT:
continuous scale

Calorimeter:
deposited energy scale

Vertex:
categorical origin

Do not apply one global rainbow mapping to everything.

============================================================
24. DYNAMIC LEGEND
============================================================

Legend must update automatically with Color By mode.

Example:

PARTICLE TYPE

Muon
Electron
Photon
Charged track
Jet
MET

For pT:

pT
0 GeV ───────────── 500+ GeV

For vertex:

Primary
Pile-up
Secondary
Displaced

Legend must always communicate what color currently means.

============================================================
25. EVENT INSPECTOR
============================================================

Hovering/selecting an object should expose appropriate data.

Example track:

μ-
PDG ID: 13
Charge: -1
pT: 86.4 GeV
η: -1.21
φ: 2.48
Energy: ...
Vertex: Primary #0

Selecting a particle should:

- highlight its trajectory
- identify parent
- identify children
- optionally highlight its decay chain

Provide a simple decay-tree view.

============================================================
26. INVARIANT-MASS HISTOGRAM
============================================================

Provide a histogram panel capable of accumulating events.

Example:

Z → μμ

For each event:
- identify/select two muon candidates
- calculate invariant mass
- fill histogram

Histogram must be computed from event four-vectors, not hardcoded.

Provide:
- event count
- mean where meaningful
- selected event marker
- reset button

Architecture should permit future JSROOT integration.

============================================================
27. REALISTIC VISUAL PIPELINE
============================================================

Target:

PBR materials
HDR environment lighting
baked lighting/lightmaps for static architecture
selective dynamic lights
reasonable shadow budget
tone mapping
subtle AO
optional AA
subtle bloom
optional cinematic DOF
limited volumetric effects

Do not overuse bloom/fog.

Physical and Scientific modes should remain visually restrained.

Cinematic mode may enhance presentation.

Tunnel/cavern lights should preferentially use:
- baked/static contribution
- emissive materials

rather than hundreds of shadow-casting lights.

============================================================
28. PHYSICALLY INCORRECT EFFECTS TO AVOID
============================================================

Do NOT depict:

- proton beams as permanently visible laser beams in Physical mode
- glowing tracks visible to naked eyes
- explosions at ordinary collision points
- macroscopic shockwaves from particle collisions
- sparks caused directly by pp collisions
- firework-style particle trails
- Cherenkov glow in vacuum
- jet cones as physical objects
- MET as a physical particle
- every quench as an explosion

Educational overlays may visualize otherwise invisible quantities if explicitly identified.

============================================================
29. CHERENKOV
============================================================

Do not add generic blue Cherenkov glow around the interaction point.

Cherenkov radiation requires appropriate material conditions.

The architecture may support future Cherenkov detector visualization, e.g. RICH-like systems.

If demonstrated educationally, label it as an augmented detector effect.

============================================================
30. PERFORMANCE
============================================================

Primary target:

60 FPS
16.67 ms/frame

Aim approximately for:

physics/update:
2–3 ms

CPU scene/update:
~2 ms

geometry/render:
4–5 ms

post-processing:
3–4 ms

remaining:
headroom

These are targets, not rigid requirements.

Provide runtime profiling.

Track:

- FPS
- frame time
- draw calls
- triangles
- visible tracks
- active particles
- approximate GPU/renderer statistics where available

============================================================
31. QUALITY PRESETS
============================================================

Provide:

ULTRA
HIGH
MEDIUM
SCIENTIFIC

Quality scaling may change:

- shadows
- volumetric effects
- reflection quality
- post-processing
- track geometric detail
- distant environment LOD
- particle visual density

Quality settings MUST NOT change underlying physics results.

SCIENTIFIC should prioritize:
- accuracy
- clarity
- high event readability

over cinematic effects.

============================================================
32. DETERMINISM
============================================================

Phase 1 must be reproducible.

Given:

machine configuration
event ID
visualization settings
random seed

the resulting physics state should be deterministic.

Any visual-only randomization must use a seeded PRNG when reproducibility matters.

============================================================
33. TESTING
============================================================

Use automated unit tests for physics/math modules.

At minimum test:

MAGNETIC RIGIDITY
- known proton examples
- ion Z/A scaling
- sign handling
- unit conversion

FOUR VECTOR
- invariant mass
- Lorentz-vector addition
- pT
- η
- φ

TRACK PROPAGATION
- neutral particle remains unbent
- positive/negative charges curve oppositely
- increased momentum increases curvature radius
- increased B decreases curvature radius

SYNCHROTRON RADIATION
- electron loss >> proton loss at equivalent conditions
- E^4 scaling
- mass dependence

IONS
- Pb-208 Z=82
- O-16 Z=8
- Ne-20 Z=10

FODO
- focusing/defocusing behavior
- stable envelope for suitable educational lattice parameters

EVENTS
- parent/child relationships
- deterministic loading

INVARIANT MASS
- curated Z sample reconstructs near intended Z mass
- curated Higgs diphoton sample reconstructs near intended Higgs-like mass

VISUALIZATION
- Physical mode hides invisible tracks/beams
- Detector mode shows detector response
- Augmented mode enables truth trajectories
- Analysis mode enables reconstructed overlays

Do not make tests pass by hardcoding expected UI outputs.

============================================================
34. ACCEPTANCE CRITERIA
============================================================

Phase 1 is complete when:

1. The project runs locally using standard Vite commands.

2. WebGPU is preferred when supported and the application has a graceful fallback path.

3. User can navigate:

Surface
→ Ring
→ Tunnel
→ Cavern
→ ATLAS
→ Event

without using one enormous global coordinate space.

4. AcceleratorCore is independent of Three.js.

5. User can select at least:
- proton
- Pb-208
- O-16
- Ne-20

6. Neutron cannot be selected as an LHC circulating beam.

7. User can choose:
- LHC
- HL-LHC
- FCC-hh Concept
- Sandbox

8. Magnetic rigidity updates correctly with particle, momentum, B, and radius.

9. Electron configurations demonstrate severe synchrotron-loss scaling at extreme energies.

10. Physics Inspector reports useful warnings.

11. Simplified FODO focusing and beam envelopes are visible.

12. At least these events load:
- Z → μμ
- H → γγ
- Z → ee
- jet event
- ttbar-like event
- simplified heavy-ion event

13. Charged tracks curve according to physics-owned trajectories.

14. Neutral particles do not bend magnetically.

15. CMS test field can demonstrate approximately 3.8 T solenoidal propagation.

16. ATLAS does not incorrectly use one uniform 2 T field throughout the whole detector.

17. User can switch:
PHYSICAL
DETECTOR
AUGMENTED
ANALYSIS
CINEMATIC

18. Physical mode does not display visible sci-fi proton beams.

19. Color By works for at least:
Particle Type
Charge
pT
Energy
Vertex

20. Colorblind-safe palette exists.

21. Inferno/Viridis continuous colormaps exist.

22. Dynamic legend correctly follows current color semantics.

23. Event Inspector exposes four-vector/particle information.

24. Z → μμ invariant mass is calculated from four-vectors.

25. Histogram accumulates multiple events.

26. Heavy-ion event remains usable through track LOD.

27. Quality presets change rendering cost without changing physics.

28. Representative desktop hardware should approach 60 FPS in normal Phase 1 scenes.

29. No visualization is knowingly presented as physically visible when it is actually an analytical/educational overlay.

30. Physics assumptions and approximations are documented.

============================================================
35. IMPLEMENTATION MILESTONES
============================================================

MILESTONE 1 — FOUNDATION

- initialize Vite + TypeScript + Three.js
- renderer abstraction
- WebGPU preferred path
- fallback path
- simulation state
- units
- constants
- deterministic PRNG
- basic UI shell
- performance instrumentation

Do not proceed until build/typecheck/tests work.

------------------------------------------------------------

MILESTONE 2 — ACCELERATOR CORE

Implement:

ParticleDatabase
IonDatabase
MachinePreset
AcceleratorCore
MagneticRigidity
SynchrotronRadiation
MagnetModel
MachineValidator
PhysicsInspector

Add unit tests before visualization complexity.

------------------------------------------------------------

MILESTONE 3 — MULTI-SCALE WORLD

Implement:

Surface
Ring
Tunnel
Cavern
Detector scene domains

Add transitions and resource lifecycle management.

Use placeholders where final art assets are unavailable.

Do NOT block physics development on detailed Blender assets.

------------------------------------------------------------

MILESTONE 4 — BEAM OPTICS

Implement:

FODO lattice
transfer matrices
beam envelope
dipole visualization
quadrupole visualization

Add scientific overlay explaining:

Dipole = bending
Quadrupole = focusing

------------------------------------------------------------

MILESTONE 5 — EVENT MODEL

Implement:

FourVector
Particle
Event
EventLoader
curated deterministic samples
parent/child relationships

Test invariant mass before rendering tracks.

------------------------------------------------------------

MILESTONE 6 — FIELD + TRACK PROPAGATION

Implement:

MagneticField interface
UniformField
RegionalField
TrackPropagator

Validate:
- charge sign
- radius
- neutral behavior
- CMS 3.8 T example
- simplified ATLAS regional field

------------------------------------------------------------

MILESTONE 7 — DETECTOR RESPONSE

Implement simplified:

tracker hits
ECAL deposits
HCAL deposits
muon hits

Maintain explicit separation:

Truth
→ Detector Response
→ Reconstruction

------------------------------------------------------------

MILESTONE 8 — GPU EVENT VISUALIZATION

Implement:

TrackRenderer
track LOD
time-of-flight animation
calorimeter visualization
hit visualization
beam visualization

Optimize high-multiplicity events.

------------------------------------------------------------

MILESTONE 9 — SCIENTIFIC UX

Implement:

Visualization Honesty Toggle
Color By
accessibility palettes
Inferno/Viridis
DynamicLegend
EventInspector
decay tree
PhysicsInspector
warnings

------------------------------------------------------------

MILESTONE 10 — RECONSTRUCTION / ANALYSIS

Implement:

electrons
muons
photons
simplified jets
MET
invariant mass
histogram

Keep analysis overlays semantically separate from physical geometry.

------------------------------------------------------------

MILESTONE 11 — VISUAL QUALITY

Add:

PBR refinement
HDR lighting
baked-light workflow
post-processing
controlled bloom
optional volumetrics
cinematic mode

Scientific correctness must remain unchanged.

------------------------------------------------------------

MILESTONE 12 — PERFORMANCE PASS

Profile:

draw calls
CPU frame time
GPU frame time where possible
track counts
memory
scene transitions

Implement:

quality presets
adaptive LOD
track importance
scene unloading
instancing
GPU-oriented event rendering

Target stable interactive performance and approximately 60 FPS on representative desktop hardware.

============================================================
36. DEVELOPMENT RULES
============================================================

1. Physics correctness has priority over visual spectacle.

2. Never invent physics merely to make an animation look better.

3. Visual exaggeration is allowed only when clearly marked as visualization.

4. Keep Physics and Renderer independent.

5. Avoid premature overengineering.

6. Implement Phase 1 approximations behind interfaces that can later be replaced with higher-fidelity models.

7. Do not claim Phase 1 is a Geant4, PYTHIA, MAD-X, ROOT, or full accelerator digital-twin replacement.

8. Prefer deterministic simulations.

9. Add comments explaining important equations and assumptions.

10. Put citations/source notes for physical constants and machine parameters in documentation/data metadata where possible.

11. If a requested physical behavior cannot be implemented accurately within Phase 1, implement a documented approximation rather than silently fabricating behavior.

12. When uncertain about a physics constant or machine parameter, isolate it in configuration and mark it for verification rather than guessing.

13. Keep visual state separate from scientific state.

14. Avoid allocations in per-frame hot paths.

15. Avoid creating thousands of independent Three.js objects when instancing/batching/GPU buffers can represent the same data.

============================================================
37. REQUIRED DOCUMENTATION
============================================================

Create:

README.md

docs/
  architecture.md
  physics-model.md
  visualization-honesty.md
  performance.md
  known-approximations.md

physics-model.md must document:

- units
- constants
- magnetic rigidity
- ion treatment
- synchrotron approximation
- FODO approximation
- magnetic-field approximation
- track propagation
- detector-response approximation
- reconstruction approximation

visualization-honesty.md must explicitly distinguish:

PHYSICALLY VISIBLE
DETECTOR MEASUREMENT
SIMULATION TRUTH
RECONSTRUCTED DATA
ANALYSIS OVERLAY
CINEMATIC ENHANCEMENT

============================================================
38. FINAL PRINCIPLE
============================================================

The central philosophy of the project is:

"Make invisible physics understandable without pretending it is visible."

The simulator should feel visually impressive, but a user should always be able to determine whether something on screen represents:

- physical infrastructure
- a real physical process
- detector response
- Monte Carlo truth
- reconstructed information
- analytical visualization
- or cinematic enhancement.

Build Phase 1 incrementally according to the milestones above.

Start with Milestone 1.

Before implementing later milestones, ensure the existing code:
- builds
- typechecks
- passes tests
- preserves architectural boundaries
- does not introduce scientifically misleading behavior.

When an implementation choice conflicts with scientific correctness, performance, and visual quality, prioritize:

1. Scientific correctness
2. Clear representation of approximations
3. Stable architecture
4. Performance
5. Visual spectacle
