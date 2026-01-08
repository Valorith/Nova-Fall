import { Container, Graphics, RenderTexture, Sprite, Text, TextStyle, type Application } from 'pixi.js';
import type { MapNode } from '@nova-fall/shared';
import { TerrainType, TERRAIN_CONFIGS, NodeType } from '@nova-fall/shared';
import type { Camera } from '../engine/Camera';
import type { ZoomLevel } from '../engine/GameEngine';
import {
  hexToPixel,
  pixelToHex,
  hexKey,
  HEX_SIZE,
  findPath,
  type HexCoord,
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

// Transfer data for animated flow lines
export interface TransferData {
  id: string;
  sourceNodeId: string;
  destNodeId: string;
  completesAt: string;
}

// Neutral color for unclaimed nodes
const NEUTRAL_NODE_COLOR = 0x505050;

// PERFORMANCE: Cache player colors to avoid recalculating on every render
const playerColorCache = new Map<string, number>();

// Generate a consistent color from a player ID using hashing (cached)
function getPlayerColor(ownerId: string): number {
  // Check cache first
  const cached = playerColorCache.get(ownerId);
  if (cached !== undefined) return cached;
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
  const color = hslToHex(hue, saturation, lightness);

  // Cache for future lookups
  playerColorCache.set(ownerId, color);

  return color;
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

// Draw a crown shape for KOTH crown node indicator
function drawCrownPath(g: Graphics, cx: number, cy: number, width: number, height: number): void {
  const halfW = width / 2;
  const halfH = height / 2;
  const peakHeight = height * 0.4; // How high the peaks go

  // Start at bottom left
  g.moveTo(cx - halfW, cy + halfH);
  // Left peak
  g.lineTo(cx - halfW, cy - halfH + peakHeight);
  g.lineTo(cx - halfW * 0.5, cy);
  // Center peak (highest)
  g.lineTo(cx, cy - halfH);
  // Right inner
  g.lineTo(cx + halfW * 0.5, cy);
  // Right peak
  g.lineTo(cx + halfW, cy - halfH + peakHeight);
  g.lineTo(cx + halfW, cy + halfH);
  // Bottom
  g.closePath();
}

// Draw a money bag icon for Trade Hub nodes
function drawMoneyBagPath(g: Graphics, cx: number, cy: number, size: number): void {
  const s = size;

  // Bag body (rounded bottom, narrower top)
  g.moveTo(cx - s * 0.5, cy + s * 0.1);
  // Left side curve down to bottom
  g.bezierCurveTo(
    cx - s * 0.6, cy + s * 0.4,
    cx - s * 0.5, cy + s * 0.7,
    cx, cy + s * 0.7
  );
  // Right side curve up from bottom
  g.bezierCurveTo(
    cx + s * 0.5, cy + s * 0.7,
    cx + s * 0.6, cy + s * 0.4,
    cx + s * 0.5, cy + s * 0.1
  );
  // Top tie/neck
  g.lineTo(cx + s * 0.3, cy - s * 0.1);
  g.bezierCurveTo(
    cx + s * 0.35, cy - s * 0.35,
    cx + s * 0.2, cy - s * 0.5,
    cx, cy - s * 0.45
  );
  g.bezierCurveTo(
    cx - s * 0.2, cy - s * 0.5,
    cx - s * 0.35, cy - s * 0.35,
    cx - s * 0.3, cy - s * 0.1
  );
  g.closePath();
}

// Draw dollar sign for money bag
function drawDollarSign(g: Graphics, cx: number, cy: number, size: number): void {
  const s = size * 0.3;
  // Vertical line
  g.moveTo(cx, cy - s * 0.8);
  g.lineTo(cx, cy + s * 0.8);
  // S curve (simplified as two arcs)
  g.moveTo(cx + s * 0.4, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.4, cy - s * 0.6, cx - s * 0.4, cy - s * 0.6, cx - s * 0.4, cy - s * 0.3);
  g.bezierCurveTo(cx - s * 0.4, cy, cx + s * 0.4, cy, cx + s * 0.4, cy + s * 0.3);
  g.bezierCurveTo(cx + s * 0.4, cy + s * 0.6, cx - s * 0.4, cy + s * 0.6, cx - s * 0.4, cy + s * 0.4);
}

export class WorldRenderer {
  // Layer containers
  private terrainLayer: Container;
  private connectionLayer: Container;
  private nodeLayer: Container;
  private selectionLayer: Container;
  private animationLayer: Container; // For animated effects like crown pulse
  private transferLayer: Container; // For animated transfer flow lines
  private nameplateLayer: Container; // For HQ nameplates at corners

  // Graphics for batch rendering
  private terrainGraphics: Graphics;
  private connectionGraphics: Graphics;
  private nodeGraphics: Graphics;
  private selectionGraphics: Graphics;
  private crownPulseGraphics: Graphics; // Animated crown pulse effect
  private transferGraphics: Graphics; // Animated transfer lines

  // Cached textures and sprites for performance
  private terrainTexture: RenderTexture | null = null;
  private terrainSprite: Sprite | null = null;
  private nodeTexture: RenderTexture | null = null;
  private nodeSprite: Sprite | null = null;
  private app: Application | null = null;

  // Data
  private mapData: HexMapData | null = null;
  private nodesByHexKey = new Map<string, MapNode>();
  private nodesById = new Map<string, MapNode>(); // PERFORMANCE: O(1) lookup by ID
  private currentPlayerId: string | null = null; // Active player's ID for HQ highlighting
  private playerNames = new Map<string, string>(); // Player ID to display name
  private currentCameraScale = 1; // Track camera scale for nameplate sizing

  // Selection state
  private selectedNodeIds = new Set<string>();
  private highlightedNodeId: string | null = null;

  // PERFORMANCE: Batch node updates to avoid re-rendering on every update
  private nodesDirty = false;
  private pendingRenderFrame: number | null = null;

  // Crown pulse animation state
  private crownPulsePhase = 0;
  private crownAnimationFrame: number | null = null;

  // Transfer flow animation state
  private transferFlowPhase = 0;
  private transferAnimationFrame: number | null = null;
  private pendingTransfers: TransferData[] = [];
  private transferPaths: Map<string, HexCoord[]> = new Map(); // transferId -> path

  constructor() {
    this.terrainLayer = new Container();
    this.terrainLayer.label = 'terrain';

    this.connectionLayer = new Container();
    this.connectionLayer.label = 'connections';

    this.nodeLayer = new Container();
    this.nodeLayer.label = 'nodes';

    this.selectionLayer = new Container();
    this.selectionLayer.label = 'selection';

    this.animationLayer = new Container();
    this.animationLayer.label = 'animation';

    this.transferLayer = new Container();
    this.transferLayer.label = 'transfers';

    this.nameplateLayer = new Container();
    this.nameplateLayer.label = 'nameplates';

    this.terrainGraphics = new Graphics();
    this.connectionGraphics = new Graphics();
    this.nodeGraphics = new Graphics();
    this.selectionGraphics = new Graphics();
    this.crownPulseGraphics = new Graphics();
    this.transferGraphics = new Graphics();

    this.connectionLayer.addChild(this.connectionGraphics);
    this.selectionLayer.addChild(this.selectionGraphics);
    this.animationLayer.addChild(this.crownPulseGraphics);
    this.transferLayer.addChild(this.transferGraphics);
  }

  setApp(app: Application): void {
    this.app = app;
  }

  setCurrentPlayerId(playerId: string | null): void {
    if (this.currentPlayerId !== playerId) {
      this.currentPlayerId = playerId;
      // Re-render nodes if map data exists to update HQ highlight
      if (this.mapData) {
        this.renderNodes();
      }
    }
  }

  setPlayerNames(names: Map<string, string>): void {
    this.playerNames = names;
    // Re-render nameplates if map data exists (defer to next frame for proper rendering)
    if (this.mapData) {
      requestAnimationFrame(() => {
        this.renderNameplates();
      });
    }
  }

  addToContainer(parent: Container): void {
    parent.addChild(this.terrainLayer);
    parent.addChild(this.connectionLayer);
    parent.addChild(this.nodeLayer);
    parent.addChild(this.transferLayer);
    parent.addChild(this.animationLayer);
    parent.addChild(this.nameplateLayer);
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

    // Clear existing state first (before building new lookups)
    this.clearAll();

    // Build node lookups
    this.nodesByHexKey.clear();
    this.nodesById.clear();
    for (const node of nodes) {
      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      this.nodesByHexKey.set(hexKey(hex), node);
      this.nodesById.set(node.id, node);
    }

    this.renderTerrain();
    this.renderConnections();
    this.renderNodes(); // Also renders nameplates
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
    this.crownPulseGraphics.clear();
    this.transferGraphics.clear();
    this.selectedNodeIds.clear();
    this.highlightedNodeId = null;
    this.nodesById.clear();
    this.playerNames.clear();
    this.nodesDirty = false;
    this.pendingTransfers = [];
    this.transferPaths.clear();

    // Cancel any pending render frame
    if (this.pendingRenderFrame !== null) {
      cancelAnimationFrame(this.pendingRenderFrame);
      this.pendingRenderFrame = null;
    }

    // Cancel crown animation
    this.stopCrownAnimation();

    // Cancel transfer animation
    this.stopTransferAnimation();

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
    this.animationLayer.removeChildren();
    this.animationLayer.addChild(this.crownPulseGraphics);
    this.nameplateLayer.removeChildren();
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
        // Check if this is the current player's HQ
        const isMyHQ = this.currentPlayerId && node.ownerId === this.currentPlayerId;

        if (isMyHQ) {
          // Player's own HQ - add cyan/teal glow effect and border
          // Outer glow rings
          g.setStrokeStyle({ width: 3, color: 0x00ffff, alpha: 0.15 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 10);
          g.stroke();

          g.setStrokeStyle({ width: 4, color: 0x00ffff, alpha: 0.25 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 6);
          g.stroke();

          // Cyan border around the hex
          g.setStrokeStyle({ width: 3, color: 0x00ffff, alpha: 0.8 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE);
          g.stroke();
        }

        // Star background glow
        drawStarPath(g, pixel.x, pixel.y, 12, 5);
        g.fill({ color: 0xffd700, alpha: 0.9 });
        // Star border
        g.setStrokeStyle({ width: 1.5, color: 0xffa500, alpha: 1 });
        drawStarPath(g, pixel.x, pixel.y, 12, 5);
        g.stroke();
      }

      // Crown node indicator (gold crown for KOTH)
      if (node.isCrown) {
        // If claimed, add gold border and glow effect
        if (node.ownerId) {
          // Outer gold pulse glow (multiple rings for pulse effect)
          g.setStrokeStyle({ width: 3, color: 0xffd700, alpha: 0.2 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 8);
          g.stroke();

          g.setStrokeStyle({ width: 4, color: 0xffd700, alpha: 0.4 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 5);
          g.stroke();

          // Gold border (replaces the normal gray border)
          g.setStrokeStyle({ width: 3, color: 0xffd700, alpha: 1 });
          drawHexPath(g, pixel.x, pixel.y, HEX_SIZE - 1);
          g.stroke();
        }

        // Gold crown icon (always shown)
        drawCrownPath(g, pixel.x, pixel.y, 18, 12);
        g.fill({ color: 0xffd700, alpha: 0.95 });
        // Crown border (darker gold)
        g.setStrokeStyle({ width: 1.5, color: 0xb8860b, alpha: 1 });
        drawCrownPath(g, pixel.x, pixel.y, 18, 12);
        g.stroke();
      }

      // Trade Hub icon (money bag)
      if (node.type === NodeType.TRADE_HUB && !node.isCrown) {
        // Money bag body
        drawMoneyBagPath(g, pixel.x, pixel.y, 16);
        g.fill({ color: 0xdaa520, alpha: 0.95 }); // Goldenrod fill
        g.setStrokeStyle({ width: 1.5, color: 0x8b6914, alpha: 1 });
        drawMoneyBagPath(g, pixel.x, pixel.y, 16);
        g.stroke();

        // Dollar sign on bag
        g.setStrokeStyle({ width: 2, color: 0x8b6914, alpha: 0.9 });
        drawDollarSign(g, pixel.x, pixel.y + 2, 16);
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

    // Update crown animation state
    this.updateCrownAnimation();

    // Re-render nameplates (HQ ownership may have changed)
    this.renderNameplates();
  }

  // Update a single node - batches re-renders for performance
  updateNode(nodeId: string, data: Partial<MapNode>): void {
    if (!this.mapData) return;

    // Use nodesById for O(1) lookup instead of findIndex
    const existingNode = this.nodesById.get(nodeId);
    if (!existingNode) return;

    // Check if visual properties actually changed (skip render if only storage changed)
    const visualPropsChanged =
      data.ownerId !== undefined && data.ownerId !== existingNode.ownerId ||
      data.isHQ !== undefined && data.isHQ !== existingNode.isHQ ||
      data.isCrown !== undefined && data.isCrown !== existingNode.isCrown ||
      data.status !== undefined && data.status !== existingNode.status;

    // Update the node data
    const updatedNode: MapNode = { ...existingNode, ...data };

    // Update in array (find index only when needed)
    const index = this.mapData.nodes.findIndex((n) => n.id === nodeId);
    if (index !== -1) {
      this.mapData.nodes[index] = updatedNode;
    }

    // Update lookups
    const hex = pixelToHex({ x: updatedNode.positionX, y: updatedNode.positionY });
    this.nodesByHexKey.set(hexKey(hex), updatedNode);
    this.nodesById.set(nodeId, updatedNode);

    // Only mark dirty if visual properties changed
    if (visualPropsChanged) {
      this.markNodesDirty();
    }
  }

  // PERFORMANCE: Batch multiple node updates into a single render
  private markNodesDirty(): void {
    if (this.nodesDirty) return; // Already scheduled

    this.nodesDirty = true;

    // Use requestAnimationFrame to batch all updates in current frame
    if (this.pendingRenderFrame === null) {
      this.pendingRenderFrame = requestAnimationFrame(() => {
        this.pendingRenderFrame = null;
        if (this.nodesDirty) {
          this.nodesDirty = false;
          this.renderNodes();
        }
      });
    }
  }

  // Visibility culling - no longer needed with texture caching
  updateVisibility(): void {
    // No-op: textures don't need visibility culling
  }

  // Update nameplate scale to maintain consistent screen size
  updateNameplateScale(cameraScale: number): void {
    if (this.currentCameraScale === cameraScale) return;
    this.currentCameraScale = cameraScale;

    // Apply inverse scale so nameplates stay same size on screen
    const inverseScale = 1 / cameraScale;
    for (const child of this.nameplateLayer.children) {
      child.scale.set(inverseScale);
    }
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

    // Draw selection rings (use nodesById for O(1) lookup instead of .find())
    for (const nodeId of this.selectedNodeIds) {
      const node = this.nodesById.get(nodeId);
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

    // Draw highlight (if any) - use nodesById for O(1) lookup
    if (this.highlightedNodeId && !this.selectedNodeIds.has(this.highlightedNodeId)) {
      const node = this.nodesById.get(this.highlightedNodeId);
      if (node) {
        const hex = pixelToHex({ x: node.positionX, y: node.positionY });
        const pixel = hexToPixel(hex);

        g.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.5 });
        drawHexPath(g, pixel.x, pixel.y, HEX_SIZE + 2);
        g.stroke();
      }
    }
  }

  // Start crown pulse animation for claimed crown nodes
  private startCrownAnimation(): void {
    if (this.crownAnimationFrame !== null) return; // Already running

    const animate = () => {
      this.crownPulsePhase += 0.03; // Adjust speed
      if (this.crownPulsePhase > Math.PI * 2) {
        this.crownPulsePhase -= Math.PI * 2;
      }

      this.renderCrownPulse();
      this.crownAnimationFrame = requestAnimationFrame(animate);
    };

    this.crownAnimationFrame = requestAnimationFrame(animate);
  }

  // Stop crown pulse animation
  private stopCrownAnimation(): void {
    if (this.crownAnimationFrame !== null) {
      cancelAnimationFrame(this.crownAnimationFrame);
      this.crownAnimationFrame = null;
    }
    this.crownPulseGraphics.clear();
  }

  // Render animated pulse effect for claimed crown nodes
  private renderCrownPulse(): void {
    if (!this.mapData) return;

    const g = this.crownPulseGraphics;
    g.clear();

    // Find claimed crown nodes
    for (const node of this.mapData.nodes) {
      if (!node.isCrown || !node.ownerId) continue;

      const hex = pixelToHex({ x: node.positionX, y: node.positionY });
      const pixel = hexToPixel(hex);

      // Animated pulse rings - sine wave for smooth pulsing
      const pulseAlpha = 0.2 + Math.sin(this.crownPulsePhase) * 0.15;
      const pulseSize = HEX_SIZE + 6 + Math.sin(this.crownPulsePhase) * 3;

      // Outer expanding ring
      g.setStrokeStyle({ width: 2, color: 0xffd700, alpha: pulseAlpha });
      drawHexPath(g, pixel.x, pixel.y, pulseSize + 4);
      g.stroke();

      // Middle ring
      g.setStrokeStyle({ width: 3, color: 0xffd700, alpha: pulseAlpha + 0.1 });
      drawHexPath(g, pixel.x, pixel.y, pulseSize);
      g.stroke();
    }
  }

  // Check if we need to start/stop crown animation based on node state
  private updateCrownAnimation(): void {
    if (!this.mapData) {
      this.stopCrownAnimation();
      return;
    }

    // Check if there's a claimed crown node
    const hasClaimedCrown = this.mapData.nodes.some(
      (node) => node.isCrown && node.ownerId
    );

    if (hasClaimedCrown && this.crownAnimationFrame === null) {
      this.startCrownAnimation();
    } else if (!hasClaimedCrown && this.crownAnimationFrame !== null) {
      this.stopCrownAnimation();
    }
  }

  // Render stylized nameplates at each corner for HQs
  private renderNameplates(): void {
    if (!this.mapData) return;

    // Clear existing nameplates
    this.nameplateLayer.removeChildren();

    // Find all HQ nodes
    const hqNodes = this.mapData.nodes.filter((node) => node.isHQ && node.ownerId);
    if (hqNodes.length === 0) return;

    // Map boundaries for determining corner positions
    const GRID_PADDING = 150;
    const GRID_SIZE_PX = 1600;
    const centerX = GRID_PADDING + GRID_SIZE_PX / 2;
    const centerY = GRID_PADDING + GRID_SIZE_PX / 2;

    // Determine which corner each HQ is in and create nameplates
    for (const hq of hqNodes) {
      const isLeft = hq.positionX < centerX;
      const isTop = hq.positionY < centerY;

      // Determine rotation based on corner
      // Top left: -45deg, Top right: +45deg, Bottom right: -45deg, Bottom left: +45deg
      let rotation: number;
      let offsetX: number;
      let offsetY: number;

      if (isTop && isLeft) {
        // Top left corner - rotate counter-clockwise (-45 degrees)
        rotation = -Math.PI / 4;
        offsetX = -80;
        offsetY = -80;
      } else if (isTop && !isLeft) {
        // Top right corner - rotate clockwise (+45 degrees)
        rotation = Math.PI / 4;
        offsetX = 80;
        offsetY = -80;
      } else if (!isTop && !isLeft) {
        // Bottom right corner - rotate counter-clockwise (-45 degrees)
        rotation = -Math.PI / 4;
        offsetX = 80;
        offsetY = 80;
      } else {
        // Bottom left corner - rotate clockwise (+45 degrees)
        rotation = Math.PI / 4;
        offsetX = -80;
        offsetY = 80;
      }

      // Create nameplate container
      const nameplateContainer = new Container();
      nameplateContainer.x = hq.positionX + offsetX;
      nameplateContainer.y = hq.positionY + offsetY;
      nameplateContainer.rotation = rotation;

      // Get player name and color - use node's ownerName directly, fallback to playerNames map
      const playerName = hq.ownerName || this.playerNames.get(hq.ownerId!) || 'Unknown';
      const playerColor = getPlayerColor(hq.ownerId!);

      // Create nameplate background
      const bg = new Graphics();
      const plateWidth = 140;
      const plateHeight = 36;
      const cornerRadius = 6;

      // Dark background with player color accent
      bg.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, cornerRadius);
      bg.fill({ color: 0x1a1a2e, alpha: 0.9 });

      // Player color border
      bg.setStrokeStyle({ width: 2, color: playerColor, alpha: 1 });
      bg.roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, cornerRadius);
      bg.stroke();

      // Accent line at top
      bg.setStrokeStyle({ width: 3, color: playerColor, alpha: 0.8 });
      bg.moveTo(-plateWidth / 2 + cornerRadius, -plateHeight / 2);
      bg.lineTo(plateWidth / 2 - cornerRadius, -plateHeight / 2);
      bg.stroke();

      nameplateContainer.addChild(bg);

      // Create player name text
      const textStyle = new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#ffffff',
        align: 'center',
      });

      const nameText = new Text({
        text: playerName,
        style: textStyle,
      });
      nameText.anchor.set(0.5, 0.5);
      nameText.x = 0;
      nameText.y = 0;

      nameplateContainer.addChild(nameText);

      // Apply current camera scale so nameplate is readable immediately
      if (this.currentCameraScale !== 1) {
        nameplateContainer.scale.set(1 / this.currentCameraScale);
      }

      this.nameplateLayer.addChild(nameplateContainer);
    }

    // Force PixiJS to recognize the new children by updating position
    this.nameplateLayer.position.set(0.001, 0.001);
    requestAnimationFrame(() => {
      this.nameplateLayer.position.set(0, 0);
    });
  }

  // Set pending transfers and calculate paths
  setTransfers(transfers: TransferData[]): void {
    this.pendingTransfers = transfers;
    this.transferPaths.clear();

    if (!this.mapData || !this.currentPlayerId) return;

    // Build set of valid hex keys (only nodes owned by the current player)
    const validHexes = new Set<string>();
    for (const node of this.mapData.nodes) {
      if (node.ownerId === this.currentPlayerId) {
        const hex = pixelToHex({ x: node.positionX, y: node.positionY });
        validHexes.add(hexKey(hex));
      }
    }

    // Calculate paths for each transfer
    for (const transfer of transfers) {
      const sourceNode = this.nodesById.get(transfer.sourceNodeId);
      const destNode = this.nodesById.get(transfer.destNodeId);

      if (!sourceNode || !destNode) continue;

      const sourceHex = pixelToHex({ x: sourceNode.positionX, y: sourceNode.positionY });
      const destHex = pixelToHex({ x: destNode.positionX, y: destNode.positionY });

      const path = findPath(sourceHex, destHex, validHexes);
      if (path) {
        this.transferPaths.set(transfer.id, path);
      }
    }

    // Start or stop animation based on whether there are transfers
    if (transfers.length > 0 && this.transferAnimationFrame === null) {
      this.startTransferAnimation();
    } else if (transfers.length === 0 && this.transferAnimationFrame !== null) {
      this.stopTransferAnimation();
    }
  }

  // Start transfer flow animation
  private startTransferAnimation(): void {
    if (this.transferAnimationFrame !== null) return; // Already running

    const animate = () => {
      this.transferFlowPhase += 0.08; // Adjust speed of flow
      if (this.transferFlowPhase > Math.PI * 2) {
        this.transferFlowPhase -= Math.PI * 2;
      }

      this.renderTransferLines();
      this.transferAnimationFrame = requestAnimationFrame(animate);
    };

    this.transferAnimationFrame = requestAnimationFrame(animate);
  }

  // Stop transfer flow animation
  private stopTransferAnimation(): void {
    if (this.transferAnimationFrame !== null) {
      cancelAnimationFrame(this.transferAnimationFrame);
      this.transferAnimationFrame = null;
    }
    this.transferGraphics.clear();
  }

  // Render animated transfer flow lines
  private renderTransferLines(): void {
    const g = this.transferGraphics;
    g.clear();

    if (this.pendingTransfers.length === 0) return;

    // Draw each transfer path
    for (const transfer of this.pendingTransfers) {
      const path = this.transferPaths.get(transfer.id);
      if (!path || path.length < 2) continue;

      // Convert hex path to pixel coordinates
      const pixelPath = path.map((hex) => hexToPixel(hex));

      // Draw the base path line (semi-transparent)
      g.setStrokeStyle({ width: 4, color: 0x818cf8, alpha: 0.3 });
      g.moveTo(pixelPath[0]!.x, pixelPath[0]!.y);
      for (let i = 1; i < pixelPath.length; i++) {
        g.lineTo(pixelPath[i]!.x, pixelPath[i]!.y);
      }
      g.stroke();

      // Draw animated flowing dots along the path
      this.drawFlowingDots(g, pixelPath);
    }
  }

  // Draw animated dots flowing along a path
  private drawFlowingDots(g: Graphics, pixelPath: { x: number; y: number }[]): void {
    if (pixelPath.length < 2) return;

    // Calculate total path length
    let totalLength = 0;
    const segmentLengths: number[] = [];
    for (let i = 1; i < pixelPath.length; i++) {
      const dx = pixelPath[i]!.x - pixelPath[i - 1]!.x;
      const dy = pixelPath[i]!.y - pixelPath[i - 1]!.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segmentLengths.push(len);
      totalLength += len;
    }

    // Number of dots based on path length
    const dotSpacing = 40; // Pixels between dots
    const numDots = Math.max(3, Math.floor(totalLength / dotSpacing));

    // Draw dots at animated positions along the path
    for (let i = 0; i < numDots; i++) {
      // Calculate position along path (0 to 1), animated by phase
      const baseT = i / numDots;
      const animatedT = (baseT + this.transferFlowPhase / (Math.PI * 2)) % 1;

      // Convert t to actual position on path
      const targetDist = animatedT * totalLength;
      let accumulatedDist = 0;
      let dotX = pixelPath[0]!.x;
      let dotY = pixelPath[0]!.y;

      for (let j = 0; j < segmentLengths.length; j++) {
        const segLen = segmentLengths[j]!;
        if (accumulatedDist + segLen >= targetDist) {
          // Dot is on this segment
          const segT = (targetDist - accumulatedDist) / segLen;
          const p1 = pixelPath[j]!;
          const p2 = pixelPath[j + 1]!;
          dotX = p1.x + (p2.x - p1.x) * segT;
          dotY = p1.y + (p2.y - p1.y) * segT;
          break;
        }
        accumulatedDist += segLen;
      }

      // Draw dot with glow effect
      const dotSize = 5;
      const glowAlpha = 0.3 + 0.2 * Math.sin(this.transferFlowPhase + i * 0.5);

      // Outer glow
      g.circle(dotX, dotY, dotSize + 3);
      g.fill({ color: 0x818cf8, alpha: glowAlpha });

      // Inner dot
      g.circle(dotX, dotY, dotSize);
      g.fill({ color: 0xc7d2fe, alpha: 0.9 });
    }
  }
}
