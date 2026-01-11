import { NodeType } from '../types/enums.js';
import type { NodeTypeConfig } from '../types/node.js';

// Node type configurations
// Defines bonuses, costs, and properties for each node type

export const NODE_TYPE_CONFIGS: Record<NodeType, NodeTypeConfig> = {
  [NodeType.MINING]: {
    type: NodeType.MINING,
    displayName: 'Mining Outpost',
    description: 'Rich in iron deposits. Ideal for resource extraction.',
    baseUpkeep: 40,
    resourceBonuses: { iron: 1.5 },
    buildingSlots: 6,
    defaultResources: { iron: 150 },
    claimCost: { credits: 500, iron: 50, energy: 25 },
    color: '#8B4513',
    icon: 'mining',
  },
  [NodeType.REFINERY]: {
    type: NodeType.REFINERY,
    displayName: 'Refinery Complex',
    description: 'Converts raw materials into advanced composites.',
    baseUpkeep: 60,
    resourceBonuses: { composites: 1.5 },
    buildingSlots: 8,
    defaultResources: { iron: 50, composites: 25 },
    claimCost: { credits: 750, iron: 100, energy: 50 },
    color: '#708090',
    icon: 'refinery',
  },
  [NodeType.RESEARCH]: {
    type: NodeType.RESEARCH,
    displayName: 'Research Station',
    description: 'Advanced facility for technological development.',
    baseUpkeep: 80,
    resourceBonuses: { minerals: 1.25 },
    buildingSlots: 6,
    defaultResources: { energy: 75, minerals: 25 },
    claimCost: { credits: 1000, iron: 75, energy: 100 },
    color: '#9370DB',
    icon: 'research',
  },
  [NodeType.TRADE_HUB]: {
    type: NodeType.TRADE_HUB,
    displayName: 'Trade Hub',
    description: 'Central marketplace with reduced trading fees.',
    baseUpkeep: 70,
    resourceBonuses: { credits: 1.5 },
    buildingSlots: 10,
    defaultResources: { iron: 50, energy: 50 },
    claimCost: { credits: 1500, iron: 50, energy: 50 },
    color: '#FFD700',
    icon: 'trade',
  },
  [NodeType.BARRACKS]: {
    type: NodeType.BARRACKS,
    displayName: 'Barracks',
    description: 'Military training facility. Reduced unit training costs.',
    baseUpkeep: 75,
    resourceBonuses: {},
    buildingSlots: 10,
    defaultResources: { iron: 75, energy: 50 },
    claimCost: { credits: 1500, iron: 150, energy: 75 },
    color: '#DC143C',
    icon: 'barracks',
  },
  [NodeType.AGRICULTURAL]: {
    type: NodeType.AGRICULTURAL,
    displayName: 'Agricultural Center',
    description: 'Reduces upkeep costs for nearby nodes.',
    baseUpkeep: 30,
    resourceBonuses: { credits: 1.25 },
    buildingSlots: 8,
    defaultResources: { iron: 25, energy: 25 },
    claimCost: { credits: 400, iron: 25, energy: 25 },
    color: '#228B22',
    icon: 'agricultural',
  },
  [NodeType.POWER_PLANT]: {
    type: NodeType.POWER_PLANT,
    displayName: 'Power Plant',
    description: 'Generates energy for surrounding territories.',
    baseUpkeep: 50,
    resourceBonuses: { energy: 2.0 },
    buildingSlots: 6,
    defaultResources: { iron: 50, energy: 200 },
    claimCost: { credits: 600, iron: 100, energy: 0 },
    color: '#00CED1',
    icon: 'power',
  },
  [NodeType.MANUFACTURING_PLANT]: {
    type: NodeType.MANUFACTURING_PLANT,
    displayName: 'Manufacturing Plant',
    description: 'Industrial facility for producing advanced equipment and non-biological units.',
    baseUpkeep: 65,
    resourceBonuses: { composites: 1.25 },
    buildingSlots: 10,
    defaultResources: { iron: 100, energy: 75 },
    claimCost: { credits: 800, iron: 150, energy: 100 },
    color: '#4A5568',
    icon: 'manufacturing',
  },
  [NodeType.CAPITAL]: {
    type: NodeType.CAPITAL,
    displayName: 'Capital',
    description: 'Player headquarters. Cannot be captured, only destroyed.',
    baseUpkeep: 0,
    resourceBonuses: { credits: 1.1, iron: 1.1, energy: 1.1 },
    buildingSlots: 16,
    defaultResources: { credits: 1000, iron: 100, energy: 50 },
    claimCost: { credits: 0, iron: 0, energy: 0 }, // Cannot be claimed
    color: '#4169E1',
    icon: 'capital',
  },
  [NodeType.CROWN]: {
    type: NodeType.CROWN,
    displayName: 'Game Objective',
    description: 'Hold this sacred site for 48 hours to claim victory. All factions fight for control.',
    baseUpkeep: 0, // No upkeep - prize node
    resourceBonuses: {},
    buildingSlots: 0, // Cannot build
    defaultResources: { credits: 0, iron: 0, energy: 0 },
    claimCost: { credits: 0, iron: 0, energy: 0 }, // Claimed through combat
    color: '#FFD700', // Gold
    icon: 'crown',
  },
};

// Get config for a node type
export function getNodeTypeConfig(type: NodeType): NodeTypeConfig {
  return NODE_TYPE_CONFIGS[type];
}

// Get all node types as array
export function getAllNodeTypes(): NodeType[] {
  return Object.values(NodeType);
}

// Node types that support crafting
const CRAFTING_NODE_TYPES: NodeType[] = [
  NodeType.REFINERY,
  NodeType.MANUFACTURING_PLANT,
  NodeType.BARRACKS,
];

// Check if a node type supports crafting
export function nodeSupportsCrafting(type: NodeType): boolean {
  return CRAFTING_NODE_TYPES.includes(type);
}
