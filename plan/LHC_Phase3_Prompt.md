You are continuing the completed Phase 1 and Phase 2 LHC simulator.

DO NOT rebuild the application.

Phase 3 extends the existing architecture into:

"FULL EXPERIENCE & PLATFORM"

The existing scientific pipeline remains:

Machine
→ Beam
→ Event
→ Detector Response
→ Reconstruction
→ Visualization

Phase 3 adds world-scale exploration, accelerator engineering, education, analysis, collaboration, XR, localization, persistence, and scalable performance.

============================================================
1. GOAL
============================================================

Create a complete interactive platform where users can:

- explore CERN from surface to collision scale
- understand the full accelerator chain
- operate simplified accelerator systems
- explore the complete LHC ring
- investigate beam loss/collimation/dump systems
- analyze collision data
- complete guided lessons
- save/share scenarios
- collaborate in classrooms
- use desktop/mobile/XR interfaces

The experience should support three broad audiences:

VISITOR
STUDENT
ADVANCED / ENGINEERING

Complexity must be progressively disclosed.

============================================================
2. PREREQUISITES
============================================================

Phase 1 and Phase 2 must:

- build
- typecheck
- pass tests
- preserve Physics ↔ Renderer separation
- support normalized event sources
- preserve data provenance
- provide accelerator physics
- provide detector simulation/reconstruction
- support multiple experiments
- support scientific visualization modes
- remain performant

Fix regressions before Phase 3.

============================================================
3. SCOPE
============================================================

IN SCOPE:

- realistic regional surface environment
- terrain/geology
- 3D city representation
- full 27 km ring streaming
- injector chain
- collimation
- beam dump
- accelerator engineering mode
- machine operation scenarios
- guided tours
- interactive lessons
- quizzes
- browser analysis workspace
- scenario persistence
- shareable configurations
- classroom/multiplayer
- WebXR
- TH/EN localization
- mobile optimization
- advanced streaming/LOD

OUT OF SCOPE:

- operational control of real CERN equipment
- safety-critical accelerator software
- exact CERN control-system reproduction
- complete geological digital twin
- exact building-by-building CAD twin
- production replacement for CERN analysis frameworks
- unrestricted arbitrary server code execution
- exact accelerator failure prediction

============================================================
4. ARCHITECTURE CHANGES
============================================================

Preserve existing physics architecture.

Add platform layers:

World
Education
Analysis Workspace
Scenario
Collaboration
XR
Localization

Suggested:

src/
  world/
    terrain/
    geology/
    city/
    streaming/
    coordinates/

  accelerator/
    injectors/
    collimation/
    dump/
    engineering/

  education/
    tours/
    lessons/
    quizzes/
    progression/

  notebook/
    AnalysisRuntime.ts
    DataFrameAdapter.ts
    PlotBridge.ts

  scenarios/
    ScenarioSchema.ts
    ScenarioManager.ts
    ShareService.ts

  collaboration/
    Session.ts
    Presence.ts
    Classroom.ts

  xr/
    XRManager.ts
    XRInteraction.ts

  i18n/
    en/
    th/

============================================================
5. WORLD / GEOLOGY
============================================================

Create a geographically grounded surface representation around CERN.

Support:

- terrain elevation
- approximate urban context
- CERN sites
- France/Switzerland context
- LHC underground alignment
- geological cross-section

Use authoritative/open datasets where licensing permits.

Separate:

Measured/geospatial data
Approximation
Artistic fill

Never imply approximate underground strata are exact survey data.

Allow:

Surface
→ geology cutaway
→ tunnel

with depth indicators.

============================================================
6. 3D CITY / STREAMING
============================================================

Support streamed city/environment content using an appropriate tiled/LOD strategy.

Potential sources:

3D Tiles
OpenStreetMap-derived geometry
terrain tiles
custom optimized assets

Do not load the entire regional world simultaneously.

Use:

frustum culling
distance LOD
tile streaming
occlusion where useful
GPU instancing
texture compression

============================================================
7. FULL LHC RING
============================================================

Represent the approximately 27 km accelerator using streamed sectors.

Create reusable sector architecture.

Support:

- arcs
- straight sections
- experimental points
- RF areas
- collimation areas
- beam dump extraction areas
- service infrastructure where appropriate

Users must be able to:

fly around ring
jump to points of interest
follow beam
inspect sector metadata

Do not duplicate unique high-detail geometry across the full ring.

============================================================
8. INJECTOR CHAIN
============================================================

Implement educational accelerator flow:

Linac4
→ PS Booster
→ Proton Synchrotron
→ Super Proton Synchrotron
→ LHC

Represent:

injection
acceleration
transfer
bunch manipulation
energy progression

Use machine-specific configuration.

The user should be able to follow a proton from source/injection chain to LHC collision.

Do not imply one individual proton can literally be visually tracked through real machine operation.

This is an educational representative trajectory.

============================================================
9. COLLIMATION
============================================================

Implement simplified beam-halo/collimation physics.

Represent:

beam core
halo
primary collimators
secondary collimators
absorbers

