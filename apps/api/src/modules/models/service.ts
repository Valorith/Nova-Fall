import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config/index.js';
import type { ModelFile, ModelListResponse } from './types.js';

// Path to the models directory (web app's public folder)
const MODELS_ROOT = config.server.modelsPath || path.resolve(process.cwd(), '../web/public/models');

/**
 * Check if a file is a 3D model file
 */
function isModelFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.glb', '.gltf'].includes(ext);
}

/**
 * Scan a directory for model files
 */
async function scanDirectory(dirPath: string, category: 'buildings' | 'units' | 'other'): Promise<ModelFile[]> {
  const models: ModelFile[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && isModelFile(entry.name)) {
        const filePath = path.join(dirPath, entry.name);
        const stats = await fs.stat(filePath);

        // Create relative URL path
        const relativePath = `/models/${category}/${entry.name}`;

        models.push({
          path: relativePath,
          filename: entry.name,
          category,
          size: stats.size,
          // Files with "pack" in name or larger files might be packs
          isPack: entry.name.toLowerCase().includes('pack') || stats.size > 1000000,
        });
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    console.warn(`Could not read models directory: ${dirPath}`, error);
  }

  return models;
}

/**
 * List all available model files
 */
export async function listModels(): Promise<ModelListResponse> {
  const [buildings, units] = await Promise.all([
    scanDirectory(path.join(MODELS_ROOT, 'buildings'), 'buildings'),
    scanDirectory(path.join(MODELS_ROOT, 'units'), 'units'),
  ]);

  return {
    buildings,
    units,
    other: [],
  };
}

/**
 * Get info about a specific model file
 */
export async function getModelInfo(modelPath: string): Promise<ModelFile | null> {
  // Security: ensure path doesn't escape models directory
  const normalizedPath = path.normalize(modelPath).replace(/^\/models\//, '');
  const fullPath = path.join(MODELS_ROOT, normalizedPath);

  // Check path is still within models root
  if (!fullPath.startsWith(MODELS_ROOT)) {
    return null;
  }

  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isFile()) {
      return null;
    }

    const filename = path.basename(fullPath);
    const category = normalizedPath.startsWith('buildings/')
      ? 'buildings'
      : normalizedPath.startsWith('units/')
        ? 'units'
        : 'other';

    return {
      path: `/models/${normalizedPath}`,
      filename,
      category,
      size: stats.size,
      isPack: filename.toLowerCase().includes('pack') || stats.size > 1000000,
    };
  } catch {
    return null;
  }
}

export const modelService = {
  listModels,
  getModelInfo,
};
