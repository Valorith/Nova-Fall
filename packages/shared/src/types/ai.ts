/**
 * AI Behavior Tree types for the AI Editor
 * Used by units and buildings to define combat behavior
 */

// ==================== NODE TYPES ====================

export type CompositeNodeType = 'selector' | 'sequence' | 'parallel';
export type DecoratorNodeType = 'inverter' | 'succeeder' | 'repeater' | 'until_fail';
export type LeafNodeType = 'condition' | 'action';
export type BehaviorNodeType = CompositeNodeType | DecoratorNodeType | LeafNodeType;

// ==================== NODE STRUCTURES ====================

/**
 * A node in the behavior tree
 */
export interface BehaviorNode {
  id: string;
  type: BehaviorNodeType;
  label: string;
  params: Record<string, unknown>;
  position: { x: number; y: number };
}

/**
 * An edge connecting two nodes
 */
export interface BehaviorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  order?: number; // For composite children ordering
}

/**
 * Complete behavior tree structure
 */
export interface BehaviorTree {
  version: 1;
  category: 'unit' | 'building';
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
  rootId: string;
}

// ==================== PARAMETER DEFINITIONS ====================

export type ParamType = 'number' | 'string' | 'boolean' | 'select';

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  name: string;
  type: ParamType;
  label: string;
  description?: string;
  default?: unknown;
  options?: ParamOption[]; // For select type
  min?: number;
  max?: number;
  required?: boolean;
}

// ==================== CONDITION/ACTION DEFINITIONS ====================

export interface ConditionDef {
  id: string;
  name: string;
  description: string;
  category: string;
  params: ParamDef[];
}

export interface ActionDef {
  id: string;
  name: string;
  description: string;
  category: string;
  params: ParamDef[];
}

// ==================== RUNTIME TYPES ====================

export type NodeResult = 'success' | 'failure' | 'running';

/**
 * Context available to AI during combat tick evaluation
 */
export interface AIContext {
  unit: {
    id: string;
    x: number;
    z: number;
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
    state: string;
    targetId: string | null;
    stats: {
      damage: number;
      armor: number;
      range: number;
      speed: number;
      attackSpeed: number;
    };
  };
  enemies: {
    id: string;
    x: number;
    z: number;
    health: number;
    maxHealth: number;
    type: string;
    isBuilding: boolean;
  }[];
  allies: {
    id: string;
    x: number;
    z: number;
    health: number;
    maxHealth: number;
    type: string;
  }[];
  buildings: {
    id: string;
    x: number;
    z: number;
    health: number;
    maxHealth: number;
    type: string;
    isEnemy: boolean;
  }[];
  core: {
    x: number;
    z: number;
    health: number;
    maxHealth: number;
  };
  flowField: {
    getDirection: (x: number, z: number) => { dx: number; dz: number } | null;
    getDistance: (x: number, z: number) => number;
  };
  currentTime: number;
}

// ==================== DATABASE TYPES ====================

/**
 * AI Preset as stored in the database
 */
export interface DbAIPreset {
  id: string;
  name: string;
  description: string | null;
  category: 'unit' | 'building';
  treeData: BehaviorTree;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;

  // Relations (counts for display)
  unitDefinitions?: { id: string; name: string }[];
  buildingDefinitions?: { id: string; name: string }[];
  _count?: {
    unitDefinitions: number;
    buildingDefinitions: number;
  };
}

/**
 * Input for creating/updating AI presets
 */
export interface DbAIPresetInput {
  name: string;
  description?: string | null;
  category: 'unit' | 'building';
  treeData: BehaviorTree;
  isTemplate?: boolean;
}

// ==================== VALIDATION TYPES ====================

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  nodeId?: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ==================== BUILT-IN CONDITIONS ====================

