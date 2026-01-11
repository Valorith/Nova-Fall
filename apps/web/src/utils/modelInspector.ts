/**
 * Model Inspector Utility
 *
 * Loads GLB/GLTF files and extracts mesh information for the model selector.
 * Uses a temporary Babylon.js scene to parse the model.
 */

import {
  Scene,
  NullEngine,
  SceneLoader,
  type AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export interface MeshInfo {
  name: string;
  isTopLevel: boolean;
  childCount: number;
}

/**
 * Get the model name for a geometry mesh by examining its ancestry.
 * Looks at grandparent/parent names to find the model identifier.
 */
function getModelName(mesh: AbstractMesh): string | null {
  const parent = mesh.parent;
  const grandparent = parent?.parent;
  const grandparentName = grandparent?.name || '';
  const parentName = parent?.name || '';

  // Pattern 1: Grandparent is like "T-B05_5" or "T-A03_11" -> extract "T-B05" or "T-A03"
  const tSeriesMatch = grandparentName.match(/^(T-[A-D]\d{2})_\d+$/);
  if (tSeriesMatch?.[1]) {
    return tSeriesMatch[1];
  }

  // Pattern 2: Parent contains model ID like "T-B05_base 2_4" -> extract "T-B05"
  const tParentMatch = parentName.match(/^(T-[A-D]\d{2})_/);
  if (tParentMatch?.[1]) {
    return tParentMatch[1];
  }

  // Skip KB series (kit-bashed combo turrets) - uncomment below to include them
  // Pattern 3: Grandparent is GLTF_SceneRootNode, parent is like "KB1a_Base B01b_126" -> extract "KB1a"
  // if (grandparentName === 'GLTF_SceneRootNode') {
  //   const kbMatch = parentName.match(/^(KB\d+[a-z]?)_/);
  //   if (kbMatch?.[1]) {
  //     return kbMatch[1];
  //   }
  // }
  // Pattern 4: For nested KB parts
  // const kbGrandparentMatch = grandparentName.match(/^(KB\d+[a-z]?)_/);
  // if (kbGrandparentMatch?.[1]) {
  //   return kbGrandparentMatch[1];
  // }

  return null;
}

/**
 * Check if a mesh has actual geometry (vertices)
 */
function hasGeometry(mesh: AbstractMesh): boolean {
  return mesh.getTotalVertices() > 0;
}

/**
 * Inspect a GLB/GLTF file and return top-level model groups
 * For pack files, this returns the individual model names (e.g., "Turret_01", "Turret_02")
 * rather than all the internal primitives and sub-meshes
 */
export async function inspectModel(modelPath: string): Promise<MeshInfo[]> {
  // Use NullEngine for headless parsing (no WebGL required)
  const engine = new NullEngine();
  const scene = new Scene(engine);

  try {
    // Parse the path
    const fullPath = modelPath.startsWith('/') ? modelPath : `/${modelPath}`;
    const lastSlash = fullPath.lastIndexOf('/');
    const rootUrl = fullPath.substring(0, lastSlash + 1);
    const filename = fullPath.substring(lastSlash + 1);

    // Load the model
    const result = await SceneLoader.ImportMeshAsync('', rootUrl, filename, scene);

    // Strategy: Find all meshes with geometry, then group by their model name
    const modelGroups = new Map<string, number>();

    for (const mesh of result.meshes) {
      // Only consider meshes with actual geometry
      if (!hasGeometry(mesh)) continue;

      // Get the model name for this mesh
      const modelName = getModelName(mesh);
      if (!modelName) continue;

      // Track this model group
      const existing = modelGroups.get(modelName);
      modelGroups.set(modelName, (existing || 0) + 1);
    }

    // Convert to MeshInfo array
    const meshInfos: MeshInfo[] = [];
    for (const [name, meshCount] of modelGroups) {
      meshInfos.push({
        name,
        isTopLevel: true,
        childCount: meshCount,
      });
    }

    // Sort alphabetically for easier browsing
    meshInfos.sort((a, b) => a.name.localeCompare(b.name));

    return meshInfos;
  } finally {
    // Cleanup
    scene.dispose();
    engine.dispose();
  }
}

/**
 * Get only the top-level model names that can be selected
 */
export async function getSelectableMeshes(modelPath: string): Promise<string[]> {
  const meshInfos = await inspectModel(modelPath);
  return meshInfos.map(info => info.name);
}
