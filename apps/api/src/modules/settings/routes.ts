import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { NodeType } from '@nova-fall/shared';

// Default node icons (used if not customized)
const DEFAULT_NODE_ICONS: Record<string, string> = {
  [NodeType.MINING]: '⛏️',
  [NodeType.REFINERY]: '🏭',
  [NodeType.RESEARCH]: '🔬',
  [NodeType.TRADE_HUB]: '💰',
  [NodeType.BARRACKS]: '⚔️',
  [NodeType.AGRICULTURAL]: '🌾',
  [NodeType.POWER_PLANT]: '⚡',
  [NodeType.MANUFACTURING_PLANT]: '🔧',
  [NodeType.CAPITAL]: '🏛️',
  [NodeType.CROWN]: '👑',
};

export async function settingsRoutes(app: FastifyInstance) {
  // Get all settings
  app.get('/api/settings', async () => {
    const settings = await prisma.gameSetting.findMany();

    // Convert to key-value object
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return { data: result };
  });

  // =============================================
  // Node Icons routes (MUST be before /:key route)
  // =============================================

  // Get node icons specifically (convenience endpoint)
  app.get('/api/settings/node-icons', async () => {
    const setting = await prisma.gameSetting.findUnique({
      where: { key: 'nodeIcons' },
    });

    // Merge defaults with custom icons
    const customIcons = (setting?.value as Record<string, string>) || {};
    const mergedIcons = { ...DEFAULT_NODE_ICONS, ...customIcons };

    return { data: mergedIcons };
  });

  // Update a single node type icon
  app.put<{ Params: { nodeType: string }; Body: { icon: string } }>(
    '/api/settings/node-icons/:nodeType',
    async (request, reply) => {
      const { nodeType } = request.params;
      const { icon } = request.body;

      // Validate node type
      if (!Object.values(NodeType).includes(nodeType as NodeType)) {
        return reply.status(400).send({ error: { message: 'Invalid node type' } });
      }

      // Get existing custom icons
      const existing = await prisma.gameSetting.findUnique({
        where: { key: 'nodeIcons' },
      });

      const currentIcons = (existing?.value as Record<string, string>) || {};
      const updatedIcons = { ...currentIcons, [nodeType]: icon };

      // Upsert the setting
      await prisma.gameSetting.upsert({
        where: { key: 'nodeIcons' },
        update: { value: updatedIcons },
        create: { key: 'nodeIcons', value: updatedIcons },
      });

      return { data: { nodeType, icon } };
    }
  );

  // Reset node icons to defaults
  app.delete('/api/settings/node-icons', async () => {
    await prisma.gameSetting.deleteMany({
      where: { key: 'nodeIcons' },
    });

    return { data: DEFAULT_NODE_ICONS };
  });

  // =============================================
  // Generic settings routes (AFTER specific routes)
  // =============================================

  // Get a specific setting by key
  app.get<{ Params: { key: string } }>('/api/settings/:key', async (request, reply) => {
    const { key } = request.params;

    const setting = await prisma.gameSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      // Return default values for known settings
      if (key === 'nodeIcons') {
        return { data: { key, value: DEFAULT_NODE_ICONS } };
      }
      return reply.status(404).send({ error: { message: 'Setting not found' } });
    }

    return { data: { key: setting.key, value: setting.value } };
  });

  // Update a setting (upsert)
  app.put<{ Params: { key: string }; Body: { value: unknown } }>(
    '/api/settings/:key',
    async (request) => {
      const { key } = request.params;
      const { value } = request.body;

      const setting = await prisma.gameSetting.upsert({
        where: { key },
        update: { value: value as object },
        create: { key, value: value as object },
      });

      return { data: { key: setting.key, value: setting.value } };
    }
  );
}
