/**
 * Luminosity, cross sections, rates and yields — kept as distinct quantities:
 *
 *   instantaneous luminosity  L      [cm⁻² s⁻¹]
 *   integrated luminosity     L_int  [fb⁻¹]      (= ∫ L dt)
 *   cross section             σ      [pb]         (process property)
 *   event rate                R = L σ           [Hz]   — events PRODUCED per second
 *   expected yield            N ≈ L_int σ ε            — events SELECTED (ε = acceptance × efficiency)
 *
 * Produced ≠ recorded: the trigger keeps ~1 kHz of a ~40 MHz crossing rate (see trigger/).
 */
import type { SourcedValue } from '../constants/acceleratorConstants';

export const CM2_PER_PB = 1e-36;
export const CM2_PER_MB = 1e-27;
/** 1 fb⁻¹ = 10³⁹ cm⁻². */
export const INV_CM2_PER_INV_FB = 1e39;

/** R = L σ  [Hz]. */
export function eventRateHz(luminosityCm2s: number, sigmaPb: number): number {
  return luminosityCm2s * sigmaPb * CM2_PER_PB;
}

/** L_int [fb⁻¹] delivered by a constant luminosity over `seconds`. */
export function integratedLuminosityInvFb(luminosityCm2s: number, seconds: number): number {
  return (luminosityCm2s * seconds) / INV_CM2_PER_INV_FB;
}

/** N ≈ L_int σ ε  (σ in pb, L_int in fb⁻¹ → 1 fb⁻¹ × 1 pb = 1000 events). */
export function expectedYield(intLumiInvFb: number, sigmaPb: number, efficiency = 1): number {
  if (efficiency < 0 || efficiency > 1) throw new RangeError('efficiency must be within [0, 1]');
  return intLumiInvFb * 1e3 * sigmaPb * efficiency;
}

/**
 * Reference cross sections for pp at √s ≈ 13–13.6 TeV (educational, order-of-magnitude
 * quality; flagged VERIFY — quote primary references before using quantitatively).
 */
export const REFERENCE_CROSS_SECTIONS: Record<string, SourcedValue & { label: string }> = {
  inelastic: { label: 'Inelastic pp (σ_inel)', value: 80e9, unit: 'pb', source: 'ATLAS/CMS/TOTEM measurements at 13 TeV (≈ 78–80 mb)', verify: true },
  wLnu: { label: 'W → ℓν (one lepton flavour)', value: 20.6e3, unit: 'pb', source: 'ATLAS/CMS 13 TeV measurements (W⁺+W⁻, ≈ 20 nb)', verify: true },
  zLL: { label: 'Z/γ* → ℓℓ (66 < m < 116 GeV, one flavour)', value: 1.95e3, unit: 'pb', source: 'ATLAS/CMS 13 TeV measurements (≈ 1.9–2.0 nb)', verify: true },
  ttbar: { label: 'tt̄', value: 924, unit: 'pb', source: 'NNLO+NNLL prediction at 13.6 TeV (Top++), consistent with Run-3 measurements', verify: true },
  higgsGgf: { label: 'gg → H (m_H = 125 GeV)', value: 52.2, unit: 'pb', source: 'LHC Higgs WG (N3LO), 13.6 TeV', verify: true },
  higgsDiphoton: { label: 'gg → H → γγ (BR ≈ 2.27×10⁻³)', value: 52.2 * 2.27e-3, unit: 'pb', source: 'LHC Higgs WG σ × BR', verify: true },
};

export interface RateRow {
  readonly key: string;
  readonly label: string;
  readonly sigmaPb: number;
  readonly rateHz: number;
  readonly yieldPerInvFb: number;
}

export function rateTable(luminosityCm2s: number): RateRow[] {
  return Object.entries(REFERENCE_CROSS_SECTIONS).map(([key, x]) => ({
    key,
    label: x.label,
    sigmaPb: x.value,
    rateHz: eventRateHz(luminosityCm2s, x.value),
    yieldPerInvFb: expectedYield(1, x.value),
  }));
}
