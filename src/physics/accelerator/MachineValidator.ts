/**
 * Feasibility checks for an accelerator configuration. Produces explained warnings,
 * never clamps values.
 */
import type { MagnetOperatingPoint } from './MagnetModel';
import type { MachinePreset } from './MachinePreset';
import type { BeamSpecies } from '../particles/ParticleDefinition';
import type { SynchrotronResult } from './SynchrotronRadiation';
import { formatEnergyGeV, formatNumber } from '../../utils/units';

export type WarningCode =
  | 'FIELD_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_MAGNETIC_RIGIDITY'
  | 'ORBIT_MISMATCH'
  | 'SYNCHROTRON_LOSS_DOMINANT'
  | 'SYNCHROTRON_LOSS_HIGH'
  | 'CRYOGENIC_MARGIN_EXCEEDED'
  | 'LOW_MAGNET_MARGIN'
  | 'UNSUPPORTED_CIRCULATING_PARTICLE'
  | 'UNSTABLE_BEAM_PARTICLE'
  | 'MACHINE_CONFIGURATION_NON_PHYSICAL'
  | 'CONCEPT_MACHINE'
  | 'OPTICS_UNSTABLE'
  | 'QUAD_GRADIENT_LIMIT';

export type Severity = 'info' | 'warning' | 'error';

export interface PhysicsWarning {
  readonly code: WarningCode;
  readonly severity: Severity;
  /** Upper-case label shown in the UI, e.g. "FIELD LIMIT EXCEEDED". */
  readonly title: string;
  /** Short physical explanation (always present). */
  readonly explanation: string;
}

export type Feasibility = 'FEASIBLE' | 'MARGINAL' | 'INFEASIBLE' | 'NON_PHYSICAL';

/**
 * Relative momentum error the ring tolerates before the closed orbit leaves the aperture.
 * Order of magnitude of the LHC momentum acceptance (~1e-3). Educational threshold.
 */
export const MOMENTUM_ACCEPTANCE = 1e-3;

/** U₀ above this fraction of the maximum RF energy gain per turn triggers a warning. */
export const RF_LOSS_WARNING_FRACTION = 0.1;

export interface ValidationContext {
  readonly machine: MachinePreset;
  readonly species: BeamSpecies;
  readonly mode: 'physics' | 'sandbox';
  readonly requestedEnergyBelowRest: boolean;
  readonly rigidityTm: number;
  readonly ringBendingRadiusM: number;
  readonly operatingFieldT: number;
  readonly requiredFieldT: number;
  readonly totalEnergyGeV: number;
  readonly gamma: number;
  readonly revolutionFrequencyHz: number;
  readonly temperatureK: number;
  readonly synchrotron: SynchrotronResult;
  readonly magnet: MagnetOperatingPoint;
}

