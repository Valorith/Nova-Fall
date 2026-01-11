/**
 * CombatEngine - Babylon.js 3D Combat Renderer
 *
 * Handles the real-time 3D visualization of combat in Nova Fall.
 * This engine is separate from the PixiJS tactical map and is shown
 * during the 30-minute combat phase.
 *
 * Key responsibilities:
 * - 3D arena rendering with modular terrain
 * - Unit visualization and animation
 * - Camera controls (isometric with rotation)
 * - State interpolation from server updates
 * - Visual effects (projectiles, explosions, shields)
 */

import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  GlowLayer,
  Matrix,
  PBRMaterial,
  SceneLoader,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF'; // Required for .glb loading
import type {
  CombatState,
  CombatSetup,
  ArenaPosition,
  CombatUnitState,
} from '@nova-fall/shared';
import { TileType, UnitState } from '@nova-fall/shared';
import type { DbUnitDefinition, DbBuildingDefinition } from '@nova-fall/shared';
import { UnitManager } from './UnitManager';
import { FlowField } from './FlowField';

// Arena constants
export const ARENA_SIZE = 60; // 60x60 tiles
export const TILE_SIZE = 8; // 8 meters per tile
export const ARENA_METERS = ARENA_SIZE * TILE_SIZE; // 480m x 480m

/**
 * Engine configuration options
 */
export interface CombatEngineOptions {
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
}

/**
 * Main combat engine class
 */
export class CombatEngine {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private shadowGenerator: ShadowGenerator | null = null;
  private glowLayer: GlowLayer | null = null;

  // Arena elements
  private groundMesh: Mesh | null = null;
  private pickingPlane: Mesh | null = null; // Invisible plane for raycasting
  private coreMesh: Mesh | null = null;
  // Arena layout stored for future tile-specific logic
  // @ts-expect-error - Will be used when implementing tile-based obstacles
  private _arenaLayout: TileType[][] | null = null;

  // Unit manager
  private unitManager: UnitManager | null = null;

  // Flow field for pathfinding
  private flowField: FlowField | null = null;

  // State
  private _isRunning = false;
  private _battleId: string | null = null;
  private _lastFrameTime: number = 0;

  // Player IDs (stored for dev tools)
  private _attackerId: string = '';
  private _defenderId: string = '';

  // Dev mode tracking
  private devUnitIds: Set<string> = new Set();
  private devBuildingMeshes: Map<string, TransformNode> = new Map();

  constructor(canvas: HTMLCanvasElement, options: CombatEngineOptions = {}) {
    this.canvas = canvas;

    // Manually set canvas resolution to match display * devicePixelRatio
    // This must be done BEFORE creating the engine
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    // Create Babylon.js engine
    this.engine = new Engine(canvas, options.antialias ?? true, {
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
      stencil: true,
      antialias: options.antialias ?? true,
    });

    // Create main scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.1, 1); // Dark space blue

    // Setup camera
    this.camera = this.setupCamera();

    // Setup lighting
    this.setupLighting();

    // Setup glow effects
    this.setupGlow();

    // Create unit manager
    this.unitManager = new UnitManager(this.scene);

    // Create flow field
    this.flowField = new FlowField(this.scene);

    // Handle window resize
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Setup the isometric-style camera
   */
  private setupCamera(): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      'combatCamera',
      -Math.PI / 4, // Alpha: 45 degrees rotation
      Math.PI / 4, // Beta: 45 degrees tilt (isometric)
      90, // Radius: distance from target
      new Vector3(ARENA_METERS / 2, 0, ARENA_METERS / 2), // Target: center of arena
      this.scene
    );

    // Camera limits (scaled to arena size)
    camera.lowerRadiusLimit = 5; // Minimum zoom (close-up view)
    camera.upperRadiusLimit = ARENA_METERS; // Maximum zoom (see whole arena)
    camera.lowerBetaLimit = 0.2; // Minimum tilt (almost top-down)
    camera.upperBetaLimit = Math.PI / 2.5; // Maximum tilt

    // Enable camera controls
    camera.attachControl(this.canvas, true);

    // Camera movement settings
    camera.panningSensibility = 100; // Right-click panning
    camera.wheelPrecision = 5; // Zoom sensitivity (lower = faster)
    camera.angularSensibilityX = 500; // Rotation sensitivity
    camera.angularSensibilityY = 500;

    // Smooth movement
    camera.inertia = 0.9;

    // Clamp camera target to arena bounds after each frame
    camera.onAfterCheckInputsObservable.add(() => {
      this.clampCameraToArena();
    });

