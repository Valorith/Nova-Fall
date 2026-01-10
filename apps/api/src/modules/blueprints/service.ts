import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import type {
  CreateBlueprintRequest,
  UpdateBlueprintRequest,
  ListBlueprintsQuery,
  BlueprintResponse,
  BlueprintListResponse,
  BlueprintMaterial,
} from './types.js';
import type { BlueprintCategory, BlueprintQuality, NodeType } from '@nova-fall/shared';

// Transform Prisma blueprint to API response
function toResponse(blueprint: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  quality: string;
  learned: boolean;
  craftTime: number;
  nodeTypes: Prisma.JsonValue;
  nodeTierRequired: number;
  inputs: Prisma.JsonValue;
  outputs: Prisma.JsonValue;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BlueprintResponse {
  return {
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description,
    category: blueprint.category as BlueprintCategory,
    quality: blueprint.quality as BlueprintQuality,
    learned: blueprint.learned,
    craftTime: blueprint.craftTime,
    nodeTypes: blueprint.nodeTypes as unknown as NodeType[],
    nodeTierRequired: blueprint.nodeTierRequired,
    inputs: blueprint.inputs as unknown as BlueprintMaterial[],
    outputs: blueprint.outputs as unknown as BlueprintMaterial[],
    icon: blueprint.icon,
    createdAt: blueprint.createdAt.toISOString(),
    updatedAt: blueprint.updatedAt.toISOString(),
  };
}

// List all blueprints with optional filtering
export async function listBlueprints(
  query: ListBlueprintsQuery
): Promise<BlueprintListResponse> {
  const { category, quality, learned, search, limit = 50, offset = 0 } = query;

  // Build where clause
  const where: Prisma.BlueprintWhereInput = {};

  if (category) {
    where.category = category;
  }

  if (quality) {
    where.quality = quality;
  }

  if (learned !== undefined) {
    where.learned = learned === 'true';
  }

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  // Get total count and blueprints
  const [total, blueprints] = await Promise.all([
    prisma.blueprint.count({ where }),
    prisma.blueprint.findMany({
      where,
      take: Math.min(limit, 100), // Cap at 100
      skip: offset,
      orderBy: [{ quality: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return {
    blueprints: blueprints.map(toResponse),
    total,
    limit: Math.min(limit, 100),
    offset,
  };
}

// Get a single blueprint by ID
export async function getBlueprint(id: string): Promise<BlueprintResponse | null> {
  const blueprint = await prisma.blueprint.findUnique({
    where: { id },
  });

  if (!blueprint) {
    return null;
  }

  return toResponse(blueprint);
}

// Create a new blueprint
export async function createBlueprint(
  data: CreateBlueprintRequest
): Promise<BlueprintResponse> {
  const blueprint = await prisma.blueprint.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category,
      quality: data.quality,
      learned: data.learned,
      craftTime: data.craftTime,
      nodeTypes: data.nodeTypes as unknown as Prisma.InputJsonValue,
      nodeTierRequired: data.nodeTierRequired,
      inputs: data.inputs as unknown as Prisma.InputJsonValue,
      outputs: data.outputs as unknown as Prisma.InputJsonValue,
      icon: data.icon ?? null,
    },
  });

  return toResponse(blueprint);
}

// Update an existing blueprint
export async function updateBlueprint(
  id: string,
  data: UpdateBlueprintRequest
): Promise<BlueprintResponse | null> {
  // Check if blueprint exists
  const existing = await prisma.blueprint.findUnique({
    where: { id },
  });

  if (!existing) {
    return null;
  }

  // Build update data (only include provided fields)
  const updateData: Prisma.BlueprintUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.quality !== undefined) updateData.quality = data.quality;
  if (data.learned !== undefined) updateData.learned = data.learned;
  if (data.craftTime !== undefined) updateData.craftTime = data.craftTime;
  if (data.nodeTypes !== undefined) updateData.nodeTypes = data.nodeTypes as unknown as Prisma.InputJsonValue;
  if (data.nodeTierRequired !== undefined) updateData.nodeTierRequired = data.nodeTierRequired;
  if (data.inputs !== undefined) updateData.inputs = data.inputs as unknown as Prisma.InputJsonValue;
  if (data.outputs !== undefined) updateData.outputs = data.outputs as unknown as Prisma.InputJsonValue;
  if (data.icon !== undefined) updateData.icon = data.icon;

  const blueprint = await prisma.blueprint.update({
    where: { id },
    data: updateData,
  });

  return toResponse(blueprint);
}

// Delete a blueprint
export async function deleteBlueprint(id: string): Promise<boolean> {
  const existing = await prisma.blueprint.findUnique({
    where: { id },
  });

  if (!existing) {
    return false;
  }

  await prisma.blueprint.delete({
    where: { id },
  });

  return true;
}

// Duplicate a blueprint (useful for creating quality variants)
export async function duplicateBlueprint(
  id: string,
  overrides?: Partial<CreateBlueprintRequest>
): Promise<BlueprintResponse | null> {
  const existing = await prisma.blueprint.findUnique({
    where: { id },
  });

  if (!existing) {
    return null;
  }

  // Create new blueprint based on existing
  const blueprint = await prisma.blueprint.create({
    data: {
      name: overrides?.name ?? `${existing.name} (Copy)`,
      description: overrides?.description ?? existing.description,
      category: overrides?.category ?? existing.category,
      quality: overrides?.quality ?? existing.quality,
      learned: overrides?.learned ?? existing.learned,
      craftTime: overrides?.craftTime ?? existing.craftTime,
      nodeTypes: overrides?.nodeTypes
        ? (overrides.nodeTypes as unknown as Prisma.InputJsonValue)
        : (existing.nodeTypes as Prisma.InputJsonValue),
      nodeTierRequired: overrides?.nodeTierRequired ?? existing.nodeTierRequired,
      inputs: overrides?.inputs
        ? (overrides.inputs as unknown as Prisma.InputJsonValue)
        : (existing.inputs as Prisma.InputJsonValue),
      outputs: overrides?.outputs
        ? (overrides.outputs as unknown as Prisma.InputJsonValue)
        : (existing.outputs as Prisma.InputJsonValue),
      icon: overrides?.icon ?? existing.icon,
    },
  });

  return toResponse(blueprint);
}

// Get all unique categories in use
export async function getUsedCategories(): Promise<BlueprintCategory[]> {
  const result = await prisma.blueprint.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });

  return result.map((r) => r.category as unknown as BlueprintCategory);
}

// Get all unique qualities in use
export async function getUsedQualities(): Promise<BlueprintQuality[]> {
  const result = await prisma.blueprint.findMany({
    select: { quality: true },
    distinct: ['quality'],
    orderBy: { quality: 'asc' },
  });

  return result.map((r) => r.quality as unknown as BlueprintQuality);
}

// Get blueprint statistics for dashboard
export async function getBlueprintStats(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byQuality: Record<string, number>;
  learned: number;
  default: number;
}> {
  const [total, learned, byCategory, byQuality] = await Promise.all([
    prisma.blueprint.count(),
    prisma.blueprint.count({ where: { learned: true } }),
    prisma.blueprint.groupBy({
      by: ['category'],
      _count: { category: true },
    }),
    prisma.blueprint.groupBy({
      by: ['quality'],
      _count: { quality: true },
    }),
  ]);

  return {
    total,
    byCategory: Object.fromEntries(
      byCategory.map((c) => [c.category, c._count.category])
    ),
    byQuality: Object.fromEntries(
      byQuality.map((q) => [q.quality, q._count.quality])
    ),
    learned,
    default: total - learned,
  };
}
