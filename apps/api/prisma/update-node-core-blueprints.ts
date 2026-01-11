import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all NODE_CORE blueprints
  const blueprints = await prisma.blueprint.findMany({
    where: { category: 'NODE_CORE' }
  });

  console.log(`Found ${blueprints.length} NODE_CORE blueprints`);

  let updated = 0;
  for (const bp of blueprints) {
    const nodeTypes = (bp.nodeTypes as string[]) || [];
    // Set nodeTypes to ONLY MANUFACTURING_PLANT
    const newNodeTypes = ['MANUFACTURING_PLANT'];

    // Check if it needs updating
    if (nodeTypes.length !== 1 || nodeTypes[0] !== 'MANUFACTURING_PLANT') {
      await prisma.blueprint.update({
        where: { id: bp.id },
        data: { nodeTypes: newNodeTypes }
      });
      console.log(`Updated: ${bp.name} -> nodeTypes: [${newNodeTypes.join(', ')}] (was: [${nodeTypes.join(', ')}])`);
      updated++;
    } else {
      console.log(`Already correct: ${bp.name}`);
    }
  }

  console.log(`\nDone! Updated ${updated} blueprints.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