    return camera;
  }

  /**
   * Clamp camera target position to stay within arena bounds
   */
  private clampCameraToArena(): void {
    const padding = 10; // Allow some padding beyond arena edges
    const minBound = -padding;
    const maxBound = ARENA_METERS + padding;

    const target = this.camera.target;
    let clamped = false;

    if (target.x < minBound) {
      target.x = minBound;
      clamped = true;
    } else if (target.x > maxBound) {
      target.x = maxBound;
      clamped = true;
    }

    if (target.z < minBound) {
      target.z = minBound;
      clamped = true;
    } else if (target.z > maxBound) {
      target.z = maxBound;
      clamped = true;
    }

    // Keep Y at ground level
    if (target.y !== 0) {
      target.y = 0;
      clamped = true;
    }

    if (clamped) {
      this.camera.target = target;
    }
  }

  /**
   * Setup scene lighting
   */
  private setupLighting(): void {
    // Ambient light for base visibility
    const ambient = new HemisphericLight(
      'ambient',
      new Vector3(0, 1, 0),
      this.scene
    );
    ambient.intensity = 0.4;
    ambient.groundColor = new Color3(0.1, 0.1, 0.2);

    // Main directional light (sun-like)
    const sun = new DirectionalLight(
      'sun',
      new Vector3(-1, -2, -1).normalize(),
      this.scene
    );
    sun.intensity = 0.8;
    sun.position = new Vector3(ARENA_METERS, 50, ARENA_METERS);

    // Setup shadows
    this.shadowGenerator = new ShadowGenerator(1024, sun);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 32;
  }

  /**
   * Setup glow effects for lasers, shields, etc.
   */
  private setupGlow(): void {
    this.glowLayer = new GlowLayer('glow', this.scene);
    this.glowLayer.intensity = 0.5;
  }

  /**
   * Handle window resize
   */
  private handleResize = (): void => {
    this.resize();
  };

  /**
   * Resize the canvas to match its display size * devicePixelRatio
   * Call this when the canvas becomes visible
   */
  public resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    // Only resize if we have valid dimensions
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      this.engine.resize();
    }
  }

  /**
   * Start the render loop
   */
  public start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastFrameTime = performance.now();

    this.engine.runRenderLoop(() => {
      // Calculate delta time
      const now = performance.now();
      const deltaTime = (now - this._lastFrameTime) / 1000; // Convert to seconds
      this._lastFrameTime = now;

      // Update unit positions (interpolation)
      this.unitManager?.update(deltaTime);

      // Render the scene
      this.scene.render();
    });
  }

  /**
   * Stop the render loop (pause when not visible)
   */
  public stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;

    this.engine.stopRenderLoop();
  }

  /**
   * Check if the engine is currently rendering
   */
  public get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Get the current battle ID
   */
  public get battleId(): string | null {
    return this._battleId;
  }

  /**
   * Load a battle into the engine
   */
  public loadBattle(setup: CombatSetup): void {
    this._battleId = setup.battleId;
    this._arenaLayout = setup.arenaLayout;

    // Store player IDs for dev tools
    this._attackerId = setup.attackerId;
    this._defenderId = setup.defenderId;

    // Clear existing arena
    this.clearArena();

    // Set up unit manager with player IDs
    this.unitManager?.setPlayers(setup.attackerId, setup.defenderId);

    // Build the arena terrain
    this.buildArena(setup.arenaLayout, setup.nodeType);

    // Create Core (the central structure being defended)
    this.createCore(setup.hqMaxHealth);

    // Generate flow field for pathfinding toward Core
    this.flowField?.generate(setup.arenaLayout);

    // Pre-place defender buildings
    for (const building of setup.defenderBuildings) {
      this.placeBuilding(building.buildingTypeId, building.position, building.rotation);
    }

    // Reset camera to default position
    this.resetCamera();
  }

  /**
   * Initialize a dev arena for testing without a real battle
   * Creates a basic arena with default layout
   */
  public initDevArena(): void {
    // Clear existing arena
    this.clearArena();

    // Create default arena layout (all walkable)
    const layout: TileType[][] = [];
    for (let x = 0; x < ARENA_SIZE; x++) {
      const row: TileType[] = [];
      for (let z = 0; z < ARENA_SIZE; z++) {
        row.push(TileType.WALKABLE);
      }
      layout.push(row);
    }

    this._arenaLayout = layout;
    this._attackerId = 'dev_attacker';
    this._defenderId = 'dev_defender';

    // Set up unit manager with dev player IDs
    this.unitManager?.setPlayers(this._attackerId, this._defenderId);

    // Build the arena terrain
    this.buildArena(layout, 'MILITARY_BASE');

    // Create Core at center
    this.createCore(1000);

    // Generate flow field
    this.flowField?.generate(layout);

    // Reset camera
    this.resetCamera();

    // Start rendering if not already running
    if (!this._isRunning) {
      this.start();
    }
  }

  /**
   * Check if arena is initialized (either from battle or dev mode)
   */
  public get hasArena(): boolean {
    return this.groundMesh !== null && this.pickingPlane !== null;
  }

  /**
   * Clear the current arena
   */
  private clearArena(): void {
    // Dispose of existing meshes
    this.groundMesh?.dispose();
    this.groundMesh = null;

    this.pickingPlane?.dispose();
    this.pickingPlane = null;

    this.coreMesh?.dispose();
    this.coreMesh = null;

    // Clear all units
    this.unitManager?.clear();

    // Clear dev entities
    this.devUnitIds.clear();
    for (const mesh of this.devBuildingMeshes.values()) {
      mesh.dispose();
    }
    this.devBuildingMeshes.clear();

    // TODO: Clear projectiles
  }

  /**
   * Build the arena terrain using ThinInstances for performance
   */
  private buildArena(layout: TileType[][], nodeType: string): void {
    // Create a base tile mesh (template for ThinInstances)
    const baseTile = MeshBuilder.CreateGround(
      'baseTile',
      { width: TILE_SIZE * 0.98, height: TILE_SIZE * 0.98 }, // Slight gap between tiles
      this.scene
    );

    // Create PBR material for better visual quality
    const groundMat = new PBRMaterial('groundMat', this.scene);
    groundMat.albedoColor = this.getGroundColor(nodeType);
    groundMat.metallic = 0.1;
    groundMat.roughness = 0.8;
    groundMat.useRoughnessFromMetallicTextureGreen = false;
    baseTile.material = groundMat;
    baseTile.receiveShadows = true;

    // Calculate number of tiles
    const numTiles = ARENA_SIZE * ARENA_SIZE;

    // Create matrix buffer for ThinInstances
    const matricesData = new Float32Array(numTiles * 16);

    // Fill matrices for each tile position
    for (let x = 0; x < ARENA_SIZE; x++) {
      for (let z = 0; z < ARENA_SIZE; z++) {
        const index = x * ARENA_SIZE + z;
        const matrix = Matrix.Translation(
          x * TILE_SIZE + TILE_SIZE / 2,
          0,
          z * TILE_SIZE + TILE_SIZE / 2
        );
        matrix.copyToArray(matricesData, index * 16);
      }
    }

    // Apply ThinInstances
    baseTile.thinInstanceSetBuffer('matrix', matricesData, 16);

    // Store reference
    this.groundMesh = baseTile;

    // Create invisible picking plane that covers the entire arena
    // ThinInstances don't support picking, so we use a separate plane
    this.pickingPlane = MeshBuilder.CreateGround(
      'pickingPlane',
      { width: ARENA_METERS, height: ARENA_METERS },
      this.scene
    );
    this.pickingPlane.position.x = ARENA_METERS / 2;
    this.pickingPlane.position.z = ARENA_METERS / 2;
    this.pickingPlane.position.y = 0.01; // Slightly above ground to ensure hits
    this.pickingPlane.visibility = 0; // Invisible
    this.pickingPlane.isPickable = true;

    // Create hazard/special tile overlay for non-walkable tiles
    this.createSpecialTileOverlays(layout);

    // Add grid overlay for visual clarity
    this.createGridOverlay();

    // Mark spawn zones (arena perimeter)
    this.createSpawnZones();
  }

  /**
   * Create overlays for special tile types (blocked, slow, hazard)
   */
  private createSpecialTileOverlays(layout: TileType[][]): void {
    // Count special tiles
    const blockedTiles: { x: number; z: number }[] = [];
    const slowTiles: { x: number; z: number }[] = [];
    const hazardTiles: { x: number; z: number }[] = [];

    for (let x = 0; x < Math.min(layout.length, ARENA_SIZE); x++) {
      const row = layout[x];
      if (!row) continue;
      for (let z = 0; z < Math.min(row.length, ARENA_SIZE); z++) {
        const tileType = row[z];
        if (tileType === 'blocked') blockedTiles.push({ x, z });
        else if (tileType === 'slow') slowTiles.push({ x, z });
        else if (tileType === 'hazard') hazardTiles.push({ x, z });
      }
    }

    // Create blocked tiles overlay (walls, obstacles)
    if (blockedTiles.length > 0) {
      this.createTileOverlay(blockedTiles, new Color3(0.15, 0.15, 0.15), 0.5, 'blocked');
    }

    // Create slow tiles overlay
    if (slowTiles.length > 0) {
      this.createTileOverlay(slowTiles, new Color3(0.4, 0.35, 0.2), 0.02, 'slow');
    }

    // Create hazard tiles overlay
    if (hazardTiles.length > 0) {
      this.createTileOverlay(hazardTiles, new Color3(0.6, 0.2, 0.1), 0.02, 'hazard');
    }
  }

  /**
   * Create overlay meshes for special tiles using ThinInstances
   */
  private createTileOverlay(
    tiles: { x: number; z: number }[],
    color: Color3,
    height: number,
    name: string
  ): void {
    if (tiles.length === 0) return;

    // Create base mesh
    const baseMesh = height > 0.1
      ? MeshBuilder.CreateBox(name, { width: TILE_SIZE * 0.95, height, depth: TILE_SIZE * 0.95 }, this.scene)
      : MeshBuilder.CreateGround(name, { width: TILE_SIZE * 0.95, height: TILE_SIZE * 0.95 }, this.scene);

    const mat = new StandardMaterial(`${name}Mat`, this.scene);
    mat.diffuseColor = color;
    if (height <= 0.1) {
      mat.alpha = 0.5;
    }
    baseMesh.material = mat;

    // Create ThinInstance matrices
    const matricesData = new Float32Array(tiles.length * 16);
    tiles.forEach((tile, i) => {
      const matrix = Matrix.Translation(
        tile.x * TILE_SIZE + TILE_SIZE / 2,
        height > 0.1 ? height / 2 : 0.03,
        tile.z * TILE_SIZE + TILE_SIZE / 2
      );
      matrix.copyToArray(matricesData, i * 16);
    });

    baseMesh.thinInstanceSetBuffer('matrix', matricesData, 16);

    // Add to shadow generator if it's a tall obstacle
    if (height > 0.1 && this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(baseMesh);
    }
  }

  /**
   * Get ground color based on node type
   */
  private getGroundColor(nodeType: string): Color3 {
    const colors: Record<string, Color3> = {
      MINING_STATION: new Color3(0.4, 0.35, 0.3), // Brown/gray
      REFINERY: new Color3(0.25, 0.25, 0.25), // Dark gray
      RESEARCH_LAB: new Color3(0.6, 0.65, 0.7), // Light blue-gray
      BARRACKS: new Color3(0.35, 0.38, 0.3), // Olive
      AGRICULTURAL: new Color3(0.3, 0.45, 0.25), // Green-brown
      POWER_PLANT: new Color3(0.3, 0.35, 0.45), // Blue-gray
      TRADE_HUB: new Color3(0.4, 0.4, 0.4), // Gray
      CAPITAL: new Color3(0.3, 0.3, 0.4), // Player themed
    };
    return colors[nodeType] ?? new Color3(0.3, 0.3, 0.3);
  }

  /**
   * Create grid overlay for tile visualization
   */
  private createGridOverlay(): void {
    const lines: Vector3[][] = [];

    // Vertical lines
    for (let x = 0; x <= ARENA_SIZE; x++) {
      lines.push([
        new Vector3(x * TILE_SIZE, 0.01, 0),
        new Vector3(x * TILE_SIZE, 0.01, ARENA_METERS),
      ]);
    }

    // Horizontal lines
    for (let z = 0; z <= ARENA_SIZE; z++) {
      lines.push([
        new Vector3(0, 0.01, z * TILE_SIZE),
        new Vector3(ARENA_METERS, 0.01, z * TILE_SIZE),
      ]);
    }

    const gridSystem = MeshBuilder.CreateLineSystem(
      'grid',
      { lines },
      this.scene
    );
    gridSystem.color = new Color3(0.2, 0.2, 0.25);
  }

  /**
   * Create visual indicators for spawn zones (arena perimeter)
   */
  private createSpawnZones(): void {
    const spawnMat = new StandardMaterial('spawnMat', this.scene);
    spawnMat.diffuseColor = new Color3(0.2, 0.5, 0.2);
    spawnMat.alpha = 0.3;
    spawnMat.emissiveColor = new Color3(0.1, 0.3, 0.1);

    // Create thin strips around the perimeter
    const thickness = TILE_SIZE;

    // North edge
    const north = MeshBuilder.CreateGround('spawnNorth', { width: ARENA_METERS, height: thickness }, this.scene);
    north.position = new Vector3(ARENA_METERS / 2, 0.02, ARENA_METERS - thickness / 2);
    north.material = spawnMat;

    // South edge
    const south = MeshBuilder.CreateGround('spawnSouth', { width: ARENA_METERS, height: thickness }, this.scene);
    south.position = new Vector3(ARENA_METERS / 2, 0.02, thickness / 2);
    south.material = spawnMat;

    // East edge
    const east = MeshBuilder.CreateGround('spawnEast', { width: thickness, height: ARENA_METERS - 2 * thickness }, this.scene);
    east.position = new Vector3(ARENA_METERS - thickness / 2, 0.02, ARENA_METERS / 2);
    east.material = spawnMat;

    // West edge
    const west = MeshBuilder.CreateGround('spawnWest', { width: thickness, height: ARENA_METERS - 2 * thickness }, this.scene);
    west.position = new Vector3(thickness / 2, 0.02, ARENA_METERS / 2);
    west.material = spawnMat;
  }

  /**
   * Create the Core structure at center of arena
   * The Core is the primary objective - attackers try to destroy it
   */
  private createCore(maxHealth: number): void {
    // Core occupies center 2x2 tiles
    const coreSize = TILE_SIZE * 2;
    const centerX = ARENA_METERS / 2;
    const centerZ = ARENA_METERS / 2;

    // Main Core structure (placeholder - will be replaced with loaded model)
    this.coreMesh = MeshBuilder.CreateBox(
      'core',
      { width: coreSize * 0.8, height: coreSize, depth: coreSize * 0.8 },
      this.scene
    );
    this.coreMesh.position = new Vector3(centerX, coreSize / 2, centerZ);

    // Core material - glowing blue/purple
    const coreMat = new StandardMaterial('coreMat', this.scene);
    coreMat.diffuseColor = new Color3(0.4, 0.5, 0.8);
    coreMat.specularColor = new Color3(0.4, 0.4, 0.5);
    coreMat.emissiveColor = new Color3(0.15, 0.2, 0.4);
    this.coreMesh.material = coreMat;

    // Add to shadow generator
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(this.coreMesh);
    }

    // Add to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.coreMesh);
    }

    // Store max health for later use
    (this.coreMesh as unknown as { maxHealth: number }).maxHealth = maxHealth;
  }

  /**
   * Place a building in the arena (placeholder)
   */
  private placeBuilding(buildingTypeId: string, position: ArenaPosition, rotation: number): void {
    const worldX = position.x * TILE_SIZE + TILE_SIZE / 2;
    const worldZ = position.z * TILE_SIZE + TILE_SIZE / 2;

    // Placeholder box for building
    const building = MeshBuilder.CreateBox(
      `building_${buildingTypeId}_${position.x}_${position.z}`,
      { width: TILE_SIZE * 0.7, height: TILE_SIZE, depth: TILE_SIZE * 0.7 },
      this.scene
    );
    building.position = new Vector3(worldX, TILE_SIZE / 2, worldZ);
    building.rotation.y = rotation;

    // Building material
    const mat = new StandardMaterial('buildingMat', this.scene);
    mat.diffuseColor = new Color3(0.5, 0.3, 0.3);
    building.material = mat;

    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(building);
    }
  }

  /**
   * Reset camera to default isometric view
   */
  public resetCamera(): void {
    this.camera.alpha = -Math.PI / 4;
    this.camera.beta = Math.PI / 4;
    this.camera.radius = 90;
    this.camera.target = new Vector3(ARENA_METERS / 2, 0, ARENA_METERS / 2);
  }

  /**
   * Rotate camera by 45 degrees
   */
  public rotateCamera(direction: 'left' | 'right'): void {
    const delta = direction === 'left' ? Math.PI / 4 : -Math.PI / 4;
    this.camera.alpha += delta;
  }

  /**
   * Update state from server
   */
  public updateState(state: CombatState): void {
    // Sync units from server state
    this.unitManager?.syncUnits(state.units);

    // TODO: Update buildings, projectiles, effects, Core health
  }

  /**
   * Convert grid position to world position
   */
  public gridToWorld(position: ArenaPosition): Vector3 {
    return new Vector3(
      position.x * TILE_SIZE + TILE_SIZE / 2,
      0,
      position.z * TILE_SIZE + TILE_SIZE / 2
    );
  }

  /**
   * Convert world position to grid position
   */
  public worldToGrid(position: Vector3): ArenaPosition {
    return {
      x: Math.floor(position.x / TILE_SIZE),
      z: Math.floor(position.z / TILE_SIZE),
    };
  }

  /**
   * Toggle flow field debug visualization
   */
  public toggleFlowFieldDebug(): void {
    this.flowField?.toggleDebug();
  }

  /**
   * Get flow field (for external access if needed)
   */
  public getFlowField(): FlowField | null {
    return this.flowField;
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.stop();
    this.unitManager?.dispose();
    this.flowField?.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  /**
   * Get the Babylon.js scene (for debugging/extensions)
   */
  public getScene(): Scene {
    return this.scene;
  }

  /**
   * Get the Babylon.js engine (for debugging/extensions)
   */
  public getEngine(): Engine {
    return this.engine;
  }

  // ========================================
  // Dev Tools - For testing units/buildings
  // ========================================

  /**
   * Convert screen coordinates to arena grid position
   * Uses raycasting to find where the mouse intersects the ground plane
   */
  public screenToArena(screenX: number, screenY: number): ArenaPosition | null {
    // Get canvas-relative coordinates
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Use Babylon.js picking
    const pickResult = this.scene.pick(canvasX, canvasY);

    if (pickResult?.hit && pickResult.pickedPoint) {
      // Convert any hit on ground-level meshes to grid position
      // Accept hits on: pickingPlane, grid, baseTile, or any mesh near ground level
      const hitY = pickResult.pickedPoint.y;
      if (hitY < 5) {
        // Near ground level
        const gridPos = this.worldToGrid(pickResult.pickedPoint);

        // Clamp to arena bounds
        if (gridPos.x >= 0 && gridPos.x < ARENA_SIZE && gridPos.z >= 0 && gridPos.z < ARENA_SIZE) {
          return gridPos;
        }
      }
    }

    return null;
  }

  /**
   * Spawn a unit at position for dev testing
   * Uses the DbUnitDefinition stats from the database
   */
  public devSpawnUnit(
    unitDef: DbUnitDefinition,
    position: ArenaPosition,
    team: 'attacker' | 'defender'
  ): string {
    const unitId = `dev_unit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ownerId = team === 'attacker' ? this._attackerId : this._defenderId;

    const unitState: CombatUnitState = {
      id: unitId,
      unitTypeId: unitDef.id,
      ownerId,
      position,
      rotation: team === 'attacker' ? Math.PI : 0, // Attackers face south, defenders face north
      health: unitDef.health,
      maxHealth: unitDef.health,
      shield: unitDef.shield,
      maxShield: unitDef.shield,
      state: UnitState.SPAWNING,
    };

    // Pass modelPath and tileSize to load the actual 3D model if available
    this.unitManager?.spawnUnit(unitState, unitDef.modelPath, unitDef.tileSize ?? 1);
    this.devUnitIds.add(unitId);

    return unitId;
  }

  /**
   * Place a building at position for dev testing
   * Uses the DbBuildingDefinition stats from the database
   */
  public devPlaceBuilding(
    buildingDef: DbBuildingDefinition,
    position: ArenaPosition,
    team: 'attacker' | 'defender'
  ): string {
    const buildingId = `dev_building_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const worldX = position.x * TILE_SIZE + TILE_SIZE / 2;
    const worldZ = position.z * TILE_SIZE + TILE_SIZE / 2;

    // Calculate building size based on definition
    const width = (buildingDef.width || 1) * TILE_SIZE * 0.8;
    const depth = (buildingDef.height || 1) * TILE_SIZE * 0.8;
    const height = 5.0; // Buildings are imposing structures

    // Create placeholder building mesh
    const building = MeshBuilder.CreateBox(
      buildingId,
      { width, height, depth },
      this.scene
    );
    building.position = new Vector3(worldX, height / 2, worldZ);

    // Building material - color based on team
    const mat = new StandardMaterial(`${buildingId}_mat`, this.scene);
    if (team === 'attacker') {
      mat.diffuseColor = new Color3(0.7, 0.3, 0.3); // Red tint
    } else {
      mat.diffuseColor = new Color3(0.3, 0.4, 0.7); // Blue tint
    }
    building.material = mat;

    // Add shadows
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(building);
    }

    this.devBuildingMeshes.set(buildingId, building);

    // Load 3D model if available, replacing the placeholder
    if (buildingDef.modelPath) {
      this.loadBuildingModel(
        buildingId,
        buildingDef.modelPath,
        worldX,
        worldZ,
        team,
        buildingDef.width || 1,
        buildingDef.height || 1
      );
    }

    return buildingId;
  }

  /**
   * Load a building model asynchronously and replace the placeholder
   * Supports both single-model files and multi-model packs:
   * - "model.glb" - loads entire file
   * - "pack.glb#MeshName" - loads specific mesh from pack
   *
   * @param tileWidth - Building width in tiles (from definition)
   * @param tileHeight - Building depth in tiles (from definition)
   */
  private async loadBuildingModel(
    buildingId: string,
    modelPath: string,
    worldX: number,
    worldZ: number,
    _team: 'attacker' | 'defender',
    tileWidth: number = 1,
    tileHeight: number = 1
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
        console.warn(`No meshes found in building model: ${filePath}`);
        return;
      }

      // Get the placeholder building
      const placeholder = this.devBuildingMeshes.get(buildingId);
      if (!placeholder) {
        // Building was removed while loading
        result.meshes.forEach((m) => m.dispose());
        return;
      }

      // Determine which meshes to use
      let meshesToUse: typeof result.meshes;
      let rootToUse: typeof result.meshes[0];

      if (targetMeshName) {
        // Build patterns to match parent/grandparent names
        // Pack files often have model IDs in ancestor names, not mesh names
        const escapedName = targetMeshName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isTSeries = /^T-[A-D]\d{2}$/.test(targetMeshName);

        // Patterns for matching: "T-B05_5" (grandparent) or "T-B05_base 2_4" (parent)
        const grandparentPattern = isTSeries
          ? new RegExp(`^${escapedName}_\\d+$`)
          : new RegExp(`^${escapedName}_`);
        const parentPattern = new RegExp(`^${escapedName}_`);

        // First try direct mesh name match
        let targetNode = result.meshes.find(
          (m) => m.name === targetMeshName || m.name === targetMeshName + '_primitive0'
        );

        // If not found, find meshes by parent/grandparent name patterns
        const meshesToKeep: typeof result.meshes = [];
        if (!targetNode) {
          for (const mesh of result.meshes) {
            const parentName = mesh.parent?.name || '';
            const grandparentName = mesh.parent?.parent?.name || '';

            const belongsToModel =
              grandparentPattern.test(grandparentName) ||
              parentPattern.test(parentName) ||
              grandparentPattern.test(parentName);

            if (belongsToModel) {
              meshesToKeep.push(mesh);
            }
          }
        }

        if (!targetNode && meshesToKeep.length === 0) {
          console.warn(`Mesh "${targetMeshName}" not found in ${filePath}. Available: ${result.meshes.map(m => m.name).join(', ')}`);
          result.meshes.forEach((m) => m.dispose());
          return;
        }

        if (targetNode) {
          // Direct match found - get target and all its descendants
          const descendants = targetNode.getDescendants(false);
          meshesToUse = [targetNode, ...descendants.filter((d): d is Mesh => d instanceof Mesh)] as typeof result.meshes;
          rootToUse = targetNode;
        } else {
          // Use meshes found by parent/grandparent pattern matching
          meshesToUse = meshesToKeep;

          // Calculate center of all meshes we're keeping (before reparenting)
          let centerSum = Vector3.Zero();
          let meshCount = 0;
          meshesToKeep.forEach((mesh) => {
            if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
              mesh.computeWorldMatrix(true);
              const center = mesh.getBoundingInfo().boundingBox.centerWorld;
              centerSum.addInPlace(center);
              meshCount++;
            }
          });
          const groupCenter = meshCount > 0 ? centerSum.scale(1 / meshCount) : Vector3.Zero();

          // Create a parent transform node at the group center
          const containerNode = new TransformNode(`${targetMeshName}_container`, this.scene);

          // Reparent meshes to container, preserving relative positions
          meshesToKeep.forEach((mesh) => {
            // Get current world position
            mesh.computeWorldMatrix(true);
            const worldPos = mesh.getAbsolutePosition().clone();

            // Detach from old parent
            mesh.setParent(null);
            mesh.position = worldPos.subtract(groupCenter);
            mesh.rotation = Vector3.Zero();

            // Parent to container
            mesh.setParent(containerNode);
          });

          // Detect inherited scales from reparenting (Babylon preserves world scale)
          // We need to counter this when applying our own scale
          let inheritedScale = 1;
          meshesToKeep.forEach((mesh) => {
            const s = mesh.scaling;
            const maxS = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
            inheritedScale = Math.max(inheritedScale, maxS);
          });

          if (inheritedScale > 1.01) {
            console.log(`Pack meshes have inherited scale ${inheritedScale.toFixed(2)}, will compensate`);
          }

          // Store the inherited scale on the container for later use in scaling calculation
          (containerNode as unknown as { _inheritedScale: number })._inheritedScale = inheritedScale;

          rootToUse = containerNode as unknown as typeof result.meshes[0];
        }

        // Dispose meshes we're not using
        result.meshes.forEach((m) => {
          if (!meshesToUse.includes(m)) {
            // Check if this mesh's parent is in our keep list
            let parentInKeepList = false;
            let parent = m.parent;
            while (parent) {
              if (meshesToUse.includes(parent as Mesh)) {
                parentInKeepList = true;
                break;
              }
              parent = parent.parent;
            }
            if (!parentInKeepList) {
              m.dispose();
            }
          }
        });
      } else {
        // Use all meshes (original behavior)
        meshesToUse = result.meshes;
        const firstMesh = result.meshes[0];

        if (!firstMesh) {
          console.warn(`No root mesh found in building model: ${filePath}`);
          return;
        }
        rootToUse = firstMesh;
      }

      // Force compute world matrices
      this.scene.updateTransformMatrix();
      meshesToUse.forEach((mesh) => {
        mesh.computeWorldMatrix(true);
      });

      // Calculate combined bounding box from world bounds
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

      console.log(`Building bounding box: min=(${minVec.x.toFixed(2)}, ${minVec.y.toFixed(2)}, ${minVec.z.toFixed(2)}), max=(${maxVec.x.toFixed(2)}, ${maxVec.y.toFixed(2)}, ${maxVec.z.toFixed(2)}), meshCount=${meshesToUse.length}`);

      // Calculate scale to fit building within tile footprint
      const modelHeight = maxVec.y - minVec.y;
      const modelWidth = maxVec.x - minVec.x;
      const modelDepth = maxVec.z - minVec.z;

      // Target size based on tile dimensions (fill entire authorized grid)
      const targetWidth = tileWidth * TILE_SIZE;
      const targetDepth = tileHeight * TILE_SIZE;

      // Scale to fit within the footprint
      // Use the max dimension of the model's XZ footprint to scale uniformly
      const modelFootprint = Math.max(modelWidth, modelDepth);
      const targetFootprint = Math.max(targetWidth, targetDepth);

      let scaleFactor = 1;
      if (modelFootprint > 0) {
        scaleFactor = targetFootprint / modelFootprint;
      }

      // Check for inherited scale from pack file meshes and compensate
      const inheritedScale = (rootToUse as unknown as { _inheritedScale?: number })._inheritedScale || 1;
      if (inheritedScale > 1.01) {
        scaleFactor = scaleFactor / inheritedScale;
        console.log(`Compensating for inherited scale ${inheritedScale.toFixed(2)}, adjusted scale=${scaleFactor.toFixed(3)}`);
      }

      console.log(`Building model scaling: model=${modelWidth.toFixed(2)}x${modelDepth.toFixed(2)}, target=${targetWidth.toFixed(2)}x${targetDepth.toFixed(2)}, scale=${scaleFactor.toFixed(3)}`);

      // Note: Removed minimum height constraint - it was causing models to scale UP
      // when they should scale down to fit tile footprint

      // Position and scale the model
      const centerX = (minVec.x + maxVec.x) / 2;
      const centerZ = (minVec.z + maxVec.z) / 2;

      // Check if root already has transforms that we need to account for
      console.log(`Root node "${rootToUse.name}" existing transforms - pos: (${rootToUse.position.x.toFixed(2)}, ${rootToUse.position.y.toFixed(2)}, ${rootToUse.position.z.toFixed(2)}), scale: (${rootToUse.scaling.x.toFixed(4)}, ${rootToUse.scaling.y.toFixed(4)}, ${rootToUse.scaling.z.toFixed(4)})`);

      // Reset root transforms first
      rootToUse.position = Vector3.Zero();
      rootToUse.scaling = new Vector3(1, 1, 1);
      rootToUse.rotation = Vector3.Zero();

      // Apply our scale
      rootToUse.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);

      // Position so model center is at target world position, bottom on ground
      rootToUse.position = new Vector3(
        worldX - centerX * scaleFactor,
        -minVec.y * scaleFactor,
        worldZ - centerZ * scaleFactor
      );

      console.log(`Final position: (${rootToUse.position.x.toFixed(2)}, ${rootToUse.position.y.toFixed(2)}, ${rootToUse.position.z.toFixed(2)}), Final scaled size: ${(modelWidth * scaleFactor).toFixed(2)}x${(modelDepth * scaleFactor).toFixed(2)}x${(modelHeight * scaleFactor).toFixed(2)}`);

      // Add shadows to meshes
      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && this.shadowGenerator) {
          this.shadowGenerator.addShadowCaster(mesh);
        }
      });

      // Dispose of the placeholder
      placeholder.dispose();

      // Store the root node for cleanup (includes all descendants)
      this.devBuildingMeshes.set(buildingId, rootToUse as TransformNode);

    } catch (error) {
      console.error(`Failed to load building model ${modelPath}:`, error);
    }
  }

  /**
   * Remove a dev-spawned unit
   */
  public devRemoveUnit(unitId: string): void {
    if (this.devUnitIds.has(unitId)) {
      this.unitManager?.removeUnit(unitId);
      this.devUnitIds.delete(unitId);
    }
  }

  /**
   * Dispose a building node and all its descendants
   */
  private disposeBuildingNode(node: TransformNode): void {
    // Dispose all descendants first (children, grandchildren, etc.)
    const descendants = node.getDescendants(false);
    for (const descendant of descendants) {
      if (descendant instanceof Mesh) {
        descendant.dispose();
      } else if (descendant instanceof TransformNode) {
        descendant.dispose();
      }
    }
    // Then dispose the node itself
    node.dispose();
  }

  /**
   * Remove a dev-placed building
   */
  public devRemoveBuilding(buildingId: string): void {
    const node = this.devBuildingMeshes.get(buildingId);
    if (node) {
      this.disposeBuildingNode(node);
      this.devBuildingMeshes.delete(buildingId);
    }
  }

  /**
   * Clear all dev-spawned units and buildings
   */
  public devClearAll(): void {
    // Remove all dev units
    for (const unitId of this.devUnitIds) {
      this.unitManager?.removeUnit(unitId);
    }
    this.devUnitIds.clear();

    // Remove all dev buildings (dispose all descendants)
    for (const node of this.devBuildingMeshes.values()) {
      this.disposeBuildingNode(node);
    }
    this.devBuildingMeshes.clear();
  }

  /**
   * Get count of dev entities
   */
  public getDevEntityCount(): { units: number; buildings: number } {
    return {
      units: this.devUnitIds.size,
      buildings: this.devBuildingMeshes.size,
    };
  }

  /**
   * Inspect a GLB file and list all available mesh names
   * Useful for discovering mesh names in multi-model pack files
   */
  public async inspectModelPack(modelPath: string): Promise<string[]> {
    try {
      // Parse the path to get directory and filename
      const lastSlash = modelPath.lastIndexOf('/');
      const rootUrl = lastSlash >= 0 ? modelPath.substring(0, lastSlash + 1) : '/';
      const fileName = lastSlash >= 0 ? modelPath.substring(lastSlash + 1) : modelPath;

      console.log(`\n🔍 Inspecting model pack: ${modelPath}`);
      console.log('Loading...');

      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene);

      const meshNames: string[] = [];

      console.log(`\n📦 Found ${result.meshes.length} meshes in ${fileName}:\n`);
      console.log('─'.repeat(60));

      result.meshes.forEach((mesh, index) => {
        const vertexCount = mesh instanceof Mesh ? mesh.getTotalVertices() : 0;
        const isRoot = mesh.parent === null;
        const parentName = mesh.parent ? ` (parent: ${mesh.parent.name})` : '';

        // Only include meshes that have geometry (not empty transform nodes)
        if (vertexCount > 0 || mesh.getChildren().length > 0) {
          meshNames.push(mesh.name);
        }

        const prefix = isRoot ? '📁' : '  └─';
        const vertexInfo = vertexCount > 0 ? ` [${vertexCount} vertices]` : ' [transform node]';

        console.log(`${prefix} ${index}: "${mesh.name}"${vertexInfo}${parentName}`);
      });

      console.log('─'.repeat(60));
      console.log(`\n✅ To use a specific mesh, set modelPath to:`);
      console.log(`   ${modelPath}#MeshName`);
      console.log(`\nExample: ${modelPath}#${meshNames[1] || meshNames[0] || 'MeshName'}\n`);

      // Clean up - dispose all loaded meshes
      result.meshes.forEach((m) => m.dispose());

      return meshNames;
    } catch (error) {
      console.error(`❌ Failed to load model pack ${modelPath}:`, error);
      return [];
    }
  }
}
