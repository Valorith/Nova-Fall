import { Container, Graphics, RenderTexture, Sprite, type Application } from 'pixi.js';
import type { MapNode } from '@nova-fall/shared';
import { TerrainType, TERRAIN_CONFIGS } from '@nova-fall/shared';
import type { Camera } from '../engine/Camera';
import type { ZoomLevel } from '../engine/GameEngine';
import {
  hexToPixel,
  pixelToHex,
  hexKey,
  HEX_SIZE,
} from '../utils/hexGrid';

// Connection data from API/mock
interface ConnectionData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  roadType: string;
  dangerLevel: number;
}

// Extended map data including terrain
export interface HexMapData {
  nodes: MapNode[];
  connections: ConnectionData[];
  terrain: Map<string, TerrainType>; // hexKey -> terrain type
  gridBounds: { minQ: number; maxQ: number; minR: number; maxR: number };
}

// Neutral color for unclaimed nodes
const NEUTRAL_NODE_COLOR = 0x505050;

// Generate a consistent color from a player ID using hashing
function getPlayerColor(ownerId: string): number {
  // Better hash function using golden ratio for good distribution
  let hash = 0;
  for (let i = 0; i < ownerId.length; i++) {
    const char = ownerId.charCodeAt(i);
    // Use golden ratio prime (2654435769) for better distribution
    hash = Math.imul(hash ^ char, 2654435769);
  }
  hash = hash >>> 0; // Convert to unsigned 32-bit

  // Use golden angle (137.5°) spacing for visually distinct colors
  // This ensures even sequential IDs get well-separated hues
  const goldenAngle = 137.508;
  const hue = (hash * goldenAngle) % 360;
  const saturation = 65; // Good saturation for visibility
  const lightness = 50; // Mid-range lightness

  // Convert HSL to RGB then to hex
  return hslToHex(hue, saturation, lightness);
}

// Convert HSL to hex color
function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return (red << 16) | (green << 8) | blue;
}

// Draw a hexagon path (flat-top orientation)
// Vertices at 0°, 60°, 120°, 180°, 240°, 300° creates flat edges at top/bottom
function drawHexPath(g: Graphics, cx: number, cy: number, size: number): void {
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // Flat-top: vertices at left/right, flat edges at top/bottom
    vertices.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }

  const first = vertices[0];
  if (!first) return;
  g.moveTo(first.x, first.y);
  for (let i = 1; i < 6; i++) {
    const v = vertices[i];
    if (v) g.lineTo(v.x, v.y);
  }
  g.closePath();
}

// Draw a 5-pointed star for HQ indicator
function drawStarPath(g: Graphics, cx: number, cy: number, outerRadius: number, innerRadius: number): void {
  const points = 5;
  const step = Math.PI / points;
  const startAngle = -Math.PI / 2; // Point upward

  g.moveTo(
    cx + outerRadius * Math.cos(startAngle),
    cy + outerRadius * Math.sin(startAngle)
  );

  for (let i = 1; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = startAngle + i * step;
    g.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }

  g.closePath();
}

export class WorldRenderer {
  // Layer containers
  private terrainLayer: Container;
  private connectionLayer: Container;
  private nodeLayer: Container;
  private selectionLayer: Container;

  // Graphics for batch rendering
  private terrainGraphics: Graphics;
  private connectionGraphics: Graphics;
  private nodeGraphics: Graphics;
  private selectionGraphics: Graphics;

  // Cached textures and sprites for performance
  private terrainTexture: RenderTexture | null = null;
  private terrainSprite: Sprite | null = null;
  private nodeTexture: RenderTexture | null = null;
  private nodeSprite: Sprite | null = null;
  private app: Application | null = null;

  // Data
  private mapData: HexMapData | null = null;
  private nodesByHexKey = new Map<string, MapNode>();

  // Selection state
  private selectedNodeIds = new Set<string>();
  private highlightedNodeId: string | null = null;

  constructor() {
    this.terrainLayer = new Container();
    this.terrainLayer.label = 'terrain';

    this.connectionLayer = new Container();
    this.connectionLayer.label = 'connections';

    this.nodeLayer = new Container();
    this.nodeLayer.label = 'nodes';

    this.selectionLayer = new Container();
    this.selectionLayer.label = 'selection';

    this.terrainGraphics = new Graphics();
    this.connectionGraphics = new Graphics();
    this.nodeGraphics = new Graphics();
    this.selectionGraphics = new Graphics();

    this.connectionLayer.addChild(this.connectionGraphics);
    this.selectionLayer.addChild(this.selectionGraphics);
  }

  setApp(app: Application): void {
    this.app = app;
  }

