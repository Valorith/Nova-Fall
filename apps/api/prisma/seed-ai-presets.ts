// Database seed script for AI Behavior Tree Templates
// Seeds the system templates for units and buildings

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from apps/api directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import type { BehaviorTree } from '@nova-fall/shared';

const prisma = new PrismaClient();

// ==================== TEMPLATE DEFINITIONS ====================

const AGGRESSIVE_ATTACKER: BehaviorTree = {
  version: 1,
  category: 'unit',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Aggressive AI',
      params: {},
      position: { x: 250, y: 0 },
    },
    {
      id: 'attack_seq',
      type: 'sequence',
      label: 'Attack Sequence',
      params: {},
      position: { x: 100, y: 100 },
    },
    {
      id: 'pursue_seq',
      type: 'sequence',
      label: 'Pursue Sequence',
      params: {},
      position: { x: 400, y: 100 },
    },
    {
      id: 'has_target',
      type: 'condition',
      label: 'Has Target',
      params: { conditionId: 'has_target' },
      position: { x: 0, y: 200 },
    },
    {
      id: 'target_in_range',
      type: 'condition',
      label: 'Target In Range',
      params: { conditionId: 'target_in_range', range_mult: 1.0 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'attack_target',
      type: 'action',
      label: 'Attack Target',
      params: { actionId: 'attack_target' },
      position: { x: 200, y: 200 },
    },
    {
      id: 'set_target',
      type: 'action',
      label: 'Set Target',
      params: { actionId: 'set_target', filter: 'nearest' },
      position: { x: 350, y: 200 },
    },
    {
      id: 'move_to_target',
      type: 'action',
      label: 'Move To Target',
      params: { actionId: 'move_to_target' },
      position: { x: 450, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'attack_seq' },
    { id: 'e2', source: 'root', target: 'pursue_seq' },
    { id: 'e3', source: 'attack_seq', target: 'has_target' },
    { id: 'e4', source: 'attack_seq', target: 'target_in_range' },
    { id: 'e5', source: 'attack_seq', target: 'attack_target' },
    { id: 'e6', source: 'pursue_seq', target: 'set_target' },
    { id: 'e7', source: 'pursue_seq', target: 'move_to_target' },
  ],
};

const DEFENSIVE_HOLDER: BehaviorTree = {
  version: 1,
  category: 'unit',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Defensive AI',
      params: {},
      position: { x: 250, y: 0 },
    },
    {
      id: 'attack_seq',
      type: 'sequence',
      label: 'Attack If Close',
      params: {},
      position: { x: 100, y: 100 },
    },
    {
      id: 'hold_action',
      type: 'action',
      label: 'Hold Position',
      params: { actionId: 'hold_position' },
      position: { x: 400, y: 100 },
    },
    {
      id: 'enemy_nearby',
      type: 'condition',
      label: 'Enemy Nearby',
      params: { conditionId: 'enemy_count', operator: '>', value: 0, radius: 8 },
      position: { x: 0, y: 200 },
    },
    {
      id: 'attack_nearest',
      type: 'action',
      label: 'Attack Nearest',
      params: { actionId: 'attack_nearest', filter: 'any' },
      position: { x: 150, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'attack_seq' },
    { id: 'e2', source: 'root', target: 'hold_action' },
    { id: 'e3', source: 'attack_seq', target: 'enemy_nearby' },
    { id: 'e4', source: 'attack_seq', target: 'attack_nearest' },
  ],
};

const SUPPORT_HEALER: BehaviorTree = {
  version: 1,
  category: 'unit',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Support AI',
      params: {},
      position: { x: 250, y: 0 },
    },
    {
      id: 'protect_seq',
      type: 'sequence',
      label: 'Protect Ally',
      params: {},
      position: { x: 100, y: 100 },
    },
    {
      id: 'fallback_seq',
      type: 'sequence',
      label: 'Fallback Attack',
      params: {},
      position: { x: 400, y: 100 },
    },
    {
      id: 'ally_low',
      type: 'condition',
      label: 'Ally Low Health',
      params: { conditionId: 'ally_low_health', radius: 15, threshold: 40 },
      position: { x: 0, y: 200 },
    },
    {
      id: 'protect_ally',
      type: 'action',
      label: 'Protect Ally',
      params: { actionId: 'protect_ally', filter: 'lowest_health', radius: 15 },
      position: { x: 150, y: 200 },
    },
    {
      id: 'enemy_nearby',
      type: 'condition',
      label: 'Enemy Count',
      params: { conditionId: 'enemy_count', operator: '>', value: 0, radius: 10 },
      position: { x: 350, y: 200 },
    },
    {
      id: 'attack_nearest',
      type: 'action',
      label: 'Attack Nearest',
      params: { actionId: 'attack_nearest', filter: 'any' },
      position: { x: 500, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'protect_seq' },
    { id: 'e2', source: 'root', target: 'fallback_seq' },
    { id: 'e3', source: 'protect_seq', target: 'ally_low' },
    { id: 'e4', source: 'protect_seq', target: 'protect_ally' },
    { id: 'e5', source: 'fallback_seq', target: 'enemy_nearby' },
    { id: 'e6', source: 'fallback_seq', target: 'attack_nearest' },
  ],
};