export const CONDITION_DEFINITIONS: ConditionDef[] = [
  // Status conditions
  {
    id: 'health_check',
    name: 'Health Check',
    description: 'Compare unit health to a threshold',
    category: 'Status',
    params: [
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '<',
        options: [
          { value: '<', label: 'Less than' },
          { value: '<=', label: 'Less or equal' },
          { value: '>', label: 'Greater than' },
          { value: '>=', label: 'Greater or equal' },
          { value: '==', label: 'Equal to' },
        ],
      },
      {
        name: 'value',
        type: 'number',
        label: 'Value',
        default: 50,
        min: 0,
        max: 100,
      },
      {
        name: 'type',
        type: 'select',
        label: 'Type',
        default: 'percent',
        options: [
          { value: 'percent', label: 'Percentage' },
          { value: 'absolute', label: 'Absolute' },
        ],
      },
    ],
  },
  {
    id: 'shield_check',
    name: 'Shield Check',
    description: 'Compare unit shield to a threshold',
    category: 'Status',
    params: [
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '<',
        options: [
          { value: '<', label: 'Less than' },
          { value: '<=', label: 'Less or equal' },
          { value: '>', label: 'Greater than' },
          { value: '>=', label: 'Greater or equal' },
        ],
      },
      {
        name: 'value',
        type: 'number',
        label: 'Value',
        default: 50,
        min: 0,
        max: 100,
      },
      {
        name: 'type',
        type: 'select',
        label: 'Type',
        default: 'percent',
        options: [
          { value: 'percent', label: 'Percentage' },
          { value: 'absolute', label: 'Absolute' },
        ],
      },
    ],
  },
  {
    id: 'is_state',
    name: 'Is State',
    description: 'Check if unit is in a specific state',
    category: 'Status',
    params: [
      {
        name: 'state',
        type: 'select',
        label: 'State',
        default: 'idle',
        options: [
          { value: 'idle', label: 'Idle' },
          { value: 'moving', label: 'Moving' },
          { value: 'attacking', label: 'Attacking' },
        ],
      },
    ],
  },
  {
    id: 'cooldown_ready',
    name: 'Cooldown Ready',
    description: 'Check if attack cooldown has finished',
    category: 'Status',
    params: [],
  },

  // Targeting conditions
  {
    id: 'has_target',
    name: 'Has Target',
    description: 'Check if unit has an active attack target',
    category: 'Targeting',
    params: [],
  },
  {
    id: 'target_in_range',
    name: 'Target In Range',
    description: 'Check if current target is within attack range',
    category: 'Targeting',
    params: [
      {
        name: 'range_mult',
        type: 'number',
        label: 'Range Multiplier',
        description: 'Multiply weapon range by this value',
        default: 1.0,
        min: 0.5,
        max: 2.0,
      },
    ],
  },
  {
    id: 'target_health',
    name: 'Target Health',
    description: "Check target's health",
    category: 'Targeting',
    params: [
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '<',
        options: [
          { value: '<', label: 'Less than' },
          { value: '<=', label: 'Less or equal' },
          { value: '>', label: 'Greater than' },
          { value: '>=', label: 'Greater or equal' },
        ],
      },
      {
        name: 'value',
        type: 'number',
        label: 'Value (%)',
        default: 50,
        min: 0,
        max: 100,
      },
    ],
  },

  // Awareness conditions
  {
    id: 'ally_nearby',
    name: 'Ally Nearby',
    description: 'Check if friendly unit is within radius',
    category: 'Awareness',
    params: [
      {
        name: 'radius',
        type: 'number',
        label: 'Radius (tiles)',
        default: 5,
        min: 1,
        max: 20,
      },
    ],
  },
  {
    id: 'ally_low_health',
    name: 'Ally Low Health',
    description: 'Check if ally is below health threshold',
    category: 'Awareness',
    params: [
      {
        name: 'radius',
        type: 'number',
        label: 'Radius (tiles)',
        default: 10,
        min: 1,
        max: 30,
      },
      {
        name: 'threshold',
        type: 'number',
        label: 'Health Threshold (%)',
        default: 40,
        min: 1,
        max: 99,
      },
    ],
  },
  {
    id: 'enemy_count',
    name: 'Enemy Count',
    description: 'Count enemies within radius',
    category: 'Awareness',
    params: [
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '>',
        options: [
          { value: '>', label: 'Greater than' },
          { value: '>=', label: 'Greater or equal' },
          { value: '<', label: 'Less than' },
          { value: '<=', label: 'Less or equal' },
          { value: '==', label: 'Equal to' },
        ],
      },
      {
        name: 'value',
        type: 'number',
        label: 'Count',
        default: 0,
        min: 0,
        max: 50,
      },
      {
        name: 'radius',
        type: 'number',
        label: 'Radius (tiles)',
        default: 10,
        min: 1,
        max: 30,
      },
    ],
  },
  {
    id: 'enemy_type_nearby',
    name: 'Enemy Type Nearby',
    description: 'Check if specific enemy type is nearby',
    category: 'Awareness',
    params: [
      {
        name: 'type',
        type: 'select',
        label: 'Enemy Type',
        default: 'any',
        options: [
          { value: 'any', label: 'Any' },
          { value: 'infantry', label: 'Infantry' },
          { value: 'combat_vehicle', label: 'Combat Vehicle' },
          { value: 'support_vehicle', label: 'Support Vehicle' },
          { value: 'building', label: 'Building' },
          { value: 'turret', label: 'Turret' },
        ],
      },
      {
        name: 'radius',
        type: 'number',
        label: 'Radius (tiles)',
        default: 8,
        min: 1,
        max: 30,
      },
    ],
  },

  // Position conditions
  {
    id: 'distance_to_core',
    name: 'Distance To Core',
    description: 'Check distance to enemy core',
    category: 'Position',
    params: [
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '<',
        options: [
          { value: '<', label: 'Less than' },
          { value: '<=', label: 'Less or equal' },
          { value: '>', label: 'Greater than' },
          { value: '>=', label: 'Greater or equal' },
        ],
      },
      {
        name: 'value',
        type: 'number',
        label: 'Distance (tiles)',
        default: 10,
        min: 1,
        max: 60,
      },
    ],
  },
  {
    id: 'in_spawn_zone',
    name: 'In Spawn Zone',
    description: 'Check if unit is in spawn area',
    category: 'Position',
    params: [],
  },

  // Utility conditions
  {
    id: 'random_chance',
    name: 'Random Chance',
    description: 'Random probability check',
    category: 'Utility',
    params: [
      {
        name: 'percent',
        type: 'number',
        label: 'Chance (%)',
        default: 50,
        min: 1,
        max: 100,
      },
    ],
  },
];