  addToContainer(parent: Container): void {
    parent.addChild(this.terrainLayer);
    parent.addChild(this.connectionLayer);
    parent.addChild(this.nodeLayer);
    parent.addChild(this.selectionLayer);
  }

  setCamera(_camera: Camera): void {
    // No-op: camera not needed with texture caching
  }

  setZoomLevel(_level: ZoomLevel): void {
    // Future: adjust detail level
  }

  // Main entry point for loading map data
  setMapData(nodes: MapNode[], connections: ConnectionData[]): void {
    // Generate terrain and grid bounds from node positions
    const mapData = this.generateMapData(nodes, connections);
    this.mapData = mapData;

    // Build node lookup
    this.nodesByHexKey.clear();
    for (const node of nodes) {
      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      this.nodesByHexKey.set(hexKey(hex), node);
    }

    this.clearAll();
    this.renderTerrain();
    this.renderConnections();
    this.renderNodes();
  }

  // Generate terrain for the grid using flood-fill to match GameView approach
  private generateMapData(nodes: MapNode[], connections: ConnectionData[]): HexMapData {
    // Use same bounds as GameView generator
    const GRID_PADDING = 150;
    const GRID_SIZE_PX = 1600;
    const minPx = GRID_PADDING;
    const maxPx = GRID_PADDING + GRID_SIZE_PX;

    // Helper to check if hex is within square pixel bounds
    const isInBounds = (hex: { q: number; r: number }): boolean => {
      const pixel = hexToPixel(hex);
      return pixel.x >= minPx && pixel.x <= maxPx && pixel.y >= minPx && pixel.y <= maxPx;
    };

    // Build set of node hex positions
    const nodeHexes = new Set<string>();
    for (const node of nodes) {
      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      nodeHexes.add(hexKey(hex));
    }

    // Use flood-fill to find ALL hexes within the square pixel bounds
    // This ensures we don't miss any hexes in corners
    const allHexes: { q: number; r: number }[] = [];
    const visited = new Set<string>();
    const frontier: { q: number; r: number }[] = [];

    // Start from center of the grid
    const startHex = { q: 20, r: 15 };
    if (isInBounds(startHex)) {
      allHexes.push(startHex);
      visited.add(hexKey(startHex));
    }

    // Get neighbors of start hex
    const directions = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];

    for (const dir of directions) {
      const neighbor = { q: startHex.q + dir.q, r: startHex.r + dir.r };
      if (isInBounds(neighbor)) {
        frontier.push(neighbor);
      }
    }

    // Flood-fill to find all hexes in bounds
    while (frontier.length > 0) {
      const hex = frontier.pop()!;
      const key = hexKey(hex);
      if (visited.has(key)) continue;
      visited.add(key);

      if (isInBounds(hex)) {
        allHexes.push(hex);
        for (const dir of directions) {
          const neighbor = { q: hex.q + dir.q, r: hex.r + dir.r };
          if (!visited.has(hexKey(neighbor))) {
            frontier.push(neighbor);
          }
        }
      }
    }

    // Generate terrain for hexes that aren't nodes
    const terrain = new Map<string, TerrainType>();

    // Seeded random for consistent terrain
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const terrainTypes = [
      TerrainType.PLAINS,
      TerrainType.PLAINS,
      TerrainType.PLAINS, // Weight towards plains
      TerrainType.FOREST,
      TerrainType.FOREST,
      TerrainType.MOUNTAIN,
      TerrainType.MARSH,
      TerrainType.DESERT,
      TerrainType.TUNDRA,
    ];

    // Track bounds for metadata
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;

    for (const hex of allHexes) {
      minQ = Math.min(minQ, hex.q);
      maxQ = Math.max(maxQ, hex.q);
      minR = Math.min(minR, hex.r);
      maxR = Math.max(maxR, hex.r);

      const key = hexKey(hex);
      if (!nodeHexes.has(key)) {
        // Assign random terrain
        const terrainIndex = Math.floor(random() * terrainTypes.length);
        const terrainType = terrainTypes[terrainIndex] ?? TerrainType.PLAINS;
        terrain.set(key, terrainType);
      }
    }

