import { prisma } from '../../lib/prisma.js';
import type { AIPresetInput, AIPresetListQuery } from './types.js';
import type { Prisma } from '@prisma/client';

export const aiPresetService = {
  // Get all AI presets with optional filtering
  async getAll(query: AIPresetListQuery = {}) {
    const { category, includeTemplates = true, search, limit = 100, offset = 0 } = query;

    const where: Prisma.AIPresetWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (!includeTemplates) {
      where.isTemplate = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [presets, total] = await Promise.all([
      prisma.aIPreset.findMany({
        where,
        include: {
          _count: {
            select: {
              unitDefinitions: true,
              buildingDefinitions: true,
            },
          },
        },
        orderBy: [{ isTemplate: 'desc' }, { name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.aIPreset.count({ where }),
    ]);

    // Transform to include linkedCount for convenience
    const transformedPresets = presets.map((preset) => ({
      ...preset,
      linkedCount: preset._count.unitDefinitions + preset._count.buildingDefinitions,
    }));

    return { presets: transformedPresets, total, limit, offset };
  },

  // Get a single AI preset by ID with full relations
  async getById(id: string) {
    const preset = await prisma.aIPreset.findUnique({
      where: { id },
      include: {
        unitDefinitions: {
          select: { id: true, name: true },
        },
        buildingDefinitions: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            unitDefinitions: true,
            buildingDefinitions: true,
          },
        },
      },
    });

    if (!preset) return null;

    return {
      ...preset,
      linkedCount: preset._count.unitDefinitions + preset._count.buildingDefinitions,
    };
  },

  // Create a new AI preset
  async create(data: AIPresetInput) {
    const createData: Prisma.AIPresetCreateInput = {
      name: data.name,
      category: data.category,
      treeData: data.treeData as unknown as Prisma.InputJsonValue,
      isTemplate: data.isTemplate ?? false,
    };

    // Only set description if it's explicitly provided (null or string)
    if (data.description !== undefined) {
      createData.description = data.description;
    }

    return prisma.aIPreset.create({
      data: createData,
      include: {
        _count: {
          select: {
            unitDefinitions: true,
            buildingDefinitions: true,
          },
        },
      },
    });
  },

  // Update an existing AI preset
  async update(id: string, data: Partial<AIPresetInput>) {
    const updateData: Prisma.AIPresetUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.treeData !== undefined) updateData.treeData = data.treeData as unknown as Prisma.InputJsonValue;
    if (data.isTemplate !== undefined) updateData.isTemplate = data.isTemplate;

    return prisma.aIPreset.update({
      where: { id },
      data: updateData,
      include: {
        unitDefinitions: {
          select: { id: true, name: true },
        },
        buildingDefinitions: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            unitDefinitions: true,
            buildingDefinitions: true,
          },
        },
      },
    });
  },

  // Delete an AI preset (only if not linked to any definitions)
  async delete(id: string) {
    // Check for linked definitions
    const preset = await prisma.aIPreset.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            unitDefinitions: true,
            buildingDefinitions: true,
          },
        },
      },
    });

    if (!preset) {
      return null;
    }

    const linkedCount = preset._count.unitDefinitions + preset._count.buildingDefinitions;
    if (linkedCount > 0) {
      throw new Error(
        `Cannot delete AI preset with ${linkedCount} linked definitions. Unlink all units/buildings first.`
      );
    }

    return prisma.aIPreset.delete({ where: { id } });
  },

  // Duplicate an AI preset
  async duplicate(id: string, newName?: string) {
    const original = await prisma.aIPreset.findUnique({ where: { id } });
    if (!original) return null;

    const name = newName || `${original.name} (Copy)`;

    return prisma.aIPreset.create({
      data: {
        name,
        description: original.description,
        category: original.category,
        treeData: original.treeData as Prisma.InputJsonValue,
        isTemplate: false, // Duplicates are never templates
      },
      include: {
        _count: {
          select: {
            unitDefinitions: true,
            buildingDefinitions: true,
          },
        },
      },
    });
  },

  // Get AI preset stats
  async getStats() {
    const [total, byCategory, templates] = await Promise.all([
      prisma.aIPreset.count(),
      prisma.aIPreset.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
      prisma.aIPreset.count({ where: { isTemplate: true } }),
    ]);

    return {
      total,
      templates,
      byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count.category])),
    };
  },

  // Get only templates
  async getTemplates() {
    return prisma.aIPreset.findMany({
      where: { isTemplate: true },
      orderBy: { name: 'asc' },
    });
  },
};