Provide loss maps.

Conceptually model normalized transverse amplitude and interception thresholds.

Visualize:

normal operation
increased halo
mis-steering
collimator interception

Beam-loss visualization must be augmented scientific visualization.

============================================================
10. BEAM DUMP
============================================================

Implement the conceptual LHC beam dump sequence:

dump request
→ extraction kick
→ beam extraction
→ transfer line
→ dilution
→ absorber

Visualize:

bunch trajectory
extraction timing
energy deposition
absorber heatmap

Do NOT depict the beam dump as a conventional explosion.

Include machine-protection context.

============================================================
11. ACCELERATOR ENGINEERING MODE
============================================================

Create a dedicated Engineering workspace.

Subsystems:

Magnets
RF
Cryogenics
Vacuum
Beam instrumentation
Collimation
Machine protection
Beam dump

Expose relevant state.

Example:

MAGNETS
B
current
temperature
margin
stored energy

RF
frequency
voltage
phase
energy gain

VACUUM
pressure
beam-gas interaction proxy

CRYOGENICS
temperature
thermal load
simplified cooling capacity

Provide scenario-based failures rather than arbitrary visual effects.

============================================================
12. RF ACCELERATION
============================================================

Implement educational RF physics.

For effective cavity voltage V and synchronous phase φs:

ΔE ≈ q V sin(φs)

or the appropriate documented convention used by the implementation.

Represent:

RF bucket concept
synchronous particle
phase
energy gain
bunch structure

Do not implement unnecessary full longitudinal dynamics unless required.

============================================================
13. BEAM LIFETIME / LOSSES
============================================================

Provide simplified models for:

luminosity burn-off
beam-gas losses
collimation losses
other configurable educational loss mechanisms

A simple decay model may use:

N(t) = N0 exp(-t/τ)

only where that approximation is appropriate.

Document limitations.

============================================================
14. GUIDED TOURS
============================================================

Create narrative tours such as:

"From Hydrogen to Collision"

"How the LHC Bends a 7 TeV Proton"

"Inside ATLAS"

"How We Discover a Z Boson"

"Why Electrons Do Not Run in the LHC"

"What Happens During a Magnet Quench?"

"How the LHC Safely Dumps a Beam"

Tours may:

move camera
change scenes
highlight systems
set parameters
pause for interaction
open scientific panels

Never fake experimental results for narrative convenience.

============================================================
15. LESSON / QUIZ SYSTEM
============================================================

Lessons must use actual simulator state.

Example challenges:

- calculate required dipole field
- identify why a configuration fails
- focus a beam
- reconstruct Z → μμ
- distinguish pile-up vertices
- configure a trigger
- inspect a quench
- safely dump a beam

Support:

objectives
hints
validation
completion state

Avoid arbitrary gamification that contradicts physics.

============================================================
16. ANALYSIS WORKSPACE
============================================================

Create a browser-based analysis workspace.

Users should be able to:

select dataset
filter events
inspect variables
build histograms
fit distributions
compare samples
calculate derived quantities

Provide a constrained analysis API.

Examples:

event.muons
event.electrons
event.jets
event.met

Derived expressions:

pT
η
φ
invariant mass
ΔR

ΔR = sqrt((Δη)^2 + (Δφ)^2)

Support notebook-like cells:

DATA
FILTER
CALCULATION
PLOT
TEXT

Do NOT execute arbitrary unsafe server code.

============================================================
17. SCENARIOS
============================================================

Scenario must serialize:

schema version
machine
beam configuration
particle species
physics mode
event source
detector
visualization settings
camera position
lesson state where relevant

Support:

Save
Load
Duplicate
Share

Use versioned schemas and migrations.

Shared scenarios must reproduce scientific state deterministically when possible.

============================================================
18. MULTIPLAYER / CLASSROOM
============================================================

Add optional collaborative sessions.

Roles:

Instructor
Student
Observer

Instructor may:

synchronize scene
highlight objects
load scenario
start lesson
broadcast selected event

Students may independently inspect permitted objects.

Do not synchronize unnecessary high-frequency particle geometry.

Synchronize semantic state rather than full rendered state.

============================================================
19. WEBXR
============================================================

Add optional WebXR support.

Provide comfortable scales:

World
Human
Detector
Event

Avoid forcing literal scale continuity.

Support teleport/navigation rather than requiring users to traverse kilometers physically.

XR must preserve Visualization Honesty modes.

Provide accessible non-XR equivalents.

============================================================
20. LOCALIZATION
============================================================

Support:

English
Thai

No scientific strings should be hardcoded directly into UI components.

Localize:

controls
warnings
lessons
tours
legends
units/descriptions

Keep symbols such as:

pT
η
φ
β*
√s

scientifically standard.

============================================================
21. MOBILE
============================================================

Provide a mobile rendering path.

Mobile may reduce:

geometry detail
shadow resolution
post effects
track count
city detail
texture resolution

Mobile must NOT change physics calculations.

Provide touch-friendly:

orbit
pan
selection
scene navigation
inspectors

Heavy analysis workflows may use simplified layouts.

