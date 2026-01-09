// Node Core System
// Cores must be installed in nodes to activate them for production
// HQ and Crown nodes are always active (no core needed)

import { NodeType } from '../types/enums.js';

export type NodeCoreId =
  | 'solar_farm'
  | 'laboratory'
  | 'refinery'
  | 'greenhouse_biome'
  | 'strip_miner'
  | 'trading_complex'
  | 'factory'
  | 'training_facility';

export interface NodeCoreDefinition {
  id: NodeCoreId;
  name: string;
  description: string;
  icon: string;
  color: string;
  targetNode: NodeType; // Which node type this core activates
  cost: number; // Credits to purchase from HQ
}

// Core definitions - one for each activatable node type
export const NODE_CORES: Record<NodeCoreId, NodeCoreDefinition> = {
  solar_farm: {
    id: 'solar_farm',
    name: 'Solar Farm (Core)',
    description: 'Harnesses solar energy to power a Power Plant node.',
    icon: '☀️',
    color: '#FFD700',
    targetNode: NodeType.POWER_PLANT,
    cost: 100,
  },
  laboratory: {
    id: 'laboratory',
    name: 'Laboratory (Core)',
    description: 'Advanced research equipment for a Research Station.',
    icon: '🔬',
    color: '#9370DB',
    targetNode: NodeType.RESEARCH,
    cost: 100,
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery (Core)',
    description: 'Processing equipment for a Refinery Complex.',
    icon: '🏭',
    color: '#708090',
    targetNode: NodeType.REFINERY,
    cost: 100,
  },
  greenhouse_biome: {
    id: 'greenhouse_biome',
    name: 'Greenhouse Biome (Core)',
    description: 'Climate-controlled agriculture systems for an Agricultural Center.',
    icon: '🌱',
    color: '#228B22',
    targetNode: NodeType.AGRICULTURAL,
    cost: 100,
  },
  strip_miner: {
    id: 'strip_miner',
    name: 'Strip Miner (Core)',
    description: 'Heavy extraction equipment for a Mining Outpost.',
    icon: '⛏️',
    color: '#8B4513',
    targetNode: NodeType.MINING,
    cost: 100,
  },
  trading_complex: {
    id: 'trading_complex',
    name: 'Trading Complex (Core)',
    description: 'Market infrastructure for a Trade Hub.',
    icon: '🏪',
    color: '#FFD700',
    targetNode: NodeType.TRADE_HUB,
    cost: 100,
  },
  factory: {
    id: 'factory',
    name: 'Factory (Core)',
    description: 'Manufacturing equipment for a Manufacturing Plant.',
    icon: '🔧',
    color: '#4A5568',
    targetNode: NodeType.MANUFACTURING_PLANT,
    cost: 100,
  },
  training_facility: {
    id: 'training_facility',
    name: 'Training Facility (Core)',
    description: 'Military training infrastructure for a Barracks.',
    icon: '🎖️',
    color: '#DC143C',
    targetNode: NodeType.BARRACKS,
    cost: 100,
  },
};

// Array of all core IDs for iteration
export const NODE_CORE_IDS: NodeCoreId[] = Object.keys(NODE_CORES) as NodeCoreId[];

// Get core definition by ID
export function getNodeCoreDefinition(coreId: string): NodeCoreDefinition | undefined {
  return NODE_CORES[coreId as NodeCoreId];
}

// Get the core type that matches a given node type
export function getCoreForNodeType(nodeType: NodeType): NodeCoreId | null {
  for (const [coreId, core] of Object.entries(NODE_CORES)) {
    if (core.targetNode === nodeType) {
      return coreId as NodeCoreId;
    }
  }
  return null;
}

// Check if a node type requires a core to be active
export function nodeRequiresCore(nodeType: NodeType): boolean {
  // HQ and Crown are always active
  if (nodeType === NodeType.CAPITAL || nodeType === NodeType.CROWN) {
    return false;
  }
  // All other node types require their matching core
  return getCoreForNodeType(nodeType) !== null;
}

// Check if a core can be installed in a node type
export function canInstallCore(coreId: NodeCoreId, nodeType: NodeType): boolean {
  const core = NODE_CORES[coreId];
  return core?.targetNode === nodeType;
}
