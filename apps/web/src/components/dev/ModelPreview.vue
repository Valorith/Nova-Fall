<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color4,
  SceneLoader,
  AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const props = defineProps<{
  modelPath: string | null;
  teamColor?: string;
  height?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

let engine: Engine | null = null;
let scene: Scene | null = null;
let camera: ArcRotateCamera | null = null;
let currentMeshes: AbstractMesh[] = [];
let animationFrame: number | null = null;
let isAutoRotating = true;

// Initialize the Babylon.js scene
function initScene() {
  if (!canvasRef.value) return;

  // Create engine
  engine = new Engine(canvasRef.value, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  // Create scene with dark background
  scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.08, 0.1, 1); // Match editor dark theme

  // Create camera
  camera = new ArcRotateCamera(
    'camera',
    Math.PI / 2,
    Math.PI / 3,
    5,
    Vector3.Zero(),
    scene
  );
  camera.attachControl(canvasRef.value, true);
  camera.wheelPrecision = 50;
  camera.minZ = 0.01;
  camera.lowerRadiusLimit = 1;
  camera.upperRadiusLimit = 20;

  // Track when user interacts with camera
  camera.onViewMatrixChangedObservable.add(() => {
    isAutoRotating = false;
  });

  // Create lights
  const light1 = new HemisphericLight('light1', new Vector3(1, 1, 0), scene);
  light1.intensity = 0.7;

  const light2 = new HemisphericLight('light2', new Vector3(-1, -1, 0), scene);
  light2.intensity = 0.3;

  // Start render loop
  engine.runRenderLoop(() => {
    if (scene && camera && isAutoRotating) {
      camera.alpha += 0.005; // Auto-rotate
    }
    scene?.render();
  });

  // Handle window resize
  window.addEventListener('resize', handleResize);
}

function handleResize() {
  engine?.resize();
}

// Load a 3D model
async function loadModel(modelPath: string) {
  if (!scene) return;

  loading.value = true;
  error.value = null;

  // Clear existing meshes
  clearModel();

  try {
    // Parse modelPath for optional mesh name (e.g., "pack.glb#TurretA")
    let filePath = modelPath;
    let targetMeshName: string | null = null;

    const hashIndex = modelPath.indexOf('#');
    if (hashIndex !== -1) {
      filePath = modelPath.substring(0, hashIndex);
      targetMeshName = modelPath.substring(hashIndex + 1);
    }

    // Determine the base URL and filename
    const fullPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const lastSlash = fullPath.lastIndexOf('/');
    const rootUrl = fullPath.substring(0, lastSlash + 1);
    const filename = fullPath.substring(lastSlash + 1);

    // Load the model
    const result = await SceneLoader.ImportMeshAsync('', rootUrl, filename, scene);

    // If targeting a specific mesh, filter to only meshes belonging to that model
    if (targetMeshName) {
      // Build patterns to match parent/grandparent names
      // For T-series: "T-B05" -> grandparent matches "T-B05_\d+" or parent starts with "T-B05_"
      // For KB-series: "KB1a" -> parent/grandparent starts with "KB1a_"
      const escapedName = targetMeshName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isTSeries = /^T-[A-D]\d{2}$/.test(targetMeshName);

      const grandparentPattern = isTSeries
        ? new RegExp(`^${escapedName}_\\d+$`)  // T-B05_5
        : new RegExp(`^${escapedName}_`);      // KB1a_Base...
      const parentPattern = new RegExp(`^${escapedName}_`);

      // Find all meshes that belong to this model
      const meshesToKeep: AbstractMesh[] = [];

      for (const mesh of result.meshes) {
        if (mesh.name === '__root__') {
          meshesToKeep.push(mesh);
          continue;
        }

        const parentName = mesh.parent?.name || '';
        const grandparentName = mesh.parent?.parent?.name || '';

        // Check if this mesh belongs to the target model
        const belongsToModel =
          grandparentPattern.test(grandparentName) ||
          parentPattern.test(parentName) ||
          grandparentPattern.test(parentName);  // For KB nested parts

        if (belongsToModel) {
          meshesToKeep.push(mesh);
        } else {
          mesh.dispose();
        }
      }

      if (meshesToKeep.length > 1) {  // More than just __root__
        currentMeshes = meshesToKeep;
      } else {
        // Target not found, show all meshes
        console.warn(`No meshes found for model "${targetMeshName}", showing all`);
        currentMeshes = result.meshes;
      }
    } else {
      currentMeshes = result.meshes;
    }

    // Center camera on the model
    if (currentMeshes.length > 0 && camera) {
      // Calculate bounding box of visible meshes (exclude __root__)
      let minBounds = new Vector3(Infinity, Infinity, Infinity);
      let maxBounds = new Vector3(-Infinity, -Infinity, -Infinity);
      let hasValidBounds = false;

      for (const mesh of currentMeshes) {
        if (mesh.name === '__root__') continue;
        if (mesh.getTotalVertices() === 0) continue;

        mesh.computeWorldMatrix(true);
        const boundingInfo = mesh.getBoundingInfo();
        const min = boundingInfo.boundingBox.minimumWorld;
        const max = boundingInfo.boundingBox.maximumWorld;

        // Skip invalid bounds
        if (!isFinite(min.x) || !isFinite(max.x)) continue;

        minBounds = Vector3.Minimize(minBounds, min);
        maxBounds = Vector3.Maximize(maxBounds, max);
        hasValidBounds = true;
      }

      if (hasValidBounds) {
        // Calculate center and size
        const center = minBounds.add(maxBounds).scale(0.5);
        const size = maxBounds.subtract(minBounds);
        const maxDimension = Math.max(size.x, size.y, size.z);

        // Position camera to frame the model tightly
        // Smaller multiplier = closer zoom
        const distance = maxDimension * 0.9;

        camera.target = center;
        camera.radius = Math.max(distance, 0.5);
        camera.alpha = Math.PI / 4;  // 45 degree angle
        camera.beta = Math.PI / 3;   // 60 degree elevation
        camera.lowerRadiusLimit = distance * 0.2;
        camera.upperRadiusLimit = distance * 4;
      }
    }

    isAutoRotating = true;
  } catch (err) {
    console.error('Failed to load model:', err);
    error.value = 'Failed to load model';
  } finally {
    loading.value = false;
  }
}

// Clear the current model
function clearModel() {
  for (const mesh of currentMeshes) {
    mesh.dispose();
  }
  currentMeshes = [];
}

// Reset camera to initial view
function resetCamera() {
  if (camera) {
    camera.alpha = Math.PI / 2;
    camera.beta = Math.PI / 3;
    camera.radius = 4;
    camera.target = Vector3.Zero();
    isAutoRotating = true;
  }
}

// Watch for model path changes
watch(
  () => props.modelPath,
  async (newPath) => {
    if (newPath) {
      await nextTick();
      loadModel(newPath);
    } else {
      clearModel();
      error.value = null;
    }
  },
  { immediate: true }
);

// Initialize on mount
onMounted(async () => {
  await nextTick();
  initScene();
  if (props.modelPath) {
    loadModel(props.modelPath);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
  window.removeEventListener('resize', handleResize);
  clearModel();
  scene?.dispose();
  engine?.dispose();
});
</script>

<template>
  <div
    ref="containerRef"
    class="model-preview"
    :style="{ height: `${height || 250}px` }"
  >
    <!-- Canvas -->
    <canvas ref="canvasRef" class="preview-canvas"></canvas>

    <!-- Loading overlay -->
    <div v-if="loading" class="preview-overlay loading-overlay">
      <div class="loading-spinner"></div>
      <span>Loading model...</span>
    </div>

    <!-- Error overlay -->
    <div v-else-if="error" class="preview-overlay error-overlay">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
    </div>

    <!-- No model placeholder -->
    <div v-else-if="!modelPath" class="preview-overlay placeholder-overlay">
      <span class="placeholder-icon">3D</span>
      <span>No model configured</span>
    </div>

    <!-- Controls -->
    <div class="preview-controls">
      <button
        type="button"
        class="control-btn"
        title="Reset camera"
        @click="resetCamera"
      >
        Reset
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-preview {
  position: relative;
  width: 100%;
  background: #0f1419;
  border: 1px solid #2a3040;
  border-radius: 8px;
  overflow: hidden;
}

.preview-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(15, 20, 25, 0.9);
  color: #6b7280;
  font-size: 13px;
}

.loading-overlay {
  color: #9ca3af;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #3b82f6;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-overlay {
  color: #f87171;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(239, 68, 68, 0.2);
  border-radius: 50%;
  font-size: 18px;
  font-weight: bold;
}

.placeholder-overlay {
  color: #4b5563;
}

.placeholder-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: #1a1f2e;
  border: 2px dashed #2a3040;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

.preview-controls {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

.control-btn {
  padding: 4px 10px;
  background: rgba(26, 31, 46, 0.9);
  border: 1px solid #2a3040;
  border-radius: 4px;
  color: #9ca3af;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.control-btn:hover {
  background: #2a3040;
  color: #e5e5e5;
}
</style>
