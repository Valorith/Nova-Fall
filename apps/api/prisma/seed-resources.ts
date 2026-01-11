// Seed resource items into ItemDefinition table
// This will upsert resources (update existing, insert new) without deleting other items

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from apps/api directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { RESOURCES, NPC_MARKET_PRICES, type ResourceType } from '@nova-fall/shared';

const prisma = new PrismaClient();

// Map resource tiers to quality
function tierToQuality(tier: number): 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
  switch (tier) {
    case 0:
      return 'COMMON'; // Credits
    case 1:
      return 'COMMON'; // Basic resources
    case 2:
      return 'UNCOMMON'; // Processed resources
    case 3:
      return 'RARE'; // Advanced resources
    default:
      return 'COMMON';
  }
}

async function main() {
  console.log('💎 Seeding resource items into ItemDefinition...\n');

  const resourceEntries = Object.entries(RESOURCES) as [ResourceType, (typeof RESOURCES)[ResourceType]][];
  let created = 0;
  let updated = 0;

  for (const [resourceId, resource] of resourceEntries) {
    // Get market prices if this is a tradeable resource (not credits)
    const marketPrices = resourceId !== 'credits' ? NPC_MARKET_PRICES[resourceId as Exclude<ResourceType, 'credits'>] : null;
    const isTradeable = resourceId !== 'credits';

    const itemData = {
      name: resource.name,
      description: resource.description,
      category: 'RESOURCE' as const,
      quality: tierToQuality(resource.tier),
      icon: resource.icon,
      color: resource.color,
      stackSize: resource.stackSize,
      isTradeable,
      buyPrice: marketPrices?.buyPrice ?? null,
      sellPrice: marketPrices?.sellPrice ?? null,
    };

    // Check if item already exists
    const existing = await prisma.itemDefinition.findUnique({
      where: { itemId: resourceId },
    });

    if (existing) {
      // Update existing
      await prisma.itemDefinition.update({
        where: { itemId: resourceId },
        data: itemData,
      });
      console.log(`   ✓ Updated: ${resource.name} (${resourceId})`);
      updated++;
    } else {
      // Create new
      await prisma.itemDefinition.create({
        data: {
          itemId: resourceId,
          ...itemData,
        },
      });
      console.log(`   ✓ Created: ${resource.name} (${resourceId})`);
      created++;
    }
  }

  console.log('\n📊 Seed Summary:');
  console.log(`   • Created: ${created}`);
  console.log(`   • Updated: ${updated}`);
  console.log(`   • Total resources: ${resourceEntries.length}`);

  // Show all resources in database
  const allResources = await prisma.itemDefinition.findMany({
    where: { category: 'RESOURCE' },
    orderBy: { name: 'asc' },
  });

  console.log('\n📦 Resource Items in Database:');
  for (const item of allResources) {
    const tradeInfo = item.isTradeable ? ` [Buy: ${item.buyPrice}💰 / Sell: ${item.sellPrice}💰]` : ' [Not tradeable]';
    console.log(`   ${item.icon || '📦'} ${item.name} (${item.itemId})${tradeInfo}`);
  }

  console.log('\n✨ Resource seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
