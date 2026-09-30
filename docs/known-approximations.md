# Known approximations

Phase 1 is not Geant4, PYTHIA, MAD-X, ROOT or an accelerator digital twin.

## Accelerator
- Ring treated as isomagnetic with one bending radius; straight sections, insertions, dispersion
  suppressors and the 1.4 % tunnel tilt are not modelled physically (schematic drawing only).
- √s assumes symmetric head-on collisions of identical beams (crossing angle ignored; no p–Pb).
- Synchrotron radiation: classical formula, dipoles only; no damping/equilibrium emittance.
- Magnet margin: Bc2(T) scaling anchored to one operating point; current ∝ field (no iron
  saturation); no conductor, FEM or thermal model. Quench timeline is illustrative (VERIFY τ values).
- Momentum acceptance ±1e-3 is an order-of-magnitude threshold.
- Luminosity: round Gaussian beams, fixed reduction factor F; no levelling/crab cavities.
  Ion bunch parameters are placeholders (VERIFY).
- FCC-hh values are study-level and flagged VERIFY.

## Beam optics
- One symmetric FODO cell, thick quads, dipoles as drifts; no dispersion, chromaticity,
  coupling, nonlinearities. Beam-2 envelope in the tunnel uses swapped planes.

## Events
- Toy generator: isotropic decays (no spin correlations), toy fragmentation (approximate
  charge conservation, no parton shower), simplified underlying event, only 2 pile-up vertices,
  reduced heavy-ion multiplicity, no jet quenching or radial flow.
- Incoming partons are illustrative (longitudinal momentum only).

## Fields and propagation
- Piecewise analytic fields; ATLAS solenoid end fall-off and toroid ripple ignored.
- No energy loss, multiple scattering, bremsstrahlung, photon conversions or nuclear interactions.
- Loopers truncated after 1.5 turns.

## Detector response
- Fixed lateral shower profiles, no longitudinal development, no noise, no e/h non-compensation,
  constant muon MIP deposits, no dead material/cracks.
- TRT represented by effective layers; geometry is simplified cylinders/disks.

## Reconstruction
- Truth-seeded tracking with resolution smearing (no pattern recognition or fit); truth
  vertex association; displayed reconstructed tracks reuse the truth-propagated trajectory of
  the matched particle.
- Jet areas approximated by πR²; no jet energy scale calibration.
- MET is shown only for pp events.

## Visualization (all labelled on screen)
- Tunnel width exaggerated in the ring view; beam envelope transverse size exaggerated.
- Bunch markers, SR photon rate, animation speed are visual mappings.
- Dense events hide soft calorimeter cells and (at lower presets) the softest tracks — display only.
- Surface landscape is schematic (not a Geneva digital twin).

# Phase 2

## Data
- CMS outreach CSVs contain selected leptons (and MET) only; lepton masses are PDG values; no hits.
- ROOT import supports two column schemas; variable-bin TH1 are rejected.
- Hit-to-track assignment uses simulation bookkeeping (no pattern recognition).
- The PYTHIA backend was not executed in the development environment; WASM PYTHIA is not implemented.

## Collider operation
- One educational filling scheme for all IPs; no levelling, no bunch-by-bunch luminosity.
- Toy minimum-bias pile-up unless a minimum-bias dataset is supplied; no out-of-time pile-up.
- Trigger thresholds are illustrative; Level-1 is emulated from the same simulated cells.

## Optics
- IR model: drift + inner triplet only; no matching section, dispersion, D1/D2 or bumps beyond L*.
- Beam 2 uses mirrored optics and the opposite orbit sign.

## Fields
- Vacuum finite solenoids (no iron); yoke return and toroids remain analytic regions.
- Gaussian dipole profiles without fringe fields or ∇·B corrections.

## Detectors
- ALICE: EMCal with full φ; no PHOS/DCal/FIT/ZDC; TPC as 30 effective layers.
- LHCb: annular planes instead of rectangular stations; RICH rings drawn as cones (no mirrors).
- CMS HF and preshower, ATLAS FCal: geometry only.
- No multiple scattering, energy loss or material interactions in propagation.

## Reconstruction
- Kalman fit in the transverse plane with a helix of the track-averaged Bz; no smoother.
- Vertexing without adaptive fits; displaced vertices from two-track seeds.
- Topo-clusters without splitting or calibration; jets uncalibrated.

## Quench
- Lumped model: one normal-zone temperature plus an adiabatic hot spot; no 3D diffusion, no
  inter-turn propagation, no coupling currents, simplified material functions.
