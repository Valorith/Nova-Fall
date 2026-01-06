// Nova Prime - The main 1000-node map for Nova Fall
// 4-player map with capitals at corners + hex grid layout

import type {
  NodeSeed,
  ConnectionSeed,
  EnvironmentZoneSeed,
  MapSeed} from '@nova-fall/shared';
import {
  NodeType,
  RoadType,
  REGIONS,
} from '@nova-fall/shared';

// ============================================
// Hex Grid Utilities (matching frontend)
// ============================================

interface HexCoord {
  q: number;
  r: number;
}

interface PixelCoord {
  x: number;
  y: number;
}

// Hex size configuration (must match frontend)
const HEX_SIZE = 28;
const GRID_OFFSET_X = 100;
const GRID_OFFSET_Y = 100;

// Convert axial hex coordinates to pixel coordinates
function hexToPixel(hex: HexCoord): PixelCoord {
  const x = HEX_SIZE * (3 / 2) * hex.q + GRID_OFFSET_X;
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * hex.q + Math.sqrt(3) * hex.r) + GRID_OFFSET_Y;
  return { x, y };
}

// Get the 6 neighboring hex coordinates
function hexNeighbors(hex: HexCoord): HexCoord[] {
  const directions: HexCoord[] = [
    { q: 1, r: 0 },   // East
    { q: 1, r: -1 },  // Northeast
    { q: 0, r: -1 },  // Northwest
    { q: -1, r: 0 },  // West
    { q: -1, r: 1 },  // Southwest
    { q: 0, r: 1 },   // Southeast
  ];

  return directions.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
}

// Create a hex coordinate key for Map/Set usage
function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

// ============================================
// Seeded Random Number Generator
// ============================================