export function validateMachine(ctx: ValidationContext): { warnings: PhysicsWarning[]; feasibility: Feasibility } {
  const w: PhysicsWarning[] = [];
  const { machine, species, mode } = ctx;
  const enforce = mode === 'physics';

  // --- Species -----------------------------------------------------------------------
  if (!species.circulatable || species.chargeE === 0) {
    w.push({
      code: 'UNSUPPORTED_CIRCULATING_PARTICLE',
      severity: 'error',
      title: 'UNSUPPORTED CIRCULATING PARTICLE',
      explanation:
        species.notCirculatableReason ??
        `${species.label} is electrically neutral; a magnetic ring cannot steer it (F = q v×B = 0).`,
    });
  } else if (machine.allowedSpecies !== 'any' && !machine.allowedSpecies.includes(species.id)) {
    w.push({
      code: 'UNSUPPORTED_CIRCULATING_PARTICLE',
      severity: enforce ? 'error' : 'info',
      title: 'UNSUPPORTED CIRCULATING PARTICLE',
      explanation:
        `${machine.name} has no injector chain, RF or vacuum/beam-screen design for ${species.label} beams. ` +
        (enforce ? 'Switch to Sandbox to explore it hypothetically.' : 'Evaluated hypothetically in Sandbox.'),
    });
  }

  if (species.properLifetimeS !== undefined && Number.isFinite(ctx.gamma)) {
    const labLifetime = species.properLifetimeS * ctx.gamma;
    const turns = labLifetime * ctx.revolutionFrequencyHz;
    w.push({
      code: 'UNSTABLE_BEAM_PARTICLE',
      severity: turns < 1e4 ? 'warning' : 'info',
      title: 'UNSTABLE BEAM PARTICLE',
      explanation: `${species.label} decays: time-dilated lifetime γτ = ${formatNumber(labLifetime, 3)} s ≈ ${formatNumber(turns, 3)} turns. A collider would need to accelerate and collide within that time.`,
    });
  }

  // --- Energy / configuration sanity ----------------------------------------------------
  if (ctx.requestedEnergyBelowRest) {
    w.push({
      code: 'MACHINE_CONFIGURATION_NON_PHYSICAL',
      severity: 'error',
      title: 'MACHINE CONFIGURATION NON-PHYSICAL',
      explanation: 'Requested total energy is below the rest energy mc²; no real particle has E < mc². Momentum was evaluated as zero.',
    });
  }
  if (ctx.temperatureK <= 0) {
    w.push({
      code: 'MACHINE_CONFIGURATION_NON_PHYSICAL',
      severity: 'error',
      title: 'MACHINE CONFIGURATION NON-PHYSICAL',
      explanation: 'Absolute zero (0 K) or negative temperature is not reachable by a cryogenic system (third law of thermodynamics).',
    });
  }

  // --- Field limit ------------------------------------------------------------------------
  if (ctx.operatingFieldT > machine.dipoleFieldLimitT * (1 + 1e-9)) {
    w.push({
      code: 'FIELD_LIMIT_EXCEEDED',
      severity: enforce ? 'error' : 'warning',
      title: 'FIELD LIMIT EXCEEDED',
      explanation:
        `Dipoles would need ${ctx.operatingFieldT.toFixed(2)} T but ${machine.name} dipoles are rated for ` +
        `${machine.dipoleFieldLimitT.toFixed(2)} T. Higher energy needs stronger magnets or a larger ring (p = 0.2998·Z·B·ρ).`,
    });
  }

  // --- Orbit closure (Sandbox: user-set field vs beam rigidity) --------------------------
  const ringRigidity = ctx.operatingFieldT * ctx.ringBendingRadiusM;
  if (Number.isFinite(ctx.rigidityTm) && ctx.rigidityTm > 0) {
    const mismatch = ringRigidity / ctx.rigidityTm - 1;
    if (mismatch < -MOMENTUM_ACCEPTANCE) {
      w.push({
        code: 'INSUFFICIENT_MAGNETIC_RIGIDITY',
        severity: 'error',
        title: 'INSUFFICIENT MAGNETIC RIGIDITY',
        explanation:
          `Beam rigidity Bρ = ${formatNumber(ctx.rigidityTm, 5)} T·m exceeds what the ring provides ` +
          `(B·ρ = ${formatNumber(ringRigidity, 5)} T·m). The orbit radius would be ${formatNumber(Math.abs(mismatch) * 100, 3)} % too large; the beam hits the outer aperture within a turn.`,
      });
    } else if (mismatch > MOMENTUM_ACCEPTANCE) {
      w.push({
        code: 'ORBIT_MISMATCH',
        severity: 'error',
        title: 'ORBIT MISMATCH (OVER-BENDING)',
        explanation:
          `The dipole field bends this beam ${formatNumber(mismatch * 100, 3)} % more than the ring geometry allows ` +
          `(acceptance ≈ ±${MOMENTUM_ACCEPTANCE * 100} %). The beam spirals onto the inner wall.`,
      });
    }
  }

  // --- Magnet margin ---------------------------------------------------------------------
  const mag = ctx.magnet;
  if (mag.state === 'QUENCHED') {
    w.push({
      code: 'CRYOGENIC_MARGIN_EXCEEDED',
      severity: 'error',
      title: 'CRYOGENIC MARGIN EXCEEDED',
      explanation:
        `At ${ctx.temperatureK.toFixed(2)} K the ${mag.spec.label} can carry at most ≈${mag.shortSampleFieldT.toFixed(2)} T ` +
        `(simplified critical surface). Operating at ${mag.operatingFieldT.toFixed(2)} T the coil turns resistive → quench.`,
    });
  } else if (mag.state === 'QUENCH_RISK' || mag.state === 'LOW_MARGIN') {
    w.push({
      code: 'LOW_MAGNET_MARGIN',
      severity: mag.state === 'QUENCH_RISK' ? 'warning' : 'info',
      title: mag.state === 'QUENCH_RISK' ? 'QUENCH RISK' : 'LOW MAGNET MARGIN',
      explanation: `Load-line margin ${(mag.margin * 100).toFixed(1)} % (${ctx.temperatureK.toFixed(2)} K). Small beam losses or temperature excursions could trigger a quench.`,
    });
  }

  // --- Synchrotron radiation ---------------------------------------------------------------
  const sr = ctx.synchrotron;
  const rfGainGeV = Math.abs(species.chargeE) * machine.rfVoltagePerBeamMV * 1e-3;
  if (sr.energyLossPerTurnGeV >= ctx.totalEnergyGeV && ctx.totalEnergyGeV > 0) {
    w.push({
      code: 'MACHINE_CONFIGURATION_NON_PHYSICAL',
      severity: 'error',
      title: 'MACHINE CONFIGURATION NON-PHYSICAL',
      explanation:
        `Classical estimate gives a loss per turn (${formatEnergyGeV(sr.energyLossPerTurnGeV)}) larger than the beam energy itself — ` +
        'the particle would radiate away its energy within one turn. The formula is outside its validity; such a beam cannot exist.',
    });
  }
  if (rfGainGeV > 0 && sr.energyLossPerTurnGeV > rfGainGeV) {
    w.push({
      code: 'SYNCHROTRON_LOSS_DOMINANT',
      severity: 'error',
      title: 'SYNCHROTRON LOSS DOMINANT',
      explanation:
        `Each particle radiates ${formatEnergyGeV(sr.energyLossPerTurnGeV)} per turn but the RF can restore at most ` +
        `${formatEnergyGeV(rfGainGeV)} (${machine.rfVoltagePerBeamMV} MV × |q|). U₀ ∝ E⁴/(m⁴ρ): light particles at high energy need huge rings.`,
    });
  } else if (rfGainGeV > 0 && sr.energyLossPerTurnGeV > RF_LOSS_WARNING_FRACTION * rfGainGeV) {
    w.push({
      code: 'SYNCHROTRON_LOSS_HIGH',
      severity: 'warning',
      title: 'HIGH SYNCHROTRON LOSS',
      explanation: `Loss per turn is ${((sr.energyLossPerTurnGeV / rfGainGeV) * 100).toFixed(0)} % of the maximum RF energy gain.`,
    });
  }

  if (machine.status === 'concept') {
    w.push({
      code: 'CONCEPT_MACHINE',
      severity: 'info',
      title: 'CONCEPT MACHINE',
      explanation: `${machine.name} is a study, not a built accelerator. Parameters are provisional.`,
    });
  }

  return { warnings: w, feasibility: classify(w) };
}

function classify(w: readonly PhysicsWarning[]): Feasibility {
  if (w.some((x) => x.code === 'MACHINE_CONFIGURATION_NON_PHYSICAL' && x.severity === 'error')) return 'NON_PHYSICAL';
  if (w.some((x) => x.severity === 'error')) return 'INFEASIBLE';
  if (w.some((x) => x.severity === 'warning')) return 'MARGINAL';
  return 'FEASIBLE';
}
