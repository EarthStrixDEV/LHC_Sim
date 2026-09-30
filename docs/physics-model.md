# Physics model (Phase 1)

All models are educational approximations with explicit scope. Code references are given
for every formula.

## Units

SI internally for length (m), time (s), field (T), temperature (K), charge (e).
Energies, momenta and masses are in GeV with c = 1 inside the particle-physics layer — the
unit in which every relevant quantity (rigidity, √s, invariant mass) is quoted. Explicit
conversions (eV/GeV/TeV ↔ J, GeV/c ↔ kg·m/s, ns ↔ s, cm⁻²s⁻¹ ↔ m⁻²s⁻¹, K ↔ °C) live in
`src/utils/units.ts`. Presentation-only formatting never feeds back into physics.

## Constants

`src/physics/constants/physicalConstants.ts` (CODATA 2018, PDG 2024, AME 2020) and
`acceleratorConstants.ts` (LHC Design Report, HL-LHC TDR, FCC-hh CDR/FS). Uncertain machine
parameters carry `verify: true`.

## Magnetic rigidity (`accelerator/MagneticRigidity.ts`)

    p [GeV/c] = 0.299792458 · |q/e| · B[T] · ρ[m]      Bρ [T·m] = p / (0.299792458 |q/e|)

No proton assumption: the charge state enters explicitly. Kinematics: E² = p² + m²,
γ = E/m, β = p/E, and 1 − β = m² / (E(E + p)) (cancellation-free). Checks: 7 TeV protons on
ρ = 2803.95 m need 8.33 T; 450 GeV need 0.535 T.

## Ions (`particles/IonDefinition.ts`)

Fully stripped nuclei, q = Ze. Nuclear mass m = M_atom·u − Z·m_e (electron binding energy
≲ 1 MeV neglected, < 1e-5 relative). Default ion momentum in a machine = Z × design proton
momentum (same dipole field, "proton-equivalent energy"). Reported: total energy, E/A, p/A,
√s and √s_NN = 2E/A for symmetric head-on collisions. Pb-208 at 7 Z TeV → E/A = 2.76 TeV,
√s_NN = 5.52 TeV. Neutrons are neutral and never offered as beams (validator error if forced).

## Synchrotron radiation (`accelerator/SynchrotronRadiation.ts`)

Isomagnetic ring, radiation only in dipoles:

    U₀ = Z² e² β³ γ⁴ / (3 ε₀ ρ)   ⇒   U₀ ∝ Z² E⁴ / (m⁴ ρ)

Cross-checks: electron 1 GeV, ρ = 1 m → 88.5 keV; LHC proton 7 TeV → 6.7 keV/turn. Also
reported: U₀/E, instantaneous power, critical photon energy ε_c = (3/2)ħcγ³/ρ, beam SR power
U₀·f_rev·N. Validator: U₀ > Z·V_RF → *SYNCHROTRON LOSS DOMINANT*; U₀ ≥ E → *NON-PHYSICAL*
(classical formula outside validity). Quantum excitation, damping and insertion radiation
are not modelled.

## Magnet margin & quench (`accelerator/MagnetModel.ts`)

Empirical upper critical field Bc2(T) = Bc2(0)(1 − (T/Tc0)^1.7) (Nb-Ti: 9.2 K / 14.5 T;
Nb₃Sn: 18 K / 28 T). The short-sample limit is anchored to one published operating point per
magnet type (LHC MB: 8.33 T at 1.9 K with 86 % load line) and scaled with Bc2(T).
Margin = 1 − B_op/B_ss(T); states STABLE (≥ 10 %), LOW_MARGIN, QUENCH_RISK (< 3 %), QUENCHED (≤ 0).
The quench timeline (detection → heaters → bypass-diode current decay τ ≈ 0.2 s → energy
extraction τ ≈ 104 s → cryogenic recovery) is illustrative; hot-spot temperature scales with the
dissipated fraction of stored energy ½LI². Not an FEM, conductor or thermal simulation.

## FODO optics (`beam/*`)