const PRIORITY_TURRET: BehaviorTree = {
  version: 1,
  category: 'building',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Turret AI',
      params: {},
      position: { x: 250, y: 0 },
    },
    {
      id: 'attack_seq',
      type: 'sequence',
      label: 'Attack Priority',
      params: {},
      position: { x: 100, y: 100 },
    },
    {
      id: 'idle_action',
      type: 'action',
      label: 'Hold Position',
      params: { actionId: 'hold_position' },
      position: { x: 400, y: 100 },
    },
    {
      id: 'enemy_nearby',
      type: 'condition',
      label: 'Enemy Count',
      params: { conditionId: 'enemy_count', operator: '>', value: 0, radius: 12 },
      position: { x: 0, y: 200 },
    },
    {
      id: 'attack_priority',
      type: 'action',
      label: 'Attack Priority',
      params: { actionId: 'attack_priority', priority_1: 'lowest_health', priority_2: 'closest' },
      position: { x: 150, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'attack_seq' },
    { id: 'e2', source: 'root', target: 'idle_action' },
    { id: 'e3', source: 'attack_seq', target: 'enemy_nearby' },
    { id: 'e4', source: 'attack_seq', target: 'attack_priority' },
  ],
};

const AREA_DENIAL: BehaviorTree = {
  version: 1,
  category: 'building',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Area Denial AI',
      params: {},
      position: { x: 250, y: 0 },
    },
    {
      id: 'attack_seq',
      type: 'sequence',
      label: 'Attack All',
      params: {},
      position: { x: 100, y: 100 },
    },
    {
      id: 'idle_action',
      type: 'action',
      label: 'Hold Position',
      params: { actionId: 'hold_position' },
      position: { x: 400, y: 100 },
    },
    {
      id: 'cooldown_ready',
      type: 'condition',
      label: 'Cooldown Ready',
      params: { conditionId: 'cooldown_ready' },
      position: { x: 0, y: 200 },
    },
    {
      id: 'enemy_nearby',
      type: 'condition',
      label: 'Enemy Count',
      params: { conditionId: 'enemy_count', operator: '>', value: 0, radius: 10 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'attack_nearest',
      type: 'action',
      label: 'Attack Nearest',
      params: { actionId: 'attack_nearest', filter: 'any' },
      position: { x: 200, y: 200 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'attack_seq' },
    { id: 'e2', source: 'root', target: 'idle_action' },
    { id: 'e3', source: 'attack_seq', target: 'cooldown_ready' },
    { id: 'e4', source: 'attack_seq', target: 'enemy_nearby' },
    { id: 'e5', source: 'attack_seq', target: 'attack_nearest' },
  ],
};

