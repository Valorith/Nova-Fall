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
  DynamicTexture,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF'; // Required for .glb loading
import type { CombatState, CombatSetup, ArenaPosition, CombatUnitState } from '@nova-fall/shared';
import { TileType, UnitState } from '@nova-fall/shared';
import type { DbUnitDefinition, DbBuildingDefinition } from '@nova-fall/shared';
import { UnitManager } from './UnitManager';
import { FlowField } from './FlowField';
import { PerformanceMonitor } from '@/utils/debugMetrics';

// Arena constants
export const ARENA_SIZE = 60; // 60x60 tiles
export const TILE_SIZE = 8; // 8 meters per tile
export const ARENA_METERS = ARENA_SIZE * TILE_SIZE; // 480m x 480m

const TURRET_ALIGNMENT_TOLERANCE = (0.5 * Math.PI) / 180;
const AUTO_TARGET_COOLDOWN_MS = 800;

type UnitVisual = NonNullable<ReturnType<UnitManager['getUnit']>>;

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
  // Arena layout stored for tile-based logic
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

  private performanceMonitor = new PerformanceMonitor();
  private lastPerfSampleTime = 0;

  // Building metadata for turret attacks and selection
  private buildingData = new Map<
    string,
    {
      x: number; // Grid position (top-left)
      z: number;
      tileWidth: number;
      tileHeight: number;
      range: number;
      damage: number;
      attackSpeed: number; // Attacks per second
      attackType: string;
      laserColor: string | null;
      ownerId: string;
      mesh: TransformNode;
      yawParts: TransformNode[]; // All meshes that rotate for yaw
      pitchParts: TransformNode[]; // All meshes that rotate for pitch
      rootYawParts: TransformNode[]; // Root yaw meshes (no yaw parent)
      rootPitchParts: TransformNode[]; // Root pitch meshes (no pitch parent)
      yawOnlyParts: TransformNode[]; // Root yaw meshes not shared with pitch
      pitchOnlyParts: TransformNode[]; // Root pitch meshes not shared with yaw
      sharedParts: TransformNode[]; // Root meshes used for both yaw + pitch
      baseRotations: Map<TransformNode, Vector3>; // Base rotations before aim adjustments
      barrelLineAnchor: TransformNode | null; // TransformNode at barrel line origin
      barrelLinePositionConfig: { x: number; y: number; z: number } | null; // Saved barrel line position
      hasBarrelLine: boolean; // True when barrel line is configured
      baseBarrelYaw: number; // Base yaw from barrel line forward
      baseBarrelPitch: number; // Base pitch from barrel line forward
      modelCenterLocal: Vector3 | null; // Local model center for fallback origin
      visualCenterWorld: Vector3 | null; // World-space center of model
      barrelMeshNameConfig: string | null; // Explicit barrel mesh name from building definition
      meshPartFlagsConfig: Record<string, string[]> | null; // Mesh part flags: {"meshName": ["base", "pitch", "yaw"]}
      currentRotation: number; // Horizontal rotation (yaw)
      targetRotation: number;
      currentPitch: number; // Vertical rotation (pitch)
      targetPitch: number;
      // Rotation clamps (in radians)
      yawClampMin: number;
      yawClampMax: number;
      pitchClampMin: number;
      pitchClampMax: number;
      // Health tracking
      health: number;
      maxHealth: number;
      healthBarPlane: Mesh | null;
      healthBarTexture: DynamicTexture | null;
      // Cooldown tracking
      cooldownBarPlane: Mesh | null;
      cooldownBarTexture: DynamicTexture | null;
      lastFireTime: number; // Timestamp of last shot
      autoTargetId: string | null;
      autoTargetSwitchAt: number;
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

  // Placement preview
  private placementPreview: {
    root: TransformNode;
    placeholder: Mesh | null;
    modelMeshes: Mesh[];
    modelPath: string | null;
    tileWidth: number;
    tileHeight: number;
    valid: boolean;
    loading: boolean; // Flag to track if model is currently loading
  } | null = null;
  private placementPreviewToken = 0;

  // Model cache for fast preview loading - stores hidden model hierarchy for cloning
  private modelCache = new Map<
    string,
    {
      cacheRoot: TransformNode;
      glbRoot: TransformNode; // The __root__ node from the GLB file
    }
  >();
  private modelCacheLoading = new Map<string, Promise<boolean>>();

  // Move marker visualization
  private moveMarker: Mesh | null = null;

  // Barrel calibration visualization
  private calibrationMarker: Mesh | null = null;
  private calibrationBuildingId: string | null = null;

  // Active lasers with fade-out support
  private activeLasers = new Map<
    string,
    {
      coreMesh: Mesh;
      glowMesh: Mesh;
      startTime: number;
      duration: number;
    }
  >();

  // Pending attacks (waiting for turret rotation)
  private pendingAttacks = new Map<
    string,
    {
      targetWorldX: number;
      targetWorldZ: number;
      targetWorldY: number;
      color: string;
    }
  >();

  // Active kill commands (turret tracking and attacking a unit)
  private activeKillCommands = new Map<
    string,
    {
      targetUnitId: string;
      nextFireTime: number; // Timestamp when turret can fire next
      attackSpeed: number; // Attacks per second
      damage: number;
    }
  >();

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
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.4;
    ambient.groundColor = new Color3(0.1, 0.1, 0.2);

    // Main directional light (sun-like)
    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1).normalize(), this.scene);
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
    this.lastPerfSampleTime = this._lastFrameTime;
    this.performanceMonitor.start();

    this.engine.runRenderLoop(() => {
      // Calculate delta time
      const now = performance.now();
      const deltaTime = (now - this._lastFrameTime) / 1000; // Convert to seconds
      this._lastFrameTime = now;

      // Update unit positions (interpolation)
      this.unitManager?.update(deltaTime);

      // Update turret rotations
      this.updateTurretRotations(deltaTime);

      // Keep target ring synced to moving targets
      this.updateTargetRingTracking();

      // Process active kill commands
      this.updateKillCommands(now);

      // Auto-targeting for turrets without manual commands
      this.updateAutoTargeting(now);

      // Update laser lifecycle (remove expired lasers)
      this.updateLasers();

      // Update cooldown bars
      this.updateAllBuildingCooldownBars();
      this.unitManager?.updateAllCooldownBars();

      if (now - this.lastPerfSampleTime >= 250) {
        this.performanceMonitor.recordFrame(now);
        this.lastPerfSampleTime = now;
      }

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
    this.performanceMonitor.stop();
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

  public get attackerId(): string {
    return this._attackerId;
  }

  public get defenderId(): string {
    return this._defenderId;
  }

  public get arenaLayout(): TileType[][] | null {
    return this._arenaLayout;
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
    const baseMesh =
      height > 0.1
        ? MeshBuilder.CreateBox(
            name,
            { width: TILE_SIZE * 0.95, height, depth: TILE_SIZE * 0.95 },
            this.scene
          )
        : MeshBuilder.CreateGround(
            name,
            { width: TILE_SIZE * 0.95, height: TILE_SIZE * 0.95 },
            this.scene
          );

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

    const gridSystem = MeshBuilder.CreateLineSystem('grid', { lines }, this.scene);
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
    const north = MeshBuilder.CreateGround(
      'spawnNorth',
      { width: ARENA_METERS, height: thickness },
      this.scene
    );
    north.position = new Vector3(ARENA_METERS / 2, 0.02, ARENA_METERS - thickness / 2);
    north.material = spawnMat;

    // South edge
    const south = MeshBuilder.CreateGround(
      'spawnSouth',
      { width: ARENA_METERS, height: thickness },
      this.scene
    );
    south.position = new Vector3(ARENA_METERS / 2, 0.02, thickness / 2);
    south.material = spawnMat;

    // East edge
    const east = MeshBuilder.CreateGround(
      'spawnEast',
      { width: thickness, height: ARENA_METERS - 2 * thickness },
      this.scene
    );
    east.position = new Vector3(ARENA_METERS - thickness / 2, 0.02, ARENA_METERS / 2);
    east.material = spawnMat;

    // West edge
    const west = MeshBuilder.CreateGround(
      'spawnWest',
      { width: thickness, height: ARENA_METERS - 2 * thickness },
      this.scene
    );
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

    // Clean up model cache
    this.modelCache.forEach((cached) => {
      cached.cacheRoot.dispose();
    });
    this.modelCache.clear();
    this.modelCacheLoading.clear();

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
    const worldPos = this.screenToWorld(screenX, screenY);
    if (!worldPos) return null;

    const gridPos = this.worldToGrid(new Vector3(worldPos.x, worldPos.y, worldPos.z));

    // Clamp to arena bounds
    if (gridPos.x >= 0 && gridPos.x < ARENA_SIZE && gridPos.z >= 0 && gridPos.z < ARENA_SIZE) {
      return gridPos;
    }

    return null;
  }

  /**
   * Convert screen coordinates to exact world position on ground plane
   * Returns precise coordinates without grid snapping
   */
  public screenToWorld(
    screenX: number,
    screenY: number
  ): { x: number; y: number; z: number } | null {
    // Get canvas-relative coordinates
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Use Babylon.js picking (Babylon handles DPR internally)
    const pickResult = this.scene.pick(canvasX, canvasY);

    if (pickResult?.hit && pickResult.pickedPoint) {
      // Accept hits on meshes near or above ground level (includes buildings/units)
      const hitY = pickResult.pickedPoint.y;
      if (hitY < 25) {
        // Near ground level - return exact world position
        const worldX = pickResult.pickedPoint.x;
        const worldZ = pickResult.pickedPoint.z;

        // Check if within arena bounds (in world units)
        const arenaWorldSize = ARENA_SIZE * TILE_SIZE;
        if (worldX >= 0 && worldX < arenaWorldSize && worldZ >= 0 && worldZ < arenaWorldSize) {
          return { x: worldX, y: 0.1, z: worldZ };
        }
      }
    }

    // Fallback to picking plane for consistent ground hit (even when clicking tall meshes)
    if (this.pickingPlane) {
      const planePick = this.scene.pick(canvasX, canvasY, (mesh) => mesh === this.pickingPlane);
      if (planePick?.hit && planePick.pickedPoint) {
        const worldX = planePick.pickedPoint.x;
        const worldZ = planePick.pickedPoint.z;
        const arenaWorldSize = ARENA_SIZE * TILE_SIZE;
        if (worldX >= 0 && worldX < arenaWorldSize && worldZ >= 0 && worldZ < arenaWorldSize) {
          return { x: worldX, y: 0.1, z: worldZ };
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
   * Spawn a unit at exact world coordinates for dev testing (no grid snapping)
   */
  public devSpawnUnitAtWorld(
    unitDef: DbUnitDefinition,
    worldX: number,
    worldZ: number,
    team: 'attacker' | 'defender'
  ): string {
    // Calculate nearest grid position for state tracking
    const gridPos: ArenaPosition = {
      x: Math.floor(worldX / TILE_SIZE),
      z: Math.floor(worldZ / TILE_SIZE),
    };

    // Spawn at grid position first
    const unitId = this.devSpawnUnit(unitDef, gridPos, team);

    // Immediately override with exact world position
    this.unitManager?.setUnitWorldPosition(unitId, worldX, worldZ);

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

    const tileWidth = buildingDef.width || 1;
    const tileHeight = buildingDef.height || 1;
    const worldX = (position.x + tileWidth / 2) * TILE_SIZE;
    const worldZ = (position.z + tileHeight / 2) * TILE_SIZE;

    // Calculate building size based on definition
    const width = tileWidth * TILE_SIZE * 0.8;
    const depth = tileHeight * TILE_SIZE * 0.8;
    const height = 5.0; // Buildings are imposing structures

    // Create placeholder building mesh
    const building = MeshBuilder.CreateBox(buildingId, { width, height, depth }, this.scene);
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

    // Create health bar for building
    // Use small fixed sizes positioned just above the turret
    const buildingHealth = buildingDef.health || 100;
    const healthBarWidth = 3.2; // Wider bar for visibility
    const healthBarHeight = 0.32; // Slightly taller bar
    const barYOffset = height + 0.3; // Just above the building

    // Health bar texture
    const healthBarTexture = new DynamicTexture(
      `building_healthbar_tex_${buildingId}`,
      { width: 128, height: 16 },
      this.scene,
      false
    );
    const healthBarMaterial = new StandardMaterial(
      `building_healthbar_mat_${buildingId}`,
      this.scene
    );
    healthBarMaterial.diffuseTexture = healthBarTexture;
    healthBarMaterial.emissiveTexture = healthBarTexture;
    healthBarMaterial.disableLighting = true;
    healthBarMaterial.backFaceCulling = false;

    const healthBarPlane = MeshBuilder.CreatePlane(
      `building_healthbar_${buildingId}`,
      { width: healthBarWidth, height: healthBarHeight },
      this.scene
    );
    healthBarPlane.parent = building;
    healthBarPlane.position.y = barYOffset;
    healthBarPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    healthBarPlane.material = healthBarMaterial;
    healthBarPlane.isVisible = false; // Hidden until damaged

    // Cooldown bar texture (below health bar)
    const cooldownBarTexture = new DynamicTexture(
      `building_cooldownbar_tex_${buildingId}`,
      { width: 128, height: 16 },
      this.scene,
      false
    );
    const cooldownBarMaterial = new StandardMaterial(
      `building_cooldownbar_mat_${buildingId}`,
      this.scene
    );
    cooldownBarMaterial.diffuseTexture = cooldownBarTexture;
    cooldownBarMaterial.emissiveTexture = cooldownBarTexture;
    cooldownBarMaterial.disableLighting = true;
    cooldownBarMaterial.backFaceCulling = false;

    const cooldownBarPlane = MeshBuilder.CreatePlane(
      `building_cooldownbar_${buildingId}`,
      { width: healthBarWidth, height: healthBarHeight * 0.65 },
      this.scene
    );
    cooldownBarPlane.parent = building;
    cooldownBarPlane.position.y = barYOffset - healthBarHeight - 0.3;
    cooldownBarPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    cooldownBarPlane.material = cooldownBarMaterial;
    // Cooldown bar starts hidden, will show when turret fires and is on cooldown
    cooldownBarPlane.isVisible = false;

    // Store building data for turret rotation and attack handling
    this.buildingData.set(buildingId, {
      x: position.x,
      z: position.z,
      tileWidth,
      tileHeight,
      range: buildingDef.range || 0,
      damage: buildingDef.damage || 0,
      attackSpeed: buildingDef.attackSpeed || 1.0, // Default: 1 attack per second
      attackType: buildingDef.attackType || 'instant_laser',
      laserColor: buildingDef.laserColor || null,
      ownerId: team === 'attacker' ? this._attackerId : this._defenderId,
      mesh: building,
      yawParts: [], // Will be populated when model loads
      pitchParts: [], // Will be populated when model loads
      rootYawParts: [],
      rootPitchParts: [],
      yawOnlyParts: [],
      pitchOnlyParts: [],
      sharedParts: [],
      baseRotations: new Map(),
      barrelLineAnchor: null,
      barrelLinePositionConfig:
        (buildingDef.barrelLinePosition as { x: number; y: number; z: number } | null) || null,
      hasBarrelLine: false,
      baseBarrelYaw: 0,
      baseBarrelPitch: 0,
      modelCenterLocal: null,
      visualCenterWorld: new Vector3(worldX, height / 2, worldZ),
      barrelMeshNameConfig: buildingDef.barrelMeshName || null, // Explicit barrel mesh name from definition
      meshPartFlagsConfig: (buildingDef.meshPartFlags as Record<string, string[]> | null) || null, // Mesh part flags from definition
      currentRotation: 0,
      targetRotation: 0,
      currentPitch: 0,
      targetPitch: 0,
      // Rotation clamps (in radians)
      yawClampMin: ((buildingDef.yawClampMin ?? -180) * Math.PI) / 180,
      yawClampMax: ((buildingDef.yawClampMax ?? 180) * Math.PI) / 180,
      pitchClampMin: ((buildingDef.pitchClampMin ?? -45) * Math.PI) / 180,
      pitchClampMax: ((buildingDef.pitchClampMax ?? 45) * Math.PI) / 180,
      // Health tracking
      health: buildingHealth,
      maxHealth: buildingHealth,
      healthBarPlane,
      healthBarTexture,
      // Cooldown tracking
      cooldownBarPlane,
      cooldownBarTexture,
      lastFireTime: 0, // Never fired yet
      autoTargetId: null,
      autoTargetSwitchAt: 0,
    });

    // Draw initial bars
    this.updateBuildingHealthBar(buildingId);
    this.updateBuildingCooldownBar(buildingId);

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
      let rootToUse: (typeof result.meshes)[0];

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

        // If not found, find meshes by checking ALL ancestors for model pattern
        // This handles deeper hierarchies where base/platform meshes might be 3+ levels deep
        const meshesToKeep: Mesh[] = [];
        if (!targetNode) {
          for (const mesh of result.meshes) {
            // Skip __root__
            if (mesh.name === '__root__') continue;

            // Check all ancestors up to root for the model pattern
            let belongsToModel = false;
            let ancestor = mesh.parent;
            while (ancestor) {
              const ancestorName = ancestor.name || '';
              if (grandparentPattern.test(ancestorName) || parentPattern.test(ancestorName)) {
                belongsToModel = true;
                break;
              }
              ancestor = ancestor.parent;
            }

            if (belongsToModel && mesh instanceof Mesh) {
              meshesToKeep.push(mesh);
            }
          }
        }

        if (!targetNode && meshesToKeep.length === 0) {
          console.warn(
            `Mesh "${targetMeshName}" not found in ${filePath}. Available: ${result.meshes.map((m) => m.name).join(', ')}`
          );
          result.meshes.forEach((m) => m.dispose());
          return;
        }

        // Get __root__ from the import result - it's always result.meshes[0]
        // Don't use getTransformNodeByName as it searches the entire scene and __root__ is a Mesh, not TransformNode
        const rootNode = result.meshes[0];

        if (targetNode) {
          // Direct match found - get target and all its descendants
          const descendants = targetNode.getDescendants(false);
          meshesToUse = [
            targetNode,
            ...descendants.filter((d): d is Mesh => d instanceof Mesh),
          ] as typeof result.meshes;
          rootToUse = rootNode || targetNode;
        } else {
          // Use meshes found by parent/grandparent pattern matching
          // Keep hierarchy intact like ModelCalibrationPanel does
          meshesToUse = meshesToKeep as unknown as typeof result.meshes;

          // ALWAYS use result.meshes[0] as the root - it's the import root that parents everything
          // This matches how ModelCalibrationPanel works
          if (!rootNode) {
            console.warn('No root node found in import result');
            return;
          }
          rootToUse = rootNode;

          // Verify all kept meshes are descendants of rootNode
          const rootDescendants = new Set(rootNode.getDescendants(false));
          const allAreDescendants = meshesToKeep.every((m) => rootDescendants.has(m));

          if (!allAreDescendants) {
            console.warn(
              'Some kept meshes are not descendants of import root - hierarchy may be broken'
            );
          }
        }

        // Dispose meshes we're not using (like ModelCalibrationPanel does)
        // This disposes other models from the pack while keeping our model's hierarchy intact
        // IMPORTANT: Don't dispose rootNode (result.meshes[0]) even if it's not named __root__
        for (const m of result.meshes) {
          if (m === rootNode) continue; // Keep the root
          if (m.name === '__root__') continue; // Also keep any __root__ by name
          if (m instanceof Mesh && !meshesToKeep.includes(m) && m !== targetNode) {
            // Check if this is a descendant of our target node
            let isDescendant = false;
            if (targetNode) {
              let parent = m.parent;
              while (parent) {
                if (parent === targetNode) {
                  isDescendant = true;
                  break;
                }
                parent = parent.parent;
              }
            }
            // Also check if it's an ancestor of any kept mesh (don't dispose parents!)
            let isAncestorOfKept = false;
            for (const kept of meshesToKeep) {
              let ancestor = kept.parent;
              while (ancestor) {
                if (ancestor === m) {
                  isAncestorOfKept = true;
                  break;
                }
                ancestor = ancestor.parent;
              }
              if (isAncestorOfKept) break;
            }
            if (!isDescendant && !isAncestorOfKept) {
              m.dispose();
            }
          }
        }

        const importTransformNodes = (result as { transformNodes?: TransformNode[] })
          .transformNodes;
        const transformNodesToCheck = importTransformNodes ?? [];

        for (const node of transformNodesToCheck) {
          if (node === rootNode || node.name === '__root__') continue;

          // Check if this node is an ancestor of any mesh we're keeping
          let isAncestorOfKept = false;
          for (const mesh of meshesToKeep) {
            let ancestor = mesh.parent;
            while (ancestor) {
              if (ancestor === node) {
                isAncestorOfKept = true;
                break;
              }
              ancestor = ancestor.parent;
            }
            if (isAncestorOfKept) break;
          }

          if (!isAncestorOfKept && meshesToKeep.length > 0) {
            let parent = node.parent;
            let isUnderRoot = false;
            while (parent) {
              if (parent === rootNode || parent.name === '__root__') {
                isUnderRoot = true;
                break;
              }
              parent = parent.parent;
            }

            if (isUnderRoot) {
              const nodeDescendants = new Set(node.getDescendants(false));
              const hasKeptMesh = meshesToKeep.some((m) => nodeDescendants.has(m));
              if (!hasKeptMesh) {
                node.dispose();
              }
            }
          }
        }
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

      // Reset root position to origin - GLB files may have non-zero initial positions
      // We'll reposition it properly after calculating bounds
      rootToUse.position = Vector3.Zero();

      // Handle negative scale (common in GLB files from Blender)
      // IMPORTANT: Negative Z scale ≠ 180° Y rotation!
      // - Negative Z scale: (x, y, z) → (x, y, -z) [only Z flipped]
      // - 180° Y rotation: (x, y, z) → (-x, y, -z) [both X and Z flipped]
      // To correctly compensate for negative Z scale using rotation:
      // We need 180° Y rotation PLUS negative X scale to cancel the extra X flip
      const hasNegativeScale =
        rootToUse.scaling.x < 0 || rootToUse.scaling.y < 0 || rootToUse.scaling.z < 0;
      if (hasNegativeScale) {
        const scaleSignX = Math.sign(rootToUse.scaling.x) || 1;
        const scaleSignZ = Math.sign(rootToUse.scaling.z) || 1;

        // If Z was negative (common Blender export)
        if (scaleSignZ < 0) {
          // Make Z positive and add 180° Y rotation
          rootToUse.scaling.z = Math.abs(rootToUse.scaling.z);
          rootToUse.rotation.y += Math.PI;
          // CRITICAL: Also flip X to cancel the extra X inversion from the Y rotation
          rootToUse.scaling.x = -Math.abs(rootToUse.scaling.x);
        } else {
          // Just normalize other scales
          rootToUse.scaling.x = Math.abs(rootToUse.scaling.x);
          rootToUse.scaling.y = Math.abs(rootToUse.scaling.y);
          rootToUse.scaling.z = Math.abs(rootToUse.scaling.z);

          if (scaleSignX < 0) {
            rootToUse.rotation.y += Math.PI;
          }
        }
      }

      // STEP 1: Calculate pre-scale bounding box from world bounds (preserving hierarchy)
      // This is similar to how ModelCalibrationPanel works - don't reset transforms first
      this.scene.updateTransformMatrix();
      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh) {
          mesh.computeWorldMatrix(true);
        }
      });

      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      let hasValidBounds = false;

      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
          mesh.refreshBoundingInfo();
          mesh.computeWorldMatrix(true);
          const boundingInfo = mesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;

          if (isFinite(min.x) && isFinite(max.x)) {
            minVec = Vector3.Minimize(minVec, min);
            maxVec = Vector3.Maximize(maxVec, max);
            hasValidBounds = true;
          }
        }
      });

      if (!hasValidBounds) {
        console.warn('No valid bounding boxes found for building meshes');
        return;
      }

      // Calculate pre-scale model dimensions
      const preScaleWidth = maxVec.x - minVec.x;
      const preScaleDepth = maxVec.z - minVec.z;

      // STEP 2: Calculate scale factor to fit tile footprint
      const targetWidth = tileWidth * TILE_SIZE;
      const targetDepth = tileHeight * TILE_SIZE;
      const modelFootprint = Math.max(preScaleWidth, preScaleDepth);
      const targetFootprint = Math.max(targetWidth, targetDepth);

      let scaleFactor = 1;
      if (modelFootprint > 0) {
        scaleFactor = targetFootprint / modelFootprint;
      }

      // STEP 3: Apply scale to __root__ (like ModelCalibrationPanel does)
      rootToUse.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);

      // STEP 4: Recalculate bounds after scaling
      this.scene.updateTransformMatrix();
      let scaledMinVec = new Vector3(Infinity, Infinity, Infinity);
      let scaledMaxVec = new Vector3(-Infinity, -Infinity, -Infinity);

      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
          mesh.computeWorldMatrix(true);
          const boundingInfo = mesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;
          if (isFinite(min.x) && isFinite(max.x)) {
            scaledMinVec = Vector3.Minimize(scaledMinVec, min);
            scaledMaxVec = Vector3.Maximize(scaledMaxVec, max);
          }
        }
      });

      const scaledCenter = scaledMinVec.add(scaledMaxVec).scale(0.5);

      // STEP 5: Position __root__ to place model at target world position with bottom at Y=0
      // We need to move the root so that:
      // - Model's XZ center is at (worldX, worldZ)
      // - Model's bottom (scaledMinVec.y) is at Y=0
      const offsetX = worldX - scaledCenter.x;
      const offsetY = -scaledMinVec.y; // Move up so bottom is at Y=0
      const offsetZ = worldZ - scaledCenter.z;

      // Set position absolutely (root was reset to origin earlier)
      rootToUse.position = new Vector3(offsetX, offsetY, offsetZ);

      // VERIFY: Check final world bounds
      this.scene.updateTransformMatrix();
      let finalMinVec = new Vector3(Infinity, Infinity, Infinity);
      let finalMaxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
          mesh.computeWorldMatrix(true);
          const bi = mesh.getBoundingInfo();
          finalMinVec = Vector3.Minimize(finalMinVec, bi.boundingBox.minimumWorld);
          finalMaxVec = Vector3.Maximize(finalMaxVec, bi.boundingBox.maximumWorld);
        }
      });
      const finalCenter = finalMinVec.add(finalMaxVec).scale(0.5);

      // Add shadows to meshes
      meshesToUse.forEach((mesh) => {
        if (mesh instanceof Mesh && this.shadowGenerator) {
          this.shadowGenerator.addShadowCaster(mesh);
        }
      });

      // Update bar positions based on actual model bounds
      const buildingDataEntry = this.buildingData.get(buildingId);
      if (buildingDataEntry) {
        const healthBarHeight = 0.32; // Same as in devPlaceBuilding

        rootToUse.computeWorldMatrix(true);
        const invRootMatrix = rootToUse.getWorldMatrix().clone();
        invRootMatrix.invert();

        const localCenter = Vector3.TransformCoordinates(finalCenter, invRootMatrix);

        buildingDataEntry.modelCenterLocal = localCenter.clone();
        buildingDataEntry.visualCenterWorld = finalCenter.clone();

        const barWorldY = finalMaxVec.y + 0.3;
        const cooldownWorldY = barWorldY - healthBarHeight - 0.3;

        const barWorldX = (buildingDataEntry.x + buildingDataEntry.tileWidth / 2) * TILE_SIZE;
        const barWorldZ = (buildingDataEntry.z + buildingDataEntry.tileHeight / 2) * TILE_SIZE;

        if (buildingDataEntry.healthBarPlane) {
          buildingDataEntry.healthBarPlane.parent = null;
          buildingDataEntry.healthBarPlane.scaling = Vector3.One();
          buildingDataEntry.healthBarPlane.setAbsolutePosition(
            new Vector3(barWorldX, barWorldY, barWorldZ)
          );
        }
        if (buildingDataEntry.cooldownBarPlane) {
          buildingDataEntry.cooldownBarPlane.parent = null;
          buildingDataEntry.cooldownBarPlane.scaling = Vector3.One();
          buildingDataEntry.cooldownBarPlane.setAbsolutePosition(
            new Vector3(barWorldX, cooldownWorldY, barWorldZ)
          );
        }
      }

      // Dispose of the placeholder (now safe - bars have been reparented)
      placeholder.dispose();

      // Store the root node for cleanup (includes all descendants)
      this.devBuildingMeshes.set(buildingId, rootToUse as TransformNode);

      // Update building data with loaded mesh and find turret parts
      if (buildingDataEntry) {
        buildingDataEntry.mesh = rootToUse as TransformNode;

        const turretParts = this.findTurretParts(
          rootToUse as TransformNode,
          buildingDataEntry.barrelMeshNameConfig,
          buildingDataEntry.meshPartFlagsConfig,
          buildingDataEntry.barrelLinePositionConfig,
          buildingDataEntry.modelCenterLocal
        );

        buildingDataEntry.yawParts = turretParts.yawParts;
        buildingDataEntry.pitchParts = turretParts.pitchParts;
        buildingDataEntry.rootYawParts = turretParts.rootYawParts;
        buildingDataEntry.rootPitchParts = turretParts.rootPitchParts;
        buildingDataEntry.yawOnlyParts = turretParts.yawOnlyParts;
        buildingDataEntry.pitchOnlyParts = turretParts.pitchOnlyParts;
        buildingDataEntry.sharedParts = turretParts.sharedParts;
        buildingDataEntry.baseRotations = turretParts.baseRotations;
        buildingDataEntry.barrelLineAnchor = turretParts.barrelLineAnchor;
        buildingDataEntry.hasBarrelLine = turretParts.hasBarrelLine;
        buildingDataEntry.baseBarrelYaw = turretParts.baseBarrelYaw;
        buildingDataEntry.baseBarrelPitch = turretParts.baseBarrelPitch;

        if (this.selectedBuildingId === buildingId) {
          const { centerX, centerZ } = this.getBuildingCenterWorld(buildingDataEntry);
          const ringDiameter = this.getBuildingSelectionDiameter(buildingDataEntry);
          this.showSelectionRing(centerX, centerZ, ringDiameter);
          if (buildingDataEntry.range > 0) {
            this.showRangeCircle(centerX, centerZ, buildingDataEntry.range);
          }
        }
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

  private disposeBuildingBars(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): void {
    if (building.healthBarPlane) {
      building.healthBarPlane.material?.dispose();
      building.healthBarPlane.dispose();
    }
    if (building.cooldownBarPlane) {
      building.cooldownBarPlane.material?.dispose();
      building.cooldownBarPlane.dispose();
    }
    building.healthBarTexture?.dispose();
    building.cooldownBarTexture?.dispose();
  }

  /**
   * Remove a dev-placed building
   */
  public devRemoveBuilding(buildingId: string): void {
    const node = this.devBuildingMeshes.get(buildingId);
    const building = this.buildingData.get(buildingId);
    if (building) {
      this.disposeBuildingBars(building);
    }
    if (node) {
      this.disposeBuildingNode(node);
      this.devBuildingMeshes.delete(buildingId);
    }
    this.buildingData.delete(buildingId);

    // Clear selection if this building was selected
    if (this.selectedBuildingId === buildingId) {
      this.deselectBuilding();
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
    for (const [buildingId, node] of this.devBuildingMeshes) {
      const building = this.buildingData.get(buildingId);
      if (building) {
        this.disposeBuildingBars(building);
      }
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

  public getCombatEntitySummary(): {
    units: { total: number; attackers: number; defenders: number; dead: number };
    buildings: { total: number };
    dev: { units: number; buildings: number };
  } {
    return {
      units: this.unitManager?.getUnitSummary() ?? {
        total: 0,
        attackers: 0,
        defenders: 0,
        dead: 0,
      },
      buildings: { total: this.buildingData.size },
      dev: this.getDevEntityCount(),
    };
  }

  /**
   * Get list of all placed buildings (for UI dropdown)
   */
  public getPlacedBuildings(): { id: string; name: string; hasTurret: boolean }[] {
    const buildings: { id: string; name: string; hasTurret: boolean }[] = [];
    for (const [id, data] of this.buildingData.entries()) {
      buildings.push({
        id,
        name: id.replace('dev_building_', '').slice(0, 12) + '...',
        hasTurret: data.yawParts.length > 0 || data.hasBarrelLine,
      });
    }
    return buildings;
  }

  /**
   * Get barrel info for a building (for calibration UI)
   */
  public getBuildingBarrelInfo(buildingId: string): {
    hasTurret: boolean;
    hasBarrelLine: boolean;
  } | null {
    const data = this.buildingData.get(buildingId);
    if (!data) return null;
    return {
      hasTurret: data.yawParts.length > 0,
      hasBarrelLine: data.hasBarrelLine,
    };
  }

  /**
   * Show calibration marker for a building's barrel line origin
   * Creates a glowing sphere at where the laser will fire from
   */
  public showCalibrationMarker(buildingId: string): boolean {
    const data = this.buildingData.get(buildingId);
    if (!data || !data.barrelLineAnchor || !data.hasBarrelLine) {
      console.warn('Building not found or barrel line not configured:', buildingId);
      return false;
    }

    // Remove existing marker
    this.hideCalibrationMarker();

    // Create glowing sphere marker
    this.calibrationMarker = MeshBuilder.CreateSphere(
      'calibration_marker',
      { diameter: 0.5 },
      this.scene
    );

    // Bright emissive material
    const material = new StandardMaterial('calibration_mat', this.scene);
    material.emissiveColor = new Color3(1, 0.5, 0); // Orange glow
    material.diffuseColor = new Color3(1, 0.7, 0.3);
    material.specularColor = new Color3(1, 1, 1);
    this.calibrationMarker.material = material;

    this.calibrationBuildingId = buildingId;

    // Position the marker
    this.updateCalibrationMarkerPosition();

    // Select the building for visibility
    this.selectBuilding(buildingId);

    return true;
  }

  /**
   * Hide the calibration marker
   */
  public hideCalibrationMarker(): void {
    if (this.calibrationMarker) {
      this.calibrationMarker.dispose();
      this.calibrationMarker = null;
    }
    this.calibrationBuildingId = null;
  }

  /**
   * Update calibration marker position based on barrel line anchor
   */
  private updateCalibrationMarkerPosition(): void {
    if (!this.calibrationMarker || !this.calibrationBuildingId) return;

    const data = this.buildingData.get(this.calibrationBuildingId);
    if (!data || !data.barrelLineAnchor || !data.hasBarrelLine) return;

    data.barrelLineAnchor.computeWorldMatrix(true);
    const markerPos = data.barrelLineAnchor.getAbsolutePosition();

    this.calibrationMarker.position = markerPos.clone();
  }

  /**
   * Fire a test laser from calibration marker to see alignment
   */
  public fireCalibrationTestLaser(): void {
    if (!this.calibrationBuildingId) {
      console.warn('No calibration active');
      return;
    }

    const data = this.buildingData.get(this.calibrationBuildingId);
    if (!data) return;

    const origin = this.getTurretBarrelOrigin(data);
    const forward = this.getTurretBarrelForward(data);
    if (!origin || !forward) {
      console.warn('Calibration test laser skipped - barrel line not configured');
      return;
    }

    const targetDist = 3 * TILE_SIZE;
    const targetPos = origin.add(forward.scale(targetDist));

    this.fireLaser(origin, targetPos, data.laserColor || '#ff3333');
  }

  /**
   * Get current calibration building ID
   */
  public getCalibrationBuildingId(): string | null {
    return this.calibrationBuildingId;
  }

  // ==================== MESH INSPECTION & HIGHLIGHTING ====================

  // Store original materials for mesh highlighting restoration
  private originalMaterials = new Map<string, Map<string, StandardMaterial | PBRMaterial | null>>();

  /**
   * Get all mesh names from a building or unit's 3D model
   */
  public getEntityMeshNames(entityType: 'building' | 'unit', entityId: string): string[] {
    if (entityType === 'unit') {
      // TODO: Implement for units via UnitManager
      console.warn('getEntityMeshNames for units not yet implemented');
      return [];
    }

    const building = this.buildingData.get(entityId);
    if (!building || !building.mesh) {
      return [];
    }

    const meshNames: string[] = [];
    const collectMeshNames = (node: TransformNode) => {
      // Only include meshes that are actual geometry (have vertices)
      if (node instanceof Mesh && node.getTotalVertices() > 0) {
        meshNames.push(node.name);
      }
      for (const child of node.getChildren()) {
        if (child instanceof TransformNode) {
          collectMeshNames(child);
        }
      }
    };

    collectMeshNames(building.mesh);
    return meshNames;
  }

  /**
   * Highlight a specific mesh with a color
   * @param color Object with r, g, b values (0-1 range)
   */
  public highlightEntityMesh(
    entityType: 'building' | 'unit',
    entityId: string,
    meshName: string,
    color: { r: number; g: number; b: number }
  ): void {
    if (entityType === 'unit') {
      // TODO: Implement for units via UnitManager
      return;
    }

    const building = this.buildingData.get(entityId);
    if (!building || !building.mesh) return;

    // Find the mesh by name
    const targetMesh = this.findMeshByName(building.mesh, meshName);
    if (!targetMesh) return;

    // Store original material if not already stored
    const entityKey = `${entityType}:${entityId}`;
    if (!this.originalMaterials.has(entityKey)) {
      this.originalMaterials.set(entityKey, new Map());
    }
    const entityMaterials = this.originalMaterials.get(entityKey);
    if (!entityMaterials) return;

    if (!entityMaterials.has(meshName)) {
      entityMaterials.set(meshName, targetMesh.material as StandardMaterial | PBRMaterial | null);
    }

    // Create highlight material
    const highlightMat = new StandardMaterial(`highlight_${meshName}`, this.scene);
    highlightMat.diffuseColor = new Color3(color.r, color.g, color.b);
    highlightMat.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    highlightMat.specularColor = new Color3(0.2, 0.2, 0.2);

    // Apply to mesh
    targetMesh.material = highlightMat;
  }

  /**
   * Clear all mesh highlights and restore original materials
   */
  public clearEntityMeshHighlights(entityType: 'building' | 'unit', entityId: string): void {
    if (entityType === 'unit') {
      // TODO: Implement for units via UnitManager
      return;
    }

    const building = this.buildingData.get(entityId);
    if (!building || !building.mesh) return;

    const entityKey = `${entityType}:${entityId}`;
    const entityMaterials = this.originalMaterials.get(entityKey);
    if (!entityMaterials) return;

    // Restore original materials
    for (const [meshName, originalMat] of entityMaterials) {
      const targetMesh = this.findMeshByName(building.mesh, meshName);
      if (targetMesh) {
        // Dispose highlight material if it's different from original
        if (targetMesh.material && targetMesh.material !== originalMat) {
          targetMesh.material.dispose();
        }
        targetMesh.material = originalMat;
      }
    }

    // Clear stored materials
    this.originalMaterials.delete(entityKey);
  }

  /**
   * Find a mesh by name in a model hierarchy
   */
  private findMeshByName(root: TransformNode, meshName: string): Mesh | null {
    if (root instanceof Mesh && root.name === meshName) {
      return root;
    }
    for (const child of root.getChildren()) {
      if (child instanceof TransformNode) {
        const found = this.findMeshByName(child, meshName);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Update barrel Y offset for a building or unit (runtime adjustment)
   */
  public updateEntityBarrelOffsetY(
    _entityType: 'building' | 'unit',
    _entityId: string,
    _offsetY: number
  ): void {
    // With the simplified barrel tip approach, manual offset adjustment is no longer needed
    // The barrel tip position is automatically found using vertex sampling
  }

  /**
   * Set barrel mesh name for a building or unit (runtime override)
   * With the simplified approach, barrel mesh is found via meshPartFlags configuration
   */
  public setEntityBarrelMeshName(
    entityType: 'building' | 'unit',
    entityId: string,
    meshName: string
  ): void {
    if (entityType === 'unit') {
      // TODO: Implement for units when needed
      return;
    }

    const building = this.buildingData.get(entityId);
    if (!building) return;

    if (building.barrelLineAnchor) {
      building.barrelLineAnchor.dispose();
      building.barrelLineAnchor = null;
    }

    building.barrelMeshNameConfig = meshName;
    const turretParts = this.findTurretParts(
      building.mesh,
      meshName,
      building.meshPartFlagsConfig,
      building.barrelLinePositionConfig,
      building.modelCenterLocal
    );
    building.yawParts = turretParts.yawParts;
    building.pitchParts = turretParts.pitchParts;
    building.rootYawParts = turretParts.rootYawParts;
    building.rootPitchParts = turretParts.rootPitchParts;
    building.yawOnlyParts = turretParts.yawOnlyParts;
    building.pitchOnlyParts = turretParts.pitchOnlyParts;
    building.sharedParts = turretParts.sharedParts;
    building.baseRotations = turretParts.baseRotations;
    building.barrelLineAnchor = turretParts.barrelLineAnchor;
    building.hasBarrelLine = turretParts.hasBarrelLine;
    building.baseBarrelYaw = turretParts.baseBarrelYaw;
    building.baseBarrelPitch = turretParts.baseBarrelPitch;
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
      const { centerX, centerZ } = this.getBuildingCenterWorld(building);
      const ringDiameter = this.getBuildingSelectionDiameter(building);

      // Show selection ring around the building
      this.showSelectionRing(centerX, centerZ, ringDiameter);

      // Show range circle if building has attack range
      if (building.range > 0) {
        this.showRangeCircle(centerX, centerZ, building.range);
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

  private getBuildingCenterWorld(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): { centerX: number; centerZ: number } {
    if (building.visualCenterWorld) {
      return { centerX: building.visualCenterWorld.x, centerZ: building.visualCenterWorld.z };
    }

    return {
      centerX: (building.x + building.tileWidth / 2) * TILE_SIZE,
      centerZ: (building.z + building.tileHeight / 2) * TILE_SIZE,
    };
  }

  private getBuildingSelectionDiameter(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): number {
    const footprintTiles = Math.max(building.tileWidth, building.tileHeight);
    return TILE_SIZE * footprintTiles * 1.3;
  }

  /**
   * Show a selection ring around a building world position
   */
  private showSelectionRing(worldX: number, worldZ: number, diameter: number): void {
    this.hideSelectionRing();

    // Single thick ring around the building
    this.selectionRing = MeshBuilder.CreateTorus(
      'selectionRing',
      {
        diameter,
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
  public showRangeCircle(worldX: number, worldZ: number, range: number): void {
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

    // Position at building center, slightly above ground
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

  // ==================== MOVE MARKER ====================

  /**
   * Show a move destination marker
   */
  public showMoveMarker(worldX: number, worldZ: number, radius = 2): void {
    if (this.moveMarker) {
      this.moveMarker.dispose();
    }

    this.moveMarker = MeshBuilder.CreateTorus(
      'moveMarker',
      {
        diameter: radius * 2,
        thickness: 0.2,
        tessellation: 32,
      },
      this.scene
    );

    this.moveMarker.position = new Vector3(worldX, 0.15, worldZ);

    const material = new StandardMaterial('moveMarkerMat', this.scene);
    material.emissiveColor = new Color3(0.2, 0.6, 1);
    material.alpha = 0.7;
    this.moveMarker.material = material;

    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.moveMarker);
    }
  }

  /**
   * Hide move destination marker
   */
  public hideMoveMarker(): void {
    if (this.moveMarker) {
      this.moveMarker.dispose();
      this.moveMarker = null;
    }
  }

  /**
   * Track target ring for moving unit targets
   */
  private updateTargetRingTracking(): void {
    if (!this.targetRing || !this.targetRingTargetId) {
      return;
    }

    if (this.targetRingTargetId === 'ground') {
      return;
    }

    if (!this.unitManager) {
      return;
    }

    const unitPos = this.unitManager.getUnitWorldPosition(this.targetRingTargetId);
    if (!unitPos) {
      this.hideTargetRing();
      return;
    }

    this.updateTargetRingPosition(unitPos.x, unitPos.z);
  }

  // ==================== PLACEMENT PREVIEW ====================

  public showPlacementPreview(
    modelPath: string | null,
    tileWidth: number,
    tileHeight: number,
    worldX: number,
    worldZ: number,
    valid: boolean
  ): void {
    if (
      this.placementPreview &&
      this.placementPreview.modelPath === modelPath &&
      this.placementPreview.tileWidth === tileWidth &&
      this.placementPreview.tileHeight === tileHeight
    ) {
      // Just update position, preview already exists with same params
      this.updatePlacementPreview(worldX, worldZ, valid);
      return;
    }

    this.hidePlacementPreview();

    const root = new TransformNode('placementPreviewRoot', this.scene);

    // Create placeholder but keep it hidden - only shown if model fails to load
    const placeholder = MeshBuilder.CreateBox(
      'placementPreviewBox',
      {
        width: tileWidth * TILE_SIZE * 0.8,
        height: TILE_SIZE * Math.max(1, tileHeight) * 0.6,
        depth: tileHeight * TILE_SIZE * 0.8,
      },
      this.scene
    );
    placeholder.parent = root;
    placeholder.position.y = TILE_SIZE * Math.max(1, tileHeight) * 0.3 || TILE_SIZE * 0.3;
    placeholder.isVisible = !modelPath; // Only show if no model to load

    this.placementPreview = {
      root,
      placeholder,
      modelMeshes: [],
      modelPath,
      tileWidth,
      tileHeight,
      valid,
      loading: !!modelPath,
    };

    this.updatePlacementPreview(worldX, worldZ, valid);

    if (modelPath) {
      void this.loadPlacementPreviewModel(modelPath, root, tileWidth, tileHeight);
    }
  }

  public updatePlacementPreview(worldX: number, worldZ: number, valid: boolean): void {
    if (!this.placementPreview) return;
    const preview = this.placementPreview;
    preview.root.position.x = worldX;
    preview.root.position.z = worldZ;
    preview.valid = valid;

    const color = valid ? new Color3(0.2, 0.9, 0.6) : new Color3(1, 0.3, 0.3);
    const alpha = 0.6;

    // Only update placeholder material if it's visible (fallback when no model)
    if (preview.placeholder && preview.placeholder.isVisible) {
      const material = new StandardMaterial('placementPreviewMat', this.scene);
      material.diffuseColor = color;
      material.emissiveColor = color.scale(0.5);
      material.alpha = alpha;
      material.backFaceCulling = false;
      preview.placeholder.material = material;
    }

    for (const mesh of preview.modelMeshes) {
      this.applyPlacementPreviewMaterial(mesh, alpha, color);
    }
  }

  public hidePlacementPreview(): void {
    if (!this.placementPreview) return;
    // Increment token to invalidate any pending model loads
    this.placementPreviewToken++;
    this.placementPreview.root.dispose();
    this.placementPreview = null;
  }

  /**
   * Preload a model file and parse it into the scene for instant cloning.
   * Call this when storage items are known to reduce load delay during drag.
   */
  public async preloadModel(modelPath: string): Promise<void> {
    if (!modelPath) return;

    // Extract file path (without mesh name after #)
    const hashIndex = modelPath.indexOf('#');
    const filePath = hashIndex !== -1 ? modelPath.substring(0, hashIndex) : modelPath;

    // Already cached or loading
    if (this.modelCache.has(filePath) || this.modelCacheLoading.has(filePath)) {
      return;
    }

    const fullPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const lastSlash = fullPath.lastIndexOf('/');
    const rootUrl = fullPath.substring(0, lastSlash + 1);
    const file = fullPath.substring(lastSlash + 1);

    // Load and parse the model, storing the entire hierarchy hidden for later cloning
    const loadPromise = SceneLoader.ImportMeshAsync('', rootUrl, file, this.scene)
      .then((result) => {
        // Create a hidden container for the cached model
        const cacheRoot = new TransformNode(`cache_${filePath}`, this.scene);
        cacheRoot.setEnabled(false);

        // Get the GLB root node (first mesh is usually __root__)
        const glbRoot = result.meshes[0];
        if (glbRoot) {
          glbRoot.parent = cacheRoot;
        }

        // Hide all meshes but keep hierarchy intact
        result.meshes.forEach((m) => {
          m.isVisible = false;
          m.setEnabled(false);
        });

        // Store in cache - keep entire hierarchy for cloning
        this.modelCache.set(filePath, {
          cacheRoot,
          glbRoot: glbRoot as TransformNode,
        });

        this.modelCacheLoading.delete(filePath);
        return true;
      })
      .catch((err) => {
        console.warn(`Failed to preload model ${filePath}:`, err);
        this.modelCacheLoading.delete(filePath);
        return false;
      });

    this.modelCacheLoading.set(filePath, loadPromise);
    await loadPromise;
  }

  /**
   * Preload multiple models at once
   */
  public async preloadModels(modelPaths: string[]): Promise<void> {
    await Promise.all(modelPaths.map((path) => this.preloadModel(path)));
  }

  /**
   * Enable all nodes in a hierarchy
   */
  private enableHierarchy(node: TransformNode): void {
    node.setEnabled(true);
    if (node instanceof Mesh) {
      node.isVisible = true;
    }
    const children = node.getChildren();
    for (const child of children) {
      if (child instanceof TransformNode) {
        this.enableHierarchy(child);
      }
    }
  }

  /**
   * Disable all nodes in a hierarchy
   */
  private disableHierarchy(node: TransformNode): void {
    node.setEnabled(false);
    if (node instanceof Mesh) {
      node.isVisible = false;
    }
    const children = node.getChildren();
    for (const child of children) {
      if (child instanceof TransformNode) {
        this.disableHierarchy(child);
      }
    }
  }

  /**
   * Compute world matrices for all nodes in a hierarchy
   */
  private computeHierarchyMatrices(node: TransformNode): void {
    node.computeWorldMatrix(true);
    if (node instanceof Mesh) {
      node.refreshBoundingInfo();
    }
    const children = node.getChildren();
    for (const child of children) {
      if (child instanceof TransformNode) {
        this.computeHierarchyMatrices(child);
      }
    }
  }

  /**
   * Collect all meshes (with vertices) from a node and its descendants
   */
  private collectMeshesFromNode(node: TransformNode, meshes: Mesh[]): void {
    if (node instanceof Mesh && node.getTotalVertices() > 0) {
      meshes.push(node);
    }
    const children = node.getChildren();
    for (const child of children) {
      if (child instanceof TransformNode) {
        this.collectMeshesFromNode(child, meshes);
      }
    }
  }

  /**
   * Check if a mesh has any ancestor (parent, grandparent, etc.) matching the pattern
   */
  private meshHasAncestorMatching(mesh: Mesh, pattern: RegExp): boolean {
    let current: TransformNode | null = mesh.parent as TransformNode | null;
    while (current) {
      if (pattern.test(current.name || '')) {
        return true;
      }
      current = current.parent as TransformNode | null;
    }
    return false;
  }

  /**
   * Deep clone a node hierarchy, preserving all transforms and parent-child relationships
   */
  private deepCloneHierarchy(
    node: TransformNode,
    newParent: TransformNode | null,
    cloneMap: Map<TransformNode, TransformNode>
  ): TransformNode {
    let clonedNode: TransformNode;

    if (node instanceof Mesh) {
      // Clone mesh (this copies geometry and local transforms)
      clonedNode = node.clone(`clone_${node.name}`, newParent) as Mesh;
    } else {
      // Clone transform node
      clonedNode = new TransformNode(`clone_${node.name}`, this.scene);
      clonedNode.parent = newParent;
      clonedNode.position = node.position.clone();
      // Handle both quaternion and euler rotation
      if (node.rotationQuaternion) {
        clonedNode.rotationQuaternion = node.rotationQuaternion.clone();
      } else {
        clonedNode.rotation = node.rotation.clone();
      }
      clonedNode.scaling = node.scaling.clone();
    }

    cloneMap.set(node, clonedNode);

    // Recursively clone children
    const children = node.getChildren();
    for (const child of children) {
      if (child instanceof TransformNode) {
        this.deepCloneHierarchy(child, clonedNode, cloneMap);
      }
    }

    return clonedNode;
  }

  private async loadPlacementPreviewModel(
    modelPath: string,
    root: TransformNode,
    tileWidth: number,
    tileHeight: number
  ): Promise<void> {
    const token = ++this.placementPreviewToken;
    let filePath = modelPath;
    let targetMeshName: string | null = null;

    const hashIndex = modelPath.indexOf('#');
    if (hashIndex !== -1) {
      filePath = modelPath.substring(0, hashIndex);
      targetMeshName = modelPath.substring(hashIndex + 1);
    }

    try {
      // Check if model is already cached
      let cachedData = this.modelCache.get(filePath);

      // If not cached and not currently loading, load it now
      if (!cachedData) {
        // Wait for any in-progress load
        const loadingPromise = this.modelCacheLoading.get(filePath);
        if (loadingPromise) {
          await loadingPromise;
          cachedData = this.modelCache.get(filePath);
        } else {
          // Load and cache the model
          await this.preloadModel(modelPath);
          cachedData = this.modelCache.get(filePath);
        }
      }

      // Check if we're still valid after async operations
      if (token !== this.placementPreviewToken) {
        return;
      }

      if (!this.placementPreview || this.placementPreview.root !== root) {
        return;
      }

      if (!cachedData || !cachedData.glbRoot) {
        // Cache failed, placeholder will remain visible
        if (this.placementPreview) {
          this.placementPreview.loading = false;
        }
        return;
      }

      // Temporarily enable the cache to compute matrices
      cachedData.cacheRoot.setEnabled(true);
      this.enableHierarchy(cachedData.glbRoot);
      cachedData.cacheRoot.computeWorldMatrix(true);
      this.computeHierarchyMatrices(cachedData.glbRoot);

      // Collect all meshes that belong to the target model
      // The model parts may be spread across multiple branches, so we check each mesh's ancestry
      const meshesToUse: Mesh[] = [];
      if (targetMeshName) {
        // Pattern matches any node starting with the target name (e.g., T-A03_base, T-A03_barrel, T-A03_11)
        const escapedName = targetMeshName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const modelPattern = new RegExp(`^${escapedName}_`);

        // Collect all meshes from the GLB and filter by ancestry
        const allMeshes: Mesh[] = [];
        this.collectMeshesFromNode(cachedData.glbRoot, allMeshes);

        for (const mesh of allMeshes) {
          if (this.meshHasAncestorMatching(mesh, modelPattern)) {
            meshesToUse.push(mesh);
          }
        }

      } else {
        // No target specified, use all meshes
        this.collectMeshesFromNode(cachedData.glbRoot, meshesToUse);
      }

      if (meshesToUse.length === 0) {
        cachedData.cacheRoot.setEnabled(false);
        this.disableHierarchy(cachedData.glbRoot);
        if (this.placementPreview) {
          this.placementPreview.loading = false;
        }
        return;
      }

      // Calculate bounding box from target meshes
      let minVec = new Vector3(Infinity, Infinity, Infinity);
      let maxVec = new Vector3(-Infinity, -Infinity, -Infinity);
      let hasValidBounds = false;

      meshesToUse.forEach((mesh) => {
        mesh.refreshBoundingInfo();
        const boundingInfo = mesh.getBoundingInfo();
        const min = boundingInfo.boundingBox.minimumWorld;
        const max = boundingInfo.boundingBox.maximumWorld;

        if (isFinite(min.x) && isFinite(max.x)) {
          minVec = Vector3.Minimize(minVec, min);
          maxVec = Vector3.Maximize(maxVec, max);
          hasValidBounds = true;
        }
      });

      if (!hasValidBounds) {
        cachedData.cacheRoot.setEnabled(false);
        this.disableHierarchy(cachedData.glbRoot);
        if (this.placementPreview) {
          this.placementPreview.loading = false;
        }
        return;
      }

      // Calculate scale factor and center
      const preScaleWidth = maxVec.x - minVec.x;
      const preScaleDepth = maxVec.z - minVec.z;
      const targetWidth = tileWidth * TILE_SIZE;
      const targetDepth = tileHeight * TILE_SIZE;
      const modelFootprint = Math.max(preScaleWidth, preScaleDepth);
      const targetFootprint = Math.max(targetWidth, targetDepth);
      const scaleFactor = modelFootprint > 0 ? targetFootprint / modelFootprint : 1;
      const center = minVec.add(maxVec).scale(0.5);

      // Deep clone the ENTIRE glbRoot hierarchy (preserves all parent-child transforms)
      // Then we'll hide meshes that don't belong to our target model
      const cloneMap = new Map<TransformNode, TransformNode>();
      const clonedRoot = this.deepCloneHierarchy(cachedData.glbRoot, root, cloneMap);

      // Collect all cloned meshes
      const allClonedMeshes: Mesh[] = [];
      this.collectMeshesFromNode(clonedRoot, allClonedMeshes);

      // Build a set of original mesh names we want to keep
      const meshNamesToKeep = new Set(meshesToUse.map((m) => m.name));

      // Process cloned meshes - keep target meshes visible with preview material, hide others
      const clonedMeshes: Mesh[] = [];
      const previewColor = new Color3(0.2, 0.9, 0.6);

      for (const clonedMesh of allClonedMeshes) {
        // The cloned mesh name has 'clone_' prefix from deepCloneHierarchy
        const originalName = clonedMesh.name.replace(/^clone_/, '');

        if (meshNamesToKeep.has(originalName)) {
          // This mesh belongs to our target model - make it visible with preview material
          const previewMat = new StandardMaterial(`previewMat_${clonedMesh.name}`, this.scene);
          previewMat.diffuseColor = previewColor;
          previewMat.emissiveColor = previewColor.scale(0.3);
          previewMat.alpha = 0.6;
          previewMat.backFaceCulling = false;
          clonedMesh.material = previewMat;

          clonedMesh.isVisible = true;
          clonedMesh.setEnabled(true);
          clonedMesh.isPickable = false;
          clonedMeshes.push(clonedMesh);
        } else {
          // This mesh doesn't belong to our target - hide it
          clonedMesh.isVisible = false;
          clonedMesh.setEnabled(false);
        }
      }

      // Position, rotate, and scale the entire cloned hierarchy
      clonedRoot.position = new Vector3(-center.x, -minVec.y, -center.z).scale(scaleFactor);
      clonedRoot.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);
      // Apply 180-degree rotation to match placed model orientation
      clonedRoot.rotationQuaternion = null;
      clonedRoot.rotation.y = Math.PI;


      // Re-disable cache
      cachedData.cacheRoot.setEnabled(false);
      this.disableHierarchy(cachedData.glbRoot);

      if (this.placementPreview) {
        this.placementPreview.modelMeshes = clonedMeshes;
        this.placementPreview.loading = false;
        if (this.placementPreview.placeholder) {
          this.placementPreview.placeholder.dispose();
          this.placementPreview.placeholder = null;
        }
      }
    } catch {
      // Model loading failed - placeholder will remain visible
      if (this.placementPreview) {
        this.placementPreview.loading = false;
      }
      return;
    }
  }

  private applyPlacementPreviewMaterial(mesh: Mesh, alpha: number, color: Color3): void {
    const material = mesh.material;
    if (material instanceof StandardMaterial) {
      material.alpha = alpha;
      material.diffuseColor = color;
      material.emissiveColor = color.scale(0.5);
      material.specularColor = new Color3(0.1, 0.1, 0.1);
      material.backFaceCulling = false;
    } else if (material instanceof PBRMaterial) {
      material.alpha = alpha;
      material.albedoColor = color;
      material.emissiveColor = color.scale(0.5);
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.backFaceCulling = false;
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
      true,
      true,
      undefined,
      false,
      true
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
      true,
      true,
      undefined,
      false,
      true
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

    // Glow material - full color, semi-transparent with proper depth
    const glowMat = new StandardMaterial(`laser_glow_mat_${id}`, this.scene);
    glowMat.emissiveColor = laserColor;
    glowMat.diffuseColor = laserColor;
    glowMat.alpha = 0.5;
    glowMat.disableLighting = true;
    // Enable depth pre-pass so transparent glow is properly occluded by geometry
    glowMat.needDepthPrePass = true;
    glow.material = glowMat;

    // NOTE: Do NOT add lasers to glow layer - glow layer is a post-process effect
    // that renders on top of everything and ignores depth testing. This would cause
    // the laser to be visible through the turret model. The emissive colors still
    // make the laser look bright without the bloom effect.

    return { core, glow };
  }

  /**
   * Fire a laser from source to target position with visual effects
   * Clips laser at ground level (Y=0) to prevent it extending below ground
   * @param attackIntervalMs - Optional: time between attacks in ms. Laser fades faster for faster attacks.
   */
  public fireLaser(
    sourcePos: Vector3,
    targetPos: Vector3,
    color = '#ff0000',
    attackIntervalMs?: number
  ): void {
    const id = `laser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Calculate duration based on attack speed
    // Fast attacks (short interval): quick fade to clear before next shot
    // Slow attacks (long interval): can linger a bit longer
    // Default: 600ms if no interval specified
    // Duration is 50% of attack interval, clamped between 150ms and 800ms
    let duration = 600;
    if (attackIntervalMs) {
      duration = Math.min(800, Math.max(150, attackIntervalMs * 0.5));
    }

    // No offset - laser starts from calculated source position inside the turret
    // The laser will be properly occluded by the turret geometry via depth testing
    const offsetSourcePos = sourcePos;

    // Clip laser at ground level if it would go below
    let clippedTargetPos = targetPos.clone();
    const groundY = 0.05; // Slightly above ground to avoid z-fighting

    if (targetPos.y < groundY && offsetSourcePos.y > groundY) {
      // Calculate intersection with ground plane using offset source
      const dir = targetPos.subtract(offsetSourcePos);
      const t = (groundY - offsetSourcePos.y) / dir.y;
      if (t > 0 && t < 1) {
        clippedTargetPos = offsetSourcePos.add(dir.scale(t));
      }
    } else if (targetPos.y < groundY) {
      // Target is below ground, just clamp Y
      clippedTargetPos.y = groundY;
    }

    const { core, glow } = this.createLaserBeam(offsetSourcePos, clippedTargetPos, color);

    this.activeLasers.set(id, {
      coreMesh: core,
      glowMesh: glow,
      startTime: Date.now(),
      duration,
    });

    // Create impact flash at clipped target position
    this.createImpactFlash(clippedTargetPos, color);
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
        // Start fading at 30% through duration for obvious fade effect
        if (progress > 0.3) {
          // Use easeOutQuad for smooth, noticeable fade: starts fast, slows down
          const fadeProgress = (progress - 0.3) / 0.7;
          const easedFade = 1 - (1 - fadeProgress) * (1 - fadeProgress); // easeOutQuad
          const alpha = 1 - easedFade;

          const coreMat = laser.coreMesh.material as StandardMaterial;
          const glowMat = laser.glowMesh.material as StandardMaterial;

          if (coreMat) coreMat.alpha = alpha;
          if (glowMat) glowMat.alpha = alpha * 0.5;

          // Shrink more dramatically as it fades (from 1.0 to 0.2)
          const scale = 1 - easedFade * 0.8;
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
   * Find turret parts using mesh part flags or naming conventions.
   * Builds a barrel line anchor from the saved local position.
   */
  private findTurretParts(
    root: TransformNode,
    barrelMeshName: string | null,
    meshPartFlags: Record<string, string[]> | null,
    barrelLinePosition: { x: number; y: number; z: number } | null,
    modelCenterLocal: Vector3 | null
  ): {
    yawParts: TransformNode[];
    pitchParts: TransformNode[];
    rootYawParts: TransformNode[];
    rootPitchParts: TransformNode[];
    yawOnlyParts: TransformNode[];
    pitchOnlyParts: TransformNode[];
    sharedParts: TransformNode[];
    baseRotations: Map<TransformNode, Vector3>;
    barrelLineAnchor: TransformNode | null;
    hasBarrelLine: boolean;
    baseBarrelYaw: number;
    baseBarrelPitch: number;
  } {
    const yawKeywords = ['turret', 'head', 'top', 'rotate', 'swivel', 'upper'];
    const pitchKeywords = ['barrel', 'gun', 'cannon', 'weapon', 'arm', 'tube', 'pipe', 'cylinder'];

    // Helper to find meshes with a specific flag
    const getMeshesWithFlag = (flag: string): string[] => {
      if (!meshPartFlags) return [];
      return Object.entries(meshPartFlags)
        .filter(([, flags]) => flags.includes(flag))
        .map(([name]) => name);
    };

    // Collect all descendants for searching
    const allDescendants: TransformNode[] = [];
    const collectDescendants = (node: TransformNode) => {
      for (const child of node.getChildren()) {
        if (child instanceof TransformNode) {
          allDescendants.push(child);
          collectDescendants(child);
        }
      }
    };
    collectDescendants(root);

    // Also check scene meshes as fallback (for flat hierarchies)
    const findMeshByName = (name: string): TransformNode | null => {
      let mesh = allDescendants.find((d) => d.name === name);
      if (!mesh && this.scene) {
        const sceneMesh = this.scene.getMeshByName(name);
        if (sceneMesh) mesh = sceneMesh;
      }
      return mesh || null;
    };

    // Find yaw parts (horizontal rotation)
    const yawMeshNames = getMeshesWithFlag('yaw');
    let yawParts: TransformNode[] = [];
    if (yawMeshNames.length > 0) {
      yawParts = yawMeshNames.map(findMeshByName).filter((m): m is TransformNode => m !== null);
    } else {
      // Fallback: search by keywords
      for (const mesh of allDescendants) {
        const nameLower = mesh.name.toLowerCase();
        if (yawKeywords.some((kw) => nameLower.includes(kw))) {
          yawParts.push(mesh);
          break; // Just use first match
        }
      }
    }

    // Find pitch parts (vertical rotation)
    const pitchMeshNames = getMeshesWithFlag('pitch');
    let pitchParts: TransformNode[] = [];
    if (pitchMeshNames.length > 0) {
      pitchParts = pitchMeshNames.map(findMeshByName).filter((m): m is TransformNode => m !== null);
    } else {
      // Fallback: search by keywords
      for (const mesh of allDescendants) {
        const nameLower = mesh.name.toLowerCase();
        if (pitchKeywords.some((kw) => nameLower.includes(kw))) {
          pitchParts.push(mesh);
          break; // Just use first match
        }
      }
    }

    if (pitchParts.length === 0 && barrelMeshName) {
      const explicitMesh = findMeshByName(barrelMeshName);
      if (explicitMesh) {
        pitchParts = [explicitMesh];
      }
    }

    // If no pitch parts, use yaw parts for both
    if (pitchParts.length === 0 && yawParts.length > 0) {
      pitchParts = [...yawParts];
    }

    const getRootParts = (parts: TransformNode[]): TransformNode[] => {
      const partSet = new Set(parts);
      return parts.filter((mesh) => {
        let parent = mesh.parent;
        while (parent) {
          if (partSet.has(parent as TransformNode)) {
            return false;
          }
          parent = parent.parent;
        }
        return true;
      });
    };

    const rootYawParts = getRootParts(yawParts);
    const rootPitchParts = getRootParts(pitchParts);

    const rootYawSet = new Set(rootYawParts);
    const rootPitchSet = new Set(rootPitchParts);
    const sharedParts = rootYawParts.filter((mesh) => rootPitchSet.has(mesh));
    const yawOnlyParts = rootYawParts.filter((mesh) => !rootPitchSet.has(mesh));
    const pitchOnlyParts = rootPitchParts.filter((mesh) => !rootYawSet.has(mesh));

    const baseRotations = new Map<TransformNode, Vector3>();
    const storeBaseRotation = (mesh: TransformNode) => {
      if (baseRotations.has(mesh)) return;
      const baseRotation = mesh.rotationQuaternion
        ? mesh.rotationQuaternion.toEulerAngles()
        : mesh.rotation.clone();
      baseRotations.set(mesh, baseRotation.clone());
    };

    [...rootYawParts, ...rootPitchParts].forEach(storeBaseRotation);

    let barrelLineAnchor: TransformNode | null = null;
    let hasBarrelLine = false;
    let baseBarrelYaw = 0;
    let baseBarrelPitch = 0;

    if (barrelLinePosition && this.scene) {
      barrelLineAnchor = new TransformNode('_barrelLineAnchor', this.scene);

      if (pitchParts[0]) {
        barrelLineAnchor.parent = pitchParts[0];
        barrelLineAnchor.position = new Vector3(
          barrelLinePosition.x,
          barrelLinePosition.y,
          barrelLinePosition.z
        );
        hasBarrelLine = true;
      } else if (modelCenterLocal) {
        barrelLineAnchor.parent = root;
        barrelLineAnchor.position = modelCenterLocal.add(
          new Vector3(barrelLinePosition.x, barrelLinePosition.y, barrelLinePosition.z)
        );
        hasBarrelLine = true;
      } else {
        barrelLineAnchor.dispose();
        barrelLineAnchor = null;
      }

      if (barrelLineAnchor && hasBarrelLine) {
        barrelLineAnchor.computeWorldMatrix(true);
        const forward = barrelLineAnchor.getDirection(new Vector3(0, 0, 1));
        const horizontal = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
        baseBarrelYaw = Math.atan2(forward.x, forward.z);
        baseBarrelPitch = Math.atan2(forward.y, horizontal);
      }
    }

    return {
      yawParts,
      pitchParts,
      rootYawParts,
      rootPitchParts,
      yawOnlyParts,
      pitchOnlyParts,
      sharedParts,
      baseRotations,
      barrelLineAnchor,
      hasBarrelLine,
      baseBarrelYaw,
      baseBarrelPitch,
    };
  }

  private normalizeAngle(angle: number): number {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  private getTurretBarrelOrigin(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): Vector3 | null {
    if (!building.barrelLineAnchor || !building.hasBarrelLine) return null;
    building.barrelLineAnchor.computeWorldMatrix(true);
    return building.barrelLineAnchor.getAbsolutePosition().clone();
  }

  private getTurretBarrelForward(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): Vector3 | null {
    if (!building.barrelLineAnchor || !building.hasBarrelLine) return null;
    building.barrelLineAnchor.computeWorldMatrix(true);
    const forward = building.barrelLineAnchor.getDirection(new Vector3(0, 0, 1));
    return forward.normalize();
  }

  private getTurretAlignmentAngle(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never,
    targetWorldX: number,
    targetWorldZ: number,
    targetWorldY: number
  ): number | null {
    const origin = this.getTurretBarrelOrigin(building);
    const forward = this.getTurretBarrelForward(building);
    if (!origin || !forward) return null;

    const toTarget = new Vector3(
      targetWorldX - origin.x,
      targetWorldY - origin.y,
      targetWorldZ - origin.z
    );

    if (toTarget.lengthSquared() < 0.0001) {
      return 0;
    }

    const toTargetDir = toTarget.normalize();
    const dot = Vector3.Dot(forward, toTargetDir);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    return Math.acos(clampedDot);
  }

  private isTurretRotationAligned(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never
  ): boolean {
    const yawError = Math.abs(
      this.normalizeAngle(building.currentRotation - building.targetRotation)
    );
    const pitchError = Math.abs(building.currentPitch - building.targetPitch);
    return yawError <= TURRET_ALIGNMENT_TOLERANCE && pitchError <= TURRET_ALIGNMENT_TOLERANCE;
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
   * Check if a target is within the turret's field of view (yaw and pitch bounds)
   * Returns { inView: true } if target can be hit, or { inView: false, reason: string } if not
   */
  private isTargetInTurretView(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never,
    targetWorldX: number,
    targetWorldZ: number,
    targetWorldY: number
  ): { inView: boolean; reason?: string; requiredYaw?: number; requiredPitch?: number } {
    if (!building.barrelLineAnchor || !building.hasBarrelLine) {
      return { inView: false, reason: 'Turret barrel line not calibrated' };
    }

    if (building.yawParts.length === 0 && building.pitchParts.length === 0) {
      return { inView: false, reason: 'Turret has no rotatable parts' };
    }

    const origin = this.getTurretBarrelOrigin(building);
    if (!origin) {
      return { inView: false, reason: 'Turret barrel line not calibrated' };
    }

    const requiredYawWorld = this.calculateTargetRotation(
      origin.x,
      origin.z,
      targetWorldX,
      targetWorldZ
    );
    const requiredYaw = this.normalizeAngle(requiredYawWorld - building.baseBarrelYaw);

    if (requiredYaw < building.yawClampMin || requiredYaw > building.yawClampMax) {
      const yawDeg = (requiredYaw * 180) / Math.PI;
      const minDeg = (building.yawClampMin * 180) / Math.PI;
      const maxDeg = (building.yawClampMax * 180) / Math.PI;
      return {
        inView: false,
        reason: `Target yaw ${yawDeg.toFixed(1)}° outside turret view [${minDeg.toFixed(0)}° to ${maxDeg.toFixed(0)}°]`,
        requiredYaw,
      };
    }

    const dx = targetWorldX - origin.x;
    const dz = targetWorldZ - origin.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const pitchWorld = Math.atan2(targetWorldY - origin.y, horizontalDistance);
    const requiredPitch = pitchWorld - building.baseBarrelPitch;

    if (requiredPitch < building.pitchClampMin || requiredPitch > building.pitchClampMax) {
      const pitchDeg = (requiredPitch * 180) / Math.PI;
      const minDeg = (building.pitchClampMin * 180) / Math.PI;
      const maxDeg = (building.pitchClampMax * 180) / Math.PI;
      return {
        inView: false,
        reason: `Target pitch ${pitchDeg.toFixed(1)}° outside turret view [${minDeg.toFixed(0)}° to ${maxDeg.toFixed(0)}°]`,
        requiredYaw,
        requiredPitch,
      };
    }

    return { inView: true, requiredYaw, requiredPitch };
  }

  /**
   * Update turret rotations (called in render loop)
   * Handles both horizontal (yaw) and vertical (pitch) rotation
   * Yaw is applied to the rotatable part (turret head)
   * Pitch is applied to the pitchable part (barrel/gun)
   * Also checks for pending attacks and fires when rotation is complete
   */
  private updateTurretRotations(deltaTime: number): void {
    const yawSpeed = 3.0;
    const pitchSpeed = 2.0;

    for (const [buildingId, data] of this.buildingData) {
      if (data.yawParts.length === 0 && data.pitchParts.length === 0) {
        continue;
      }

      const clampedTargetYaw = Math.max(
        data.yawClampMin,
        Math.min(data.yawClampMax, data.targetRotation)
      );
      const clampedTargetPitch = Math.max(
        data.pitchClampMin,
        Math.min(data.pitchClampMax, data.targetPitch)
      );

      const yawDiff = this.normalizeAngle(clampedTargetYaw - data.currentRotation);
      if (Math.abs(yawDiff) > 0.001) {
        const maxYaw = yawSpeed * deltaTime;
        const yawAmount = Math.sign(yawDiff) * Math.min(maxYaw, Math.abs(yawDiff));
        data.currentRotation = this.normalizeAngle(data.currentRotation + yawAmount);
        data.currentRotation = Math.max(
          data.yawClampMin,
          Math.min(data.yawClampMax, data.currentRotation)
        );
      }

      const pitchDiff = clampedTargetPitch - data.currentPitch;
      if (Math.abs(pitchDiff) > 0.001) {
        const maxPitch = pitchSpeed * deltaTime;
        const pitchAmount = Math.sign(pitchDiff) * Math.min(maxPitch, Math.abs(pitchDiff));
        data.currentPitch += pitchAmount;
        data.currentPitch = Math.max(
          data.pitchClampMin,
          Math.min(data.pitchClampMax, data.currentPitch)
        );
      }

      const applyRotation = (
        mesh: TransformNode,
        baseRotation: Vector3,
        applyYaw: boolean,
        applyPitch: boolean
      ) => {
        mesh.rotationQuaternion = null;
        mesh.rotation.x = baseRotation.x + (applyPitch ? -data.currentPitch : 0);
        mesh.rotation.y = baseRotation.y + (applyYaw ? data.currentRotation : 0);
        mesh.rotation.z = baseRotation.z;
      };

      for (const mesh of data.yawOnlyParts) {
        const baseRotation = data.baseRotations.get(mesh);
        if (baseRotation) {
          applyRotation(mesh, baseRotation, true, false);
        }
      }

      for (const mesh of data.pitchOnlyParts) {
        const baseRotation = data.baseRotations.get(mesh);
        if (baseRotation) {
          applyRotation(mesh, baseRotation, false, true);
        }
      }

      for (const mesh of data.sharedParts) {
        const baseRotation = data.baseRotations.get(mesh);
        if (baseRotation) {
          applyRotation(mesh, baseRotation, true, true);
        }
      }

      if (this.calibrationBuildingId === buildingId) {
        this.updateCalibrationMarkerPosition();
      }

      const pendingAttack = this.pendingAttacks.get(buildingId);
      if (pendingAttack) {
        const alignmentAngle = this.getTurretAlignmentAngle(
          data,
          pendingAttack.targetWorldX,
          pendingAttack.targetWorldZ,
          pendingAttack.targetWorldY
        );
        const aligned =
          (alignmentAngle !== null && alignmentAngle <= TURRET_ALIGNMENT_TOLERANCE) ||
          this.isTurretRotationAligned(data);
        if (aligned) {
          this.pendingAttacks.delete(buildingId);
          this.executeAttack(buildingId, data, pendingAttack);
        }
      }
    }
  }

  /**
   * Execute the actual attack (fire laser) after rotation is complete
   *
   * SIMPLIFIED APPROACH: The barrel tip TransformNode is parented to the barrel mesh
   * and automatically inherits all rotations from the scene graph. We just call
   * getAbsolutePosition() to get the world-space laser origin.
   */
  private executeAttack(
    _buildingId: string,
    data: typeof this.buildingData extends Map<string, infer V> ? V : never,
    attack: { targetWorldX: number; targetWorldZ: number; targetWorldY: number; color: string }
  ): void {
    const sourcePos = this.getTurretBarrelOrigin(data);
    if (!sourcePos) {
      console.warn('Skipping attack - barrel line not configured');
      return;
    }

    const groundY = 0.05;
    const laserEndPos = new Vector3(
      attack.targetWorldX,
      Math.max(attack.targetWorldY, groundY),
      attack.targetWorldZ
    );

    const attackIntervalMs = data.attackSpeed > 0 ? 1000 / data.attackSpeed : undefined;
    this.fireLaser(sourcePos, laserEndPos, attack.color, attackIntervalMs);

    data.lastFireTime = performance.now();

    this.showTargetRing('ground', laserEndPos.x, laserEndPos.z, 2.0);

    const laserDuration = attackIntervalMs
      ? Math.min(800, Math.max(150, attackIntervalMs * 0.5))
      : 600;
    setTimeout(() => {
      if (this.targetRingTargetId === 'ground') {
        this.hideTargetRing();
      }
    }, laserDuration + 200);
  }

  // ==================== BUILDING HEALTH/COOLDOWN BARS ====================

  /**
   * Update building health bar texture and visibility
   * Health bar is only visible when HP < 100%
   */
  private updateBuildingHealthBar(buildingId: string): void {
    const building = this.buildingData.get(buildingId);
    if (!building || !building.healthBarTexture || !building.healthBarPlane) return;

    const healthPercent = building.health / building.maxHealth;

    // Only show health bar when damaged
    building.healthBarPlane.isVisible = healthPercent < 1.0;

    // Only update texture if visible
    if (!building.healthBarPlane.isVisible) return;

    const ctx = building.healthBarTexture.getContext();
    const width = 128;
    const height = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, width, height);

    // Health fill
    const fillWidth = Math.max(0, (width - 4) * healthPercent);

    // Color based on health percentage
    if (healthPercent > 0.6) {
      ctx.fillStyle = '#22c55e';
    } else if (healthPercent > 0.3) {
      ctx.fillStyle = '#facc15';
    } else {
      ctx.fillStyle = '#ef4444';
    }

    ctx.fillRect(2, 2, fillWidth, height - 4);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    building.healthBarTexture.update();
  }

  /**
   * Update building cooldown bar texture
   * Shows progress from 0% (just fired) to 100% (ready to fire)
   */
  private updateBuildingCooldownBar(buildingId: string): void {
    const building = this.buildingData.get(buildingId);
    if (!building || !building.cooldownBarTexture || !building.cooldownBarPlane) return;

    // Don't show cooldown bar for buildings that can't attack
    if (building.attackSpeed <= 0) {
      building.cooldownBarPlane.isVisible = false;
      return;
    }

    const now = performance.now();
    const attackIntervalMs = 1000 / building.attackSpeed;
    const timeSinceLastFire = now - building.lastFireTime;
    const cooldownPercent = Math.min(1.0, timeSinceLastFire / attackIntervalMs);

    // Show cooldown bar when on cooldown (not ready to fire), hide when ready
    // Only show after the turret has fired at least once
    building.cooldownBarPlane.isVisible = building.lastFireTime > 0 && cooldownPercent < 1.0;

    const ctx = building.cooldownBarTexture.getContext();
    const width = 128;
    const height = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, width, height);

    // Cooldown fill
    const fillWidth = Math.max(0, (width - 4) * cooldownPercent);

    // Color: bright cyan when charging
    if (cooldownPercent >= 1.0) {
      ctx.fillStyle = '#22d3ee';
    } else {
      ctx.fillStyle = '#38bdf8';
    }

    ctx.fillRect(2, 2, fillWidth, height - 4);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    building.cooldownBarTexture.update();
  }

  /**
   * Update all building cooldown bars (called each frame)
   */
  private updateAllBuildingCooldownBars(): void {
    for (const [buildingId] of this.buildingData) {
      this.updateBuildingCooldownBar(buildingId);
    }
  }

  /**
   * Damage a building and update its health bar
   */
  public damageBuilding(
    buildingId: string,
    damage: number
  ): { alive: boolean; remainingHealth: number } | null {
    const building = this.buildingData.get(buildingId);
    if (!building) return null;

    building.health = Math.max(0, building.health - damage);
    this.updateBuildingHealthBar(buildingId);

    if (building.health <= 0) {
      // Building destroyed - could add visual feedback here
      return { alive: false, remainingHealth: 0 };
    }

    return { alive: true, remainingHealth: building.health };
  }

  // ==================== FORCE ATTACK ====================

  /**
   * Force attack a ground position (Ctrl+Click or Right-Click)
   * Accepts exact world coordinates for precise targeting
   * Queues the attack to fire after turret finishes rotating
   */
  public forceAttackGroundWorld(
    buildingId: string,
    targetWorldX: number,
    targetWorldZ: number
  ): boolean {
    const building = this.buildingData.get(buildingId);
    if (!building) {
      return false;
    }

    if (building.range <= 0 || building.damage <= 0) {
      return false;
    }

    if (!building.hasBarrelLine) {
      return false;
    }

    // Target world position (ground level)
    const targetWorldY = 0.1; // Ground level

    // Check if in range (use building center for range check)
    const { centerX: buildingCenterX, centerZ: buildingCenterZ } =
      this.getBuildingCenterWorld(building);
    const distFromCenter = Math.sqrt(
      Math.pow(targetWorldX - buildingCenterX, 2) + Math.pow(targetWorldZ - buildingCenterZ, 2)
    );
    const rangeInMeters = building.range * TILE_SIZE;
    if (distFromCenter > rangeInMeters) {
      return false;
    }

    // Check if target is within turret's field of view (yaw and pitch bounds)
    const viewCheck = this.isTargetInTurretView(building, targetWorldX, targetWorldZ, targetWorldY);
    if (!viewCheck.inView) {
      return false;
    }

    if (viewCheck.requiredYaw === undefined || viewCheck.requiredPitch === undefined) {
      return false;
    }

    // Set turret rotation to the calculated values
    building.targetRotation = viewCheck.requiredYaw;
    building.targetPitch = viewCheck.requiredPitch;

    // Queue the attack - it will fire when rotation completes
    this.pendingAttacks.set(buildingId, {
      targetWorldX,
      targetWorldZ,
      targetWorldY,
      color: building.laserColor || '#ff0000',
    });

    return true;
  }

  /**
   * Force attack a ground position using grid coordinates (snaps to tile center)
   * For precise targeting, use forceAttackGroundWorld instead
   */
  public forceAttackGround(buildingId: string, targetPos: ArenaPosition): boolean {
    const targetWorldX = targetPos.x * TILE_SIZE + TILE_SIZE / 2;
    const targetWorldZ = targetPos.z * TILE_SIZE + TILE_SIZE / 2;
    return this.forceAttackGroundWorld(buildingId, targetWorldX, targetWorldZ);
  }

  /**
   * Force attack a unit by ID
   * Uses the unit's actual visual position (interpolated) for pinpoint accuracy
   * The laser will hit exactly where the unit model appears on screen
   */
  public forceAttackUnit(buildingId: string, targetUnitId: string): boolean {
    if (!this.unitManager) {
      return false;
    }

    // Get the unit's actual visual position
    const unitPos = this.unitManager.getUnitWorldPosition(targetUnitId);
    if (!unitPos) {
      return false;
    }

    // Get building data
    const building = this.buildingData.get(buildingId);
    if (!building) {
      return false;
    }

    if (building.range <= 0 || building.damage <= 0) {
      return false;
    }

    if (!building.hasBarrelLine) {
      return false;
    }

    // Target is the unit's current visual position
    const targetWorldX = unitPos.x;
    const targetWorldZ = unitPos.z;
    // Target the unit's center height (half its size above ground)
    const unit = this.unitManager.getUnit(targetUnitId);
    const unitTileSize = unit?.tileSize ?? 1;
    const targetWorldY = TILE_SIZE * unitTileSize * 0.4; // Target center mass

    // Check if in range (use building center for range check)
    const { centerX: buildingCenterX, centerZ: buildingCenterZ } =
      this.getBuildingCenterWorld(building);
    const distFromCenter = Math.sqrt(
      Math.pow(targetWorldX - buildingCenterX, 2) + Math.pow(targetWorldZ - buildingCenterZ, 2)
    );
    const rangeInMeters = building.range * TILE_SIZE;
    if (distFromCenter > rangeInMeters) {
      return false;
    }

    // Check if target is within turret's field of view (yaw and pitch bounds)
    const viewCheck = this.isTargetInTurretView(building, targetWorldX, targetWorldZ, targetWorldY);
    if (!viewCheck.inView) {
      return false;
    }

    if (viewCheck.requiredYaw === undefined || viewCheck.requiredPitch === undefined) {
      return false;
    }

    // Set turret rotation to the calculated values
    building.targetRotation = viewCheck.requiredYaw;
    building.targetPitch = viewCheck.requiredPitch;

    // Queue the attack - it will fire when rotation completes
    this.pendingAttacks.set(buildingId, {
      targetWorldX,
      targetWorldZ,
      targetWorldY,
      color: building.laserColor || '#ff0000',
    });

    return true;
  }

  /**
   * Get the current visual world position of a unit
   * Useful for external systems that need to track unit positions
   */
  public getUnitWorldPosition(unitId: string): { x: number; y: number; z: number } | null {
    if (!this.unitManager) return null;
    const pos = this.unitManager.getUnitWorldPosition(unitId);
    if (!pos) return null;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  /**
   * Move a unit to a world position (dev/manual orders)
   */
  public moveUnitToWorld(unitId: string, worldX: number, worldZ: number): void {
    if (!this.unitManager) return;
    this.unitManager.setUnitTargetWorldPosition(unitId, worldX, worldZ);
  }

  /**
   * Get all unit IDs currently in the arena
   */
  public getAllUnitIds(): string[] {
    if (!this.unitManager) return [];
    return this.unitManager.getAllUnitIds();
  }

  public removeUnit(unitId: string): void {
    this.unitManager?.removeUnit(unitId);
  }

  public getBuildingFootprint(buildingId: string): {
    x: number;
    z: number;
    width: number;
    height: number;
  } | null {
    const building = this.buildingData.get(buildingId);
    if (!building) return null;
    return { x: building.x, z: building.z, width: building.tileWidth, height: building.tileHeight };
  }

  public destroyBuilding(buildingId: string): void {
    const building = this.buildingData.get(buildingId);
    if (!building) return;

    this.activeKillCommands.delete(buildingId);
    this.pendingAttacks.delete(buildingId);

    building.healthBarPlane?.dispose();
    building.healthBarTexture?.dispose();
    building.cooldownBarPlane?.dispose();
    building.cooldownBarTexture?.dispose();
    building.mesh.dispose();

    this.buildingData.delete(buildingId);

    if (this.selectedBuildingId === buildingId) {
      this.hideSelectionRing();
      this.hideRangeCircle();
      this.selectedBuildingId = null;
    }
  }

  // ==================== KILL COMMANDS ====================

  /**
   * Issue a kill command - turret will track and attack the unit until dead
   * Follows the turret's attackSpeed and damage stats
   */
  public issueKillCommand(buildingId: string, targetUnitId: string): boolean {
    const building = this.buildingData.get(buildingId);
    if (!building) {
      return false;
    }

    if (!this.unitManager) {
      return false;
    }

    if (!this.unitManager.isUnitAlive(targetUnitId)) {
      return false;
    }

    if (building.damage <= 0) {
      return false;
    }

    if (!building.hasBarrelLine) {
      return false;
    }

    // Start tracking this target
    this.activeKillCommands.set(buildingId, {
      targetUnitId,
      nextFireTime: performance.now(), // Fire immediately
      attackSpeed: building.attackSpeed,
      damage: building.damage,
    });

    return true;
  }

  /**
   * Cancel a kill command
   */
  public cancelKillCommand(buildingId: string): void {
    this.activeKillCommands.delete(buildingId);
  }

  /**
   * Cancel all kill commands
   */
  public cancelAllKillCommands(): void {
    this.activeKillCommands.clear();
  }

  /**
   * Check if a building has an active kill command
   */
  public hasKillCommand(buildingId: string): boolean {
    return this.activeKillCommands.has(buildingId);
  }

  /**
   * Process active kill commands (called each frame)
   */
  private updateKillCommands(now: number): void {
    if (!this.unitManager) return;

    for (const [buildingId, command] of this.activeKillCommands) {
      if (!this.unitManager.isUnitAlive(command.targetUnitId)) {
        this.activeKillCommands.delete(buildingId);
        continue;
      }

      const targetPos = this.unitManager.getUnitWorldPosition(command.targetUnitId);
      if (!targetPos) {
        this.activeKillCommands.delete(buildingId);
        continue;
      }

      const building = this.buildingData.get(buildingId);
      if (!building) {
        this.activeKillCommands.delete(buildingId);
        continue;
      }

      const unit = this.unitManager.getUnit(command.targetUnitId);
      const unitTileSize = unit?.tileSize ?? 1;
      const targetWorldY = TILE_SIZE * unitTileSize * 0.4;

      const { centerX: buildingCenterX, centerZ: buildingCenterZ } =
        this.getBuildingCenterWorld(building);
      const distFromCenter = Math.sqrt(
        Math.pow(targetPos.x - buildingCenterX, 2) + Math.pow(targetPos.z - buildingCenterZ, 2)
      );
      const rangeInMeters = building.range * TILE_SIZE;

      if (distFromCenter > rangeInMeters) {
        continue;
      }

      const viewCheck = this.isTargetInTurretView(building, targetPos.x, targetPos.z, targetWorldY);
      if (!viewCheck.inView) {
        continue;
      }

      if (viewCheck.requiredYaw === undefined || viewCheck.requiredPitch === undefined) {
        continue;
      }

      building.targetRotation = viewCheck.requiredYaw;
      building.targetPitch = viewCheck.requiredPitch;

      const alignmentAngle = this.getTurretAlignmentAngle(
        building,
        targetPos.x,
        targetPos.z,
        targetWorldY
      );
      const aligned =
        (alignmentAngle !== null && alignmentAngle <= TURRET_ALIGNMENT_TOLERANCE) ||
        this.isTurretRotationAligned(building);
      if (!aligned) {
        continue;
      }

      if (now < command.nextFireTime) {
        continue;
      }

      this.executeAttack(buildingId, building, {
        targetWorldX: targetPos.x,
        targetWorldZ: targetPos.z,
        targetWorldY,
        color: building.laserColor || '#ff0000',
      });

      building.lastFireTime = now;

      const result = this.unitManager.damageUnit(command.targetUnitId, command.damage);
      if (result && !result.alive) {
        this.activeKillCommands.delete(buildingId);
      }

      const fireInterval = 1000 / command.attackSpeed;
      command.nextFireTime = now + fireInterval;
    }
  }

  private findNearestEnemyUnit(
    building: typeof this.buildingData extends Map<string, infer V> ? V : never,
    centerX: number,
    centerZ: number,
    rangeInMeters: number
  ): { id: string; pos: Vector3; unit: UnitVisual } | null {
    if (!this.unitManager) return null;

    let nearest: { id: string; pos: Vector3; unit: UnitVisual; dist: number } | null = null;

    for (const unitId of this.unitManager.getAllUnitIds()) {
      const unit = this.unitManager.getUnit(unitId);
      if (!unit || unit.state === UnitState.DEAD) continue;
      if (unit.ownerId === building.ownerId) continue;

      const pos = this.unitManager.getUnitWorldPosition(unitId);
      if (!pos) continue;

      const dist = Math.sqrt(Math.pow(pos.x - centerX, 2) + Math.pow(pos.z - centerZ, 2));
      if (dist > rangeInMeters) continue;

      if (!nearest || dist < nearest.dist) {
        nearest = { id: unitId, pos, unit, dist };
      }
    }

    if (!nearest) return null;
    return { id: nearest.id, pos: nearest.pos, unit: nearest.unit };
  }

  private updateAutoTargeting(now: number): void {
    if (!this.unitManager) return;

    for (const [buildingId, building] of this.buildingData) {
      if (this.activeKillCommands.has(buildingId)) {
        continue;
      }

      if (building.damage <= 0 || building.range <= 0 || building.attackSpeed <= 0) {
        continue;
      }

      if (!building.hasBarrelLine) {
        continue;
      }

      const { centerX: buildingCenterX, centerZ: buildingCenterZ } =
        this.getBuildingCenterWorld(building);
      const rangeInMeters = building.range * TILE_SIZE;

      let targetId = building.autoTargetId;
      let targetUnit = targetId ? this.unitManager.getUnit(targetId) : undefined;
      let targetPos = targetId ? this.unitManager.getUnitWorldPosition(targetId) : null;

      if (targetId && targetUnit && targetUnit.state !== UnitState.DEAD && targetPos) {
        const distFromCenter = Math.sqrt(
          Math.pow(targetPos.x - buildingCenterX, 2) + Math.pow(targetPos.z - buildingCenterZ, 2)
        );
        if (distFromCenter > rangeInMeters) {
          targetId = null;
          targetUnit = undefined;
          targetPos = null;
          building.autoTargetId = null;
          building.autoTargetSwitchAt = 0;
        }
      } else {
        targetId = null;
        targetUnit = undefined;
        targetPos = null;
        building.autoTargetId = null;
        building.autoTargetSwitchAt = 0;
      }

      if (!targetId && now >= building.autoTargetSwitchAt) {
        const nearest = this.findNearestEnemyUnit(
          building,
          buildingCenterX,
          buildingCenterZ,
          rangeInMeters
        );
        if (nearest) {
          targetId = nearest.id;
          targetUnit = nearest.unit;
          targetPos = nearest.pos;
          building.autoTargetId = nearest.id;
          building.autoTargetSwitchAt = now + AUTO_TARGET_COOLDOWN_MS;
        }
      }

      if (!targetId || !targetUnit || !targetPos) {
        continue;
      }

      const resolvedTargetPos = targetPos;

      const unitTileSize = targetUnit.tileSize ?? 1;
      const targetWorldY = TILE_SIZE * unitTileSize * 0.4;

      const viewCheck = this.isTargetInTurretView(
        building,
        resolvedTargetPos.x,
        resolvedTargetPos.z,
        targetWorldY
      );
      if (!viewCheck.inView) {
        continue;
      }

      if (viewCheck.requiredYaw === undefined || viewCheck.requiredPitch === undefined) {
        continue;
      }

      building.targetRotation = viewCheck.requiredYaw;
      building.targetPitch = viewCheck.requiredPitch;

      const alignmentAngle = this.getTurretAlignmentAngle(
        building,
        resolvedTargetPos.x,
        resolvedTargetPos.z,
        targetWorldY
      );
      const aligned =
        (alignmentAngle !== null && alignmentAngle <= TURRET_ALIGNMENT_TOLERANCE) ||
        this.isTurretRotationAligned(building);
      if (!aligned) {
        continue;
      }

      const fireInterval = 1000 / building.attackSpeed;
      if (now - building.lastFireTime < fireInterval) {
        continue;
      }

      this.executeAttack(buildingId, building, {
        targetWorldX: resolvedTargetPos.x,
        targetWorldZ: resolvedTargetPos.z,
        targetWorldY,
        color: building.laserColor || '#ff0000',
      });

      building.lastFireTime = now;

      const result = this.unitManager.damageUnit(targetId, building.damage);
      if (result && !result.alive) {
        building.autoTargetId = null;
      }
    }
  }
}
