import { prisma } from '../../lib/prisma.js';
import type { BuildingDefinitionInput, BuildingDefinitionListQuery } from './types.js';
import type { Prisma } from '@prisma/client';

export const buildingDefinitionService = {
  // Get all building definitions with optional filtering
  async getAll(query: BuildingDefinitionListQuery = {}) {
    const { category, search, limit = 100, offset = 0 } = query;

    const where: Prisma.BuildingDefinitionWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [buildings, total] = await Promise.all([
      prisma.buildingDefinition.findMany({
        where,
        include: {
          items: {
            select: { id: true, itemId: true, name: true, quality: true },
          },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.buildingDefinition.count({ where }),
    ]);

    return { buildings, total, limit, offset };
  },

  // Get a single building definition by ID
  async getById(id: string) {
    return prisma.buildingDefinition.findUnique({
      where: { id },
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Get a single building definition by name
  async getByName(name: string) {
    return prisma.buildingDefinition.findUnique({
      where: { name },
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Create a new building definition
  async create(data: BuildingDefinitionInput) {
    const createData: Prisma.BuildingDefinitionCreateInput = {
      name: data.name,
    };

    if (data.description !== undefined) createData.description = data.description;
    if (data.modelPath !== undefined) createData.modelPath = data.modelPath;
    if (data.width !== undefined) createData.width = data.width;
    if (data.height !== undefined) createData.height = data.height;
    if (data.health !== undefined) createData.health = data.health;
    if (data.shield !== undefined) createData.shield = data.shield;
    if (data.armor !== undefined) createData.armor = data.armor;
    if (data.damage !== undefined) createData.damage = data.damage;
    if (data.range !== undefined) createData.range = data.range;
    if (data.attackSpeed !== undefined) createData.attackSpeed = data.attackSpeed;
    if (data.category !== undefined) createData.category = data.category;

    return prisma.buildingDefinition.create({ data: createData });
  },

  // Update an existing building definition
  async update(id: string, data: Partial<BuildingDefinitionInput>) {
    const updateData: Prisma.BuildingDefinitionUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.modelPath !== undefined) updateData.modelPath = data.modelPath;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.health !== undefined) updateData.health = data.health;
    if (data.shield !== undefined) updateData.shield = data.shield;
    if (data.armor !== undefined) updateData.armor = data.armor;
    if (data.damage !== undefined) updateData.damage = data.damage;
    if (data.range !== undefined) updateData.range = data.range;
    if (data.attackSpeed !== undefined) updateData.attackSpeed = data.attackSpeed;
    if (data.category !== undefined) updateData.category = data.category;

    return prisma.buildingDefinition.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Delete a building definition (only if no items linked)
  async delete(id: string) {
    // Check for linked items
    const building = await prisma.buildingDefinition.findUnique({
      where: { id },
      include: { items: { select: { id: true } } },
    });

    if (!building) {
      return null;
    }

    if (building.items.length > 0) {
      throw new Error(`Cannot delete building definition with ${building.items.length} linked items`);
    }

    return prisma.buildingDefinition.delete({ where: { id } });
  },

  // Duplicate a building definition
  async duplicate(id: string, newName?: string) {
    const original = await prisma.buildingDefinition.findUnique({ where: { id } });
    if (!original) return null;

    const name = newName || `${original.name} (Copy)`;

    return prisma.buildingDefinition.create({
      data: {
        name,
        description: original.description,
        modelPath: original.modelPath,
        width: original.width,
        height: original.height,
        health: original.health,
        shield: original.shield,
        armor: original.armor,
        damage: original.damage,
        range: original.range,
        attackSpeed: original.attackSpeed,
        category: original.category,
      },
    });
  },

  // Get building definition stats
  async getStats() {
    const [total, byCategory] = await Promise.all([
      prisma.buildingDefinition.count(),
      prisma.buildingDefinition.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
    ]);

    return {
      total,
      byCategory: Object.fromEntries(
        byCategory.map((c) => [c.category, c._count.category])
      ),
    };
  },
};
