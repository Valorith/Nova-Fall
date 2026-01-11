/**
 * UnitManager - Manages unit rendering and state in the combat arena
 *
 * Handles:
 * - Unit mesh creation and pooling
 * - Spawning units at perimeter spawn zones
 * - Unit state machine (SPAWNING, IDLE, MOVING, ATTACKING, DEAD)
 * - Movement interpolation for smooth visuals
 * - Health bar rendering
 */

import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode,
  DynamicTexture,
  SceneLoader,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Scene } from '@babylonjs/core';
import type { CombatUnitState, ArenaPosition } from '@nova-fall/shared';
import { UnitState } from '@nova-fall/shared';
import { TILE_SIZE, ARENA_SIZE } from './CombatEngine';

// Unit visual constants are now calculated dynamically in createUnitVisual based on tileSize

// Colors for different unit states/owners
const COLORS = {
  attacker: new Color3(0.8, 0.2, 0.2), // Red
  defender: new Color3(0.2, 0.5, 0.8), // Blue
  dead: new Color3(0.3, 0.3, 0.3), // Gray
  spawning: new Color3(1, 1, 1), // White (fading in)
};

/**
 * Internal unit representation with visual components
 */
interface UnitVisual {
  id: string;
  mesh: Mesh;
  healthBarPlane: Mesh;
  healthBarTexture: DynamicTexture;
  container: TransformNode;

  // State for interpolation
  currentPosition: Vector3;
  targetPosition: Vector3;
  currentRotation: number;
  targetRotation: number;

  // Cached state
  state: UnitState;
  health: number;
  maxHealth: number;
  ownerId: string;

  // Size
  tileSize: number;
}

export class UnitManager {
  private scene: Scene;
  private units = new Map<string, UnitVisual>();
  private defenderId = '';
  private attackerId = '';

  // Materials (shared across units)
  private attackerMaterial: StandardMaterial;
  private defenderMaterial: StandardMaterial;
  private deadMaterial: StandardMaterial;

  constructor(scene: Scene) {
    this.scene = scene;

    // Create shared materials
    this.attackerMaterial = new StandardMaterial('attackerMat', scene);
    this.attackerMaterial.diffuseColor = COLORS.attacker;
    this.attackerMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    this.defenderMaterial = new StandardMaterial('defenderMat', scene);
    this.defenderMaterial.diffuseColor = COLORS.defender;
    this.defenderMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    this.deadMaterial = new StandardMaterial('deadMat', scene);
    this.deadMaterial.diffuseColor = COLORS.dead;
    this.deadMaterial.alpha = 0.5;
  }

  /**
   * Set the attacker and defender IDs for coloring
   */
  setPlayers(attackerId: string, defenderId: string): void {
    this.attackerId = attackerId;
    this.defenderId = defenderId;
  }

  /**
   * Replace a unit's placeholder mesh with a loaded model
   * Supports both single-model files and multi-model packs:
   * - "model.glb" - loads entire file
   * - "pack.glb#MeshName" - loads specific mesh from pack
   */
  private async replaceWithModel(visual: UnitVisual, modelPath: string, tileSize = 1): Promise<void> {
    try {
      // Parse modelPath for optional mesh name (e.g., "pack.glb#TurretA")
      let filePath = modelPath;
      let targetMeshName: string | null = null;

      const hashIndex = modelPath.indexOf('#');
      if (hashIndex !== -1) {
        filePath = modelPath.substring(0, hashIndex);
        targetMeshName = modelPath.substring(hashIndex + 1);
      }

      // Parse the path to get directory and filename
      const lastSlash = filePath.lastIndexOf('/');
      const rootUrl = lastSlash >= 0 ? filePath.substring(0, lastSlash + 1) : '/';
      const fileName = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;

      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene);

      if (result.meshes.length === 0) {
        console.warn(`No meshes found in model: ${filePath}`);
        return;
      }

      // Create a container for the model
      const modelContainer = new TransformNode(`model_container_${visual.id}`, this.scene);
      modelContainer.parent = visual.container;
      modelContainer.position = Vector3.Zero();

      // Determine which meshes to use
      let meshesToUse: typeof result.meshes;

      if (targetMeshName) {
        // Find the specific mesh/node by name
        const targetNode = result.meshes.find(
          (m) => m.name === targetMeshName || m.name === targetMeshName + '_primitive0'
        );

        if (!targetNode) {
          console.warn(`Mesh "${targetMeshName}" not found in ${filePath}. Available: ${result.meshes.map(m => m.name).join(', ')}`);
          // Dispose all loaded meshes since we're not using them
          result.meshes.forEach((m) => m.dispose());
          return;
        }

        // Get the target and all its descendants
        const descendants = targetNode.getDescendants(false);
        meshesToUse = [targetNode, ...descendants.filter((d): d is Mesh => d instanceof Mesh || d.getClassName() === 'TransformNode')] as typeof result.meshes;

        // Dispose meshes we're not using
        result.meshes.forEach((m) => {
          if (!meshesToUse.includes(m) && m.parent && !meshesToUse.includes(m.parent as Mesh)) {
            m.dispose();
          }
        });

        // Parent target to our container
        targetNode.parent = modelContainer;
        targetNode.position = Vector3.Zero();
      } else {
        // Use all meshes (original behavior)
        meshesToUse = result.meshes;

        const loadedRoot = result.meshes[0];
        if (!loadedRoot) {
          console.warn(`No root mesh found in model: ${filePath}`);
          return;
        }

        loadedRoot.parent = modelContainer;
        loadedRoot.position = Vector3.Zero();
      }

      // Force compute all world matrices
      this.scene.updateTransformMatrix();
      meshesToUse.forEach((mesh) => {
        mesh.computeWorldMatrix(true);
      });

      // Calculate bounding info for the meshes we're using
      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);

      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
          const boundingInfo = mesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;