Symmetric cell ½QF–drift–QD–drift–½QF with thick-quadrupole matrices
(k = G/Bρ; focusing cos/sin, defocusing cosh/sinh) and drifts. Dipole weak focusing
(~1/ρ² ≈ 1e-7 m⁻²) is neglected. Periodic solution: cos μ = Tr(M)/2, β = M₁₂/sin μ,
α = (M₁₁ − M₂₂)/(2 sin μ); stable only for |cos μ| < 1. σ(s) = √(ε_n β(s)/(βγ)).
Physics mode sets G for 90° phase advance (thin-lens estimate) and checks the 223 T/m limit;
Sandbox can fix G so raising energy weakens focusing. LHC cross-check: β_max ≈ 180 m,
σ ≈ 0.3 mm at 7 TeV. Dispersion, chromaticity, coupling and insertions are omitted.

## Luminosity (`beam/BeamModel.ts`)

L = f_rev n_b N² / (4πσ*²) · F with σ*² = ε·β*. Reproduces ≈1e34 cm⁻²s⁻¹ for LHC design.
Levelling, hourglass, crab cavities: not modelled (HL-LHC quoted levelled value shown separately).

## Magnetic-field approximation (`propagation/*`, `detectors/*`)

`RegionalField` = cylindrical regions with analytic shapes (first match wins).
ATLAS: 2 T solenoid (r < 1.23 m, |z| < 2.65 m); averaged tile flux return ≈ −0.24 T (flux
conservation of the solenoid flux); 0 T in the LAr calorimeter gap; barrel and end-cap toroids
Bφ = B₀r₀/r (Ampère's law, 8-coil ripple ignored). CMS test configuration: uniform 3.8 T
solenoid, −1.8 T return yoke. ATLAS is deliberately not one uniform 2 T field.

## Track propagation (`propagation/TrackPropagator.ts`)

Path-length form of dp/dt = q v × B: dr/ds = u, du/ds = (κq/|p|) u × B (κ = 0.2998).
RK4 with the step limited by a maximum turning angle per step and 10 cm; u renormalized each
step; boundary crossings interpolated. Neutral particles: exact straight lines. Time of flight
t = s/(βc). Loopers stop after 1.5 turns. Importance tiers (by particle type/pT) change only
sampling density. Tests: helix radius R = pT/(κ|q|B) within 0.1 %, opposite curvature for
opposite charges, neutrals unbent. No energy loss, multiple scattering or bremsstrahlung.

## Detector response (`detector/DetectorResponse.ts`)

Parameterized, not Geant4. Tracker hits where charged trajectories cross barrel layers/disks
(efficiency + Gaussian rφ smearing). Calorimeters: impact point at the ECAL face; e/γ deposit
all energy in ECAL with a fixed 3×3 lateral profile; hadrons split randomly (10–50 % EM);
muons deposit fixed MIP amounts; energies smeared with s/√E ⊕ c (ATLAS ECAL 10 %/√E ⊕ 0.7 %,
HCAL 50 %/√E ⊕ 3 %). Muon hits at station crossings. Deterministic seeds per particle.

## Reconstruction (`reconstruction/*`)

Tracks: charged trajectories with pT > 0.5 GeV, |η| < 2.5, ≥ 7 hits; pT smeared with
σ/pT = 0.05 %·pT ⊕ 1 % (no track fit; vertexing replaced by truth association).
Muons: tracks with hits in ≥ 2 muon stations, combined resolution, track isolation.
EM clusters: 5×5 sliding window on local maxima; hadronic leakage cut; track match → electron,
no match → photon (direction from primary vertex to the cluster). Jets: anti-kT R = 0.4 on
towers (ECAL+HCAL on the HCAL grid), overlap removal with e/γ; heavy ions use median-ρ·πR²
subtraction. MET: −Σ(objects) − track soft term. Invariant masses from (P₁ + P₂)² of selected
pairs. Validated: Z→μμ mean 91.6 GeV, H→γγ 125.4 ± 1.4 GeV on the synthetic samples.

## Event samples (`scripts/toygen.ts`, `scripts/generate-events.ts`)

Offline toy generator (not PYTHIA): Breit–Wigner resonances decayed isotropically, toy
fragmentation conserving parton 3-momentum and (approximately) charge, soft underlying event,
2 pile-up vertices, K⁰_S/Λ secondary vertices, displaced b-hadron decays, Pb–Pb bulk with v₂.
Deterministic seeds `seedFrom(sample, index)`; every sample is labelled SYNTHETIC.

---

# Phase 2 additions

## Luminosity, rates, yields (`physics/luminosity/*`)
- Instantaneous luminosity L [cm⁻²s⁻¹] comes from the beam model. Event rate R = Lσ (produced,
  not recorded); integrated luminosity L_int = ∫L dt [fb⁻¹]; expected selected yield
  N = L_int σ ε (1 fb⁻¹ × 1 pb = 1000 events).
- Reference cross sections at √s ≈ 13–13.6 TeV (inelastic ≈ 80 mb, W→ℓν, Z→ℓℓ, tt̄ ≈ 924 pb,
  gg→H ≈ 52 pb, H→γγ with BR 2.27×10⁻³) are flagged VERIFY.

## Bunches and pile-up (`physics/bunches`, `physics/pileup`)
- 3564 slots of 24.95 ns (h = 35 640, every 10th RF bucket); educational scheme: trains of 48,
  7-slot gaps, 119-slot abort gap. f_rev = βc/C; crossing rate = n_filled·f_rev.
- μ = L σ_inel / (n_b f_rev) (≈ 50 at 2×10³⁴ cm⁻²s⁻¹ with 2808 bunches); P(≥1) = 1 − e^−μ.
- Pile-up: n ~ Poisson(μ) (exact inversion sampling), vertices Gaussian in the luminous region
  (σ_z ≈ 4 cm, VERIFY). Each interaction comes from a supplied minimum-bias sample or the toy model
  (dN_ch/dη ≈ 6 in |η| < 3, Gamma-fluctuated multiplicity, pT ~ Gamma(2, 0.25 GeV), π/K/p mix,
  π⁰→γγ). Deterministic seeds from (dataset, event, μ).

## Trigger (`physics/trigger/Trigger.ts`)
Level-1 on 0.1×0.1 calorimeter towers (1 GeV granularity), 8×8-tower jet windows, tower MET and
coarse muon pT; HLT on reconstructed objects with isolation. Items: single μ, single e, diphoton,
jet, MET with illustrative thresholds. Rates scale the crossing rate by accepted fractions; the UI
states that signal samples are not representative of the real input stream. Recorded data is not
re-triggered.

## Interaction-region optics (`physics/optics/*`)
- γ = (1 + α²)/β, σ = √(εβ), ε = ε_n/(βγ)_rel (single conversion point).
- From the IP waist β(s) = β* + s²/β*, then an inner triplet Q1(F)–Q2a(D)–Q2b(D)–Q3(F) with
  thick-quad matrices (k = G/(Bρ) at design energy; 205 T/m, L* = 23 m — VERIFY), mirror-symmetric.
  For β* = 30 cm the peak β ≈ 7.8 km.
- Crossing angle θ_c in the crossing plane (IP1 vertical, IP5 horizontal); separation θ_c·s,
  long-range encounters every c·Δt/2 ≈ 3.75 m (≈ 9–10 σ for Run-3-like values);
  Piwinski factor F = 1/√(1 + (θ_c σ_z / 2σ*)²) (≈ 0.64 at 320 µrad, β* = 30 cm).
- No matching section, dispersion, D1/D2 or coupling. TFS tables can be imported and are shown as-is.

## Field maps (`detector/fieldmaps/*`)
- `FiniteSolenoidField`: exact vacuum field of a current sheet via Bulirsch's cel (Derby & Olbert
  2010), checked against the on-axis formula and ∇·B = 0, normalized to the central field.
