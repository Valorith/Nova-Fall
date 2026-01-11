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
} from '@babylonjs/core';
import type {
  CombatState,
  CombatSetup,
  TileType,
  ArenaPosition,
} from '@nova-fall/shared';

// Arena constants
export const ARENA_SIZE = 60; // 60x60 tiles
export const TILE_SIZE = 2; // 2 meters per tile
export const ARENA_METERS = ARENA_SIZE * TILE_SIZE; // 120m x 120m

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
  private hqMesh: Mesh | null = null;
  // Arena layout stored for future tile-specific logic
  // @ts-expect-error - Will be used when implementing tile-based obstacles
  private _arenaLayout: TileType[][] | null = null;

  // State
  private _isRunning = false;
  private _battleId: string | null = null;

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

    // Camera limits
    camera.lowerRadiusLimit = 30; // Minimum zoom
    camera.upperRadiusLimit = 200; // Maximum zoom
    camera.lowerBetaLimit = 0.2; // Minimum tilt (almost top-down)
    camera.upperBetaLimit = Math.PI / 2.5; // Maximum tilt

    // Enable camera controls
    camera.attachControl(this.canvas, true);

    // Camera movement settings
    camera.panningSensibility = 100; // Right-click panning
    camera.wheelPrecision = 20; // Zoom sensitivity
    camera.angularSensibilityX = 500; // Rotation sensitivity
    camera.angularSensibilityY = 500;

    // Smooth movement
    camera.inertia = 0.9;

    return camera;
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

    this.engine.runRenderLoop(() => {
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

    // Clear existing arena
    this.clearArena();

    // Build the arena terrain
    this.buildArena(setup.arenaLayout, setup.nodeType);

    // Create HQ
    this.createHQ(setup.hqMaxHealth);

    // Pre-place defender buildings
    for (const building of setup.defenderBuildings) {
      this.placeBuilding(building.buildingTypeId, building.position, building.rotation);
    }

    // Reset camera to default position
    this.resetCamera();
  }

  /**
   * Clear the current arena
   */
  private clearArena(): void {
    // Dispose of existing meshes
    this.groundMesh?.dispose();
    this.groundMesh = null;

    this.hqMesh?.dispose();
    this.hqMesh = null;

    // TODO: Clear units, buildings, projectiles
  }

  /**
   * Build the arena terrain
   */
  private buildArena(_layout: TileType[][], nodeType: string): void {
    // Create base ground
    this.groundMesh = MeshBuilder.CreateGround(
      'ground',
      { width: ARENA_METERS, height: ARENA_METERS },
      this.scene
    );
    this.groundMesh.position = new Vector3(ARENA_METERS / 2, 0, ARENA_METERS / 2);

    // Ground material
    const groundMat = new StandardMaterial('groundMat', this.scene);
    groundMat.diffuseColor = this.getGroundColor(nodeType);
    groundMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this.groundMesh.material = groundMat;
    this.groundMesh.receiveShadows = true;

    // Add grid overlay for visual clarity
    this.createGridOverlay();

    // Mark spawn zones (arena perimeter)
    this.createSpawnZones();
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
      HQ: new Color3(0.3, 0.3, 0.4), // Player themed
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
   * Create the HQ structure at center of arena
   */
  private createHQ(maxHealth: number): void {
    // HQ occupies center 2x2 tiles
    const hqSize = TILE_SIZE * 2;
    const centerX = ARENA_METERS / 2;
    const centerZ = ARENA_METERS / 2;

    // Main HQ building (placeholder - will be replaced with loaded model)
    this.hqMesh = MeshBuilder.CreateBox(
      'hq',
      { width: hqSize * 0.8, height: hqSize, depth: hqSize * 0.8 },
      this.scene
    );
    this.hqMesh.position = new Vector3(centerX, hqSize / 2, centerZ);

    // HQ material
    const hqMat = new StandardMaterial('hqMat', this.scene);
    hqMat.diffuseColor = new Color3(0.6, 0.6, 0.7);
    hqMat.specularColor = new Color3(0.3, 0.3, 0.3);
    hqMat.emissiveColor = new Color3(0.1, 0.1, 0.2);
    this.hqMesh.material = hqMat;

    // Add to shadow generator
    if (this.shadowGenerator) {
      this.shadowGenerator.addShadowCaster(this.hqMesh);
    }

    // Add to glow layer
    if (this.glowLayer) {
      this.glowLayer.addIncludedOnlyMesh(this.hqMesh);
    }

    // Store max health for later use
    (this.hqMesh as unknown as { maxHealth: number }).maxHealth = maxHealth;
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
   * Update state from server (interpolation will be added later)
   */
  public updateState(state: CombatState): void {
    // TODO: Update units, projectiles, effects, HQ health
    // For now just log
    console.debug('Combat state update:', state.tick);
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
   * Dispose of all resources
   */
  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.stop();
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
}
