# Visualization honesty

Every element on screen belongs to exactly one epistemic category. The active honesty mode
(`src/visualization/VisualizationMode.ts`) decides which categories may appear; the HUD banner,
legend chips and label chips state them.

| Category | Meaning | Examples in Phase 1 |
|---|---|---|
| **PHYSICALLY VISIBLE** | What a human observer could see | terrain, tunnel, cryostats, cavern, detector hardware, magnet status LEDs, helium vapour *only* in the explicit venting scenario |
| **DETECTOR MEASUREMENT** | What the apparatus records | tracker hits, ECAL/HCAL cell deposits, muon-chamber segments |
| **SIMULATION TRUTH** | Monte-Carlo truth made visible | propagated particle trajectories, neutrinos (marked "undetected"), magnetic-field arrows, beam envelope, bunch positions |
| **RECONSTRUCTED DATA** | Output of reconstruction algorithms | reconstructed tracks, e/μ/γ candidates |
| **ANALYSIS OVERLAY** | Analysis constructs, not matter | jet cones, MET arrow, invariant-mass annotations, decay tree, dipole/quadrupole overlay |
| **CINEMATIC ENHANCEMENT** | Presentation only | stronger bloom, additive track glow, amplified effects |

## Modes

| Mode | Shows |
|---|---|
| PHYSICAL | infrastructure, detector, status lights. **No beams, no tracks, no glow.** |
| DETECTOR | + hits, calorimeter deposits, muon segments (geometry muted) |
| AUGMENTED | + truth trajectories, fields, beam envelopes, amplified synchrotron photons, labels |
| ANALYSIS | reconstructed tracks/objects, jet cones, MET, invariant masses, decay tree |
| CINEMATIC | augmented content with bloom/additive glow; banner states it is enhanced |

## Rules implemented

- Proton beams are never drawn as visible lasers; bunch markers exist only in AUGMENTED/CINEMATIC
  and are labelled as positions of invisible bunches.
- Synchrotron photons are shown only in AUGMENTED/CINEMATIC with the label
  "Visualization amplified"; the emission rate is a log mapping of the computed U₀.
- Beam envelopes: longitudinal positions are true, transverse size exaggerated by a stated factor.
- Jet cones and MET arrows carry an ANALYSIS chip; MET is labelled "inferred".
- No explosions, shockwaves, sparks, fireworks or Cherenkov glow at the interaction point.
- A quench is shown as a protected transition (status LED, heat-map of the coil in augmented
  view, current-decay readout) — never as an explosion. Helium vapour appears only when the
  venting scenario is explicitly enabled and is labelled as such.
- Animation time: real time (the event lasts ~50 ns, i.e. instantaneous), educational slow
  motion (×10⁸, stated on screen) or a custom scale. Slow motion is not a human-visible timescale.
- Colors: "CERN-inspired visualization palette. Colors represent visualization metadata, not
  physical particle colors." Hue is never the only encoding (width, dash, opacity, icons, labels).
- Categorical colors (particle type, vertex, subsystem) are kept separate from continuous
  colormaps (Inferno for calorimeter energy, Viridis/Inferno for pT/energy). No rainbow/jet.
- Simplified geometry and synthetic events are labelled as such.

## Phase 2: provenance and data levels

Every event carries its provenance (source type, experiment, year, √s, license, DOI/URL,
generator and seed, processing notes) and is shown with data-level chips:

| Level | When |
|---|---|
| **SIMULATED TRUTH** | generator records (curated toy, PYTHIA, HepMC) |
| **SIMULATED RECONSTRUCTION** | lhcsim reconstruction of simulated events; reco-level simulated sources |
| **RECORDED COLLISION DATA** | CERN Open Data and other declared recorded data |

- Recorded data can never carry truth (validation rejects it). Nothing is manufactured: no
  hits, cells or truth are invented for reco-level sources; the inspector says so.
- Trajectories of reco-level events are helices computed from reconstructed momenta; they are
  RECONSTRUCTED DATA and are drawn only in modes that allow reconstructed objects (ANALYSIS) —
  never in AUGMENTED/CINEMATIC as simulation truth (`trajectoryVisibility`, unit-tested).
- The event-scene status line starts with the data level (e.g. `[RECORDED COLLISION DATA]`).

## Phase 2 visual elements

| Element | Category | Mode |
|---|---|---|
| IR beam envelopes (±1σ) and crossing orbits, ×1000 transverse (stated) | SIMULATION TRUTH / AUGMENTED | AUGMENTED, CINEMATIC |
| Inner-triplet magnets, beam pipe, experiment envelope | PHYSICALLY VISIBLE | all |
| RICH Cherenkov cones (concept view, mirrors omitted — stated) | DETECTOR MEASUREMENT | DETECTOR, AUGMENTED, CINEMATIC |
| Track-fit overlay: 3-hit seed (dashed), fit (solid), ±1σ(pT), residuals ×1000 | RECONSTRUCTED · EDUCATIONAL KALMAN | AUGMENTED, ANALYSIS |
| Reconstructed vertices, K⁰_S/Λ candidates | RECONSTRUCTED | ANALYSIS |
| Jet cones from the selected generalized-kT algorithm | ANALYSIS OVERLAY | ANALYSIS |
| Pile-up vertices (faded, Color by Origin Vertex) | SIMULATION TRUTH | truth modes |
| Detector fidelity label | model statement | detector view, Detector tab |

- Bunch packets remain AUGMENTED-only; PHYSICAL shows no beams (unit-tested). The filling scheme is
  shown as a chart in the Collider tab.
- A quench stays a protected transition: the tunnel heat map follows the Quench V2 hot-spot
  temperature and current; no explosions.
- Experiments are not presented at equal fidelity: each shows DETAILED / UPGRADED / SIMPLIFIED
  EDUCATIONAL with a one-line summary.
