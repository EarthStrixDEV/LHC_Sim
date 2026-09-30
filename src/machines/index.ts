import type { MachineId, MachinePreset } from '../physics/accelerator/MachinePreset';
import { FCC_HH_PRESET } from './fccHh';
import { HL_LHC_PRESET } from './hlLhc';
import { LHC_PRESET } from './lhc';
import { SANDBOX_PRESET } from './sandbox';

export const MACHINE_PRESETS: readonly MachinePreset[] = [LHC_PRESET, HL_LHC_PRESET, FCC_HH_PRESET, SANDBOX_PRESET];

export function machineById(id: MachineId): MachinePreset {
  const m = MACHINE_PRESETS.find((p) => p.id === id);
  if (!m) throw new Error(`Unknown machine preset: ${id}`);
  return m;
}
