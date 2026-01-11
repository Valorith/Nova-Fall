/**
 * FlowField - Dijkstra-based pathfinding for unit movement toward Core
 *
 * Flow fields are computed once when the arena is loaded, then units
 * simply look up their tile to get the direction to move. This is
 * efficient for many units moving toward the same target.
 *
 * The flow field handles:
 * - Distance calculation from every tile to the Core
 * - Direction vectors pointing toward the Core
 * - Obstacle avoidance (blocked tiles)
 * - Debug visualization
 */

import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
} from '@babylonjs/core';
import type { Scene, Mesh } from '@babylonjs/core';
import type { TileType, ArenaPosition } from '@nova-fall/shared';
import { TILE_SIZE, ARENA_SIZE } from './CombatEngine';

// Direction constants (8 directions)
const DIRECTIONS = [
  { dx: 0, dz: -1 },  // North
  { dx: 1, dz: -1 },  // NE
  { dx: 1, dz: 0 },   // East
  { dx: 1, dz: 1 },   // SE
  { dx: 0, dz: 1 },   // South
  { dx: -1, dz: 1 },  // SW
  { dx: -1, dz: 0 },  // West
  { dx: -1, dz: -1 }, // NW
];

// Cost for diagonal vs cardinal movement
const CARDINAL_COST = 1.0;
const DIAGONAL_COST = 1.414; // sqrt(2)

/**
 * Flow field data structure
 */
export interface FlowFieldData {
  width: number;
  height: number;
  distances: number[][]; // Distance to Core for each tile
  directions: number[][]; // Direction index (0-7) or -1 if blocked/unreachable
}

export class FlowField {
  private scene: Scene;
  private data: FlowFieldData | null = null;
  private debugContainer: TransformNode | null = null;
  private debugArrows: Mesh[] = [];
  private isDebugVisible = false;

  // Core position (center of arena by default)
  private coreX: number = Math.floor(ARENA_SIZE / 2);
  private coreZ: number = Math.floor(ARENA_SIZE / 2);

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Helper to safely get/set 2D array values
   */
  private get2D<T>(arr: T[][], x: number, z: number, defaultVal: T): T {
    const row = arr[x];
    if (!row) return defaultVal;
    return row[z] ?? defaultVal;
  }

  private set2D<T>(arr: T[][], x: number, z: number, val: T): void {
    const row = arr[x];
    if (row) {
      row[z] = val;
    }
  }

