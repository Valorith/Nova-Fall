/**
 * Combat logic module
 *
 * Provides combat calculation functions for the game server/worker.
 */

export {
  calculateDamageAfterArmor,
  applyDamage,
  isInRange,
  euclideanDistance,
  findNearestTarget,
  attackCooldownMs,
  processAttack,
} from './damage.js';

export type { DamageResult, UnitCombatState } from './damage.js';

export { CombatSimulator } from './simulator.js';

export type {
  SimUnit,
  SimBuilding,
  SimCore,
  CombatEvent,
  FlowFieldData,
  CombatSimState,
} from './simulator.js';
