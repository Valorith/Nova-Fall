<script setup lang="ts">
/**
 * ModelCalibrationPanel - Dev tool for calibrating barrel positions on 3D models
 *
 * Features:
 * - Embedded 3D model preview with Babylon.js
 * - Lists all mesh parts with color-coded highlighting
 * - Click to select barrel mesh
 * - X/Y/Z position controls for barrel line (parented to pitch mesh)
 * - Barrel line rotates with the model during simulation
 * - Saves barrelMeshName and barrelLinePosition to definition
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { buildingsApi, unitsApi } from '@/services/api';
import { useToastStore } from '@/stores/toast';
import type { DbBuildingDefinition, DbUnitDefinition, MeshPartFlag } from '@nova-fall/shared';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  SceneLoader,
  Mesh,
  StandardMaterial,
  MeshBuilder,
  TransformNode,
} from '@babylonjs/core';
import type { BarrelLinePosition } from '@nova-fall/shared';
import '@babylonjs/loaders/glTF';

// Toast notifications
const toast = useToastStore();

// Entity type selection
type EntityType = 'building' | 'unit';
const entityType = ref<EntityType>('building');

// Definitions
const buildingDefinitions = ref<DbBuildingDefinition[]>([]);
const unitDefinitions = ref<DbUnitDefinition[]>([]);
const selectedDefinitionId = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);

// 3D Scene
const canvasRef = ref<HTMLCanvasElement | null>(null);
let engine: Engine | null = null;
let scene: Scene | null = null;
let currentMeshes: Mesh[] = [];
const originalMaterials = new Map<Mesh, StandardMaterial | null>();

// Mesh selection
const meshNames = ref<string[]>([]);
const selectedMeshName = ref<string | null>(null);
const hoveredMeshName = ref<string | null>(null);

// Barrel line position (local to pitch mesh)
const barrelLineX = ref(0);
const barrelLineY = ref(0);
const barrelLineZ = ref(0);

// Reference to the pitch mesh parent for barrel line
let pitchMeshForBarrelLine: Mesh | TransformNode | null = null;

// Mesh part flags: {"meshName": ["base", "pitch", "yaw"]}
const meshPartFlags = ref<Record<string, MeshPartFlag[]>>({});

// Rotation simulation
const simulatedYaw = ref(0); // Degrees, -180 to 180
const simulatedPitch = ref(0); // Degrees, -45 to 45

// Rotation clamps (min/max bounds)
const yawClampMin = ref(-180);
const yawClampMax = ref(180);
const pitchClampMin = ref(-45);
const pitchClampMax = ref(45);

// Y offset visual indicator
let modelCenter = new Vector3(0, 0, 0);

// Colors for highlighting
const COLOR_SELECTED = new Color3(0.13, 0.77, 0.37); // Green
const COLOR_HOVERED = new Color3(0.23, 0.51, 0.96); // Blue

// Computed
const selectedDefinition = computed(() => {
  if (!selectedDefinitionId.value) return null;
  if (entityType.value === 'building') {
    return buildingDefinitions.value.find((b) => b.id === selectedDefinitionId.value) || null;
  } else {
    return unitDefinitions.value.find((u) => u.id === selectedDefinitionId.value) || null;
  }
});

const definitionsWithModels = computed(() => {
  if (entityType.value === 'building') {
    return buildingDefinitions.value.filter((b) => b.modelPath);
  } else {
    return unitDefinitions.value.filter((u) => u.modelPath);
  }
});

// Load definitions
async function loadDefinitions() {
  loading.value = true;
  try {
    const [buildingsRes, unitsRes] = await Promise.all([buildingsApi.getAll(), unitsApi.getAll()]);
    buildingDefinitions.value = buildingsRes.data.buildings;
    unitDefinitions.value = unitsRes.data.units;
  } catch (err) {
    console.error('Failed to load definitions:', err);
  } finally {
    loading.value = false;
  }
}

// Initialize Babylon.js scene
function initScene() {
  if (!canvasRef.value) return;

  engine = new Engine(canvasRef.value, true, { preserveDrawingBuffer: true, stencil: true });
  scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.08, 0.11, 1); // Dark background

  // Camera
  const camera = new ArcRotateCamera('camera', Math.PI / 4, Math.PI / 3, 10, Vector3.Zero(), scene);
  camera.attachControl(canvasRef.value, true);
  camera.wheelPrecision = 50;
  camera.minZ = 0.1;
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 50;

  // Lights
  const light1 = new HemisphericLight('light1', new Vector3(1, 1, 0), scene);
  light1.intensity = 0.8;
  const light2 = new HemisphericLight('light2', new Vector3(-1, -1, 0), scene);
  light2.intensity = 0.4;

  // Ground grid for reference
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: 20, height: 20, subdivisions: 20 },
    scene
  );
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.wireframe = true;
  groundMat.emissiveColor = new Color3(0.15, 0.18, 0.22);
  ground.material = groundMat;
  ground.position.y = -0.01;

  engine.runRenderLoop(() => {
    scene?.render();
  });
}

// Load 3D model
async function loadModel(modelPath: string) {
  if (!scene) return;

  // Clear previous model meshes
  for (const mesh of currentMeshes) {
    if (!mesh.isDisposed()) {
      mesh.dispose();
    }
  }
  currentMeshes = [];

  // Clear any remaining meshes from previous loads (except ground)
  const meshesToDispose = scene.meshes.filter((m) => m.name !== 'ground');
  for (const mesh of meshesToDispose) {
    mesh.dispose();
  }

  // Clear transform nodes
  const nodesToDispose = [...scene.transformNodes];
  for (const node of nodesToDispose) {
    node.dispose();
  }

  originalMaterials.clear();
  meshNames.value = [];
  selectedMeshName.value = null;
  hoveredMeshName.value = null;
  meshPartFlags.value = {}; // Clear previous flags before loading new model

  // Parse model path for optional mesh name (e.g., "pack.glb#T-A03")
  let filePath = modelPath;
  let targetMeshName: string | null = null;
  const hashIndex = modelPath.indexOf('#');
  if (hashIndex !== -1) {
    filePath = modelPath.substring(0, hashIndex);
    targetMeshName = modelPath.substring(hashIndex + 1);
  }

  try {
    // Determine the base URL and filename
    const fullPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const lastSlash = fullPath.lastIndexOf('/');
    const rootUrl = fullPath.substring(0, lastSlash + 1);
    const filename = fullPath.substring(lastSlash + 1);

    // Load the model
    const result = await SceneLoader.ImportMeshAsync('', rootUrl, filename, scene);

    // If targeting a specific mesh, filter to only meshes belonging to that model
    const meshesToKeep: Mesh[] = [];

    if (targetMeshName) {
      // Build patterns to match parent/grandparent names
      const escapedName = targetMeshName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isTSeries = /^T-[A-D]\d{2}$/.test(targetMeshName);

      const grandparentPattern = isTSeries
        ? new RegExp(`^${escapedName}_\\d+$`)
        : new RegExp(`^${escapedName}_`);
      const parentPattern = new RegExp(`^${escapedName}_`);

      for (const mesh of result.meshes) {
        if (mesh.name === '__root__') {
          continue;
        }

        const parentName = mesh.parent?.name || '';
        const grandparentName = mesh.parent?.parent?.name || '';

        const belongsToModel =
          grandparentPattern.test(grandparentName) ||
          parentPattern.test(parentName) ||
          grandparentPattern.test(parentName);

        if (belongsToModel && mesh instanceof Mesh) {
          meshesToKeep.push(mesh);
        } else if (mesh instanceof Mesh) {
          mesh.dispose();
        }
      }

      if (meshesToKeep.length === 0) {
        console.warn(`No meshes found for model "${targetMeshName}", showing all`);
        const reloadResult = await SceneLoader.ImportMeshAsync('', rootUrl, filename, scene);
        for (const mesh of reloadResult.meshes) {
          if (mesh instanceof Mesh && mesh.name !== '__root__') {
            meshesToKeep.push(mesh);
          }
        }
      }
    } else {
      for (const mesh of result.meshes) {
        if (mesh instanceof Mesh && mesh.name !== '__root__') {
          meshesToKeep.push(mesh);
        }
      }
    }

    currentMeshes = meshesToKeep;

    // Get the camera and frame the model
    const camera = scene.activeCamera as ArcRotateCamera;
    if (meshesToKeep.length > 0 && camera) {
      let minBounds = new Vector3(Infinity, Infinity, Infinity);
      let maxBounds = new Vector3(-Infinity, -Infinity, -Infinity);
      let hasValidBounds = false;

      for (const mesh of meshesToKeep) {
        if (mesh.getTotalVertices() === 0) continue;
        mesh.computeWorldMatrix(true);
        const boundingInfo = mesh.getBoundingInfo();
        const min = boundingInfo.boundingBox.minimumWorld;
        const max = boundingInfo.boundingBox.maximumWorld;

        if (!isFinite(min.x) || !isFinite(max.x)) continue;

        minBounds = Vector3.Minimize(minBounds, min);
        maxBounds = Vector3.Maximize(maxBounds, max);
        hasValidBounds = true;
      }

      if (hasValidBounds) {
        const size = maxBounds.subtract(minBounds);

        // Calculate scale factor to normalize model size
        // Target size: each tile is ~1 unit in the preview
        const def = selectedDefinition.value;
        let targetSize = 2; // Default preview size

        if (def) {
          if (entityType.value === 'unit') {
            // Units use tileSize
            const unitDef = def as DbUnitDefinition;
            targetSize = (unitDef.tileSize || 1) * 2; // Scale to tile size
          } else {
            // Buildings use width/height
            const buildingDef = def as DbBuildingDefinition;
            targetSize = Math.max(buildingDef.width || 1, buildingDef.height || 1) * 2;
          }
        }

        // Scale based on model's XZ footprint to fit target size
        const modelFootprint = Math.max(size.x, size.z);
        let scaleFactor = 1;
        if (modelFootprint > 0) {
          scaleFactor = targetSize / modelFootprint;
        }

        console.log(
          `Model scaling: footprint=${modelFootprint.toFixed(2)}, targetSize=${targetSize}, scale=${scaleFactor.toFixed(3)}`
        );

        // Apply scale at the root level to keep meshes connected
        // Find common parent (usually __root__ or first transform node)
        const rootNode = scene.getTransformNodeByName('__root__');
        if (rootNode) {
          rootNode.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);
        } else if (meshesToKeep.length > 0) {
          // Fallback: find common ancestor of all meshes
          const firstMesh = meshesToKeep[0];
          if (firstMesh) {
            let commonParent = firstMesh.parent as TransformNode | null;
            while (commonParent?.parent) {
              commonParent = commonParent.parent as TransformNode;
            }
            if (commonParent) {
              commonParent.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);
            } else {
              // Last resort: scale individual meshes (may cause disconnection)
              for (const mesh of meshesToKeep) {
                mesh.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);
              }
            }
          }
        }

        // Recalculate bounds after scaling
        minBounds = new Vector3(Infinity, Infinity, Infinity);
        maxBounds = new Vector3(-Infinity, -Infinity, -Infinity);

        for (const mesh of meshesToKeep) {
          if (mesh.getTotalVertices() === 0) continue;
          mesh.computeWorldMatrix(true);
          const boundingInfo = mesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;
          if (!isFinite(min.x) || !isFinite(max.x)) continue;
          minBounds = Vector3.Minimize(minBounds, min);
          maxBounds = Vector3.Maximize(maxBounds, max);
        }

        const scaledCenter = minBounds.add(maxBounds).scale(0.5);
        const scaledSize = maxBounds.subtract(minBounds);
        const maxDimension = Math.max(scaledSize.x, scaledSize.y, scaledSize.z);
        const distance = maxDimension * 1.5;

        // Store model center for Y offset indicator
        modelCenter = scaledCenter.clone();

        camera.target = scaledCenter;
        camera.radius = Math.max(distance, 1);
        camera.alpha = Math.PI / 4;
        camera.beta = Math.PI / 3;
        camera.lowerRadiusLimit = distance * 0.2;
        camera.upperRadiusLimit = distance * 5;

        // Move the ground grid to be under the model
        const ground = scene.getMeshByName('ground');
        if (ground) {
          ground.position.x = scaledCenter.x;
          ground.position.z = scaledCenter.z;
          ground.position.y = minBounds.y - 0.01;
        }
      }
    }

    // Collect mesh names
    const names: string[] = [];
    for (const mesh of meshesToKeep) {
      if (mesh.getTotalVertices() > 0 && !mesh.name.startsWith('ground')) {
        names.push(mesh.name);
      }
    }
    meshNames.value = names;

    // Load saved values from definition
    if (selectedDefinition.value) {
      const def = selectedDefinition.value;
      selectedMeshName.value = def.barrelMeshName || null;

      // Load barrel line position from definition
      const savedPos = def.barrelLinePosition as BarrelLinePosition | null | undefined;
      if (savedPos && typeof savedPos === 'object') {
        barrelLineX.value = savedPos.x ?? 0;
        barrelLineY.value = savedPos.y ?? 0;
        barrelLineZ.value = savedPos.z ?? 0;
      } else {
        // Fallback: migrate from old barrelOffsetY if present
        barrelLineX.value = 0;
        barrelLineY.value = def.barrelOffsetY || 0;
        barrelLineZ.value = 0;
      }

      // Load mesh part flags from definition
      const savedFlags = def.meshPartFlags as Record<string, MeshPartFlag[]> | null | undefined;
      if (savedFlags && typeof savedFlags === 'object' && Object.keys(savedFlags).length > 0) {
        meshPartFlags.value = { ...savedFlags };
      } else {
        meshPartFlags.value = {};
      }

      // Load rotation clamps from definition
      yawClampMin.value = def.yawClampMin ?? -180;
      yawClampMax.value = def.yawClampMax ?? 180;
      pitchClampMin.value = def.pitchClampMin ?? -45;
      pitchClampMax.value = def.pitchClampMax ?? 45;

      // Apply saved highlighting
      if (selectedMeshName.value) {
        highlightMesh(selectedMeshName.value, COLOR_SELECTED);
      }
    }

    // Always update Y offset indicator after model loads
    updateBarrelLineIndicator();

    console.log(`Loaded model with ${names.length} meshes:`, names);
    console.log(
      `Model center: (${modelCenter.x.toFixed(2)}, ${modelCenter.y.toFixed(2)}, ${modelCenter.z.toFixed(2)}), barrelLinePos: (${barrelLineX.value.toFixed(2)}, ${barrelLineY.value.toFixed(2)}, ${barrelLineZ.value.toFixed(2)})`
    );
  } catch (err) {
    console.error('Failed to load model:', err);
  }
}

function findMeshByName(name: string): Mesh | null {
  if (!scene) return null;

  // Search through kept meshes
  for (const mesh of currentMeshes) {
    if (mesh.name === name && !mesh.isDisposed()) {
      return mesh;
    }
  }
  return null;
}

function highlightMesh(meshName: string, color: Color3) {
  const mesh = findMeshByName(meshName);
  if (!mesh || !scene) return;

  // Store original material if not already stored
  if (!originalMaterials.has(mesh)) {
    originalMaterials.set(mesh, mesh.material as StandardMaterial | null);
  }

  // Create highlight material
  const highlightMat = new StandardMaterial(`highlight_${meshName}`, scene);
  highlightMat.diffuseColor = color;
  highlightMat.emissiveColor = color.scale(0.3);
  highlightMat.specularColor = new Color3(0.2, 0.2, 0.2);
  mesh.material = highlightMat;
}

function clearMeshHighlight(meshName: string) {
  const mesh = findMeshByName(meshName);
  if (!mesh) return;

  const originalMat = originalMaterials.get(mesh);
  if (originalMat !== undefined) {
    mesh.material = originalMat;
  }
}

function clearAllHighlights() {
  for (const [mesh, originalMat] of originalMaterials.entries()) {
    if (mesh && !mesh.isDisposed()) {
      mesh.material = originalMat;
    }
  }
  originalMaterials.clear();
}

function selectMesh(meshName: string) {
  // Clear previous selection highlight
  if (selectedMeshName.value && selectedMeshName.value !== meshName) {
    clearMeshHighlight(selectedMeshName.value);
  }

  selectedMeshName.value = meshName;
  highlightMesh(meshName, COLOR_SELECTED);
}

function onMeshHover(meshName: string | null) {
  // Clear previous hover
  if (hoveredMeshName.value && hoveredMeshName.value !== selectedMeshName.value) {
    clearMeshHighlight(hoveredMeshName.value);
  }

  hoveredMeshName.value = meshName;

  // Apply hover highlight (but not if it's the selected mesh)
  if (meshName && meshName !== selectedMeshName.value) {
    highlightMesh(meshName, COLOR_HOVERED);
  }
}

// Mesh part flags
function toggleMeshFlag(meshName: string, flag: MeshPartFlag) {
  const flags = meshPartFlags.value[meshName] || [];
  const index = flags.indexOf(flag);

  if (index === -1) {
    // Add the flag
    meshPartFlags.value[meshName] = [...flags, flag];
  } else {
    // Remove the flag
    const newFlags = flags.filter((f) => f !== flag);
    if (newFlags.length === 0) {
      const { [meshName]: _, ...rest } = meshPartFlags.value;
      meshPartFlags.value = rest;
    } else {
      meshPartFlags.value[meshName] = newFlags;
    }
  }
}

function hasMeshFlag(meshName: string, flag: MeshPartFlag): boolean {
  return meshPartFlags.value[meshName]?.includes(flag) ?? false;
}

// Apply simulated rotations to flagged meshes
function applySimulatedRotations() {
  if (!scene || currentMeshes.length === 0) return;

  const yawRadians = (simulatedYaw.value * Math.PI) / 180;
  const pitchRadians = (simulatedPitch.value * Math.PI) / 180;

  // Get meshes by flag
  const yawMeshNames = Object.entries(meshPartFlags.value)
    .filter(([_, flags]) => flags.includes('yaw'))
    .map(([name]) => name);

  const pitchMeshNames = Object.entries(meshPartFlags.value)
    .filter(([_, flags]) => flags.includes('pitch'))
    .map(([name]) => name);

  // Apply yaw rotation (Y axis) to yaw-flagged meshes
  for (const meshName of yawMeshNames) {
    const mesh = currentMeshes.find((m) => m.name === meshName);
    if (mesh) {
      mesh.rotationQuaternion = null; // Ensure we use Euler angles
      mesh.rotation.y = yawRadians;
    }
  }

  // Apply pitch rotation (X axis) to pitch-flagged meshes
  for (const meshName of pitchMeshNames) {
    const mesh = currentMeshes.find((m) => m.name === meshName);
    if (mesh) {
      mesh.rotationQuaternion = null; // Ensure we use Euler angles
      mesh.rotation.x = -pitchRadians; // Negative for intuitive up/down
    }
  }
}

// Reset simulated rotations (does not reset clamps)
function resetSimulatedRotations() {
  simulatedYaw.value = 0;
  simulatedPitch.value = 0;

  // Reset all mesh rotations
  for (const mesh of currentMeshes) {
    mesh.rotationQuaternion = null;
    mesh.rotation.x = 0;
    mesh.rotation.y = 0;
    mesh.rotation.z = 0;
  }
}

// Barrel line visual indicator - mesh references
let barrelLine: Mesh | null = null;
let barrelLineParent: TransformNode | null = null;

function updateBarrelLineIndicator() {
  if (!scene) {
    console.log('updateBarrelLineIndicator: no scene');
    return;
  }

  // Remove existing indicator
  if (barrelLine) {
    barrelLine.dispose();
    barrelLine = null;
  }
  if (barrelLineParent) {
    barrelLineParent.dispose();
    barrelLineParent = null;
  }

  // Don't create indicator if no model is loaded
  if (currentMeshes.length === 0) {
    console.log('updateBarrelLineIndicator: no meshes loaded');
    return;
  }

  console.log(
    `updateBarrelLineIndicator: entityType=${entityType.value}, meshCount=${currentMeshes.length}, modelCenter=(${modelCenter.x.toFixed(2)}, ${modelCenter.y.toFixed(2)}, ${modelCenter.z.toFixed(2)}), barrelLinePos=(${barrelLineX.value.toFixed(2)}, ${barrelLineY.value.toFixed(2)}, ${barrelLineZ.value.toFixed(2)})`
  );

  // Find the pitch mesh to parent the barrel line to
  // First check meshPartFlags for pitch-flagged meshes
  const pitchMeshNames = Object.entries(meshPartFlags.value)
    .filter(([_, flags]) => flags.includes('pitch'))
    .map(([name]) => name);

  pitchMeshForBarrelLine = null;
  if (pitchMeshNames.length > 0) {
    pitchMeshForBarrelLine = currentMeshes.find((m) => m.name === pitchMeshNames[0]) || null;
  }

  // Create the barrel line
  const tubeLength = 5;
  const tubeRadius = 0.03;

  // Create a parent transform node for the barrel line
  // This allows us to position the line in local space
  barrelLineParent = new TransformNode('barrelLineParent', scene);

  // Parent to pitch mesh if found, otherwise stay at model center
  if (pitchMeshForBarrelLine) {
    barrelLineParent.parent = pitchMeshForBarrelLine;
    // Position relative to pitch mesh origin
    barrelLineParent.position = new Vector3(
      barrelLineX.value,
      barrelLineY.value,
      barrelLineZ.value
    );
    console.log(
      `Barrel line parented to pitch mesh: ${pitchMeshForBarrelLine.name}, local pos: (${barrelLineX.value.toFixed(2)}, ${barrelLineY.value.toFixed(2)}, ${barrelLineZ.value.toFixed(2)})`
    );
  } else {
    // Fallback: position at model center + offset
    barrelLineParent.position = new Vector3(
      modelCenter.x + barrelLineX.value,
      modelCenter.y + barrelLineY.value,
      modelCenter.z + barrelLineZ.value
    );
    console.log(`Barrel line at model center + offset (no pitch mesh found)`);
  }

  // Create cylinder (oriented along Z axis - forward direction)
  barrelLine = MeshBuilder.CreateCylinder(
    'barrelLine',
    {
      height: tubeLength,
      diameter: tubeRadius * 2,
      tessellation: 8,
    },
    scene
  );

  // Parent to the transform node
  barrelLine.parent = barrelLineParent;
  // Position so it extends forward from the parent (positive Z)
  barrelLine.position = new Vector3(0, 0, tubeLength / 2);
  barrelLine.rotation.x = Math.PI / 2; // Rotate to lie along Z axis

  // Orange emissive material
  const mat = new StandardMaterial('barrelLineMat', scene);
  mat.emissiveColor = new Color3(1, 0.5, 0); // Orange
  mat.diffuseColor = new Color3(1, 0.5, 0);
  mat.disableLighting = true;
  barrelLine.material = mat;
}

async function saveCalibration() {
  if (!selectedDefinition.value) return;

  saving.value = true;
  try {
    const id = selectedDefinition.value.id;
    // Clean up meshPartFlags - only include non-empty entries
    const cleanedFlags = Object.keys(meshPartFlags.value).length > 0 ? meshPartFlags.value : null;

    // Build barrel line position object
    const barrelLinePosition: BarrelLinePosition = {
      x: barrelLineX.value,
      y: barrelLineY.value,
      z: barrelLineZ.value,
    };

    const data = {
      barrelMeshName: selectedMeshName.value,
      barrelLinePosition,
      meshPartFlags: cleanedFlags,
      // Rotation clamps
      yawClampMin: yawClampMin.value,
      yawClampMax: yawClampMax.value,
      pitchClampMin: pitchClampMin.value,
      pitchClampMax: pitchClampMax.value,
    };

    if (entityType.value === 'building') {
      await buildingsApi.update(id, data);
      // Update local state
      const existing = buildingDefinitions.value.find((b) => b.id === id);
      if (existing) {
        existing.barrelMeshName = data.barrelMeshName;
        existing.barrelLinePosition = data.barrelLinePosition;
        existing.meshPartFlags = data.meshPartFlags;
        existing.yawClampMin = data.yawClampMin;
        existing.yawClampMax = data.yawClampMax;
        existing.pitchClampMin = data.pitchClampMin;
        existing.pitchClampMax = data.pitchClampMax;
      }
    } else {
      await unitsApi.update(id, data);
      // Update local state
      const existing = unitDefinitions.value.find((u) => u.id === id);
      if (existing) {
        existing.barrelMeshName = data.barrelMeshName;
        existing.barrelLinePosition = data.barrelLinePosition;
        existing.meshPartFlags = data.meshPartFlags;
        existing.yawClampMin = data.yawClampMin;
        existing.yawClampMax = data.yawClampMax;
        existing.pitchClampMin = data.pitchClampMin;
        existing.pitchClampMax = data.pitchClampMax;
      }
    }

    toast.success(`Calibration saved for ${selectedDefinition.value.name}`);
  } catch (err) {
    console.error('Failed to save calibration:', err);
    toast.error('Failed to save calibration. Check console for details.');
  } finally {
    saving.value = false;
  }
}

// Watch for definition selection changes
watch(selectedDefinitionId, async (newId) => {
  // Reset simulation and clamps when changing definitions
  simulatedYaw.value = 0;
  simulatedPitch.value = 0;
  yawClampMin.value = -180;
  yawClampMax.value = 180;
  pitchClampMin.value = -45;
  pitchClampMax.value = 45;

  if (!newId) {
    clearAllHighlights();
    // Clear current meshes
    for (const mesh of currentMeshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose();
      }
    }
    currentMeshes = [];
    meshNames.value = [];
    meshPartFlags.value = {};
    // Clear barrel line indicator
    if (barrelLine) {
      barrelLine.dispose();
      barrelLine = null;
    }
    if (barrelLineParent) {
      barrelLineParent.dispose();
      barrelLineParent = null;
    }
    return;
  }

  const def = selectedDefinition.value;
  if (def?.modelPath) {
    await loadModel(def.modelPath);
  }
});

// Watch for entity type changes
watch(entityType, () => {
  selectedDefinitionId.value = null;
});

// Watch for barrel line position changes to update indicator
watch([barrelLineX, barrelLineY, barrelLineZ], () => {
  updateBarrelLineIndicator();
});

// Watch for mesh part flags changes (rebuild barrel line when pitch mesh changes)
watch(
  meshPartFlags,
  () => {
    updateBarrelLineIndicator();
  },
  { deep: true }
);

// Watch for simulation changes and enforce clamp bounds
watch(simulatedYaw, (newVal) => {
  // Enforce clamp bounds
  if (newVal < yawClampMin.value) {
    simulatedYaw.value = yawClampMin.value;
  } else if (newVal > yawClampMax.value) {
    simulatedYaw.value = yawClampMax.value;
  }
  applySimulatedRotations();
});

watch(simulatedPitch, (newVal) => {
  // Enforce clamp bounds
  if (newVal < pitchClampMin.value) {
    simulatedPitch.value = pitchClampMin.value;
  } else if (newVal > pitchClampMax.value) {
    simulatedPitch.value = pitchClampMax.value;
  }
  applySimulatedRotations();
});

// Watch for clamp changes - update model to show clamp position
watch(yawClampMin, (newVal) => {
  if (newVal > yawClampMax.value) {
    yawClampMin.value = yawClampMax.value;
    newVal = yawClampMax.value;
  }
  // Rotate model to show this clamp position
  simulatedYaw.value = newVal;
});

watch(yawClampMax, (newVal) => {
  if (newVal < yawClampMin.value) {
    yawClampMax.value = yawClampMin.value;
    newVal = yawClampMin.value;
  }
  // Rotate model to show this clamp position
  simulatedYaw.value = newVal;
});

watch(pitchClampMin, (newVal) => {
  if (newVal > pitchClampMax.value) {
    pitchClampMin.value = pitchClampMax.value;
    newVal = pitchClampMax.value;
  }
  // Rotate model to show this clamp position
  simulatedPitch.value = newVal;
});

watch(pitchClampMax, (newVal) => {
  if (newVal < pitchClampMin.value) {
    pitchClampMax.value = pitchClampMin.value;
    newVal = pitchClampMin.value;
  }
  // Rotate model to show this clamp position
  simulatedPitch.value = newVal;
});

// Lifecycle
onMounted(async () => {
  await loadDefinitions();
  await nextTick();
  initScene();
});

onUnmounted(() => {
  if (barrelLine) {
    barrelLine.dispose();
    barrelLine = null;
  }
  if (barrelLineParent) {
    barrelLineParent.dispose();
    barrelLineParent = null;
  }
  if (engine) {
    engine.dispose();
    engine = null;
  }
  scene = null;
  currentMeshes = [];
  originalMaterials.clear();
});

// Handle window resize
function handleResize() {
  engine?.resize();
}

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="calibration-panel">
    <header class="panel-header">
      <h1>Model Calibration</h1>
      <p class="subtitle">Configure barrel mesh and offset for turrets and units</p>
    </header>

    <div class="panel-content">
      <!-- Left: Controls -->
      <div class="controls-section">
        <!-- Entity Type Selector -->
        <div class="control-group">
          <label>Entity Type</label>
          <div class="toggle-group">
            <button :class="{ active: entityType === 'building' }" @click="entityType = 'building'">
              Buildings
            </button>
            <button :class="{ active: entityType === 'unit' }" @click="entityType = 'unit'">
              Units
            </button>
          </div>
        </div>

        <!-- Definition Selector -->
        <div class="control-group">
          <label>Select {{ entityType === 'building' ? 'Building' : 'Unit' }}</label>
          <select v-model="selectedDefinitionId" :disabled="loading">
            <option :value="null">-- Select --</option>
            <option v-for="def in definitionsWithModels" :key="def.id" :value="def.id">
              {{ def.name }}
            </option>
          </select>
        </div>

        <!-- Mesh List -->
        <div v-if="meshNames.length > 0" class="control-group">
          <label>Mesh Parts ({{ meshNames.length }})</label>
          <div class="mesh-list">
            <div
              v-for="name in meshNames"
              :key="name"
              class="mesh-item"
              :class="{
                selected: selectedMeshName === name,
                hovered: hoveredMeshName === name,
              }"
              @mouseenter="onMeshHover(name)"
              @mouseleave="onMeshHover(null)"
            >
              <span
                class="mesh-indicator"
                :class="{ active: selectedMeshName === name }"
                title="Set as barrel mesh"
                @click="selectMesh(name)"
              ></span>
              <span class="mesh-name" @click="selectMesh(name)">{{ name }}</span>
              <!-- Mesh part flags -->
              <div class="mesh-flags">
                <button
                  class="flag-btn"
                  :class="{ active: hasMeshFlag(name, 'base') }"
                  title="Base (doesn't move)"
                  @click.stop="toggleMeshFlag(name, 'base')"
                >
                  B
                </button>
                <button
                  class="flag-btn"
                  :class="{ active: hasMeshFlag(name, 'pitch') }"
                  title="Pitch (moves vertically)"
                  @click.stop="toggleMeshFlag(name, 'pitch')"
                >
                  P
                </button>
                <button
                  class="flag-btn"
                  :class="{ active: hasMeshFlag(name, 'yaw') }"
                  title="Yaw (rotates horizontally)"
                  @click.stop="toggleMeshFlag(name, 'yaw')"
                >
                  Y
                </button>
                <button
                  class="flag-btn barrel-flag"
                  :class="{ active: hasMeshFlag(name, 'barrel') }"
                  title="Barrel (laser origin point)"
                  @click.stop="toggleMeshFlag(name, 'barrel')"
                >
                  R
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Barrel Line Position -->
        <div v-if="selectedDefinition" class="control-group barrel-position-group">
          <label>Barrel Line Position (local to pitch mesh)</label>
          <div class="position-sliders">
            <div class="position-slider">
              <span class="axis-label x-axis">X: {{ barrelLineX.toFixed(2) }}</span>
              <input
                v-model.number="barrelLineX"
                type="range"
                min="-5"
                max="5"
                step="0.01"
                class="slider"
              />
            </div>
            <div class="position-slider">
              <span class="axis-label y-axis">Y: {{ barrelLineY.toFixed(2) }}</span>
              <input
                v-model.number="barrelLineY"
                type="range"
                min="-5"
                max="5"
                step="0.01"
                class="slider"
              />
            </div>
            <div class="position-slider">
              <span class="axis-label z-axis">Z: {{ barrelLineZ.toFixed(2) }}</span>
              <input
                v-model.number="barrelLineZ"
                type="range"
                min="-5"
                max="5"
                step="0.01"
                class="slider"
              />
            </div>
          </div>
          <p class="position-hint">
            Position the orange line to align with the barrel tip. The line will rotate with the
            pitch mesh.
          </p>
        </div>

        <!-- Rotation Simulation -->
        <div v-if="selectedDefinition" class="control-group simulation-group">
          <div class="simulation-header">
            <label>Rotation Simulation</label>
            <button class="btn-reset-small" @click="resetSimulatedRotations">Reset</button>
          </div>
          <div class="simulation-controls">
            <!-- Yaw Control -->
            <div class="sim-control">
              <span class="sim-label">Yaw: {{ simulatedYaw.toFixed(0) }}°</span>
              <input
                v-model.number="simulatedYaw"
                type="range"
                min="-180"
                max="180"
                step="1"
                class="slider sim-slider"
              />
              <div class="clamp-row">
                <div class="clamp-input">
                  <label>Min</label>
                  <input
                    v-model.number="yawClampMin"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    class="slider clamp-slider"
                  />
                  <span class="clamp-value">{{ yawClampMin }}°</span>
                </div>
                <div class="clamp-input">
                  <label>Max</label>
                  <input
                    v-model.number="yawClampMax"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    class="slider clamp-slider"
                  />
                  <span class="clamp-value">{{ yawClampMax }}°</span>
                </div>
              </div>
            </div>
            <!-- Pitch Control -->
            <div class="sim-control">
              <span class="sim-label">Pitch: {{ simulatedPitch.toFixed(0) }}°</span>
              <input
                v-model.number="simulatedPitch"
                type="range"
                min="-45"
                max="45"
                step="1"
                class="slider sim-slider"
              />
              <div class="clamp-row">
                <div class="clamp-input">
                  <label>Min</label>
                  <input
                    v-model.number="pitchClampMin"
                    type="range"
                    min="-45"
                    max="45"
                    step="1"
                    class="slider clamp-slider"
                  />
                  <span class="clamp-value">{{ pitchClampMin }}°</span>
                </div>
                <div class="clamp-input">
                  <label>Max</label>
                  <input
                    v-model.number="pitchClampMax"
                    type="range"
                    min="-45"
                    max="45"
                    step="1"
                    class="slider clamp-slider"
                  />
                  <span class="clamp-value">{{ pitchClampMax }}°</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div v-if="selectedDefinition" class="control-group">
          <button class="btn-save" :disabled="saving" @click="saveCalibration">
            {{ saving ? 'Saving...' : 'Save Calibration' }}
          </button>
        </div>

        <!-- Current Values -->
        <div v-if="selectedDefinition" class="current-values">
          <h4>Current Values</h4>
          <p><strong>Barrel Mesh:</strong> {{ selectedMeshName || '(auto-detect)' }}</p>
          <p>
            <strong>Barrel Line:</strong> ({{ barrelLineX.toFixed(2) }},
            {{ barrelLineY.toFixed(2) }}, {{ barrelLineZ.toFixed(2) }})
          </p>
          <p v-if="Object.keys(meshPartFlags).length > 0">
            <strong>Mesh Flags:</strong>
            <span class="flag-summary"
              >{{ Object.keys(meshPartFlags).length }} mesh(es) flagged</span
            >
          </p>
        </div>
      </div>

      <!-- Right: 3D Preview -->
      <div class="preview-section">
        <div class="canvas-container">
          <canvas ref="canvasRef"></canvas>
          <div v-if="!selectedDefinition" class="canvas-placeholder">
            <p>Select a building or unit to preview its 3D model</p>
          </div>
        </div>
        <div class="preview-controls">
          <span>Drag to rotate | Scroll to zoom</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calibration-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0f1419;
}

.panel-header {
  padding: 24px 32px;
  border-bottom: 1px solid #1e2533;
}

.panel-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #f5f5f5;
}

.panel-header .subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.panel-content {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
}

/* Controls Section */
.controls-section {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toggle-group {
  display: flex;
  gap: 8px;
}

.toggle-group button {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #1f2937;
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-group button:hover {
  background: #374151;
  color: #e5e5e5;
}

.toggle-group button.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

select {
  padding: 10px 12px;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #1f2937;
  color: #e5e5e5;
  font-size: 14px;
  cursor: pointer;
}

select:focus {
  outline: none;
  border-color: #3b82f6;
}

/* Mesh List */
.mesh-list {
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #1f2937;
}

.mesh-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.mesh-item:hover {
  background: #374151;
}

.mesh-item.selected {
  background: rgba(34, 197, 94, 0.2);
}

.mesh-item.hovered:not(.selected) {
  background: rgba(59, 130, 246, 0.2);
}

.mesh-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4b5563;
  flex-shrink: 0;
}

.mesh-indicator.active {
  background: #22c55e;
}

.mesh-name {
  font-size: 13px;
  color: #e5e5e5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  cursor: pointer;
}

/* Mesh part flags */
.mesh-flags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.flag-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #4b5563;
  border-radius: 3px;
  background: #374151;
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.flag-btn:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.flag-btn.active {
  border-color: #3b82f6;
  color: white;
}

.flag-btn.active[title*='Base'] {
  background: #6b7280;
}

.flag-btn.active[title*='Pitch'] {
  background: #f59e0b;
}

.flag-btn.active[title*='Yaw'] {
  background: #10b981;
}

.flag-btn.active[title*='Barrel'] {
  background: #ef4444;
}

/* Slider */
.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #374151;
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6b7280;
}

