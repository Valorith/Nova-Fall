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
  cooldownBarPlane: Mesh;
  cooldownBarTexture: DynamicTexture;
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

  // Attack capabilities (for cooldown bar)
  attackSpeed: number;
  lastFireTime: number;

  // Spawn animation progress (0 to 1)
  spawnProgress: number;
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
  private async replaceWithModel(
    visual: UnitVisual,
    modelPath: string,
    tileSize = 1
  ): Promise<void> {
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
          console.warn(
            `Mesh "${targetMeshName}" not found in ${filePath}. Available: ${result.meshes.map((m) => m.name).join(', ')}`
          );
          // Dispose all loaded meshes since we're not using them
          result.meshes.forEach((m) => m.dispose());
          return;
        }

        // Get the target and all its descendants
        const descendants = targetNode.getDescendants(false);
        meshesToUse = [
          targetNode,
          ...descendants.filter(
            (d): d is Mesh => d instanceof Mesh || d.getClassName() === 'TransformNode'
          ),
        ] as typeof result.meshes;

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

      // Get the root node for bounds calculation
      const rootNode = modelContainer.getChildren()[0] as TransformNode | undefined;
      if (!rootNode) {
        console.warn('No root node found in model container');
        return;
      }

      // Force compute world matrices before bounds calculation
      this.scene.updateTransformMatrix();
      rootNode.computeWorldMatrix(true);
      meshesToUse.forEach((mesh) => {
        mesh.computeWorldMatrix(true);
      });

      // Use getHierarchyBoundingVectors to get proper bounds for entire model hierarchy
      // This correctly accounts for all child transforms
      const bounds = rootNode.getHierarchyBoundingVectors(true);
      const minVec = bounds.min;
      const maxVec = bounds.max;

      // Calculate model dimensions
      const modelHeight = maxVec.y - minVec.y;
      const modelWidth = maxVec.x - minVec.x;
      const modelDepth = maxVec.z - minVec.z;
      const maxDimension = Math.max(modelHeight, modelWidth, modelDepth);

      // Scale to fit target size (based on tileSize)
      const targetSize = TILE_SIZE * tileSize * 0.8; // 80% of tile footprint
      const scaleFactor = maxDimension > 0 ? targetSize / maxDimension : 1;

      // Store base scale for spawn animation to use
      modelContainer.metadata = { baseScale: scaleFactor };

      // If unit is still spawning, apply spawn progress to scale
      const spawnScale = visual.spawnProgress;
      modelContainer.scaling = new Vector3(
        scaleFactor * spawnScale,
        scaleFactor * spawnScale,
        scaleFactor * spawnScale
      );

      // Recalculate bounds after scaling
      this.scene.updateTransformMatrix();
      rootNode.computeWorldMatrix(true);
      const scaledBounds = rootNode.getHierarchyBoundingVectors(true);

      // Calculate center offset relative to container position
      // We want the model's center (in XZ) to be at the container's position
      const containerWorldPos = visual.container.absolutePosition;
      const modelCenterX = (scaledBounds.min.x + scaledBounds.max.x) / 2;
      const modelCenterZ = (scaledBounds.min.z + scaledBounds.max.z) / 2;

      // Offset the root to center the model on the container
      rootNode.position.x -= modelCenterX - containerWorldPos.x;
      rootNode.position.z -= modelCenterZ - containerWorldPos.z;
      rootNode.position.y -= scaledBounds.min.y; // Place on ground

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
    const sides = side ? [side] : (['north', 'south', 'east', 'west'] as const);
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

    // Create cooldown bar (below health bar)
    const cooldownBarTexture = new DynamicTexture(
      `cooldownbar_tex_${unitState.id}`,
      { width: 128, height: 16 },
      this.scene,
      false
    );

    const cooldownBarMaterial = new StandardMaterial(`cooldownbar_mat_${unitState.id}`, this.scene);
    cooldownBarMaterial.diffuseTexture = cooldownBarTexture;
    cooldownBarMaterial.emissiveTexture = cooldownBarTexture;
    cooldownBarMaterial.disableLighting = true;
    cooldownBarMaterial.backFaceCulling = false;

    const cooldownBarPlane = MeshBuilder.CreatePlane(
      `cooldownbar_${unitState.id}`,
      { width: healthBarWidth, height: healthBarHeight * 0.6 },
      this.scene
    );
    cooldownBarPlane.parent = container;
    cooldownBarPlane.position.y = healthBarOffset - healthBarHeight - TILE_SIZE * 0.05;
    cooldownBarPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    cooldownBarPlane.material = cooldownBarMaterial;
    // Cooldown bar hidden by default (shown when unit can attack and is on cooldown)
    cooldownBarPlane.isVisible = false;

    // Set initial position
    const worldPos = this.gridToWorld(unitState.position);
    container.position = worldPos;

    const visual: UnitVisual = {
      id: unitState.id,
      mesh,
      healthBarPlane,
      healthBarTexture,
      cooldownBarPlane,
      cooldownBarTexture,
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
      attackSpeed: 0, // Will be set from unit definition
      lastFireTime: 0,
      spawnProgress: unitState.state === UnitState.SPAWNING ? 0.1 : 1.0,
    };

    // Draw initial health bar
    this.updateHealthBar(visual);

    return visual;
  }

  /**
   * Update health bar texture and visibility
   * Health bar is only visible when HP < 100%
   */
  private updateHealthBar(visual: UnitVisual): void {
    const healthPercent = visual.health / visual.maxHealth;

    // Only show health bar when damaged (not at 100%)
    // Don't interfere with spawning/dead states which control visibility elsewhere
    if (visual.state !== UnitState.SPAWNING && visual.state !== UnitState.DEAD) {
      visual.healthBarPlane.isVisible = healthPercent < 1.0;
    }

    // Only update texture if visible
    if (!visual.healthBarPlane.isVisible) return;

    const ctx = visual.healthBarTexture.getContext();
    const width = 128;
    const height = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);

    // Health fill
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
   * Update cooldown bar texture for a unit
   * Shows progress from 0% (just fired) to 100% (ready to fire)
   */
  private updateCooldownBar(visual: UnitVisual): void {
    // Don't show cooldown bar for units that can't attack
    if (visual.attackSpeed <= 0) {
      visual.cooldownBarPlane.isVisible = false;
      return;
    }

    // Don't show during spawning or when dead
    if (visual.state === UnitState.SPAWNING || visual.state === UnitState.DEAD) {
      visual.cooldownBarPlane.isVisible = false;
      return;
    }

    const now = performance.now();
    const attackIntervalMs = 1000 / visual.attackSpeed;
    const timeSinceLastFire = now - visual.lastFireTime;
    const cooldownPercent = Math.min(1.0, timeSinceLastFire / attackIntervalMs);

    // Only show cooldown bar when on cooldown (not ready)
    visual.cooldownBarPlane.isVisible = cooldownPercent < 1.0;

    if (!visual.cooldownBarPlane.isVisible) return;

    const ctx = visual.cooldownBarTexture.getContext();
    const width = 128;
    const height = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);

    // Cooldown fill
    const fillWidth = Math.max(0, (width - 4) * cooldownPercent);

    // Color: cyan when charging
    ctx.fillStyle = '#006064'; // Dark cyan - charging

    ctx.fillRect(2, 2, fillWidth, height - 4);

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    visual.cooldownBarTexture.update();
  }

  /**
   * Update all unit cooldown bars (call each frame from CombatEngine)
   */
  public updateAllCooldownBars(): void {
    for (const [, visual] of this.units) {
      this.updateCooldownBar(visual);
    }
  }

  /**
   * Set attack speed for a unit (for cooldown bar)
   */
  public setUnitAttackSpeed(unitId: string, attackSpeed: number): void {
    const visual = this.units.get(unitId);
    if (visual) {
      visual.attackSpeed = attackSpeed;
    }
  }

  /**
   * Record that a unit fired (for cooldown bar)
   */
  public recordUnitFire(unitId: string): void {
    const visual = this.units.get(unitId);
    if (visual) {
      visual.lastFireTime = performance.now();
    }
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
      // Finished spawning - only show health bar if damaged
      const healthPercent = visual.health / visual.maxHealth;
      visual.healthBarPlane.isVisible = healthPercent < 1.0;
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
    visual.cooldownBarTexture.dispose();
    visual.cooldownBarPlane.dispose();
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
      } else if (visual.state === UnitState.MOVING) {
        visual.state = UnitState.IDLE;
      }

      if (visual.state === UnitState.MOVING) {
        const moveDir = visual.targetPosition.subtract(visual.currentPosition);
        if (moveDir.length() > 0.01) {
          visual.targetRotation = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
        }
      }

      // Interpolate rotation
      let rotDiff = visual.targetRotation - visual.currentRotation;
      // Handle wrapping
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

      if (Math.abs(rotDiff) > 0.01) {
        const rotAmount = Math.sign(rotDiff) * Math.min(5 * deltaTime, Math.abs(rotDiff));
        visual.currentRotation += rotAmount;
        visual.container.rotation.y = visual.currentRotation;
      }

      // Animate spawning units
      if (visual.state === UnitState.SPAWNING) {
        if (visual.spawnProgress < 1) {
          visual.spawnProgress = Math.min(1, visual.spawnProgress + deltaTime * 2);

          // Scale placeholder mesh
          visual.mesh.scaling = new Vector3(
            visual.spawnProgress,
            visual.spawnProgress,
            visual.spawnProgress
          );

          // Also scale any loaded model container
          const modelContainer = visual.container
            .getChildren()
            .find((c) => c.name.startsWith('model_container_')) as TransformNode | undefined;
          if (modelContainer) {
            // Model container has its own scale for sizing, multiply with spawn progress
            const baseScale = (modelContainer.metadata as { baseScale?: number })?.baseScale ?? 1;
            modelContainer.scaling = new Vector3(
              baseScale * visual.spawnProgress,
              baseScale * visual.spawnProgress,
              baseScale * visual.spawnProgress
            );
          }

          // Auto-transition to IDLE when spawn animation completes
          if (visual.spawnProgress >= 1) {
            visual.state = UnitState.IDLE;
            // Show health bar if damaged
            const healthPercent = visual.health / visual.maxHealth;
            visual.healthBarPlane.isVisible = healthPercent < 1.0;
          }
        }
      }
    }
  }

  /**
   * Sync all units from server state
   */
  syncUnits(units: CombatUnitState[]): void {
    const serverUnitIds = new Set(units.map((u) => u.id));

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
   * Get the actual visual world position of a unit by ID
   * Returns the interpolated position (where the unit model actually appears)
   */
  getUnitWorldPosition(unitId: string): Vector3 | null {
    const visual = this.units.get(unitId);
    if (!visual) return null;
    return visual.currentPosition.clone();
  }

  /**
   * Get unit by ID
   */
  getUnit(unitId: string): UnitVisual | undefined {
    return this.units.get(unitId);
  }

  /**
   * Get all unit IDs
   */
  getAllUnitIds(): string[] {
    return Array.from(this.units.keys());
  }

  getUnitSummary(): { total: number; attackers: number; defenders: number; dead: number } {
    let attackers = 0;
    let defenders = 0;
    let dead = 0;
    for (const unit of this.units.values()) {
      if (unit.state === UnitState.DEAD) {
        dead++;
        continue;
      }
      if (unit.ownerId === this.attackerId) {
        attackers++;
      } else {
        defenders++;
      }
    }
    return { total: this.units.size, attackers, defenders, dead };
  }

  /**
   * Set a unit's world position directly (bypasses grid snapping)
   * Used for dev mode precise placement
   */
  setUnitWorldPosition(unitId: string, worldX: number, worldZ: number): void {
    const visual = this.units.get(unitId);
    if (!visual) {
      console.warn(`[setUnitWorldPosition] Unit ${unitId} not found!`);
      return;
    }

    const newPos = new Vector3(worldX, 0, worldZ);
    visual.currentPosition = newPos;
    visual.targetPosition = newPos.clone();
    visual.container.position = newPos;
  }

  /**
   * Set a unit's target world position for movement
   */
  setUnitTargetWorldPosition(unitId: string, worldX: number, worldZ: number): void {
    const visual = this.units.get(unitId);
    if (!visual) {
      console.warn(`[setUnitTargetWorldPosition] Unit ${unitId} not found!`);
      return;
    }

    if (visual.state === UnitState.DEAD) {
      return;
    }

    const newTarget = new Vector3(worldX, 0, worldZ);
    visual.targetPosition = newTarget;
    visual.state = UnitState.MOVING;

    const dir = newTarget.subtract(visual.currentPosition);
    if (dir.length() > 0.01) {
      visual.targetRotation = Math.atan2(dir.x, dir.z) + Math.PI;
    }
  }

  /**
   * Damage a unit and update its health bar
   * Returns true if the unit is still alive, false if dead
   */
  damageUnit(unitId: string, damage: number): { alive: boolean; remainingHealth: number } | null {
    const visual = this.units.get(unitId);
    if (!visual) return null;

    // Apply damage
    visual.health = Math.max(0, visual.health - damage);

    // Update health bar
    this.updateHealthBar(visual);

    // Check if dead
    if (visual.health <= 0) {
      visual.state = UnitState.DEAD;
      visual.healthBarPlane.isVisible = false;
      visual.cooldownBarPlane.isVisible = false;

      // Apply dead material to all meshes in the container
      visual.container.getChildMeshes().forEach((mesh) => {
        if (mesh.material) {
          mesh.material = this.deadMaterial;
        }
      });
      // Also apply to placeholder mesh if it's still visible
      visual.mesh.material = this.deadMaterial;

      // Schedule removal after 2 seconds
      setTimeout(() => {
        this.removeUnit(unitId);
      }, 2000);

      return { alive: false, remainingHealth: 0 };
    }

    return { alive: true, remainingHealth: visual.health };
  }

  /**
   * Check if a unit is alive
   */
  isUnitAlive(unitId: string): boolean {
    const visual = this.units.get(unitId);
    if (!visual) return false;
    return visual.state !== UnitState.DEAD && visual.health > 0;
  }

  /**
   * Get unit health info
   */
  getUnitHealth(unitId: string): { health: number; maxHealth: number } | null {
    const visual = this.units.get(unitId);
    if (!visual) return null;
    return { health: visual.health, maxHealth: visual.maxHealth };
  }

  /**
   * Get all units for a player
   */
  getUnitsForPlayer(playerId: string): UnitVisual[] {
    return Array.from(this.units.values()).filter((v) => v.ownerId === playerId);
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