// ==================== BUILT-IN ACTIONS ====================

export const ACTION_DEFINITIONS: ActionDef[] = [
  // Combat actions
  {
    id: 'attack_target',
    name: 'Attack Target',
    description: 'Attack the current target',
    category: 'Combat',
    params: [],
  },
  {
    id: 'attack_nearest',
    name: 'Attack Nearest',
    description: 'Attack the nearest enemy matching filter',
    category: 'Combat',
    params: [
      {
        name: 'filter',
        type: 'select',
        label: 'Target Filter',
        default: 'any',
        options: [
          { value: 'any', label: 'Any Enemy' },
          { value: 'unit', label: 'Units Only' },
          { value: 'building', label: 'Buildings Only' },
          { value: 'turret', label: 'Turrets Only' },
        ],
      },
    ],
  },
  {
    id: 'attack_priority',
    name: 'Attack Priority',
    description: 'Attack based on priority list',
    category: 'Combat',
    params: [
      {
        name: 'priority_1',
        type: 'select',
        label: 'Priority 1',
        default: 'lowest_health',
        options: [
          { value: 'lowest_health', label: 'Lowest Health' },
          { value: 'highest_health', label: 'Highest Health' },
          { value: 'closest', label: 'Closest' },
          { value: 'highest_damage', label: 'Highest Damage' },
          { value: 'turrets', label: 'Turrets' },
          { value: 'support', label: 'Support Units' },
        ],
      },
      {
        name: 'priority_2',
        type: 'select',
        label: 'Priority 2 (tiebreaker)',
        default: 'closest',
        options: [
          { value: 'lowest_health', label: 'Lowest Health' },
          { value: 'closest', label: 'Closest' },
          { value: 'highest_damage', label: 'Highest Damage' },
        ],
      },
    ],
  },

  // Targeting actions
  {
    id: 'set_target',
    name: 'Set Target',
    description: 'Select a new target',
    category: 'Targeting',
    params: [
      {
        name: 'filter',
        type: 'select',
        label: 'Target Filter',
        default: 'nearest',
        options: [
          { value: 'nearest', label: 'Nearest Enemy' },
          { value: 'lowest_health', label: 'Lowest Health' },
          { value: 'highest_threat', label: 'Highest Threat' },
          { value: 'buildings', label: 'Buildings' },
          { value: 'core', label: 'Enemy Core' },
        ],
      },
    ],
  },
  {
    id: 'clear_target',
    name: 'Clear Target',
    description: 'Remove current target',
    category: 'Targeting',
    params: [],
  },

  // Movement actions
  {
    id: 'move_to_target',
    name: 'Move To Target',
    description: 'Move toward current target',
    category: 'Movement',
    params: [],
  },
  {
    id: 'move_to_position',
    name: 'Move To Position',
    description: 'Move to specific tile position',
    category: 'Movement',
    params: [
      {
        name: 'x',
        type: 'number',
        label: 'X Position',
        default: 30,
        min: 0,
        max: 59,
      },
      {
        name: 'z',
        type: 'number',
        label: 'Z Position',
        default: 30,
        min: 0,
        max: 59,
      },
    ],
  },
  {
    id: 'follow_flow_field',
    name: 'Follow Flow Field',
    description: 'Move toward enemy core using pathfinding',
    category: 'Movement',
    params: [],
  },
  {
    id: 'retreat_to_spawn',
    name: 'Retreat To Spawn',
    description: 'Move back to spawn area',
    category: 'Movement',
    params: [],
  },
  {
    id: 'hold_position',
    name: 'Hold Position',
    description: 'Stop moving, stay in place',
    category: 'Movement',
    params: [],
  },

  // Support actions
  {
    id: 'protect_ally',
    name: 'Protect Ally',
    description: 'Move to protect a nearby ally',
    category: 'Support',
    params: [
      {
        name: 'filter',
        type: 'select',
        label: 'Ally Filter',
        default: 'lowest_health',
        options: [
          { value: 'lowest_health', label: 'Lowest Health' },
          { value: 'nearest', label: 'Nearest' },
          { value: 'highest_value', label: 'Highest Value' },
        ],
      },
      {
        name: 'radius',
        type: 'number',
        label: 'Search Radius (tiles)',
        default: 10,
        min: 1,
        max: 30,
      },
    ],
  },
];

