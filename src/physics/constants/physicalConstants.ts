/**
 * Fundamental physical constants.
 *
 * Sources:
 *   [CODATA2018] E. Tiesinga et al., "CODATA recommended values of the fundamental
 *                physical constants: 2018", Rev. Mod. Phys. 93, 025010 (2021).
 *   [PDG2024]    Particle Data Group, S. Navas et al., Phys. Rev. D 110, 030001 (2024).
 *   [AME2020]    M. Wang et al., "The AME 2020 atomic mass evaluation",
 *                Chinese Phys. C 45, 030003 (2021).
 *
 * Exact values (SI 2019 redefinition) are marked "exact".
 */

/** Speed of light in vacuum [m/s] (exact). */
export const SPEED_OF_LIGHT_M_PER_S = 299_792_458;

/** Elementary charge [C] (exact). */
export const ELEMENTARY_CHARGE_C = 1.602_176_634e-19;

/** Vacuum electric permittivity ε0 [F/m] [CODATA2018]. */
export const VACUUM_PERMITTIVITY_F_PER_M = 8.854_187_8128e-12;

/** Boltzmann constant [J/K] (exact). */
export const BOLTZMANN_J_PER_K = 1.380_649e-23;

/**
 * Rigidity conversion constant:  p[GeV/c] = RIGIDITY_GEV_PER_TM · |q/e| · B[T] · ρ[m].
 * Numerically equal to c / 1e9 (exact), because p[GeV/c] = q·B·ρ·c / (e·1e9).
 */
export const RIGIDITY_GEV_PER_TM = SPEED_OF_LIGHT_M_PER_S / 1e9; // 0.299792458

// ---- Particle masses [GeV/c²] -----------------------------------------------------------

/** Electron mass [PDG2024]: 0.51099895000 MeV. */
export const ELECTRON_MASS_GEV = 0.000_510_998_950;
/** Muon mass [PDG2024]: 105.6583755 MeV. */
export const MUON_MASS_GEV = 0.105_658_3755;
/** Proton mass [PDG2024]: 938.27208816 MeV. */
export const PROTON_MASS_GEV = 0.938_272_088_16;
/** Neutron mass [PDG2024]: 939.56542052 MeV. */
export const NEUTRON_MASS_GEV = 0.939_565_420_52;
/** Charged pion mass [PDG2024]: 139.57039 MeV. */
export const PION_CHARGED_MASS_GEV = 0.139_570_39;
/** Neutral pion mass [PDG2024]: 134.9768 MeV. */
export const PION_NEUTRAL_MASS_GEV = 0.134_9768;
/** Charged kaon mass [PDG2024]: 493.677 MeV. */
export const KAON_CHARGED_MASS_GEV = 0.493_677;
/** Neutral kaon mass [PDG2024]: 497.611 MeV. */
export const KAON_NEUTRAL_MASS_GEV = 0.497_611;
/** Λ baryon mass [PDG2024]: 1115.683 MeV. */
export const LAMBDA_MASS_GEV = 1.115_683;
/** B± meson mass [PDG2024]: 5279.34 MeV. */
export const B_MESON_MASS_GEV = 5.279_34;

/** Z boson mass and width [PDG2024]. */
export const Z_MASS_GEV = 91.1876;
export const Z_WIDTH_GEV = 2.4952;
/** W boson mass and width [PDG2024 world average]. */
export const W_MASS_GEV = 80.3692;
export const W_WIDTH_GEV = 2.085;
/** Top-quark mass (direct measurements) and width [PDG2024]. */
export const TOP_MASS_GEV = 172.57;
export const TOP_WIDTH_GEV = 1.42;
/** Higgs boson mass [PDG2024: 125.20 ± 0.11 GeV]. */
export const HIGGS_MASS_GEV = 125.2;

// ---- Proper decay lengths cτ [m] [PDG2024] ------------------------------------------------

export const CTAU_K0S_M = 0.026_84;
export const CTAU_LAMBDA_M = 0.078_9;
export const CTAU_B_MESON_M = 0.000_491_1;

// ---- Nuclear physics ---------------------------------------------------------------------

/** Atomic mass unit u [GeV/c²] [CODATA2018]: 931.49410242 MeV. */
export const ATOMIC_MASS_UNIT_GEV = 0.931_494_102_42;
