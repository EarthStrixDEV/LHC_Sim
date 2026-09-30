import type { MachinePreset } from '../physics/accelerator/MachinePreset';
import { SANDBOX_DIPOLE } from '../physics/accelerator/MagnetModel';
import { LHC_PRESET } from './lhc';

/**
 * Sandbox: LHC geometry, but energy, field, temperature and species can be set
 * independently. Nothing is clamped — the validator reports consequences instead.
 */
export const SANDBOX_PRESET: MachinePreset = {
  ...LHC_PRESET,
  id: 'sandbox',
  name: 'Sandbox',
  status: 'sandbox',
  description:
    'Experimental playground on LHC geometry. Operating restrictions are removed, but physics feasibility is still evaluated and reported.',
  dipoleMagnet: SANDBOX_DIPOLE,
  allowedSpecies: 'any',
  highlights: ['No clamping: invalid configurations are allowed and explained'],
  enforceLimits: false,
};