  /**
   * Generate the flow field from arena layout
   */
  generate(layout: TileType[][]): void {
    const width = ARENA_SIZE;
    const height = ARENA_SIZE;

    // Initialize distances to infinity
    const distances: number[][] = [];
    for (let x = 0; x < width; x++) {
      const row: number[] = [];
      for (let z = 0; z < height; z++) {
        row[z] = Infinity;
      }
      distances[x] = row;
    }

    // Initialize directions to -1 (no direction)
    const directions: number[][] = [];
    for (let x = 0; x < width; x++) {
      const row: number[] = [];
      for (let z = 0; z < height; z++) {
        row[z] = -1;
      }
      directions[x] = row;
    }

    // Create blocked tile map
    const blocked: boolean[][] = [];
    for (let x = 0; x < width; x++) {
      const row: boolean[] = [];
      for (let z = 0; z < height; z++) {
        row[z] = false;
      }
      blocked[x] = row;
    }

    // Mark blocked tiles from layout
    for (let x = 0; x < Math.min(layout.length, width); x++) {
      const row = layout[x];
      if (!row) continue;
      for (let z = 0; z < Math.min(row.length, height); z++) {
        if (row[z] === 'blocked') {
          this.set2D(blocked, x, z, true);
        }
      }
    }

    // Core occupies center 2x2 tiles - mark as target (distance 0)
    const corePositions: ArenaPosition[] = [
      { x: this.coreX, z: this.coreZ },
      { x: this.coreX + 1, z: this.coreZ },
      { x: this.coreX, z: this.coreZ + 1 },
      { x: this.coreX + 1, z: this.coreZ + 1 },
    ];

    // Priority queue for Dijkstra (simple array, sorted by distance)
    const queue: { x: number; z: number; dist: number }[] = [];

    // Initialize Core tiles with distance 0
    for (const pos of corePositions) {
      if (pos.x >= 0 && pos.x < width && pos.z >= 0 && pos.z < height) {
        this.set2D(distances, pos.x, pos.z, 0);
        queue.push({ x: pos.x, z: pos.z, dist: 0 });
      }
    }

    // Dijkstra's algorithm - expand outward from Core
    while (queue.length > 0) {
      // Get tile with smallest distance
      queue.sort((a, b) => a.dist - b.dist);
      const current = queue.shift();
      if (!current) break;

      // Skip if we've already found a better path
      if (current.dist > this.get2D(distances, current.x, current.z, Infinity)) {
        continue;
      }

      // Check all 8 neighbors
      for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
        const dir = DIRECTIONS[dirIdx];
        if (!dir) continue;

        const nx = current.x + dir.dx;
        const nz = current.z + dir.dz;

        // Bounds check
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) {
          continue;
        }

        // Skip blocked tiles
        if (this.get2D(blocked, nx, nz, false)) {
          continue;
        }

        // Calculate movement cost (diagonal is more expensive)
        const isDiagonal = dir.dx !== 0 && dir.dz !== 0;
        const moveCost = isDiagonal ? DIAGONAL_COST : CARDINAL_COST;

        // Check for diagonal blocking (can't cut corners)
        if (isDiagonal) {
          const blocked1 = this.get2D(blocked, current.x + dir.dx, current.z, false);
          const blocked2 = this.get2D(blocked, current.x, current.z + dir.dz, false);
          if (blocked1 || blocked2) {
            continue; // Can't move diagonally if adjacent tiles are blocked
          }
        }

        const newDist = current.dist + moveCost;

        // If we found a shorter path
        if (newDist < this.get2D(distances, nx, nz, Infinity)) {
          this.set2D(distances, nx, nz, newDist);
          // Direction points TOWARD Core (opposite of expansion direction)
          this.set2D(directions, nx, nz, (dirIdx + 4) % 8);
          queue.push({ x: nx, z: nz, dist: newDist });
        }
      }
    }

    this.data = { width, height, distances, directions };
  }

  /**
   * Get the flow direction at a grid position
   * Returns a normalized Vector3 or null if blocked/unreachable
   */
  getDirection(x: number, z: number): Vector3 | null {
    if (!this.data) return null;

    // Bounds check
    if (x < 0 || x >= this.data.width || z < 0 || z >= this.data.height) {
      return null;
    }

    const dirIdx = this.data.directions[x]?.[z];
    if (dirIdx === undefined || dirIdx < 0) {
      return null; // Blocked or unreachable
    }

    const dir = DIRECTIONS[dirIdx];
    if (!dir) return null;
    return new Vector3(dir.dx, 0, dir.dz).normalize();
  }

  /**
   * Get the distance to Core from a grid position
   * Returns Infinity if blocked/unreachable
   */
  getDistance(x: number, z: number): number {
    if (!this.data) return Infinity;

    if (x < 0 || x >= this.data.width || z < 0 || z >= this.data.height) {
      return Infinity;
    }

    return this.data.distances[x]?.[z] ?? Infinity;
  }

  /**
   * Check if a position is at or adjacent to the Core
   */
  isAtCore(x: number, z: number): boolean {
    if (!this.data) return false;
    return this.getDistance(x, z) <= DIAGONAL_COST;
  }

  /**
   * Get the next tile position following the flow field
   */
  getNextTile(x: number, z: number): ArenaPosition | null {
    if (!this.data) return null;

    const dirIdx = this.data.directions[x]?.[z];
    if (dirIdx === undefined || dirIdx < 0) return null;

    const dir = DIRECTIONS[dirIdx];
    if (!dir) return null;
    return { x: x + dir.dx, z: z + dir.dz };
  }

  /**
   * Toggle debug visualization
   */
  toggleDebug(): void {
    this.isDebugVisible = !this.isDebugVisible;

    if (this.isDebugVisible) {
      this.createDebugVisualization();
    } else {
      this.clearDebugVisualization();
    }
  }

  /**
   * Create debug arrows showing flow directions
   */
  private createDebugVisualization(): void {
    if (!this.data) return;

    this.clearDebugVisualization();

    this.debugContainer = new TransformNode('flowFieldDebug', this.scene);

    const arrowMat = new StandardMaterial('flowArrowMat', this.scene);
    arrowMat.diffuseColor = new Color3(0.2, 0.8, 0.2);
    arrowMat.emissiveColor = new Color3(0.1, 0.4, 0.1);

    // Create arrows for every 3rd tile (to avoid clutter)
    const step = 3;
    for (let x = 0; x < this.data.width; x += step) {
      for (let z = 0; z < this.data.height; z += step) {
        const dirIdx = this.data.directions[x]?.[z];
        if (dirIdx === undefined || dirIdx < 0) continue;

        const dir = DIRECTIONS[dirIdx];
        if (!dir) continue;

        const worldX = x * TILE_SIZE + TILE_SIZE / 2;
        const worldZ = z * TILE_SIZE + TILE_SIZE / 2;

        // Create arrow (simple cylinder pointing in direction)
        const arrow = MeshBuilder.CreateCylinder(
          `arrow_${x}_${z}`,
          { height: TILE_SIZE * 0.8, diameter: 0.2, tessellation: 6 },
          this.scene
        );
        arrow.parent = this.debugContainer;
        arrow.position = new Vector3(worldX, 0.5, worldZ);
        arrow.material = arrowMat;

        // Rotate arrow to point in flow direction
        const angle = Math.atan2(dir.dx, dir.dz);
        arrow.rotation.x = Math.PI / 2;
        arrow.rotation.z = -angle;

        this.debugArrows.push(arrow);
      }
    }
  }

  /**
   * Clear debug visualization
   */
  private clearDebugVisualization(): void {
    for (const arrow of this.debugArrows) {
      arrow.dispose();
    }
    this.debugArrows = [];

    this.debugContainer?.dispose();
    this.debugContainer = null;
  }

  /**
   * Check if debug is visible
   */
  get debugVisible(): boolean {
    return this.isDebugVisible;
  }

  /**
   * Update obstacle at position and regenerate affected area
   * (For future use when buildings are placed/destroyed)
   */
  updateObstacle(_x: number, _z: number, _blocked: boolean, layout: TileType[][]): void {
    // For now, just regenerate the entire field
    // Could be optimized to only update affected tiles using _x, _z, _blocked
    this.generate(layout);

    // Refresh debug if visible
    if (this.isDebugVisible) {
      this.createDebugVisualization();
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearDebugVisualization();
    this.data = null;
  }
}