- `AxisymmetricFieldMap` (bilinear, z-mirror with Br odd), `GridFieldMap3D` (trilinear); outside the
  grid: zero, clamp or analytic fallback. API: `B = field.sample(position)`.
- Detector maps: ATLAS solenoid (a 1.23 m, L 5.3 m, 2 T) + regional toroids; CMS (3.15 m, 12.5 m,
  3.8 T) + regional yoke; ALICE L3 (5.93 m, 14.1 m, 0.5 T) + Gaussian 3 T·m muon dipole; LHCb dipole
  (By peak 1.05 T, ∫B dl ≈ 4.2 T·m) on a 3D grid. Vacuum solenoids ignore iron (stronger end fall-off).
- Integrators: RK4 (Phase 1) or Dormand–Prince 5(4) with embedded error control (default for maps).

## Detector response and PID (`detector/response/*`)
- Scales on hit efficiency, hit resolution, momentum resolution, calorimeter smearing and energy
  scale; tracking-acceptance override; dead channels (fixed hash map per detector: tracker modules in
  48 φ sectors per layer side, calorimeter cells); noisy cells (Poisson count, exponential energy).
- Hits are placed on the local helix arc through three trajectory samples (exact in a uniform field).
- PID: ALEPH-type Bethe–Bloch for TPC dE/dx (normalized to the MIP, 5.5 %), TOF t = L/(βc) with
  80 ps, RICH cos θ_c = 1/(nβ) (C₄F₁₀ n = 1.0014, CF₄ n = 1.0005) with angle resolutions and threshold
  (veto) information; hypothesis by minimum χ² over e, μ, π, K, p.

