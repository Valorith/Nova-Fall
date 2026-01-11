import { prisma } from '../../lib/prisma.js';
import type { ItemDefinitionInput, ItemDefinitionListQuery } from './types.js';
import type { Prisma } from '@prisma/client';

export const itemDefinitionService = {
  // Get all item definitions with optional filtering
  async getAll(query: ItemDefinitionListQuery = {}) {
    const { category, quality, isTradeable, search, limit = 100, offset = 0 } = query;

    const where: Prisma.ItemDefinitionWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (quality) {
      where.quality = quality;
    }

    if (isTradeable !== undefined) {
      where.isTradeable = isTradeable;
    }

    if (search) {
      where.OR = [
        { itemId: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.itemDefinition.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.itemDefinition.count({ where }),
    ]);

    return { items, total, limit, offset };
  },

  // Get a single item definition by database ID
  async getById(id: string) {
    return prisma.itemDefinition.findUnique({ where: { id } });
  },

  // Get a single item definition by itemId
  async getByItemId(itemId: string) {
    return prisma.itemDefinition.findUnique({ where: { itemId } });
  },

  // Create a new item definition
  async create(data: ItemDefinitionInput) {
    const createData: Prisma.ItemDefinitionCreateInput = {
      itemId: data.itemId,
      name: data.name,
      category: data.category,
    };

    if (data.description !== undefined) createData.description = data.description;
    if (data.quality !== undefined) createData.quality = data.quality;
    if (data.icon !== undefined) createData.icon = data.icon;
    if (data.color !== undefined) createData.color = data.color;
    if (data.stackSize !== undefined) createData.stackSize = data.stackSize;
    if (data.targetNodeType !== undefined) createData.targetNodeType = data.targetNodeType;
    if (data.coreCost !== undefined) createData.coreCost = data.coreCost;
    if (data.efficiency !== undefined) createData.efficiency = data.efficiency;
    if (data.isTradeable !== undefined) createData.isTradeable = data.isTradeable;
    if (data.buyPrice !== undefined) createData.buyPrice = data.buyPrice;
    if (data.sellPrice !== undefined) createData.sellPrice = data.sellPrice;
    if (data.productionRates !== undefined) {
      createData.productionRates = data.productionRates as Prisma.InputJsonValue;
    }
    if (data.isBlueprint !== undefined) createData.isBlueprint = data.isBlueprint;
    if (data.linkedBlueprintId !== undefined) createData.linkedBlueprintId = data.linkedBlueprintId;

    return prisma.itemDefinition.create({ data: createData });
  },

  // Update an existing item definition
  async update(id: string, data: Partial<ItemDefinitionInput>) {
    const updateData: Prisma.ItemDefinitionUpdateInput = {};

    if (data.itemId !== undefined) updateData.itemId = data.itemId;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.quality !== undefined) updateData.quality = data.quality;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.stackSize !== undefined) updateData.stackSize = data.stackSize;
    if (data.targetNodeType !== undefined) updateData.targetNodeType = data.targetNodeType;
    if (data.coreCost !== undefined) updateData.coreCost = data.coreCost;
    if (data.efficiency !== undefined) updateData.efficiency = data.efficiency;
    if (data.isTradeable !== undefined) updateData.isTradeable = data.isTradeable;
    if (data.buyPrice !== undefined) updateData.buyPrice = data.buyPrice;
    if (data.sellPrice !== undefined) updateData.sellPrice = data.sellPrice;
    if (data.productionRates !== undefined) {
      updateData.productionRates = data.productionRates as Prisma.InputJsonValue;
    }
    if (data.isBlueprint !== undefined) updateData.isBlueprint = data.isBlueprint;
    if (data.linkedBlueprintId !== undefined) updateData.linkedBlueprintId = data.linkedBlueprintId;

    return prisma.itemDefinition.update({
      where: { id },
      data: updateData,
    });
  },

  // Delete an item definition
  async delete(id: string) {
    return prisma.itemDefinition.delete({ where: { id } });
  },

  // Duplicate an item definition
  async duplicate(id: string, newItemId?: string) {
    const original = await prisma.itemDefinition.findUnique({ where: { id } });
    if (!original) return null;

    const itemId = newItemId || `${original.itemId}_copy`;
    const name = `${original.name} (Copy)`;

    const createData: Parameters<typeof prisma.itemDefinition.create>[0]['data'] = {
      itemId,
      name,
      description: original.description,
      category: original.category,
      quality: original.quality,
      icon: original.icon,
      color: original.color,
      stackSize: original.stackSize,
      targetNodeType: original.targetNodeType,
      coreCost: original.coreCost,
      efficiency: original.efficiency,
      isTradeable: original.isTradeable,
      buyPrice: original.buyPrice,
      sellPrice: original.sellPrice,
      isBlueprint: original.isBlueprint,
      linkedBlueprintId: original.linkedBlueprintId,
    };

    if (original.productionRates) {
      createData.productionRates = original.productionRates;
    }

    return prisma.itemDefinition.create({ data: createData });
  },

  // Get item definition stats
  async getStats() {
    const [total, byCategory, tradeable] = await Promise.all([
      prisma.itemDefinition.count(),
      prisma.itemDefinition.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
      prisma.itemDefinition.count({ where: { isTradeable: true } }),
    ]);

    return {
      total,
      byCategory: Object.fromEntries(
        byCategory.map((c) => [c.category, c._count.category])
      ),
      tradeable,
    };
  },

  // Seed default items from hardcoded definitions
  async seedDefaults() {
    // Import hardcoded definitions
    const { RESOURCES } = await import('@nova-fall/shared');
    const { NODE_CORES } = await import('@nova-fall/shared');

    const created: string[] = [];
    const skipped: string[] = [];

    // Seed resources
    for (const [resourceId, resource] of Object.entries(RESOURCES)) {
      const existing = await prisma.itemDefinition.findUnique({
        where: { itemId: resourceId },
      });

      if (existing) {
        skipped.push(resourceId);
        continue;
      }

      await prisma.itemDefinition.create({
        data: {
          itemId: resourceId,
          name: resource.name,
          description: resource.description,
          category: 'RESOURCE',
          icon: resource.icon,
          color: resource.color,
          stackSize: resource.stackSize,
          isTradeable: resourceId !== 'credits',
        },
      });
      created.push(resourceId);
    }

    // Seed node cores
    for (const [coreId, core] of Object.entries(NODE_CORES)) {
      const existing = await prisma.itemDefinition.findUnique({
        where: { itemId: coreId },
      });

      if (existing) {
        skipped.push(coreId);
        continue;
      }

      await prisma.itemDefinition.create({
        data: {
          itemId: coreId,
          name: core.name,
          description: core.description,
          category: 'NODE_CORE',
          icon: core.icon,
          color: core.color,
          stackSize: 100,
          targetNodeType: core.targetNode,
          coreCost: core.cost,
          isTradeable: false,
        },
      });
      created.push(coreId);
    }

    return { created, skipped };
  },
};