/* Simulation Controls */
.simulation-group {
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 12px;
  background: #1a1f2e;
}

.simulation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.simulation-header label {
  margin: 0;
}

.simulation-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sim-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sim-label {
  font-size: 12px;
  color: #9ca3af;
}

.sim-slider {
  height: 4px;
}

/* Clamp controls row */
.clamp-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.clamp-input {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clamp-input label {
  font-size: 10px;
  color: #ef4444;
  text-transform: uppercase;
  font-weight: 600;
}

.clamp-input .clamp-slider {
  height: 3px;
  background: #4b2020;
}

.clamp-input .clamp-slider::-webkit-slider-thumb {
  background: #ef4444;
  border: 1px solid #b91c1c;
  width: 12px;
  height: 12px;
}

.clamp-input .clamp-slider::-webkit-slider-thumb:hover {
  background: #dc2626;
}

/* Firefox support for clamp sliders */
.clamp-input .clamp-slider::-moz-range-thumb {
  background: #ef4444;
  border: 1px solid #b91c1c;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.clamp-value {
  font-size: 11px;
  color: #ef4444;
  text-align: center;
}

.btn-reset-small {
  padding: 4px 10px;
  border: 1px solid #4b5563;
  border-radius: 4px;
  background: #374151;
  color: #9ca3af;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reset-small:hover {
  background: #4b5563;
  border-color: #6b7280;
  color: #e5e5e5;
}

/* Save Button */
.btn-save {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  background: #22c55e;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-save:hover:not(:disabled) {
  background: #16a34a;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Current Values */
.current-values {
  padding: 16px;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #1f2937;
}

.current-values h4 {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  margin: 0 0 12px 0;
}

.current-values p {
  font-size: 13px;
  color: #e5e5e5;
  margin: 4px 0;
}

.flag-summary {
  color: #3b82f6;
  font-size: 12px;
}

/* Preview Section */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.canvas-container {
  flex: 1;
  position: relative;
  border: 1px solid #374151;
  border-radius: 8px;
  overflow: hidden;
  background: #0f1419;
}

.canvas-container canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.canvas-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 14px;
}

.preview-controls {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  color: #6b7280;
}

/* Barrel Line Position Controls */
.barrel-position-group {
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 12px;
  background: #1a1f2e;
}

.position-sliders {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.position-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.axis-label {
  font-size: 12px;
  font-weight: 600;
}

.axis-label.x-axis {
  color: #ef4444; /* Red for X */
}

.axis-label.y-axis {
  color: #22c55e; /* Green for Y */
}

.axis-label.z-axis {
  color: #3b82f6; /* Blue for Z */
}

.position-hint {
  font-size: 11px;
  color: #6b7280;
  margin-top: 8px;
  font-style: italic;
}
</style>