## Reconstruction — Phase 2 layer (`physics/reconstruction/AdvancedReconstruction.ts`)
- **Kalman-like track fit** (`physics/fitting/KalmanTrackFit.ts`): perigee state (d₀, φ₀, ρ), F = I,
  Q from Highland scattering (x/X₀ configurable; 0 by default because the propagation has no
  scattering), measurement φ at each hit radius, numerical Jacobian, iterated measurement update,
  3-hit circle seed. Hits near a looper's turning point (r > 0.9·2R) and after gaps > 0.5 m are
  excluded. z₀ and cot θ from a straight-line fit in (s, z) with per-technology z smearing. The helix
  uses the mean Bz over the track's hits; in non-uniform maps the fitted pT differs from vertex truth
  by O(1 %) (Br components change pT physically). Not production reconstruction.
- **Vertices**: beam-line tracks (|d₀| < 1 mm) clustered in z₀ (1 mm gaps); primary = max Σ pT².
  Displaced: opposite-charge pairs with |d₀|/σ > 4, transverse circle intersection, K⁰_S/Λ mass tags.
- **Topo-clusters**: 4-2-0 thresholds, 8-connectivity, σ_noise = ½ cell threshold, no splitting.
- **Generalized kT**: d_ij = min(kT_i^2p, kT_j^2p)·ΔR²/R², d_iB = kT_i^2p, p = −1/0/1; E-scheme;
  N² nearest-neighbour strategy; identical to the Phase 1 anti-kT on the same inputs.
- **MET**: −Σ(topo-cluster ET vectors + muon pT), shown next to the Phase 1 track soft-term MET.

## Quench V2 (`accelerator/QuenchModelV2.ts`)
L dI/dt = −(R_nz + R_dump)·I; enthalpy balance of the lumped normal zone
dU/dt = I²R − P_cool + u(T_op)·dV/dt; adiabatic hot spot C(T) dT/dt = ρ_Cu(T)·J_Cu·J; Wilson
propagation velocity with Wiedemann–Franz conductivity; Nb-Ti T_c(B) = T_c0 (1 − B/B_c20)^0.59 and
current-sharing temperature; minimum quench energy; detection (100 mV for 10 ms), heaters after a
delay, extraction switch at detection. C(T): Debye-like metal term + effective liquid-helium term
(sets v ≈ 8 m/s and MQE ≈ mJ). LHC dipole: τ ≈ 0.2 s, hot spot ≈ 190 K with heaters, lower with
energy extraction, much higher without heaters. All parameters VERIFY.

## Histogram fits (`analysis/fitting/HistogramFit.ts`)
Binned Poisson likelihood Σ(ν − n ln ν), Levenberg–Marquardt on the Fisher information, bounds on
yield, position and width, two stages for background models (peak fixed, then all free). Errors from
the inverse Fisher matrix; Pearson χ²/ndf; S/√B in μ ± 2σ (educational). Tests check pulls over
pseudo-experiments.