============================================================
22. PERFORMANCE / STREAMING
============================================================

Maintain approximately:

Desktop target:
60 FPS

Mobile target:
30–60 FPS depending on device.

Use adaptive systems based on measured frame cost.

Streaming hierarchy:

Region
→ Ring Sector
→ Facility
→ Machine
→ Detector
→ Event

Only maintain detailed resources for relevant scale levels.

Use:

asset manifests
background loading
cache budgets
texture compression
geometry compression
instancing
worker parsing
GPU buffers

============================================================
23. TESTS
============================================================

Add tests for:

WORLD
- coordinate transforms
- depth/alignment consistency

STREAMING
- sector load/unload
- memory budget behavior

INJECTORS
- machine progression
- energy progression

RF
- energy/phase behavior

COLLIMATION
- halo interception

DUMP
- extraction sequence

SCENARIOS
- save/load equality
- schema migration
- deterministic restore

EDUCATION
- lesson validation based on physics state

COLLABORATION
- authoritative state synchronization
- reconnect behavior

LOCALIZATION
- EN/TH completeness

MOBILE
- physics equivalence with desktop

============================================================
24. ACCEPTANCE CRITERIA
============================================================

Phase 3 is complete when:

1. All Phase 1/2 tests remain valid.
2. Surface-to-event navigation remains functional.
3. Regional terrain/city can stream dynamically.
4. Geological cutaway communicates tunnel depth.
5. Full LHC ring is navigable through streamed sectors.
6. Injector chain can be explored sequentially.
7. Users can follow representative beam progression.
8. Collimation/beam-halo scenario works.
9. Beam dump sequence works.
10. Engineering Mode exposes major accelerator systems.
11. RF acceleration is interactively demonstrated.
12. Failure scenarios remain scientifically labeled.
13. Guided tours work.
14. Lessons validate real simulation state.
15. Analysis workspace can process normalized events.
16. Users can build invariant-mass analyses.
17. Scenarios can be saved/restored/shared.
18. Collaborative classroom sessions synchronize semantic state.
19. WebXR mode works on supported devices.
20. English/Thai switching works.
21. Mobile experience is usable.
22. Mobile and desktop produce equivalent physics outputs.
23. World streaming stays within defined memory budgets.
24. Scientific provenance and honesty remain visible throughout.

============================================================
25. MILESTONES
============================================================

M1 — World foundation
Coordinates + terrain + geology.

M2 — Regional environment
City/3D tiles + streaming.

M3 — Full ring
Sector streaming + points of interest.

M4 — Injector chain
Linac4 → PSB → PS → SPS → LHC.

M5 — Machine protection
Collimation + beam loss + beam dump.

M6 — Engineering
Magnets + RF + cryogenics + vacuum + protection.

M7 — Education
Tours + lessons + quizzes.

M8 — Analysis platform
Browser notebook + datasets + plots.

M9 — Persistence
Scenario schema + save/share.

M10 — Collaboration
Classroom/multiplayer.

M11 — XR / Localization
WebXR + TH/EN.

M12 — Mobile / Final optimization
Adaptive quality + streaming + profiling.

============================================================
26. DEVELOPMENT RULES
============================================================

Follow ALL Phase 1 and Phase 2 rules.

Additionally:

1. Never replace validated physics with visual approximations.

2. World-scale fidelity and particle-scale fidelity must remain separate coordinate domains.

3. Geospatial accuracy must be distinguished from artistic reconstruction.

4. Do not present approximate geology as surveyed ground truth.

5. Educational narratives must use real simulator state.

6. Do not fake physics to make a lesson succeed.

7. Shared scenarios must preserve provenance and configuration.

8. Multiplayer synchronizes semantic state, not thousands of render primitives.

9. XR is a visualization interface, not a separate physics implementation.

10. Desktop, mobile, and XR must consume the same scientific state.

11. Localization must not alter scientific meaning.

12. Optimize visual fidelity before sacrificing scientific calculations.

13. Every major external dataset must record source/provenance/license metadata.

14. Maintain backward compatibility with Phase 1/2 scenarios where practical.

15. New subsystems must communicate through defined interfaces rather than bypassing the existing architecture.

16. Keep the application usable after every milestone.

============================================================
27. FINAL PRODUCT PRINCIPLE
============================================================

The final platform must operate coherently across:

REAL WORLD
→ ACCELERATOR
→ BEAM
→ COLLISION
→ DETECTOR
→ RECONSTRUCTION
→ ANALYSIS
→ UNDERSTANDING

A visitor should be able to explore CERN visually.

A student should be able to understand why the machine works.

An advanced user should be able to inspect the physics behind it.

At every level the user must be able to distinguish:

MEASURED DATA
SIMULATED PHYSICS
ENGINEERING APPROXIMATION
RECONSTRUCTED INFORMATION
EDUCATIONAL OVERLAY
ARTISTIC / CINEMATIC ENHANCEMENT

Do not sacrifice this distinction for visual spectacle.

Implement Phase 3 incrementally, starting only after Phase 2 acceptance criteria pass.