// Scout AI - Hit-and-run distraction tactics
// Quickly engages enemy defenses then retreats to draw fire away from other units
const SCOUT: BehaviorTree = {
  version: 1,
  category: 'unit',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Scout AI',
      params: {},
      position: { x: 300, y: 0 },
    },
    // Priority 1: Kite away if being targeted and took damage recently
    {
      id: 'kite_seq',
      type: 'sequence',
      label: 'Kite Away',
      params: {},
      position: { x: 50, y: 100 },
    },
    {
      id: 'is_targeted',
      type: 'condition',
      label: 'Being Targeted',
      params: { conditionId: 'is_being_targeted' },
      position: { x: 0, y: 200 },
    },
    {
      id: 'kite_action',
      type: 'action',
      label: 'Kite Away',
      params: { actionId: 'kite_away', distance: 6, maintain_range: true },
      position: { x: 100, y: 200 },
    },
    // Priority 2: Quick strike if enemy in range
    {
      id: 'strike_seq',
      type: 'sequence',
      label: 'Quick Strike',
      params: {},
      position: { x: 250, y: 100 },
    },
    {
      id: 'enemy_in_range',
      type: 'condition',
      label: 'Enemy In Range',
      params: { conditionId: 'enemy_in_range', range_mult: 1.0 },
      position: { x: 200, y: 200 },
    },
    {
      id: 'quick_attack',
      type: 'action',
      label: 'Quick Attack',
      params: { actionId: 'attack_nearest', filter: 'structure', burst_count: 2 },
      position: { x: 300, y: 200 },
    },
    // Priority 3: Approach enemy structures at max range
    {
      id: 'approach_seq',
      type: 'sequence',
      label: 'Approach Target',
      params: {},
      position: { x: 450, y: 100 },
    },
    {
      id: 'set_structure_target',
      type: 'action',
      label: 'Find Structure',
      params: { actionId: 'set_target', filter: 'structure', priority: 'nearest' },
      position: { x: 400, y: 200 },
    },
    {
      id: 'approach_at_range',
      type: 'action',
      label: 'Approach at Range',
      params: { actionId: 'move_to_target', stop_at_range: true, range_mult: 0.95 },
      position: { x: 500, y: 200 },
    },
    // Fallback: Patrol/scout around
    {
      id: 'patrol_action',
      type: 'action',
      label: 'Patrol Area',
      params: { actionId: 'patrol', radius: 10, speed_mult: 1.2 },
      position: { x: 650, y: 100 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'kite_seq' },
    { id: 'e2', source: 'root', target: 'strike_seq' },
    { id: 'e3', source: 'root', target: 'approach_seq' },
    { id: 'e4', source: 'root', target: 'patrol_action' },
    { id: 'e5', source: 'kite_seq', target: 'is_targeted' },
    { id: 'e6', source: 'kite_seq', target: 'kite_action' },
    { id: 'e7', source: 'strike_seq', target: 'enemy_in_range' },
    { id: 'e8', source: 'strike_seq', target: 'quick_attack' },
    { id: 'e9', source: 'approach_seq', target: 'set_structure_target' },
    { id: 'e10', source: 'approach_seq', target: 'approach_at_range' },
  ],
};

// Tank AI - Protective frontline unit that shields allies
// Absorbs damage from enemy structures, only engages when allies are present
const TANK: BehaviorTree = {
  version: 1,
  category: 'unit',
  rootId: 'root',
  nodes: [
    {
      id: 'root',
      type: 'selector',
      label: 'Tank AI',
      params: {},
      position: { x: 350, y: 0 },
    },
    // Priority 1: Position between allies and enemies when allies nearby
    {
      id: 'protect_seq',
      type: 'sequence',
      label: 'Shield Allies',
      params: {},
      position: { x: 50, y: 100 },
    },
    {
      id: 'has_allies',
      type: 'condition',
      label: 'Has Nearby Allies',
      params: { conditionId: 'friendly_count', operator: '>', value: 0, radius: 15, exclude_role: 'tank' },
      position: { x: 0, y: 200 },
    },
    {
      id: 'enemy_structure_exists',
      type: 'condition',
      label: 'Enemy Structure Exists',
      params: { conditionId: 'enemy_count', operator: '>', value: 0, radius: 20, filter: 'structure' },
      position: { x: 100, y: 200 },
    },
    {
      id: 'interpose',
      type: 'action',
      label: 'Interpose',
      params: { actionId: 'interpose', ally_filter: 'nearest_non_tank', enemy_filter: 'structure' },
      position: { x: 200, y: 200 },
    },
    // Priority 2: Engage and loiter if allies nearby (tank for team)
    {
      id: 'engage_seq',
      type: 'sequence',
      label: 'Engage with Support',
      params: {},
      position: { x: 300, y: 100 },
    },
    {
      id: 'has_support',
      type: 'condition',
      label: 'Has Support',
      params: { conditionId: 'friendly_count', operator: '>', value: 0, radius: 12, exclude_role: 'tank' },
      position: { x: 280, y: 200 },
    },
    {
      id: 'loiter_attack',
      type: 'action',
      label: 'Loiter and Attack',
      params: { actionId: 'loiter_attack', filter: 'structure', loiter_radius: 3, priority: 'nearest' },
      position: { x: 380, y: 200 },
    },
    // Priority 3: Move to allies if alone (don't suicide)
    {
      id: 'regroup_seq',
      type: 'sequence',
      label: 'Regroup',
      params: {},
      position: { x: 500, y: 100 },
    },
    {
      id: 'is_alone',
      type: 'condition',
      label: 'Is Alone',
      params: { conditionId: 'friendly_count', operator: '==', value: 0, radius: 15, exclude_role: 'tank' },
      position: { x: 480, y: 200 },
    },
    {
      id: 'move_to_allies',
      type: 'action',
      label: 'Move To Allies',
      params: { actionId: 'move_to_friendly', filter: 'non_tank', priority: 'nearest' },
      position: { x: 580, y: 200 },
    },
    // Fallback: Hold position and wait
    {
      id: 'hold_position',
      type: 'action',
      label: 'Hold Position',
      params: { actionId: 'hold_position' },
      position: { x: 700, y: 100 },
    },
  ],
  edges: [
    { id: 'e1', source: 'root', target: 'protect_seq' },
    { id: 'e2', source: 'root', target: 'engage_seq' },
    { id: 'e3', source: 'root', target: 'regroup_seq' },
    { id: 'e4', source: 'root', target: 'hold_position' },
    { id: 'e5', source: 'protect_seq', target: 'has_allies' },
    { id: 'e6', source: 'protect_seq', target: 'enemy_structure_exists' },
    { id: 'e7', source: 'protect_seq', target: 'interpose' },
    { id: 'e8', source: 'engage_seq', target: 'has_support' },
    { id: 'e9', source: 'engage_seq', target: 'loiter_attack' },
    { id: 'e10', source: 'regroup_seq', target: 'is_alone' },
    { id: 'e11', source: 'regroup_seq', target: 'move_to_allies' },
  ],
};

