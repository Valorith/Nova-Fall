/**
 * Generates plain language tooltips for AI behavior tree nodes
 */

import type { BehaviorNodeType } from '@nova-fall/shared';
import { CONDITION_DEFINITIONS, ACTION_DEFINITIONS, NODE_DESCRIPTIONS } from '@nova-fall/shared';

export interface NodeData {
  type: BehaviorNodeType;
  label: string;
  conditionId?: string;
  actionId?: string;
  params: Record<string, unknown>;
}

/**
 * Generate a human-readable tooltip for a behavior tree node
 */
export function generateNodeTooltip(data: NodeData, childCount = 0): string {
  const type = data.type;

  // Composite nodes
  if (type === 'selector') {
    const suffix = childCount > 0 ? ` (${childCount} ${childCount === 1 ? 'child' : 'children'})` : '';
    return `Tries each child in order until one succeeds${suffix}`;
  }
  if (type === 'sequence') {
    const suffix = childCount > 0 ? ` (${childCount} ${childCount === 1 ? 'child' : 'children'})` : '';
    return `Runs each child in order until one fails${suffix}`;
  }
  if (type === 'parallel') {
    const policy = (data.params?.policy as string) || 'all';
    const policyText = policy === 'all' ? 'all must succeed' : 'one must succeed';
    const suffix = childCount > 0 ? ` (${childCount} ${childCount === 1 ? 'child' : 'children'})` : '';
    return `Runs all children simultaneously - ${policyText}${suffix}`;
  }

  // Decorator nodes
  if (type === 'inverter') {
    return 'Inverts the result: success becomes failure, failure becomes success';
  }
  if (type === 'succeeder') {
    return 'Always returns success, regardless of child result';
  }
  if (type === 'repeater') {
    const count = (data.params?.count as number) ?? 3;
    return `Repeats child ${count} ${count === 1 ? 'time' : 'times'}`;
  }
  if (type === 'until_fail') {
    return 'Repeats child continuously until it returns failure';
  }

  // Condition nodes - generate readable description
  if (type === 'condition' && data.conditionId) {
    return generateConditionTooltip(data.conditionId, data.params);
  }

  // Action nodes - generate readable description
  if (type === 'action' && data.actionId) {
    return generateActionTooltip(data.actionId, data.params);
  }

  // Fallback to base description
  return NODE_DESCRIPTIONS[type] || 'Unknown node type';
}

/**
 * Generate tooltip for a condition node based on its definition and params
 */
function generateConditionTooltip(conditionId: string, params: Record<string, unknown>): string {
  const def = CONDITION_DEFINITIONS.find((d) => d.id === conditionId);
  if (!def) return 'Unknown condition';

  switch (conditionId) {
    case 'health_check': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 50;
      const isPercent = params.type !== 'absolute';
      return `Check if health is ${op} ${val}${isPercent ? '%' : ''}`;
    }
    case 'shield_check': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 50;
      const isPercent = params.type !== 'absolute';
      return `Check if shield is ${op} ${val}${isPercent ? '%' : ''}`;
    }
    case 'is_state': {
      const state = params.state ?? 'idle';
      return `Check if unit is ${state}`;
    }
    case 'cooldown_ready':
      return 'Check if attack cooldown has finished';
    case 'has_target':
      return 'Check if unit has an active target';
    case 'target_in_range': {
      const mult = (params.range_mult as number) ?? 1.0;
      if (mult === 1.0) return 'Check if target is within attack range';
      return `Check if target is within ${mult}x attack range`;
    }
    case 'target_health': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 50;
      return `Check if target health is ${op} ${val}%`;
    }
    case 'ally_nearby': {
      const radius = params.radius ?? 5;
      return `Check if ally is within ${radius} tiles`;
    }
    case 'ally_low_health': {
      const radius = params.radius ?? 10;
      const threshold = params.threshold ?? 40;
      return `Check if ally within ${radius} tiles has health below ${threshold}%`;
    }
    case 'enemy_count': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 0;
      const radius = params.radius ?? 10;
      return `Check if enemy count ${op} ${val} within ${radius} tiles`;
    }
    case 'enemy_type_nearby': {
      const type = params.type ?? 'any';
      const radius = params.radius ?? 8;
      const typeLabel = type === 'any' ? 'enemy' : formatType(type as string);
      return `Check if ${typeLabel} is within ${radius} tiles`;
    }
    case 'distance_to_core': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 10;
      return `Check if distance to enemy core is ${op} ${val} tiles`;
    }
    case 'in_spawn_zone':
      return 'Check if unit is in spawn area';
    case 'random_chance': {
      const percent = params.percent ?? 50;
      return `${percent}% chance to succeed`;
    }
    default:
      return def.description;
  }
}

