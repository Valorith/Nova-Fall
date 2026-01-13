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
  private _lastFrameTime = 0;

  // Player IDs (stored for dev tools)
  private _attackerId = '';
  private _defenderId = '';

  // Dev mode tracking
  private devUnitIds = new Set<string>();
  private devBuildingMeshes = new Map<string, TransformNode>();

  // Building metadata for turret attacks and selection
  private buildingData = new Map<
    string,
    {
      x: number; // Grid position
      z: number;
      range: number;
      damage: number;
      attackType: string;
      laserColor: string | null;
      mesh: TransformNode;
      rotatablePart: TransformNode | null; // Turret head (yaw rotation)
      pitchablePart: TransformNode | null; // Barrel/gun (pitch rotation)
      barrelTip: TransformNode | null; // The end of the barrel for laser origin
      barrelLocalOffset: Vector3; // Pre-calculated offset from turret pivot to barrel tip in local space
      scaleFactor: number; // Scale applied to the model
      currentRotation: number; // Horizontal rotation (yaw)
      targetRotation: number;
      currentPitch: number; // Vertical rotation (pitch)
      targetPitch: number;
    }
  >();

  // Selection state
  private selectedBuildingId: string | null = null;

  // Selection ring (around selected building)
  private selectionRing: Mesh | null = null;

  // Range circle visualization
  private rangeCircle: Mesh | null = null;

  // Target ring visualization
  private targetRing: Mesh | null = null;
  private targetRingTargetId: string | null = null;

  // Active lasers with fade-out support
  private activeLasers = new Map<string, {
    coreMesh: Mesh;
    glowMesh: Mesh;
    startTime: number;
    duration: number;
  }>();

  // Pending attacks (waiting for turret rotation)
  private pendingAttacks = new Map<string, {
    targetWorldX: number;
    targetWorldZ: number;
    targetWorldY: number;
    color: string;
  }>();

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

      // Update turret rotations
      this.updateTurretRotations(deltaTime);

      // Update laser lifecycle (remove expired lasers)
      this.updateLasers();

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

    // Store building data for turret rotation and attack handling
    this.buildingData.set(buildingId, {
      x: position.x,
      z: position.z,
      range: buildingDef.range || 0,
      damage: buildingDef.damage || 0,
      attackType: buildingDef.attackType || 'instant_laser',
      laserColor: buildingDef.laserColor || null,
      mesh: building,
      rotatablePart: null, // Will be set when model loads (yaw)
      pitchablePart: null, // Will be set when model loads (pitch)
      barrelTip: null, // Will be set when model loads
      barrelLocalOffset: new Vector3(0, 0, 4), // Default offset, will be calculated when model loads
      scaleFactor: 1, // Will be set when model loads
      currentRotation: 0,
      targetRotation: 0,
      currentPitch: 0,
      targetPitch: 0,
    });

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
    tileWidth = 1,
    tileHeight = 1
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
        const targetNode = result.meshes.find(
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
          const centerSum = Vector3.Zero();
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

      // Update building data with loaded mesh and find rotatable part
      const buildingDataEntry = this.buildingData.get(buildingId);
      if (buildingDataEntry) {
        buildingDataEntry.mesh = rootToUse as TransformNode;
        buildingDataEntry.scaleFactor = scaleFactor;
        const { rotatablePart, pitchablePart, barrelTip, barrelLocalOffset } = this.findTurretParts(rootToUse as TransformNode);
        buildingDataEntry.rotatablePart = rotatablePart;
        buildingDataEntry.pitchablePart = pitchablePart;
        buildingDataEntry.barrelTip = barrelTip;
        buildingDataEntry.barrelLocalOffset = barrelLocalOffset;
        console.log(`Turret parts: rotatable="${rotatablePart?.name || 'none'}", pitchable="${pitchablePart?.name || 'none'}", barrelTip="${barrelTip?.name || 'none'}"`);
        console.log(`Barrel local offset: (${barrelLocalOffset.x.toFixed(2)}, ${barrelLocalOffset.y.toFixed(2)}, ${barrelLocalOffset.z.toFixed(2)}), scaleFactor=${scaleFactor.toFixed(3)}`);
      }

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
      this.buildingData.delete(buildingId);

      // Clear selection if this building was selected
      if (this.selectedBuildingId === buildingId) {
        this.deselectBuilding();
      }
    }
  }

  /**
   * Clear all dev-spawned units and buildings
   */
  public devClearAll(): void {
    // Clear selection first
    this.deselectAll();

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
    this.buildingData.clear();
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

  // ==================== SELECTION SYSTEM ====================

  /**
   * Select a building and show its range circle and selection ring
   */
  public selectBuilding(buildingId: string): void {
    // Clear previous selection
    if (this.selectedBuildingId) {
      this.hideRangeCircle();
      this.hideSelectionRing();
    }
    this.selectedBuildingId = buildingId;

    const building = this.buildingData.get(buildingId);
    if (building) {
      // Show selection ring around the building
      this.showSelectionRing(building.x, building.z);

      // Show range circle if building has attack range
      if (building.range > 0) {
        this.showRangeCircle(building.x, building.z, building.range);
      }
    }
  }

  /**
   * Deselect the currently selected building
   */
  public deselectBuilding(): void {
    this.selectedBuildingId = null;
    this.hideSelectionRing();
    this.hideRangeCircle();
    this.hideTargetRing();
  }

  /**
   * Clear all selection
   */
  public deselectAll(): void {
    this.selectedBuildingId = null;
    this.hideSelectionRing();
    this.hideRangeCircle();
    this.hideTargetRing();
  }

  /**
   * Get currently selected building ID
   */
  public getSelectedBuildingId(): string | null {
    return this.selectedBuildingId;
  }

  // ==================== SELECTION RING ====================

  /**
   * Show a selection ring around a building position
   */
  private showSelectionRing(gridX: number, gridZ: number): void {
    this.hideSelectionRing();

    const worldX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const worldZ = gridZ * TILE_SIZE + TILE_SIZE / 2;

    // Single thick ring around the building
    this.selectionRing = MeshBuilder.CreateTorus(
      'selectionRing',
      {
        diameter: TILE_SIZE * 1.3,
        thickness: 0.6, // Thicker ring
        tessellation: 48,
      },
      this.scene
    );
    this.selectionRing.position = new Vector3(worldX, 0.12, worldZ);

    const material = new StandardMaterial('selectionMat', this.scene);
    material.emissiveColor = new Color3(0.2, 0.9, 0.4); // Green glow
    material.alpha = 0.75;
    this.selectionRing.material = material;

    // Add to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.selectionRing);
    }
  }

  /**
   * Hide the selection ring
   */
  private hideSelectionRing(): void {
    if (this.selectionRing) {
      this.selectionRing.dispose();
      this.selectionRing = null;
    }
  }

  // ==================== RANGE CIRCLE ====================

  /**
   * Show a range circle around a position
   */
  public showRangeCircle(gridX: number, gridZ: number, range: number): void {
    if (this.rangeCircle) {
      this.rangeCircle.dispose();
    }

    // Create torus for clean ring visualization
    // Babylon.js torus is created in XZ plane by default (flat on ground)
    this.rangeCircle = MeshBuilder.CreateTorus(
      'rangeCircle',
      {
        diameter: range * TILE_SIZE * 2,
        thickness: 0.5,
        tessellation: 64,
      },
      this.scene
    );

    // Position at grid center, slightly above ground
    const worldX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const worldZ = gridZ * TILE_SIZE + TILE_SIZE / 2;
    this.rangeCircle.position = new Vector3(worldX, 0.15, worldZ);

    // Semi-transparent cyan material
    const material = new StandardMaterial('rangeMat', this.scene);
    material.diffuseColor = new Color3(0, 0.8, 1);
    material.emissiveColor = new Color3(0, 0.4, 0.5);
    material.alpha = 0.5;
    this.rangeCircle.material = material;

    // Add to glow layer if available
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.rangeCircle);
    }
  }

  /**
   * Hide the range circle
   */
  public hideRangeCircle(): void {
    if (this.rangeCircle) {
      this.rangeCircle.dispose();
      this.rangeCircle = null;
    }
  }

  // ==================== TARGET RING ====================

  /**
   * Show a target ring on an enemy position
   */
  public showTargetRing(targetId: string, worldX: number, worldZ: number, radius = 2): void {
    if (this.targetRing) {
      this.targetRing.dispose();
    }

    this.targetRingTargetId = targetId;

    // Create torus for target ring
    // Babylon.js torus is created in XZ plane by default (flat on ground)
    this.targetRing = MeshBuilder.CreateTorus(
      'targetRing',
      {
        diameter: radius * 2,
        thickness: 0.25,
        tessellation: 32,
      },
      this.scene
    );

    this.targetRing.position = new Vector3(worldX, 0.2, worldZ);

    // Red/orange emissive material
    const material = new StandardMaterial('targetMat', this.scene);
    material.emissiveColor = new Color3(1, 0.3, 0);
    material.alpha = 0.8;
    this.targetRing.material = material;

    // Add to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.targetRing);
    }
  }

  /**
   * Hide the target ring
   */
  public hideTargetRing(): void {
    if (this.targetRing) {
      this.targetRing.dispose();
      this.targetRing = null;
      this.targetRingTargetId = null;
    }
  }

  /**
   * Update target ring position (for moving targets)
   */
  public updateTargetRingPosition(worldX: number, worldZ: number): void {
    if (this.targetRing) {
      this.targetRing.position.x = worldX;
      this.targetRing.position.z = worldZ;
    }
  }

  // ==================== LASER SYSTEM ====================

  /**
   * Create a laser beam mesh between two points
   * Uses capsule shape (cylinder with hemisphere caps) for smooth ends
   * Returns both core (bright center) and glow (outer) meshes
   */
  private createLaserBeam(
    startPos: Vector3,
    endPos: Vector3,
    color: string
  ): { core: Mesh; glow: Mesh } {
    const distance = Vector3.Distance(startPos, endPos);
    const id = Date.now();

    // Parse color
    let laserColor: Color3;
    try {
      laserColor = Color3.FromHexString(color);
    } catch {
      laserColor = new Color3(1, 0, 0);
    }

    // Core dimensions (thin beam appropriate for turret barrel)
    const coreRadius = 0.08;
    const glowRadius = 0.2;

    // Create capsule-like shape using merged meshes
    // Core beam
    const coreCylinder = MeshBuilder.CreateCylinder(
      `laser_core_cyl_${id}`,
      {
        height: distance,
        diameter: coreRadius * 2,
        tessellation: 12,
      },
      this.scene
    );

    // Hemisphere caps for core
    const coreCapStart = MeshBuilder.CreateSphere(
      `laser_core_cap_start_${id}`,
      { diameter: coreRadius * 2, segments: 8 },
      this.scene
    );
    const coreCapEnd = MeshBuilder.CreateSphere(
      `laser_core_cap_end_${id}`,
      { diameter: coreRadius * 2, segments: 8 },
      this.scene
    );

    // Position caps at ends of cylinder (relative to cylinder center)
    coreCapStart.position.y = -distance / 2;
    coreCapEnd.position.y = distance / 2;

    // Merge into single mesh
    const core = Mesh.MergeMeshes(
      [coreCylinder, coreCapStart, coreCapEnd],
      true, true, undefined, false, true
    ) as Mesh;
    core.name = `laser_core_${id}`;

    // Glow beam (same process)
    const glowCylinder = MeshBuilder.CreateCylinder(
      `laser_glow_cyl_${id}`,
      {
        height: distance,
        diameter: glowRadius * 2,
        tessellation: 12,
      },
      this.scene
    );

    const glowCapStart = MeshBuilder.CreateSphere(
      `laser_glow_cap_start_${id}`,
      { diameter: glowRadius * 2, segments: 8 },
      this.scene
    );
    const glowCapEnd = MeshBuilder.CreateSphere(
      `laser_glow_cap_end_${id}`,
      { diameter: glowRadius * 2, segments: 8 },
      this.scene
    );

    glowCapStart.position.y = -distance / 2;
    glowCapEnd.position.y = distance / 2;

    const glow = Mesh.MergeMeshes(
      [glowCylinder, glowCapStart, glowCapEnd],
      true, true, undefined, false, true
    ) as Mesh;
    glow.name = `laser_glow_${id}`;

    // Position both at midpoint
    const midpoint = Vector3.Lerp(startPos, endPos, 0.5);
    core.position = midpoint.clone();
    glow.position = midpoint.clone();

    // Calculate rotation to face target
    const direction = endPos.subtract(startPos).normalize();
    const up = new Vector3(0, 1, 0);

    // Apply rotation to both meshes
    const applyRotation = (mesh: Mesh) => {
      if (Math.abs(Vector3.Dot(direction, up)) > 0.99) {
        mesh.rotation.x = direction.y > 0 ? 0 : Math.PI;
      } else {
        const tempTarget = midpoint.add(direction);
        mesh.lookAt(tempTarget);
        mesh.rotation.x += Math.PI / 2;
      }
    };
    applyRotation(core);
    applyRotation(glow);

    // Core material - bright, full emissive, white-hot center
    const coreMat = new StandardMaterial(`laser_core_mat_${id}`, this.scene);
    // Make core slightly white for intensity
    const hotColor = new Color3(
      Math.min(1, laserColor.r + 0.5),
      Math.min(1, laserColor.g + 0.5),
      Math.min(1, laserColor.b + 0.5)
    );
    coreMat.emissiveColor = hotColor;
    coreMat.diffuseColor = hotColor;
    coreMat.disableLighting = true;
    core.material = coreMat;

    // Glow material - full color, semi-transparent
    const glowMat = new StandardMaterial(`laser_glow_mat_${id}`, this.scene);
    glowMat.emissiveColor = laserColor;
    glowMat.diffuseColor = laserColor;
    glowMat.alpha = 0.5;
    glowMat.disableLighting = true;
    glow.material = glowMat;

    // Add both to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(core);
      this.glowLayer.addIncludedOnlyMesh(glow);
    }

    return { core, glow };
  }

  /**
   * Fire a laser from source to target position with visual effects
   */
  public fireLaser(sourcePos: Vector3, targetPos: Vector3, color = '#ff0000'): void {
    const id = `laser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const duration = 2000; // 2 seconds visible

    const { core, glow } = this.createLaserBeam(sourcePos, targetPos, color);

    this.activeLasers.set(id, {
      coreMesh: core,
      glowMesh: glow,
      startTime: Date.now(),
      duration,
    });

    // Create impact flash at target
    this.createImpactFlash(targetPos, color);
  }

  /**
   * Create a brief flash effect at impact point
   */
  private createImpactFlash(position: Vector3, color: string): void {
    let flashColor: Color3;
    try {
      flashColor = Color3.FromHexString(color);
    } catch {
      flashColor = new Color3(1, 0, 0);
    }

    // Create sphere for impact
    const flash = MeshBuilder.CreateSphere(
      `impact_${Date.now()}`,
      { diameter: 3, segments: 8 },
      this.scene
    );
    flash.position = position.clone();
    flash.position.y = 0.5;

    const mat = new StandardMaterial('impactMat', this.scene);
    mat.emissiveColor = flashColor;
    mat.alpha = 0.8;
    mat.disableLighting = true;
    flash.material = mat;

    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(flash);
    }

    // Animate and dispose
    let scale = 1;
    const animate = () => {
      scale += 0.15;
      mat.alpha -= 0.04;
      flash.scaling = new Vector3(scale, scale * 0.3, scale);

      if (mat.alpha > 0) {
        requestAnimationFrame(animate);
      } else {
        flash.dispose();
        mat.dispose();
      }
    };
    requestAnimationFrame(animate);
  }

  /**
   * Update active lasers with fade-out effect (called in render loop)
   */
  private updateLasers(): void {
    const now = Date.now();

    for (const [id, laser] of this.activeLasers) {
      const elapsed = now - laser.startTime;
      const progress = elapsed / laser.duration;

      if (progress >= 1) {
        // Laser expired - dispose
        laser.coreMesh.dispose();
        laser.glowMesh.dispose();
        this.activeLasers.delete(id);
      } else {
        // Fade out in the last 30% of duration
        if (progress > 0.7) {
          const fadeProgress = (progress - 0.7) / 0.3;
          const alpha = 1 - fadeProgress;

          const coreMat = laser.coreMesh.material as StandardMaterial;
          const glowMat = laser.glowMesh.material as StandardMaterial;

          if (coreMat) coreMat.alpha = alpha;
          if (glowMat) glowMat.alpha = alpha * 0.4;

          // Shrink slightly as it fades
          const scale = 1 - fadeProgress * 0.3;
          laser.coreMesh.scaling.x = scale;
          laser.coreMesh.scaling.z = scale;
          laser.glowMesh.scaling.x = scale;
          laser.glowMesh.scaling.z = scale;
        }
      }
    }
  }

  // ==================== TURRET ROTATION ====================

  /**
   * Find the turret parts: the rotatable head (yaw), pitchable barrel (pitch), and barrel tip
   * Uses mesh hierarchy and naming conventions to identify parts
   *
   * For models without proper hierarchy (like flat GLB exports), this will:
   * 1. Identify the base mesh (lowest Y position)
   * 2. Create a new parent node for all non-base meshes (turret head)
   * 3. Return that parent as the rotatable part
   * 4. Calculate the barrel local offset from the turret head's bounding box
   */
  private findTurretParts(root: TransformNode): {
    rotatablePart: TransformNode | null;
    pitchablePart: TransformNode | null;
    barrelTip: TransformNode | null;
    barrelLocalOffset: Vector3;
  } {
    const rotateKeywords = ['turret', 'head', 'top', 'rotate', 'swivel', 'upper'];
    const pitchKeywords = ['barrel', 'gun', 'cannon', 'weapon', 'arm'];
    const tipKeywords = ['muzzle', 'tip', 'nozzle', 'end'];

    // Get all direct children (meshes)
    const children = root.getChildren();
    const meshChildren: TransformNode[] = [];

    for (const child of children) {
      if (child instanceof TransformNode) {
        meshChildren.push(child);
      }
    }

    console.log('Turret mesh hierarchy:', meshChildren.map(d => {
      const pos = d.position;
      return `${d.name}(y:${pos?.y?.toFixed(1) || '?'})`;
    }).join(', '));

    let rotatablePart: TransformNode | null = null;
    let pitchablePart: TransformNode | null = null;
    let barrelTip: TransformNode | null = null;
    let headMeshes: TransformNode[] = [];

    // First, try to find parts by keyword
    for (const mesh of meshChildren) {
      const nameLower = mesh.name.toLowerCase();

      // Check for barrel tip/muzzle
      const isTip = tipKeywords.some(kw => nameLower.includes(kw));
      if (isTip && !barrelTip) {
        barrelTip = mesh;
        console.log(`Found barrel tip: "${mesh.name}"`);
      }

      // Check for pitchable part (barrel/gun)
      const isPitchable = pitchKeywords.some(kw => nameLower.includes(kw));
      if (isPitchable && !pitchablePart) {
        pitchablePart = mesh;
        console.log(`Found pitchable part (barrel): "${mesh.name}"`);
      }

      // Check for rotatable part by keyword (turret head)
      const isRotatable = rotateKeywords.some(kw => nameLower.includes(kw));
      if (isRotatable && !rotatablePart) {
        rotatablePart = mesh;
        console.log(`Found rotatable part (head): "${mesh.name}"`);
      }
    }

    // Calculate barrel local offset BEFORE reparenting (need original positions)
    // The offset will be relative to where we place the turret head pivot
    let barrelLocalOffset = new Vector3(0, 0, 4); // Default fallback
    let turretHeadCenterY = 0;

    // If no rotatable part found by keyword, create a turret head group
    // by separating base (lowest mesh) from the rest
    if (!rotatablePart && meshChildren.length > 1) {
      // Sort meshes by Y position to find the base
      const sortedByY = [...meshChildren].sort((a, b) => {
        const aY = a.position?.y ?? 0;
        const bY = b.position?.y ?? 0;
        return aY - bY;
      });

      // The lowest mesh is likely the base
      const baseMesh = sortedByY[0];
      headMeshes = sortedByY.slice(1); // Everything above the base

      if (baseMesh && headMeshes.length > 0) {
        console.log(`Identified base mesh: "${baseMesh.name}" (y=${baseMesh.position?.y?.toFixed(1)})`);
        console.log(`Turret head meshes: ${headMeshes.map(m => m.name).join(', ')}`);

        // Calculate the center position of head meshes for the pivot point
        for (const mesh of headMeshes) {
          turretHeadCenterY += mesh.position?.y ?? 0;
        }
        turretHeadCenterY /= headMeshes.length;

        // Calculate barrel offset BEFORE reparenting using original mesh positions
        // Find the mesh that extends furthest in Z (that's the barrel tip)
        let overallMaxZ = -Infinity;
        let minX = Infinity, maxX = -Infinity;

        for (const mesh of headMeshes) {
          if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
            const boundingInfo = mesh.getBoundingInfo();
            const min = boundingInfo.boundingBox.minimum;
            const max = boundingInfo.boundingBox.maximum;
            const meshPos = mesh.position || Vector3.Zero();

            const meshMaxZ = max.z + meshPos.z;
            minX = Math.min(minX, min.x + meshPos.x);
            maxX = Math.max(maxX, max.x + meshPos.x);

            if (meshMaxZ > overallMaxZ) {
              overallMaxZ = meshMaxZ;
            }
          }
        }

        if (overallMaxZ > -Infinity) {
          // Barrel tip: centered X, small negative Y offset to align with barrel centerline, max Z (front)
          const localCenterX = (minX + maxX) / 2;
          const localBarrelY = -0.22; // Offset down from pivot to barrel centerline
          barrelLocalOffset = new Vector3(localCenterX, localBarrelY, overallMaxZ);
          console.log(`Barrel offset: pivotY=${turretHeadCenterY.toFixed(2)}, localOffset=(${barrelLocalOffset.x.toFixed(2)}, ${barrelLocalOffset.y.toFixed(2)}, ${barrelLocalOffset.z.toFixed(2)})`);
        }

        // Create a new parent node for the turret head parts
        const turretHeadNode = new TransformNode('_turretHead', this.scene);
        turretHeadNode.parent = root;

        // Position the turret head node at the center Y of head parts
        turretHeadNode.position.y = turretHeadCenterY;

        // Reparent head meshes under the turret head node
        for (const mesh of headMeshes) {
          const originalY = mesh.position?.y ?? 0;
          mesh.parent = turretHeadNode;
          // Adjust position relative to new parent
          mesh.position.y = originalY - turretHeadCenterY;
        }

        rotatablePart = turretHeadNode;
        console.log(`Created turret head group at y=${turretHeadCenterY.toFixed(1)} with ${headMeshes.length} meshes`);
      }
    } else if (!rotatablePart && meshChildren.length === 1) {
      // Only one mesh - use it directly
      rotatablePart = meshChildren[0] ?? null;
      headMeshes = meshChildren;
      console.log(`Single mesh turret, using: "${rotatablePart?.name}"`);

      // Calculate offset for single mesh - use center Y (barrel centerline)
      if (rotatablePart instanceof Mesh && rotatablePart.getTotalVertices() > 0) {
        const boundingInfo = rotatablePart.getBoundingInfo();
        const min = boundingInfo.boundingBox.minimum;
        const max = boundingInfo.boundingBox.maximum;
        const meshPos = rotatablePart.position || Vector3.Zero();
        barrelLocalOffset = new Vector3(
          (min.x + max.x) / 2,
          (min.y + max.y) / 2 + meshPos.y, // Use center Y
          max.z + meshPos.z
        );
      }
    }

    // If still no pitchable part, use the rotatable part for both
    if (!pitchablePart && rotatablePart) {
      console.log('No separate pitchable part found, using rotatable part for pitch');
      pitchablePart = rotatablePart;
    }

    // If headMeshes wasn't populated (parts found by keyword), calculate offset from rotatablePart
    if (headMeshes.length === 0 && rotatablePart) {
      const rotChildren = rotatablePart.getChildMeshes();
      if (rotChildren.length > 0) {
        // Calculate bounding box from children
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const mesh of rotChildren) {
          if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
            const boundingInfo = mesh.getBoundingInfo();
            const min = boundingInfo.boundingBox.minimum;
            const max = boundingInfo.boundingBox.maximum;
            const meshPos = mesh.position || Vector3.Zero();

            minX = Math.min(minX, min.x + meshPos.x);
            maxX = Math.max(maxX, max.x + meshPos.x);
            minY = Math.min(minY, min.y + meshPos.y);
            maxY = Math.max(maxY, max.y + meshPos.y);
            minZ = Math.min(minZ, min.z + meshPos.z);
            maxZ = Math.max(maxZ, max.z + meshPos.z);
          }
        }

        if (maxZ > -Infinity) {
          barrelLocalOffset = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, maxZ); // Use center Y
          console.log(`Barrel offset from keyword-found part: (${barrelLocalOffset.x.toFixed(2)}, ${barrelLocalOffset.y.toFixed(2)}, ${barrelLocalOffset.z.toFixed(2)})`);
        }
      } else if (rotatablePart instanceof Mesh && rotatablePart.getTotalVertices() > 0) {
        const boundingInfo = rotatablePart.getBoundingInfo();
        const min = boundingInfo.boundingBox.minimum;
        const max = boundingInfo.boundingBox.maximum;
        barrelLocalOffset = new Vector3(0, (min.y + max.y) / 2, max.z); // Use center Y
        console.log(`Barrel offset from single mesh: (${barrelLocalOffset.x.toFixed(2)}, ${barrelLocalOffset.y.toFixed(2)}, ${barrelLocalOffset.z.toFixed(2)})`);
      }
    }

    // If still no barrel tip found
    if (!barrelTip && pitchablePart) {
      console.log('No barrel tip found, will use calculated offset from pitchable part');
    }

    return { rotatablePart, pitchablePart, barrelTip, barrelLocalOffset };
  }

  /**
   * Calculate target rotation from turret position to target position
   */
  private calculateTargetRotation(
    turretX: number,
    turretZ: number,
    targetX: number,
    targetZ: number
  ): number {
    return Math.atan2(targetX - turretX, targetZ - turretZ);
  }

  /**
   * Update turret rotations (called in render loop)
   * Handles both horizontal (yaw) and vertical (pitch) rotation
   * Yaw is applied to the rotatable part (turret head)
   * Pitch is applied to the pitchable part (barrel/gun)
   * Also checks for pending attacks and fires when rotation is complete
   */
  private updateTurretRotations(deltaTime: number): void {
    const yawSpeed = 3.0; // Radians per second for horizontal rotation
    const pitchSpeed = 2.0; // Radians per second for vertical rotation

    for (const [buildingId, data] of this.buildingData) {
      // Yaw rotates the turret head (or whole mesh as fallback)
      const yawPart = data.rotatablePart || data.mesh;
      // Pitch rotates the barrel (or same as yaw part if no separate barrel)
      const pitchPart = data.pitchablePart || yawPart;
      const samePart = pitchPart === yawPart;

      // Update yaw (horizontal rotation) on the turret head
      let yawDiff = data.targetRotation - data.currentRotation;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      const isYawRotating = Math.abs(yawDiff) > 0.05;
      if (isYawRotating) {
        const maxYaw = yawSpeed * deltaTime;
        const yawAmount = Math.sign(yawDiff) * Math.min(maxYaw, Math.abs(yawDiff));
        data.currentRotation += yawAmount;
      }

      // Update pitch (vertical rotation) on the barrel
      const pitchDiff = data.targetPitch - data.currentPitch;
      const isPitchRotating = Math.abs(pitchDiff) > 0.02;
      if (isPitchRotating) {
        const maxPitch = pitchSpeed * deltaTime;
        const pitchAmount = Math.sign(pitchDiff) * Math.min(maxPitch, Math.abs(pitchDiff));
        data.currentPitch += pitchAmount;
      }

      // Apply rotations - log once when attack starts
      const hasPendingAttack = this.pendingAttacks.has(buildingId);

      if (samePart) {
        // If we created a _turretHead group, rotate it directly
        // Otherwise for legacy single-mesh models, try rotating the parent container
        const partToRotate = yawPart.name === '_turretHead' ? yawPart : (yawPart.parent instanceof TransformNode ? yawPart.parent : yawPart);

        // Apply yaw and pitch using Euler angles
        // Y = yaw (horizontal), X = pitch (vertical)
        // Note: Negate pitch because Babylon.js positive X rotation tilts down
        partToRotate.rotationQuaternion = null;
        partToRotate.rotation.x = -data.currentPitch;
        partToRotate.rotation.y = data.currentRotation;
        partToRotate.rotation.z = 0;
      } else {
        // Separate parts - apply yaw and pitch to different nodes
        yawPart.rotationQuaternion = null;
        pitchPart.rotationQuaternion = null;
        yawPart.rotation.y = data.currentRotation;
        pitchPart.rotation.x = data.currentPitch;

        if (hasPendingAttack) {
          console.log(`Rotating separate parts - yaw(${yawPart.name}): ${(data.currentRotation * 180 / Math.PI).toFixed(1)}deg, pitch(${pitchPart.name}): ${(data.currentPitch * 180 / Math.PI).toFixed(1)}deg`);
        }
      }

      // Check if both rotations are complete
      const isFullyAimed = !isYawRotating && !isPitchRotating;
      if (isFullyAimed) {
        // Rotation complete - check for pending attack
        const pendingAttack = this.pendingAttacks.get(buildingId);
        if (pendingAttack) {
          this.pendingAttacks.delete(buildingId);
          this.executeAttack(buildingId, data, pendingAttack);
        }
      }
    }
  }

  /**
   * Execute the actual attack (fire laser) after rotation is complete
   */
  private executeAttack(
    buildingId: string,
    data: typeof this.buildingData extends Map<string, infer V> ? V : never,
    attack: { targetWorldX: number; targetWorldZ: number; targetWorldY: number; color: string }
  ): void {
    let sourcePos: Vector3;

    // Try to get barrel tip world position
    if (data.barrelTip) {
      data.barrelTip.computeWorldMatrix(true);
      sourcePos = data.barrelTip.getAbsolutePosition().clone();
      console.log(`Firing from barrel tip at (${sourcePos.x.toFixed(1)}, ${sourcePos.y.toFixed(1)}, ${sourcePos.z.toFixed(1)})`);
    } else if (data.rotatablePart) {
      // Get the rotatable part (turret head)
      const turretHead = data.rotatablePart;
      turretHead.computeWorldMatrix(true);
      const turretPos = turretHead.getAbsolutePosition();

      // Use pre-calculated barrel offset (in local model units), scaled by the building's scale factor
      const scaledOffset = data.barrelLocalOffset.scale(data.scaleFactor);

      // Create rotation matrix from current yaw and pitch
      // Note: pitch is negated because Babylon.js positive X rotation tilts down
      const yawMatrix = Matrix.RotationY(data.currentRotation);
      const pitchMatrix = Matrix.RotationX(-data.currentPitch);
      const rotationMatrix = pitchMatrix.multiply(yawMatrix);

      // Transform the scaled local barrel offset by the rotation
      const rotatedOffset = Vector3.TransformCoordinates(scaledOffset, rotationMatrix);

      // Add to turret position to get barrel tip world position
      sourcePos = turretPos.add(rotatedOffset);

      console.log(`Firing from turret head + offset: turret=(${turretPos.x.toFixed(1)}, ${turretPos.y.toFixed(1)}, ${turretPos.z.toFixed(1)}), ` +
        `localOffset=(${data.barrelLocalOffset.x.toFixed(1)}, ${data.barrelLocalOffset.y.toFixed(1)}, ${data.barrelLocalOffset.z.toFixed(1)}), ` +
        `scale=${data.scaleFactor.toFixed(3)}, source=(${sourcePos.x.toFixed(1)}, ${sourcePos.y.toFixed(1)}, ${sourcePos.z.toFixed(1)})`);
    } else {
      // Fallback: calculate from building grid position
      const buildingWorldX = data.x * TILE_SIZE + TILE_SIZE / 2;
      const buildingWorldZ = data.z * TILE_SIZE + TILE_SIZE / 2;
      const buildingHeight = 6.0;

      const barrelLength = TILE_SIZE * 0.5;
      const horizontalLength = barrelLength * Math.cos(data.currentPitch);
      const verticalOffset = barrelLength * Math.sin(data.currentPitch);

      const barrelTipX = buildingWorldX + Math.sin(data.currentRotation) * horizontalLength;
      const barrelTipZ = buildingWorldZ + Math.cos(data.currentRotation) * horizontalLength;
      const barrelTipY = buildingHeight + verticalOffset;

      sourcePos = new Vector3(barrelTipX, barrelTipY, barrelTipZ);
      console.log(`Firing from fallback position at (${sourcePos.x.toFixed(1)}, ${sourcePos.y.toFixed(1)}, ${sourcePos.z.toFixed(1)})`);
    }

    const targetPos = new Vector3(attack.targetWorldX, attack.targetWorldY, attack.targetWorldZ);

    // Fire the laser with improved visuals
    this.fireLaser(sourcePos, targetPos, attack.color);

    // Show target ring at attack location
    this.showTargetRing('ground', attack.targetWorldX, attack.targetWorldZ, 2.0);

    // Hide target ring after laser duration
    setTimeout(() => {
      if (this.targetRingTargetId === 'ground') {
        this.hideTargetRing();
      }
    }, 2500);

    console.log(`Turret ${buildingId} fired at (${attack.targetWorldX.toFixed(1)}, ${attack.targetWorldZ.toFixed(1)})`);
  }

  // ==================== FORCE ATTACK ====================

  /**
   * Force attack a ground position (Ctrl+Click or Right-Click)
   * Queues the attack to fire after turret finishes rotating
   */
  public forceAttackGround(buildingId: string, targetPos: ArenaPosition): boolean {
    const building = this.buildingData.get(buildingId);
    if (!building) {
      console.log('Building not found:', buildingId);
      return false;
    }

    if (building.range <= 0 || building.damage <= 0) {
      console.log('Building cannot attack (no range or damage)');
      return false;
    }

    // Get building world position
    const buildingWorldX = building.x * TILE_SIZE + TILE_SIZE / 2;
    const buildingWorldZ = building.z * TILE_SIZE + TILE_SIZE / 2;

    // Target world position (ground level)
    const targetWorldX = targetPos.x * TILE_SIZE + TILE_SIZE / 2;
    const targetWorldZ = targetPos.z * TILE_SIZE + TILE_SIZE / 2;
    const targetWorldY = 0.1; // Ground level

    // Calculate horizontal distance
    const dx = targetWorldX - buildingWorldX;
    const dz = targetWorldZ - buildingWorldZ;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // Check if in range
    const rangeInMeters = building.range * TILE_SIZE;
    if (horizontalDistance > rangeInMeters) {
      console.log('Target out of range:', horizontalDistance.toFixed(1), '>', rangeInMeters.toFixed(1));
      return false;
    }

    // Set turret horizontal rotation (yaw) toward target
    building.targetRotation = this.calculateTargetRotation(
      buildingWorldX,
      buildingWorldZ,
      targetWorldX,
      targetWorldZ
    );

    // Calculate turret barrel height (approximate from building position)
    // Get actual turret height from mesh if available
    let turretHeight = 6.0; // Default building height
    const pitchPart = building.pitchablePart || building.rotatablePart;
    if (pitchPart) {
      pitchPart.computeWorldMatrix(true);
      turretHeight = pitchPart.getAbsolutePosition().y;
    }

    // Calculate vertical pitch angle (negative because we're aiming down at ground)
    // Pitch = arctan(heightDiff / horizontalDistance)
    const heightDiff = turretHeight - targetWorldY;
    building.targetPitch = -Math.atan2(heightDiff, horizontalDistance);

    console.log(`Turret pitch: height=${turretHeight.toFixed(1)}, targetY=${targetWorldY}, hDist=${horizontalDistance.toFixed(1)}, pitch=${(building.targetPitch * 180 / Math.PI).toFixed(1)}deg`);

    // Queue the attack - it will fire when rotation completes
    this.pendingAttacks.set(buildingId, {
      targetWorldX,
      targetWorldZ,
      targetWorldY,
      color: building.laserColor || '#ff0000',
    });

    console.log(`Attack queued for turret ${buildingId}, rotating to target...`);
    return true;
  }
}