// ==================== TEMPLATES LIST ====================

const templates = [
  {
    name: 'Aggressive Attacker',
    description: 'Aggressively pursues and attacks enemies. Prioritizes combat over defense.',
    category: 'unit',
    treeData: AGGRESSIVE_ATTACKER,
    isTemplate: true,
  },
  {
    name: 'Defensive Holder',
    description: 'Holds position and only attacks enemies that come within range.',
    category: 'unit',
    treeData: DEFENSIVE_HOLDER,
    isTemplate: true,
  },
  {
    name: 'Support Healer',
    description: 'Prioritizes protecting low-health allies. Falls back to attacking if no allies need help.',
    category: 'unit',
    treeData: SUPPORT_HEALER,
    isTemplate: true,
  },
  {
    name: 'Scout',
    description:
      'Hit-and-run distraction unit. Probes enemy defenses by moving in and out of range, drawing fire away from other units. Never fully commits to an attack.',
    category: 'unit',
    treeData: SCOUT,
    isTemplate: true,
  },
  {
    name: 'Tank',
    description:
      'Protective frontline unit that absorbs damage for allies. Positions between friendly units and enemy structures. Will not engage alone - regroups with allies if isolated.',
    category: 'unit',
    treeData: TANK,
    isTemplate: true,
  },
  {
    name: 'Priority Turret',
    description: 'Attacks low-health enemies first to maximize kills.',
    category: 'building',
    treeData: PRIORITY_TURRET,
    isTemplate: true,
  },
  {
    name: 'Area Denial',
    description: 'Attacks any enemy that enters range. Simple but effective.',
    category: 'building',
    treeData: AREA_DENIAL,
    isTemplate: true,
  },
];

// ==================== MAIN SEED FUNCTION ====================

async function main() {
  console.log('🤖 Starting AI preset templates seed...');

  // Check if templates already exist and delete them for reseed
  const existingTemplates = await prisma.aIPreset.count({ where: { isTemplate: true } });
  if (existingTemplates > 0) {
    console.log(`⚠️  Found ${existingTemplates} existing templates. Deleting for reseed...`);
    await prisma.aIPreset.deleteMany({ where: { isTemplate: true } });
    console.log('   ✅ Existing templates deleted.');
  }

  // Create templates
  console.log(`📦 Creating ${templates.length} AI preset templates...`);

  for (const template of templates) {
    await prisma.aIPreset.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        treeData: template.treeData as unknown,
        isTemplate: template.isTemplate,
      },
    });
    console.log(`   ✅ Created: ${template.name} (${template.category})`);
  }

  // Summary
  console.log('\n📊 Seed Summary:');
  console.log(`   • Unit Templates: ${templates.filter((t) => t.category === 'unit').length}`);
  console.log(`   • Building Templates: ${templates.filter((t) => t.category === 'building').length}`);

  console.log('\n✨ AI preset templates seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
