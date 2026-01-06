// Database seed script for Nova Fall
// Seeds the world map with nodes, connections, and environment zones

import { PrismaClient } from '@prisma/client';
import { NOVA_PRIME_MAP } from './map-data';
import { getNodeTypeConfig } from '@nova-fall/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Check if data already exists
  const existingNodes = await prisma.node.count();
  if (existingNodes > 0) {
    console.log(`⚠️  Database already has ${existingNodes} nodes. Skipping seed.`);
    console.log('   To reseed, first clear the database with: pnpm db:reset');
    return;
  }

  const { nodes, connections, environmentZones } = NOVA_PRIME_MAP;

  // Seed environment zones first
  console.log(`📍 Creating ${environmentZones.length} environment zones...`);
  for (const zone of environmentZones) {
    await prisma.environmentZone.create({
      data: {
        id: zone.id,
        name: zone.name,
        regionId: zone.regionId,
        stability: zone.stability,
        upkeepMod: zone.upkeepMod,
        nextChangeAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      },
    });
  }
  console.log('✅ Environment zones created');

  // Seed nodes
  console.log(`🗺️  Creating ${nodes.length} nodes...`);
  for (const node of nodes) {
    const config = getNodeTypeConfig(node.type);

    await prisma.node.create({
      data: {
        id: node.id,
        name: node.name,
        type: node.type,
        tier: node.tier,
        positionX: node.positionX,
        positionY: node.positionY,
        regionId: node.regionId,
        status: 'NEUTRAL',
        storage: node.initialResources || config.defaultResources,
      },
    });
  }
  console.log('✅ Nodes created');

  // Seed connections
  console.log(`🔗 Creating ${connections.length} connections...`);
  for (const conn of connections) {
    await prisma.nodeConnection.create({
      data: {
        fromNodeId: conn.fromNodeId,
        toNodeId: conn.toNodeId,
        distance: conn.distance,
        dangerLevel: conn.dangerLevel,
        roadType: conn.roadType,
      },
    });
  }
  console.log('✅ Connections created');

  // Summary
  console.log('\n📊 Seed Summary:');
  console.log(`   • Environment Zones: ${environmentZones.length}`);
  console.log(`   • Nodes: ${nodes.length}`);
  console.log(`   • Connections: ${connections.length}`);
  console.log(`   • Avg connections per node: ${(connections.length * 2 / nodes.length).toFixed(1)}`);

  // Node type distribution
  const typeDistribution = nodes.reduce(
    (acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('\n📈 Node Type Distribution:');
  for (const [type, count] of Object.entries(typeDistribution)) {
    console.log(`   • ${type}: ${count}`);
  }

  // Region distribution
  const regionDistribution = nodes.reduce(
    (acc, node) => {
      acc[node.regionId] = (acc[node.regionId] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('\n🌍 Region Distribution:');
  for (const [region, count] of Object.entries(regionDistribution)) {
    console.log(`   • ${region}: ${count}`);
  }

  console.log('\n✨ Database seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