function seededRandom(seed: number): () => number {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// ============================================
// Region Assignment
// ============================================

function getRegionId(x: number, y: number): string {
  for (const region of REGIONS) {
    if (
      x >= region.bounds.minX &&
      x <= region.bounds.maxX &&
      y >= region.bounds.minY &&
      y <= region.bounds.maxY
    ) {
      return region.id;
    }
  }
  return 'central-plains';
}

// ============================================
// Node Name Generation
// ============================================

function generateNodeName(type: NodeType, index: number): string {
  const prefixes: Record<NodeType, string[]> = {
    [NodeType.MINING]: ['Iron Ridge', 'Deep Mine', 'Ore Pit', 'Crystal Vein', 'Stone Quarry'],
    [NodeType.REFINERY]: ['Smelter', 'Foundry', 'Processing Hub', 'Alloy Works', 'Metal Forge'],
    [NodeType.RESEARCH]: ['Lab', 'Observatory', 'Science Post', 'Research Center', 'Data Hub'],
    [NodeType.TRADE_HUB]: ['Market', 'Exchange', 'Trading Post', 'Commerce Hub', 'Bazaar'],
    [NodeType.FORTRESS]: ['Bastion', 'Stronghold', 'Citadel', 'Outpost', 'Watchtower'],
    [NodeType.AGRICULTURAL]: ['Farm', 'Greenhouse', 'Bio-Dome', 'Harvest Station', 'Agri-Hub'],
    [NodeType.POWER_PLANT]: ['Generator', 'Power Grid', 'Energy Core', 'Reactor', 'Solar Array'],
    [NodeType.CAPITAL]: ['Capital', 'Headquarters', 'Command Center', 'Home Base', 'Core'],
  };

  const suffixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Prime', 'Nova'];
  const names = prefixes[type];
  const baseName = names[index % names.length];

  return `${baseName} ${suffixes[index % suffixes.length]}`;
}

// ============================================
// Node Type Distribution
// ============================================

const REGION_TYPE_WEIGHTS: Record<string, Record<NodeType, number>> = {
  'central-plains': {
    [NodeType.MINING]: 1,
    [NodeType.REFINERY]: 1,
    [NodeType.RESEARCH]: 1,
    [NodeType.TRADE_HUB]: 2,
    [NodeType.FORTRESS]: 0.5,
    [NodeType.AGRICULTURAL]: 2,
    [NodeType.POWER_PLANT]: 1,
    [NodeType.CAPITAL]: 0,
  },
  'northern-wastes': {
    [NodeType.MINING]: 3,
    [NodeType.REFINERY]: 2,
    [NodeType.RESEARCH]: 0.5,
    [NodeType.TRADE_HUB]: 0.5,
    [NodeType.FORTRESS]: 1,
    [NodeType.AGRICULTURAL]: 0.25,
    [NodeType.POWER_PLANT]: 0.5,
    [NodeType.CAPITAL]: 0,
  },
  'eastern-highlands': {
    [NodeType.MINING]: 1.5,
    [NodeType.REFINERY]: 1,
    [NodeType.RESEARCH]: 1.5,
    [NodeType.TRADE_HUB]: 0.5,
    [NodeType.FORTRESS]: 1,
    [NodeType.AGRICULTURAL]: 0.5,
    [NodeType.POWER_PLANT]: 3,
    [NodeType.CAPITAL]: 0,
  },
  'southern-marshes': {
    [NodeType.MINING]: 0.5,
    [NodeType.REFINERY]: 0.5,
    [NodeType.RESEARCH]: 3,
    [NodeType.TRADE_HUB]: 1,
    [NodeType.FORTRESS]: 0.5,
    [NodeType.AGRICULTURAL]: 1.5,
    [NodeType.POWER_PLANT]: 1,
    [NodeType.CAPITAL]: 0,
  },
  'western-frontier': {
    [NodeType.MINING]: 1,
    [NodeType.REFINERY]: 0.5,
    [NodeType.RESEARCH]: 0.5,
    [NodeType.TRADE_HUB]: 2,
    [NodeType.FORTRESS]: 2,
    [NodeType.AGRICULTURAL]: 1,
    [NodeType.POWER_PLANT]: 0.5,
    [NodeType.CAPITAL]: 0,
  },
  deadzone: {
    [NodeType.MINING]: 1,
    [NodeType.REFINERY]: 2,
    [NodeType.RESEARCH]: 1,
    [NodeType.TRADE_HUB]: 0,
    [NodeType.FORTRESS]: 0.5,
    [NodeType.AGRICULTURAL]: 0,
    [NodeType.POWER_PLANT]: 0.5,
    [NodeType.CAPITAL]: 0,
  },
};

function selectNodeType(regionId: string, random: () => number): NodeType {
  const weights = REGION_TYPE_WEIGHTS[regionId] || REGION_TYPE_WEIGHTS['central-plains'];
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = random() * totalWeight;

  for (const [type, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      return type as NodeType;
    }
  }

  return NodeType.AGRICULTURAL;
}

// ============================================
// Map Generation
// ============================================

export function generateMap(seed = 42): MapSeed {
  const random = seededRandom(seed);
  const nodes: NodeSeed[] = [];
  const connections: ConnectionSeed[] = [];
  const nodeCount = 1000;

  // Grid bounds in pixel space (matching frontend)
  const GRID_PADDING = 150;
  const GRID_SIZE_PX = 1600;
  const minPx = GRID_PADDING;
  const maxPx = GRID_PADDING + GRID_SIZE_PX;

  // Helper to check if a hex is within square pixel bounds
  const isInSquareBounds = (hex: HexCoord): boolean => {
    const pixel = hexToPixel(hex);
    return pixel.x >= minPx && pixel.x <= maxPx && pixel.y >= minPx && pixel.y <= maxPx;
  };

  // Phase 1: Generate ALL hex positions within the square bounds via flood-fill
  const allPositions: HexCoord[] = [];
  const visited = new Set<string>();
  const frontier: HexCoord[] = [];

  const startHex = { q: 20, r: 15 }; // Approximate center
  allPositions.push(startHex);
  visited.add(hexKey(startHex));
  frontier.push(...hexNeighbors(startHex).filter(n => isInSquareBounds(n)));

  // Fill the entire square with hexes
  while (frontier.length > 0) {
    const hex = frontier.pop()!;
    const key = hexKey(hex);
    if (visited.has(key)) continue;
    visited.add(key);

    if (isInSquareBounds(hex)) {
      allPositions.push(hex);
      for (const neighbor of hexNeighbors(hex)) {
        if (!visited.has(hexKey(neighbor))) {
          frontier.push(neighbor);
        }
      }
    }
  }

  // Phase 2: Find corner hexes for capital nodes (player starting positions)
  const positionsWithPixels = allPositions.map(hex => ({
    hex,
    pixel: hexToPixel(hex)
  }));

  // Find min/max x and y values
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { pixel } of positionsWithPixels) {
    minX = Math.min(minX, pixel.x);
    maxX = Math.max(maxX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y);
  }

  // Find corner hexes
  const yTolerance = 50;
  const topRow = positionsWithPixels.filter(p => p.pixel.y <= minY + yTolerance);
  const bottomRow = positionsWithPixels.filter(p => p.pixel.y >= maxY - yTolerance);

  const topLeft = topRow.reduce((best, curr) =>
    curr.pixel.x < best.pixel.x ? curr : best
  );
  const topRight = topRow.reduce((best, curr) =>
    curr.pixel.x > best.pixel.x ? curr : best
  );
  const bottomLeft = bottomRow.reduce((best, curr) =>
    curr.pixel.x < best.pixel.x ? curr : best
  );
  const bottomRight = bottomRow.reduce((best, curr) =>
    curr.pixel.x > best.pixel.x ? curr : best
  );

  const cornerHexes = [topLeft, topRight, bottomLeft, bottomRight];
  const cornerHexKeys = new Set<string>(cornerHexes.map(c => hexKey(c.hex)));
  const capitalNames = ['Solaris Prime', 'Frosthold Station', 'Ironworks Hub', 'Shadowport'];

  // Phase 3: Shuffle positions, but ensure corners are included
  const nonCornerPositions = allPositions.filter(h => !cornerHexKeys.has(hexKey(h)));
  const cornerPositions = cornerHexes.map(c => c.hex);

  // Shuffle non-corner positions
  const shuffled = [...nonCornerPositions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // Take corners + enough shuffled positions to reach nodeCount
  const nodePositions = [...cornerPositions, ...shuffled.slice(0, nodeCount - cornerPositions.length)];
  const nodeHexKeys = new Set<string>(nodePositions.map(h => hexKey(h)));

  console.log(`Generated ${allPositions.length} total hex positions, using ${nodePositions.length} for nodes`);

  // Build node lookup map
  const hexToNode = new Map<string, NodeSeed>();
  const nodeTypes = Object.values(NodeType).filter(t => t !== NodeType.CAPITAL);
  let nodeIndex = 0;
  let capitalIndex = 0;

  // Calculate map center for tier calculation
  const mapCenterX = (minPx + maxPx) / 2; // ~950
  const mapCenterY = (minPx + maxPx) / 2; // ~950
  const maxDistanceFromCenter = Math.sqrt(
    Math.pow(maxPx - mapCenterX, 2) + Math.pow(maxPx - mapCenterY, 2)
  ); // Distance from center to corner

  // Calculate tier based on distance from center (1-3, higher near center)
  function calculateTier(x: number, y: number): number {
    const distFromCenter = Math.sqrt(
      Math.pow(x - mapCenterX, 2) + Math.pow(y - mapCenterY, 2)
    );
    const normalizedDist = distFromCenter / maxDistanceFromCenter; // 0 = center, 1 = corner

    // Tier 3 in center (0-33%), Tier 2 in middle (33-66%), Tier 1 at edges (66-100%)
    if (normalizedDist < 0.33) return 3;
    if (normalizedDist < 0.66) return 2;
    return 1;
  }

  // Generate nodes at hex positions
  for (const hex of nodePositions) {
    const pixel = hexToPixel(hex);
    const key = hexKey(hex);
    const isCorner = cornerHexKeys.has(key);

    // Corner nodes are CAPITAL type, others use region weights
    const regionId = getRegionId(pixel.x, pixel.y);
    const type = isCorner ? NodeType.CAPITAL : selectNodeType(regionId, random);
    const name = isCorner
      ? (capitalNames[capitalIndex++] ?? `Capital ${capitalIndex}`)
      : generateNodeName(type, nodeIndex);

    // Capitals are tier 3, others based on distance from center
    const tier = isCorner ? 3 : calculateTier(pixel.x, pixel.y);

    const node: NodeSeed = {
      id: `node-${nodeIndex.toString().padStart(4, '0')}`,
      name,
      type,
      tier,
      positionX: Math.round(pixel.x),
      positionY: Math.round(pixel.y),
      regionId,
      isKeyLocation: isCorner,
    };

    nodes.push(node);
    hexToNode.set(key, node);
    nodeIndex++;
  }

  // Generate connections between adjacent hexes only
  const connectionSet = new Set<string>();
  const roadTypes = [RoadType.DIRT, RoadType.PAVED, RoadType.HIGHWAY];

  for (const hex of nodePositions) {
    const node = hexToNode.get(hexKey(hex));
    if (!node) continue;

    const neighbors = hexNeighbors(hex);

    for (const neighborHex of neighbors) {
      const neighborKey = hexKey(neighborHex);
      if (!nodeHexKeys.has(neighborKey)) continue;

      const neighborNode = hexToNode.get(neighborKey);
      if (!neighborNode) continue;

      // Create unique connection key (sorted to avoid duplicates)
      const connKey = [node.id, neighborNode.id].sort().join('-');
      if (connectionSet.has(connKey)) continue;
      connectionSet.add(connKey);

      // Determine road type based on node importance
      let roadType: RoadType;
      if (node.isKeyLocation || neighborNode.isKeyLocation) {
        roadType = RoadType.HIGHWAY;
      } else if (node.tier >= 2 || neighborNode.tier >= 2) {
        roadType = RoadType.PAVED;
      } else {
        roadType = roadTypes[Math.floor(random() * roadTypes.length)] as RoadType;
      }

      // Hazardous roads in deadzone
      if (node.regionId === 'deadzone' || neighborNode.regionId === 'deadzone') {
        roadType = RoadType.HAZARDOUS;
      }

      // Calculate danger level
      let dangerLevel = Math.round(random() * 20);
      if (node.regionId === 'deadzone' || neighborNode.regionId === 'deadzone') {
        dangerLevel += 50;
      } else if (node.regionId === 'western-frontier' || neighborNode.regionId === 'western-frontier') {
        dangerLevel += 30;
      } else if (node.regionId === 'northern-wastes' || neighborNode.regionId === 'northern-wastes') {
        dangerLevel += 20;
      }
      dangerLevel = Math.min(100, dangerLevel);

      connections.push({
        fromNodeId: node.id,
        toNodeId: neighborNode.id,
        distance: 1, // All adjacent hexes have distance 1
        dangerLevel,
        roadType,
      });
    }
  }

  console.log(`Generated ${nodes.length} nodes with ${connections.length} connections`);
  console.log(`Capital positions:`);
  for (let i = 0; i < 4; i++) {
    const node = nodes[i];
    if (node) {
      console.log(`  ${node.name}: (${node.positionX}, ${node.positionY})`);
    }
  }

  // Environment zones
  const environmentZones: EnvironmentZoneSeed[] = REGIONS.map((region) => ({
    id: `zone-${region.id}`,
    name: `${region.name} Zone`,
    regionId: region.id,
    stability: region.defaultStability,
    upkeepMod: region.upkeepModifier,
  }));

  return {
    version: '1.0.0',
    name: 'Nova Prime',
    description:
      'The primary 4-player map for Nova Fall. 1000 nodes across 6 distinct regions with 4 corner capitals.',
    regions: REGIONS,
    nodes,
    connections,
    environmentZones,
  };
}

// Pre-generated map data
export const NOVA_PRIME_MAP = generateMap(42);
