import { prisma } from '../../lib/prisma.js';
import type { UnitDefinitionInput, UnitDefinitionListQuery } from './types.js';
import type { Prisma } from '@prisma/client';

export const unitDefinitionService = {
  // Get all unit definitions with optional filtering
  async getAll(query: UnitDefinitionListQuery = {}) {
    const { category, search, limit = 100, offset = 0 } = query;

    const where: Prisma.UnitDefinitionWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [units, total] = await Promise.all([
      prisma.unitDefinition.findMany({
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
      prisma.unitDefinition.count({ where }),
    ]);

    return { units, total, limit, offset };
  },

  // Get a single unit definition by ID
  async getById(id: string) {
    return prisma.unitDefinition.findUnique({
      where: { id },
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Get a single unit definition by name
  async getByName(name: string) {
    return prisma.unitDefinition.findUnique({
      where: { name },
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Create a new unit definition
  async create(data: UnitDefinitionInput) {
    const createData: Prisma.UnitDefinitionCreateInput = {
      name: data.name,
    };

    if (data.description !== undefined) createData.description = data.description;
    if (data.modelPath !== undefined) createData.modelPath = data.modelPath;
    if (data.health !== undefined) createData.health = data.health;
    if (data.shield !== undefined) createData.shield = data.shield;
    if (data.shieldRange !== undefined) createData.shieldRange = data.shieldRange;
    if (data.damage !== undefined) createData.damage = data.damage;
    if (data.armor !== undefined) createData.armor = data.armor;
    if (data.speed !== undefined) createData.speed = data.speed;
    if (data.range !== undefined) createData.range = data.range;
    if (data.attackSpeed !== undefined) createData.attackSpeed = data.attackSpeed;
    if (data.category !== undefined) createData.category = data.category;

    return prisma.unitDefinition.create({ data: createData });
  },

  // Update an existing unit definition
  async update(id: string, data: Partial<UnitDefinitionInput>) {
    const updateData: Prisma.UnitDefinitionUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.modelPath !== undefined) updateData.modelPath = data.modelPath;
    if (data.health !== undefined) updateData.health = data.health;
    if (data.shield !== undefined) updateData.shield = data.shield;
    if (data.shieldRange !== undefined) updateData.shieldRange = data.shieldRange;
    if (data.damage !== undefined) updateData.damage = data.damage;
    if (data.armor !== undefined) updateData.armor = data.armor;
    if (data.speed !== undefined) updateData.speed = data.speed;
    if (data.range !== undefined) updateData.range = data.range;
    if (data.attackSpeed !== undefined) updateData.attackSpeed = data.attackSpeed;
    if (data.category !== undefined) updateData.category = data.category;

    return prisma.unitDefinition.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          select: { id: true, itemId: true, name: true, quality: true },
        },
      },
    });
  },

  // Delete a unit definition (only if no items linked)
  async delete(id: string) {
    // Check for linked items
    const unit = await prisma.unitDefinition.findUnique({
      where: { id },
      include: { items: { select: { id: true } } },
    });

    if (!unit) {
      return null;
    }

    if (unit.items.length > 0) {
      throw new Error(`Cannot delete unit definition with ${unit.items.length} linked items`);
    }

    return prisma.unitDefinition.delete({ where: { id } });
  },

  // Duplicate a unit definition
  async duplicate(id: string, newName?: string) {
    const original = await prisma.unitDefinition.findUnique({ where: { id } });
    if (!original) return null;

    const name = newName || `${original.name} (Copy)`;

    return prisma.unitDefinition.create({
      data: {
        name,
        description: original.description,
        modelPath: original.modelPath,
        health: original.health,
        shield: original.shield,
        shieldRange: original.shieldRange,
        damage: original.damage,
        armor: original.armor,
        speed: original.speed,
        range: original.range,
        attackSpeed: original.attackSpeed,
        category: original.category,
      },
    });
  },

  // Get unit definition stats
  async getStats() {
    const [total, byCategory] = await Promise.all([
      prisma.unitDefinition.count(),
      prisma.unitDefinition.groupBy({
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