// ==================== NODE COLORS ====================

export const NODE_COLORS: Record<BehaviorNodeType, string> = {
  // Composites
  selector: '#f59e0b', // Orange
  sequence: '#3b82f6', // Blue
  parallel: '#a855f7', // Purple
  // Decorators
  inverter: '#eab308', // Yellow
  succeeder: '#eab308', // Yellow
  repeater: '#eab308', // Yellow
  until_fail: '#eab308', // Yellow
  // Leaves
  condition: '#06b6d4', // Cyan
  action: '#22c55e', // Green
};

// ==================== NODE ICONS ====================

export const NODE_ICONS: Record<BehaviorNodeType, string> = {
  selector: '?',
  sequence: '->',
  parallel: '||',
  inverter: '!',
  succeeder: 'v',
  repeater: '@',
  until_fail: '~',
  condition: '?',
  action: '!',
};

// ==================== NODE DESCRIPTIONS ====================

export const NODE_DESCRIPTIONS: Record<BehaviorNodeType, string> = {
  selector: 'Tries children in order until one succeeds',
  sequence: 'Runs children in order until one fails',
  parallel: 'Runs all children simultaneously',
  inverter: 'Flips the result of its child (success <-> failure)',
  succeeder: 'Always returns success regardless of child result',
  repeater: 'Repeats its child a specified number of times',
  until_fail: 'Repeats its child until it fails',
  condition: 'Evaluates a condition and returns success/failure',
  action: 'Performs an action and returns the result',
};