          minVec = Vector3.Minimize(minVec, min);
          maxVec = Vector3.Maximize(maxVec, max);
        }
      });

      // Calculate model dimensions
      const modelHeight = maxVec.y - minVec.y;
      const modelWidth = maxVec.x - minVec.x;
      const modelDepth = maxVec.z - minVec.z;
      const maxDimension = Math.max(modelHeight, modelWidth, modelDepth);

      // Scale to fit target size (based on tileSize)
      const targetSize = TILE_SIZE * tileSize * 0.8; // 80% of tile footprint
      const scaleFactor = maxDimension > 0 ? targetSize / maxDimension : 1;

      modelContainer.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);

      // Center the model and place on ground
      const centerX = (minVec.x + maxVec.x) / 2;
      const centerZ = (minVec.z + maxVec.z) / 2;

      const rootToAdjust = modelContainer.getChildren()[0] as TransformNode | undefined;
      if (rootToAdjust) {
        rootToAdjust.position.x = -centerX;
        rootToAdjust.position.z = -centerZ;
        rootToAdjust.position.y = -minVec.y;
      }

      // Remove the old placeholder mesh
      visual.mesh.dispose();

      // Store reference for cleanup
      const firstMesh = meshesToUse.find((m): m is Mesh => m instanceof Mesh);
      if (firstMesh) {
        visual.mesh = firstMesh;
      }

    } catch (error) {
      console.error(`Failed to load model ${modelPath}:`, error);
    }
  }

  /**
   * Convert grid position to world position
   */
  private gridToWorld(pos: ArenaPosition): Vector3 {
    return new Vector3(
      pos.x * TILE_SIZE + TILE_SIZE / 2,
      0, // Y position is handled by mesh position within container
      pos.z * TILE_SIZE + TILE_SIZE / 2
    );
  }

  /**
   * Get a random spawn position on the perimeter
   */
  getRandomSpawnPosition(side?: 'north' | 'south' | 'east' | 'west'): ArenaPosition {
    const sides = side ? [side] : ['north', 'south', 'east', 'west'] as const;
    const chosenSide = sides[Math.floor(Math.random() * sides.length)];

    switch (chosenSide) {
      case 'north':
        return { x: Math.floor(Math.random() * ARENA_SIZE), z: ARENA_SIZE - 1 };
      case 'south':
        return { x: Math.floor(Math.random() * ARENA_SIZE), z: 0 };
      case 'east':
        return { x: ARENA_SIZE - 1, z: Math.floor(Math.random() * ARENA_SIZE) };
      case 'west':
      default:
        return { x: 0, z: Math.floor(Math.random() * ARENA_SIZE) };
    }
  }

  /**
   * Create a new unit visual
   */
  private createUnitVisual(unitState: CombatUnitState, tileSize = 1): UnitVisual {
    // Create container for unit and health bar
    const container = new TransformNode(`unit_container_${unitState.id}`, this.scene);

    // Scale dimensions based on tileSize
    const unitHeight = TILE_SIZE * tileSize * 0.8;
    const unitRadius = TILE_SIZE * tileSize * 0.2;
    const healthBarWidth = TILE_SIZE * tileSize * 0.7;
    const healthBarHeight = TILE_SIZE * tileSize * 0.09;
    const healthBarOffset = unitHeight + TILE_SIZE * 0.2;

    // Create unit mesh (placeholder cylinder for now)
    const mesh = MeshBuilder.CreateCylinder(
      `unit_${unitState.id}`,
      {
        height: unitHeight,
        diameter: unitRadius * 2,
        tessellation: 12,
      },
      this.scene
    );
    mesh.parent = container;
    mesh.position.y = unitHeight / 2;

    // Set material based on owner
    if (unitState.ownerId === this.attackerId) {
      mesh.material = this.attackerMaterial;
    } else if (unitState.ownerId === this.defenderId) {
      mesh.material = this.defenderMaterial;
    }

    // Create health bar
    const healthBarTexture = new DynamicTexture(
      `healthbar_tex_${unitState.id}`,
      { width: 128, height: 16 },
      this.scene,
      false
    );

    const healthBarMaterial = new StandardMaterial(`healthbar_mat_${unitState.id}`, this.scene);
    healthBarMaterial.diffuseTexture = healthBarTexture;
    healthBarMaterial.emissiveTexture = healthBarTexture;
    healthBarMaterial.disableLighting = true;
    healthBarMaterial.backFaceCulling = false;

    const healthBarPlane = MeshBuilder.CreatePlane(
      `healthbar_${unitState.id}`,
      { width: healthBarWidth, height: healthBarHeight },
      this.scene
    );
    healthBarPlane.parent = container;
    healthBarPlane.position.y = healthBarOffset;
    healthBarPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    healthBarPlane.material = healthBarMaterial;

    // Set initial position
    const worldPos = this.gridToWorld(unitState.position);
    container.position = worldPos;

    const visual: UnitVisual = {
      id: unitState.id,
      mesh,
      healthBarPlane,
      healthBarTexture,
      container,
      currentPosition: worldPos.clone(),
      targetPosition: worldPos.clone(),
      currentRotation: unitState.rotation,
      targetRotation: unitState.rotation,
      state: unitState.state,
      health: unitState.health,
      maxHealth: unitState.maxHealth,
      ownerId: unitState.ownerId,
      tileSize,
    };

    // Draw initial health bar
    this.updateHealthBar(visual);

    return visual;
  }

  /**
   * Update health bar texture
   */
  private updateHealthBar(visual: UnitVisual): void {
    const ctx = visual.healthBarTexture.getContext();
    const width = 128;
    const height = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);

    // Health fill
    const healthPercent = visual.health / visual.maxHealth;
    const fillWidth = Math.max(0, (width - 4) * healthPercent);

    // Color based on health percentage
    if (healthPercent > 0.6) {
      ctx.fillStyle = '#4caf50'; // Green
    } else if (healthPercent > 0.3) {
      ctx.fillStyle = '#ff9800'; // Orange
    } else {
      ctx.fillStyle = '#f44336'; // Red
    }

    ctx.fillRect(2, 2, fillWidth, height - 4);

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    visual.healthBarTexture.update();
  }

  /**
   * Spawn a unit from state
   * @param unitState - The unit state from the server
   * @param modelPath - Optional path to a 3D model (.glb file)
   * @param tileSize - Size of unit in tiles (default: 1)
   */
  spawnUnit(unitState: CombatUnitState, modelPath?: string | null, tileSize = 1): void {
    // Check if unit already exists
    if (this.units.has(unitState.id)) {
      this.updateUnit(unitState);
      return;
    }

    const visual = this.createUnitVisual(unitState, tileSize);
    this.units.set(unitState.id, visual);

    // If spawning state, start with scale 0 and animate
    if (unitState.state === UnitState.SPAWNING) {
      visual.mesh.scaling = new Vector3(0.1, 0.1, 0.1);
      visual.healthBarPlane.isVisible = false;
    }

    // Load model if path provided
    if (modelPath) {
      this.replaceWithModel(visual, modelPath, tileSize).catch((err) => {
        console.error(`Error loading model for unit ${unitState.id}:`, err);
      });
    }
  }

  /**
   * Update unit from server state
   */
  updateUnit(unitState: CombatUnitState): void {
    const visual = this.units.get(unitState.id);
    if (!visual) {
      // Unit doesn't exist, spawn it
      this.spawnUnit(unitState);
      return;
    }

    // Update target position for interpolation
    const newTarget = this.gridToWorld(unitState.position);
    if (unitState.targetPosition) {
      // If unit is moving, use target position for smoother movement
      visual.targetPosition = this.gridToWorld(unitState.targetPosition);
    } else {
      visual.targetPosition = newTarget;
    }

    // Update rotation
    visual.targetRotation = unitState.rotation;

    // Update state
    const previousState = visual.state;
    visual.state = unitState.state;

    // Handle state transitions
    if (previousState === UnitState.SPAWNING && unitState.state !== UnitState.SPAWNING) {
      // Finished spawning
      visual.healthBarPlane.isVisible = true;
    }

    if (unitState.state === UnitState.DEAD && previousState !== UnitState.DEAD) {
      // Just died
      visual.mesh.material = this.deadMaterial;
      visual.healthBarPlane.isVisible = false;
    }

    // Update health
    if (visual.health !== unitState.health || visual.maxHealth !== unitState.maxHealth) {
      visual.health = unitState.health;
      visual.maxHealth = unitState.maxHealth;
      this.updateHealthBar(visual);
    }
  }

  /**
   * Remove a unit
   */
  removeUnit(unitId: string): void {
    const visual = this.units.get(unitId);
    if (!visual) return;

    // Dispose of all visual components
    visual.healthBarTexture.dispose();
    visual.healthBarPlane.dispose();
    visual.mesh.dispose();
    visual.container.dispose();

    this.units.delete(unitId);
  }

  /**
   * Update all units (called each frame for interpolation)
   */
  update(deltaTime: number): void {
    const interpolationSpeed = 8; // Units per second

    for (const visual of this.units.values()) {
      // Interpolate position
      const posDiff = visual.targetPosition.subtract(visual.currentPosition);
      if (posDiff.length() > 0.01) {
        const moveAmount = Math.min(interpolationSpeed * deltaTime, posDiff.length());
        const moveDir = posDiff.normalize();
        visual.currentPosition.addInPlace(moveDir.scale(moveAmount));
        visual.container.position = visual.currentPosition;
      }

      // Interpolate rotation
      let rotDiff = visual.targetRotation - visual.currentRotation;
      // Handle wrapping
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

      if (Math.abs(rotDiff) > 0.01) {
        const rotAmount = Math.sign(rotDiff) * Math.min(5 * deltaTime, Math.abs(rotDiff));
        visual.currentRotation += rotAmount;
        visual.mesh.rotation.y = visual.currentRotation;
      }

      // Animate spawning units
      if (visual.state === UnitState.SPAWNING) {
        const currentScale = visual.mesh.scaling.x;
        if (currentScale < 1) {
          const newScale = Math.min(1, currentScale + deltaTime * 2);
          visual.mesh.scaling = new Vector3(newScale, newScale, newScale);
        }
      }
    }
  }

  /**
   * Sync all units from server state
   */
  syncUnits(units: CombatUnitState[]): void {
    const serverUnitIds = new Set(units.map(u => u.id));

    // Remove units that no longer exist on server
    for (const id of this.units.keys()) {
      if (!serverUnitIds.has(id)) {
        this.removeUnit(id);
      }
    }

    // Update/add units from server
    for (const unitState of units) {
      this.updateUnit(unitState);
    }
  }

  /**
   * Get unit at position (for selection)
   */
  getUnitAtPosition(position: ArenaPosition): UnitVisual | undefined {
    for (const visual of this.units.values()) {
      const gridPos = {
        x: Math.floor(visual.currentPosition.x / TILE_SIZE),
        z: Math.floor(visual.currentPosition.z / TILE_SIZE),
      };
      if (gridPos.x === position.x && gridPos.z === position.z) {
        return visual;
      }
    }
    return undefined;
  }

  /**
   * Get all units for a player
   */
  getUnitsForPlayer(playerId: string): UnitVisual[] {
    return Array.from(this.units.values()).filter(v => v.ownerId === playerId);
  }

  /**
   * Clear all units
   */
  clear(): void {
    for (const unitId of this.units.keys()) {
      this.removeUnit(unitId);
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();
    this.attackerMaterial.dispose();
    this.defenderMaterial.dispose();
    this.deadMaterial.dispose();
  }
}