/**
 * Generate tooltip for an action node based on its definition and params
 */
function generateActionTooltip(actionId: string, params: Record<string, unknown>): string {
  const def = ACTION_DEFINITIONS.find((d) => d.id === actionId);
  if (!def) return 'Unknown action';

  switch (actionId) {
    case 'attack_target':
      return 'Attack the current target';
    case 'attack_nearest': {
      const filter = params.filter ?? 'any';
      if (filter === 'any') return 'Attack the nearest enemy';
      return `Attack the nearest ${formatType(filter as string)}`;
    }
    case 'attack_priority': {
      const p1 = params.priority_1 ?? 'lowest_health';
      const p2 = params.priority_2 ?? 'closest';
      return `Attack by priority: ${formatPriority(p1 as string)}, then ${formatPriority(p2 as string)}`;
    }
    case 'set_target': {
      const filter = params.filter ?? 'nearest';
      return `Set target to ${formatTargetFilter(filter as string)}`;
    }
    case 'clear_target':
      return 'Clear current target';
    case 'move_to_target':
      return 'Move toward current target';
    case 'move_to_position': {
      const x = params.x ?? 30;
      const z = params.z ?? 30;
      return `Move to tile (${x}, ${z})`;
    }
    case 'follow_flow_field':
      return 'Move toward enemy core using pathfinding';
    case 'retreat_to_spawn':
      return 'Retreat to spawn area';
    case 'hold_position':
      return 'Stop and hold current position';
    case 'protect_ally': {
      const filter = params.filter ?? 'lowest_health';
      const radius = params.radius ?? 10;
      return `Protect ${formatAllyFilter(filter as string)} ally within ${radius} tiles`;
    }
    default:
      return def.description;
  }
}

// Helper functions for formatting
function formatOperator(op: string): string {
  const ops: Record<string, string> = {
    '<': 'less than',
    '<=': 'at most',
    '>': 'greater than',
    '>=': 'at least',
    '==': 'equal to',
  };
  return ops[op] || op;
}

function formatType(type: string): string {
  const types: Record<string, string> = {
    any: 'enemy',
    unit: 'unit',
    building: 'building',
    turret: 'turret',
    infantry: 'infantry',
    combat_vehicle: 'combat vehicle',
    support_vehicle: 'support vehicle',
  };
  return types[type] || type;
}

function formatPriority(priority: string): string {
  const priorities: Record<string, string> = {
    lowest_health: 'lowest health',
    highest_health: 'highest health',
    closest: 'closest',
    highest_damage: 'highest damage',
    turrets: 'turrets',
    support: 'support units',
  };
  return priorities[priority] || priority;
}

function formatTargetFilter(filter: string): string {
  const filters: Record<string, string> = {
    nearest: 'nearest enemy',
    lowest_health: 'enemy with lowest health',
    highest_threat: 'highest threat enemy',
    buildings: 'nearest building',
    core: 'enemy core',
  };
  return filters[filter] || filter;
}

function formatAllyFilter(filter: string): string {
  const filters: Record<string, string> = {
    lowest_health: 'lowest health',
    nearest: 'nearest',
    highest_value: 'highest value',
  };
  return filters[filter] || filter;
}
