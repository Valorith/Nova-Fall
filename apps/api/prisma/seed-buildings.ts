// Seed building items and manufacturing blueprints into the database
// This will upsert items (update existing, insert new) without deleting other data

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from apps/api directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { BUILDING_TYPES, type BuildingTypeDefinition } from '@nova-fall/shared';

const prisma = new PrismaClient();

// Map building tier to quality
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

// Map building category to color
function categoryToColor(category: string): string {
  switch (category) {
    case 'defense':
      return '#DC143C'; // Crimson red for defense
    case 'support':
      return '#4169E1'; // Royal blue for support
    default:
      return '#808080'; // Gray default
  }
}

async function seedBuildingItem(buildingId: string, building: BuildingTypeDefinition): Promise<string> {
  const itemId = `building_${buildingId}`;

  const itemData = {
    name: building.name,
    description: building.description,
    category: 'BUILDING' as const,
    quality: tierToQuality(building.tier),
    icon: building.icon,
    color: categoryToColor(building.category),
    stackSize: 50, // Can stack buildings in storage
    isTradeable: true, // Buildings can be traded at market
    // Reuse unitStats field for building stats (same structure)
    unitStats: {
      health: building.baseStats.health,
      shield: building.baseStats.shield,
      shieldRange: building.baseStats.shieldRange,
      damage: building.baseStats.damage,
      armor: building.baseStats.armor,
      speed: 0, // Buildings don't move
      range: building.baseStats.range,
      attackSpeed: building.baseStats.attackSpeed,
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
    console.log(`   ✓ Updated item: ${building.name} (${itemId})`);
  } else {
    await prisma.itemDefinition.create({
      data: { itemId, ...itemData },
    });
    console.log(`   ✓ Created item: ${building.name} (${itemId})`);
  }

  return itemId;
}

async function seedBuildingBlueprint(
  buildingId: string,
  building: BuildingTypeDefinition,
  outputItemId: string
): Promise<void> {
  const blueprintName = `Manufacture ${building.name}`;

  // Convert craft cost to inputs array
  const inputs: Array<{ itemId: string; quantity: number }> = [];

  if (building.craftCost.credits) {
    inputs.push({ itemId: 'credits', quantity: building.craftCost.credits });
  }
  if (building.craftCost.iron) {
    inputs.push({ itemId: 'iron', quantity: building.craftCost.iron });
  }
  if (building.craftCost.energy) {
    inputs.push({ itemId: 'energy', quantity: building.craftCost.energy });
  }
  if (building.craftCost.steelBar) {
    inputs.push({ itemId: 'steelBar', quantity: building.craftCost.steelBar });
  }
  if (building.craftCost.coal) {
    inputs.push({ itemId: 'coal', quantity: building.craftCost.coal });
  }

  const blueprintData = {
    name: blueprintName,
    description: `Manufacture a ${building.name} at the Manufacturing Plant.`,
    category: 'BUILDINGS' as const,
    quality: tierToQuality(building.tier),
    nodeTierRequired: building.tier,
    craftTime: building.craftTime,
    inputs,
    outputs: [{ itemId: outputItemId, quantity: 1 }],
    nodeTypes: ['MANUFACTURING_PLANT'],
    learned: false, // Manufacturing blueprints are known by default
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
  console.log('🏗️  Seeding building items and manufacturing blueprints...\n');

  const buildingEntries = Object.entries(BUILDING_TYPES);

  console.log('📦 Creating building items:');
  const itemIds: Record<string, string> = {};

  for (const [buildingId, building] of buildingEntries) {
    const itemId = await seedBuildingItem(buildingId, building);
    itemIds[buildingId] = itemId;
  }

  console.log('\n📜 Creating manufacturing blueprints:');

  for (const [buildingId, building] of buildingEntries) {
    await seedBuildingBlueprint(buildingId, building, itemIds[buildingId]!);
  }

  // Show summary
  const allBuildingItems = await prisma.itemDefinition.findMany({
    where: { category: 'BUILDING' },
    orderBy: { name: 'asc' },
  });

  const allBuildingBlueprints = await prisma.blueprint.findMany({
    where: { category: 'BUILDINGS' },
    orderBy: { name: 'asc' },
  });

  console.log('\n📊 Seed Summary:');
  console.log(`   • Building items: ${allBuildingItems.length}`);
  console.log(`   • Manufacturing blueprints: ${allBuildingBlueprints.length}`);

  console.log('\n🏗️  Building Items in Database:');
  for (const item of allBuildingItems) {
    const stats = item.unitStats as { health: number; damage: number; shield: number; shieldRange?: number } | null;
    const shieldInfo = stats?.shieldRange && stats.shieldRange > 0 ? ` (AOE ${stats.shieldRange})` : '';
    const statsInfo = stats ? ` [HP: ${stats.health}, Shield: ${stats.shield}${shieldInfo}, DMG: ${stats.damage}]` : '';
    console.log(`   ${item.icon || '🏗️'} ${item.name} (${item.itemId})${statsInfo}`);
  }

  console.log('\n📜 Manufacturing Blueprints in Database:');
  for (const bp of allBuildingBlueprints) {
    console.log(`   📜 ${bp.name} - ${bp.craftTime}s`);
  }

  console.log('\n✨ Building seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