    // Add some water features (clusters) within bounds
    const waterSeeds = 3;
    for (let i = 0; i < waterSeeds; i++) {
      const centerQ = minQ + Math.floor(random() * (maxQ - minQ));
      const centerR = minR + Math.floor(random() * (maxR - minR));
      const radius = 1 + Math.floor(random() * 2);

      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (Math.abs(dq + dr) <= radius) {
            const key = hexKey({ q: centerQ + dq, r: centerR + dr });
            if (terrain.has(key) && random() > 0.3) {
              terrain.set(key, TerrainType.WATER);
            }
          }
        }
      }
    }

    return {
      nodes,
      connections,
      terrain,
      gridBounds: { minQ, maxQ, minR, maxR },
    };
  }

  clearAll(): void {
    this.terrainGraphics.clear();
    this.connectionGraphics.clear();
    this.nodeGraphics.clear();
    this.selectionGraphics.clear();
    this.selectedNodeIds.clear();
    this.highlightedNodeId = null;

    // Clean up textures
    if (this.terrainTexture) {
      this.terrainTexture.destroy(true);
      this.terrainTexture = null;
    }
    if (this.terrainSprite) {
      this.terrainSprite.destroy();
      this.terrainSprite = null;
    }
    if (this.nodeTexture) {
      this.nodeTexture.destroy(true);
      this.nodeTexture = null;
    }
    if (this.nodeSprite) {
      this.nodeSprite.destroy();
      this.nodeSprite = null;
    }

    this.terrainLayer.removeChildren();
    this.nodeLayer.removeChildren();
    this.selectionLayer.removeChildren();
    this.selectionLayer.addChild(this.selectionGraphics);
  }

  // Render all terrain hexes and cache as texture for performance
  private renderTerrain(): void {
    if (!this.mapData || !this.app) return;

    const g = this.terrainGraphics;
    g.clear();

    const { terrain } = this.mapData;

    // Define texture bounds (match the square grid)
    const TEXTURE_SIZE = 2000; // Covers the full map area

    // Group hexes by terrain type for batch rendering
    const hexesByType = new Map<number, { x: number; y: number }[]>();

    for (const [key, terrainType] of terrain) {
      const [qStr, rStr] = key.split(',');
      const q = parseInt(qStr ?? '0', 10);
      const r = parseInt(rStr ?? '0', 10);
      const pixel = hexToPixel({ q, r });

      const config = TERRAIN_CONFIGS[terrainType];
      const fillColor = parseInt(config.color.replace('#', ''), 16);

      const existing = hexesByType.get(fillColor);
      if (existing) {
        existing.push(pixel);
      } else {
        hexesByType.set(fillColor, [pixel]);
      }
    }

    // Render each terrain type as a batch (muted appearance)
    for (const [color, positions] of hexesByType) {
      for (const pixel of positions) {
        // Muted fill
        drawHexPath(g, pixel.x, pixel.y, HEX_SIZE - 1);
        g.fill({ color, alpha: 0.4 });
        // Subtle dark border
        g.setStrokeStyle({ width: 1, color: 0x222222, alpha: 0.5 });
        drawHexPath(g, pixel.x, pixel.y, HEX_SIZE - 1);
        g.stroke();
      }
    }

    // Clean up old texture and sprite
    if (this.terrainTexture) {
      this.terrainTexture.destroy(true);
      this.terrainTexture = null;
    }
    if (this.terrainSprite) {
      this.terrainSprite.destroy();
      this.terrainSprite = null;
    }

    // Create a RenderTexture and cache the terrain
    this.terrainTexture = RenderTexture.create({
      width: TEXTURE_SIZE,
      height: TEXTURE_SIZE,
    });

    // Render graphics to texture
    this.app.renderer.render({
      container: g,
      target: this.terrainTexture,
    });

    // Create sprite from texture
    this.terrainSprite = new Sprite(this.terrainTexture);
    this.terrainSprite.x = 0;
    this.terrainSprite.y = 0;

    // Add sprite to terrain layer
    this.terrainLayer.removeChildren();
    this.terrainLayer.addChild(this.terrainSprite);

    // Clear the graphics (no longer needed in display)
    g.clear();
  }

  // Render connections between nodes (simplified for performance)
  private renderConnections(): void {
    if (!this.mapData) return;

    const g = this.connectionGraphics;
    g.clear();

    // Draw all connections with a single stroke style for performance
    g.setStrokeStyle({ width: 2, color: 0x666666, alpha: 0.6 });

    for (const conn of this.mapData.connections) {
      const fromHex = pixelToHex({ x: conn.fromX, y: conn.fromY });
      const toHex = pixelToHex({ x: conn.toX, y: conn.toY });

      const fromPixel = hexToPixel(fromHex);
      const toPixel = hexToPixel(toHex);

      g.moveTo(fromPixel.x, fromPixel.y);
      g.lineTo(toPixel.x, toPixel.y);
    }

    g.stroke();
  }

  // Render all nodes and cache as texture for performance
  private renderNodes(): void {
    if (!this.mapData || !this.app) return;

    const g = this.nodeGraphics;
    g.clear();

    const TEXTURE_SIZE = 2000;

    // Draw all nodes to graphics (with bright border to distinguish from terrain)
    for (const node of this.mapData.nodes) {
      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      const pixel = hexToPixel(hex);

      // Determine fill color: neutral gray for unclaimed, player color for owned
      const fillColor = node.ownerId ? getPlayerColor(node.ownerId) : NEUTRAL_NODE_COLOR;

      // Outer glow/border (makes nodes pop against terrain)
      g.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.3 });
      drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 1);
      g.stroke();

      // Node fill (ownership color - neutral gray or player color)
      drawHexPath(g, pixel.x, pixel.y, HEX_SIZE - 1);
      g.fill({ color: fillColor, alpha: 0.95 });

      // Bright edge border
      g.setStrokeStyle({ width: 2, color: 0xcccccc, alpha: 0.8 });
      drawHexPath(g, pixel.x, pixel.y, HEX_SIZE - 1);
      g.stroke();

      // HQ indicator (golden star)
      if (node.isHQ) {
        // Star background glow
        drawStarPath(g, pixel.x, pixel.y, 12, 5);
        g.fill({ color: 0xffd700, alpha: 0.9 });
        // Star border
        g.setStrokeStyle({ width: 1.5, color: 0xffa500, alpha: 1 });
        drawStarPath(g, pixel.x, pixel.y, 12, 5);
        g.stroke();
      }
    }

    // Clean up old texture and sprite
    if (this.nodeTexture) {
      this.nodeTexture.destroy(true);
      this.nodeTexture = null;
    }
    if (this.nodeSprite) {
      this.nodeSprite.destroy();
      this.nodeSprite = null;
    }

    // Create a RenderTexture and cache the nodes
    this.nodeTexture = RenderTexture.create({
      width: TEXTURE_SIZE,
      height: TEXTURE_SIZE,
    });

    // Render graphics to texture
    this.app.renderer.render({
      container: g,
      target: this.nodeTexture,
    });

    // Create sprite from texture
    this.nodeSprite = new Sprite(this.nodeTexture);
    this.nodeSprite.x = 0;
    this.nodeSprite.y = 0;

    // Add sprite to node layer
    this.nodeLayer.removeChildren();
    this.nodeLayer.addChild(this.nodeSprite);

    // Clear the graphics
    g.clear();
  }

  // Update a single node - requires re-rendering all nodes (expensive, avoid frequent calls)
  updateNode(nodeId: string, data: Partial<MapNode>): void {
    if (!this.mapData) return;

    const index = this.mapData.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return;

    const existingNode = this.mapData.nodes[index];
    if (!existingNode) return;

    const updatedNode: MapNode = { ...existingNode, ...data };
    this.mapData.nodes[index] = updatedNode;

    // Update hex lookup
    const hex = pixelToHex({ x: updatedNode.positionX, y: updatedNode.positionY });
    this.nodesByHexKey.set(hexKey(hex), updatedNode);

    // Re-render all nodes (texture-based approach requires full re-render)
    this.renderNodes();
  }

  // Visibility culling - no longer needed with texture caching
  updateVisibility(): void {
    // No-op: textures don't need visibility culling
  }

  // Hit testing
  getNodeAtPosition(worldX: number, worldY: number): MapNode | null {
    const hex = pixelToHex({ x: worldX, y: worldY });
    return this.nodesByHexKey.get(hexKey(hex)) ?? null;
  }

  // Highlight effect - draws on selection layer
  highlightNode(nodeId: string, highlight: boolean): void {
    if (highlight) {
      this.highlightedNodeId = nodeId;
    } else if (this.highlightedNodeId === nodeId) {
      this.highlightedNodeId = null;
    }
    this.renderSelectionOverlay();
  }

  // Selection ring - draws on selection layer
  setNodeSelected(nodeId: string, selected: boolean): void {
    if (selected) {
      this.selectedNodeIds.add(nodeId);
    } else {
      this.selectedNodeIds.delete(nodeId);
    }
    this.renderSelectionOverlay();
  }

  // Render selection and highlight overlays
  private renderSelectionOverlay(): void {
    const g = this.selectionGraphics;
    g.clear();

    // Draw selection rings
    for (const nodeId of this.selectedNodeIds) {
      const node = this.mapData?.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      const pixel = hexToPixel(hex);

      // Outer glow
      g.setStrokeStyle({ width: 6, color: 0x00ff88, alpha: 0.3 });
      drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 6);
      g.stroke();

      // Inner ring
      g.setStrokeStyle({ width: 3, color: 0x00ff88 });
      drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 4);
      g.stroke();
    }

    // Draw highlight (if any)
    if (this.highlightedNodeId && !this.selectedNodeIds.has(this.highlightedNodeId)) {
      const node = this.mapData?.nodes.find(n => n.id === this.highlightedNodeId);
      if (node) {
        const hex = pixelToHex({ x: node.positionX, y: node.positionY });
        const pixel = hexToPixel(hex);

        g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.5 });
        drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 2);
        g.stroke();
      }
    }
  }
}
