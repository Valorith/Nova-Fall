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
