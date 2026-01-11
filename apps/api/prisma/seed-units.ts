// Seed unit items and training blueprints into the database
// This will upsert items (update existing, insert new) without deleting other data

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from apps/api directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { UNIT_TYPES, type UnitTypeDefinition } from '@nova-fall/shared';

const prisma = new PrismaClient();

// Map unit tier to quality
function tierToQuality(tier: number): 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
  switch (tier) {
    case 1:
      return 'COMMON';
    case 2:
      return 'UNCOMMON';
    case 3:
      return 'RARE';
    default:
      return 'COMMON';
  }
}

async function seedUnitItem(unitId: string, unit: UnitTypeDefinition): Promise<string> {
  const itemId = `unit_${unitId}`;

  const itemData = {
    name: unit.name,
    description: unit.description,
    category: 'UNIT' as const,
    quality: tierToQuality(unit.tier),
    icon: unit.icon,
    color: '#4CAF50', // Green for units
    stackSize: 100, // Can stack units in storage
    isTradeable: false, // Units can't be traded at market
    unitStats: {
      health: unit.baseStats.health,
      shield: unit.baseStats.shield,
      shieldRange: unit.baseStats.shieldRange,
      damage: unit.baseStats.damage,
      armor: unit.baseStats.armor,
      speed: unit.baseStats.speed,
      range: unit.baseStats.range,
      attackSpeed: unit.baseStats.attackSpeed,
    },
  };

  const existing = await prisma.itemDefinition.findUnique({
    where: { itemId },
  });

  if (existing) {
    await prisma.itemDefinition.update({
      where: { itemId },
      data: itemData,
    });
    console.log(`   ✓ Updated item: ${unit.name} (${itemId})`);
  } else {
    await prisma.itemDefinition.create({
      data: { itemId, ...itemData },
    });
    console.log(`   ✓ Created item: ${unit.name} (${itemId})`);
  }

  return itemId;
}

async function seedUnitBlueprint(
  unitId: string,
  unit: UnitTypeDefinition,
  outputItemId: string
): Promise<void> {
  const blueprintName = `Train ${unit.name}`;

  // Convert training cost to inputs array
  const inputs: Array<{ itemId: string; quantity: number }> = [];

  if (unit.trainingCost.credits) {
    inputs.push({ itemId: 'credits', quantity: unit.trainingCost.credits });
  }
  if (unit.trainingCost.iron) {
    inputs.push({ itemId: 'iron', quantity: unit.trainingCost.iron });
  }
  if (unit.trainingCost.energy) {
    inputs.push({ itemId: 'energy', quantity: unit.trainingCost.energy });
  }
  if (unit.trainingCost.steelBar) {
    inputs.push({ itemId: 'steelBar', quantity: unit.trainingCost.steelBar });
  }
  if (unit.trainingCost.grain) {
    inputs.push({ itemId: 'grain', quantity: unit.trainingCost.grain });
  }

  const blueprintData = {
    name: blueprintName,
    description: `Train a ${unit.name} unit at the Barracks.`,
    category: 'UNIT' as const,
    quality: tierToQuality(unit.tier),
    nodeTierRequired: unit.tier,
    craftTime: unit.trainingTime,
    inputs,
    outputs: [{ itemId: outputItemId, quantity: 1 }],
    nodeTypes: ['BARRACKS'],
    learned: false, // Training blueprints are known by default
  };

  // Find existing blueprint by name
  const existing = await prisma.blueprint.findFirst({
    where: { name: blueprintName },
  });

  if (existing) {
    await prisma.blueprint.update({
      where: { id: existing.id },
      data: blueprintData,
    });
    console.log(`   ✓ Updated blueprint: ${blueprintName}`);
  } else {
    await prisma.blueprint.create({
      data: blueprintData,
    });
    console.log(`   ✓ Created blueprint: ${blueprintName}`);
  }
}

async function main() {
  console.log('🪖 Seeding unit items and training blueprints...\n');

  const unitEntries = Object.entries(UNIT_TYPES);

  console.log('📦 Creating unit items:');
  const itemIds: Record<string, string> = {};

  for (const [unitId, unit] of unitEntries) {
    const itemId = await seedUnitItem(unitId, unit);
    itemIds[unitId] = itemId;
  }

  console.log('\n📜 Creating training blueprints:');

  for (const [unitId, unit] of unitEntries) {
    await seedUnitBlueprint(unitId, unit, itemIds[unitId]!);
  }

  // Show summary
  const allUnitItems = await prisma.itemDefinition.findMany({
    where: { category: 'UNIT' },
    orderBy: { name: 'asc' },
  });

  const allUnitBlueprints = await prisma.blueprint.findMany({
    where: { category: 'UNIT' },
    orderBy: { name: 'asc' },
  });

  console.log('\n📊 Seed Summary:');
  console.log(`   • Unit items: ${allUnitItems.length}`);
  console.log(`   • Training blueprints: ${allUnitBlueprints.length}`);

  console.log('\n🪖 Unit Items in Database:');
  for (const item of allUnitItems) {
    const stats = item.unitStats as { health: number; damage: number; shield: number; shieldRange?: number } | null;
    const shieldInfo = stats?.shieldRange && stats.shieldRange > 0 ? ` (AOE ${stats.shieldRange})` : '';
    const statsInfo = stats ? ` [HP: ${stats.health}, Shield: ${stats.shield}${shieldInfo}, DMG: ${stats.damage}]` : '';
    console.log(`   ${item.icon || '🪖'} ${item.name} (${item.itemId})${statsInfo}`);
  }

  console.log('\n📜 Training Blueprints in Database:');
  for (const bp of allUnitBlueprints) {
    console.log(`   📜 ${bp.name} - ${bp.craftTime}s`);
  }

  console.log('\n✨ Unit seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
