// Nova Prime - The main 100-node map for Nova Fall
// Hybrid design: Hand-crafted key locations + procedural distribution

import {
  NodeType,
  RoadType,
  StabilityLevel,
  REGIONS,
  MAP_BOUNDS,
  NodeSeed,
  ConnectionSeed,
  EnvironmentZoneSeed,
  MapSeed,
} from '@nova-fall/shared';

// Seeded random number generator for reproducible maps
function seededRandom(seed: number): () => number {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Distance between two points
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// Get region ID for a position
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

// Generate node name based on type and index
function generateNodeName(type: NodeType, index: number, isKeyLocation: boolean): string {
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

  if (isKeyLocation) {
    return `${baseName} Prime`;
  }

  return `${baseName} ${suffixes[index % suffixes.length]}`;
}

// Key locations - hand-crafted positions
const KEY_LOCATIONS: Array<{
  x: number;
  y: number;
  type: NodeType;
  name: string;
  tier: number;
}> = [
  // Central Trade Hub
  { x: 1000, y: 1000, type: NodeType.TRADE_HUB, name: 'Central Exchange', tier: 3 },

  // Regional capitals / key nodes
  { x: 500, y: 300, type: NodeType.MINING, name: 'Northern Mines', tier: 2 },
  { x: 1500, y: 300, type: NodeType.MINING, name: 'Frost Quarry', tier: 2 },
  { x: 1700, y: 1000, type: NodeType.POWER_PLANT, name: 'Eastern Grid', tier: 2 },
  { x: 300, y: 1000, type: NodeType.FORTRESS, name: 'Frontier Bastion', tier: 2 },
  { x: 1000, y: 1700, type: NodeType.RESEARCH, name: 'Marsh Observatory', tier: 2 },

  // Chokepoints
  { x: 650, y: 650, type: NodeType.FORTRESS, name: 'Western Gate', tier: 2 },
  { x: 1350, y: 650, type: NodeType.FORTRESS, name: 'Eastern Gate', tier: 2 },
  { x: 650, y: 1350, type: NodeType.FORTRESS, name: 'Southern Gate', tier: 2 },
  { x: 1350, y: 1350, type: NodeType.FORTRESS, name: 'Trade Gate', tier: 2 },

  // Resource hotspots
  { x: 200, y: 200, type: NodeType.REFINERY, name: 'Deadzone Refinery', tier: 3 },
  { x: 800, y: 1800, type: NodeType.RESEARCH, name: 'Crystal Labs', tier: 2 },
  { x: 1800, y: 800, type: NodeType.POWER_PLANT, name: 'Highland Reactor', tier: 2 },
];

// Node type distribution by region
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

// Select node type based on region weights
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

// Generate the map
export function generateMap(seed: number = 42): MapSeed {
  const random = seededRandom(seed);
  const nodes: NodeSeed[] = [];
  const connections: ConnectionSeed[] = [];
  const MIN_NODE_DISTANCE = 80;
  const MAX_CONNECTION_DISTANCE = 350;

  // Add key locations first
  KEY_LOCATIONS.forEach((loc, index) => {
    nodes.push({
      id: `node-${index.toString().padStart(3, '0')}`,
      name: loc.name,
      type: loc.type,
      tier: loc.tier,
      positionX: loc.x,
      positionY: loc.y,
      regionId: getRegionId(loc.x, loc.y),
      isKeyLocation: true,
    });
  });

  // Generate remaining nodes to reach 100
  const targetCount = 100;
  let attempts = 0;
  const maxAttempts = 10000;
  let nodeIndex = nodes.length;

  while (nodes.length < targetCount && attempts < maxAttempts) {
    attempts++;

    const x = random() * MAP_BOUNDS.width;
    const y = random() * MAP_BOUNDS.height;

    let tooClose = false;
    for (const node of nodes) {
      if (distance(x, y, node.positionX, node.positionY) < MIN_NODE_DISTANCE) {
        tooClose = true;
        break;
      }
    }

    if (tooClose) continue;

    const regionId = getRegionId(x, y);
    const type = selectNodeType(regionId, random);

    nodes.push({
      id: `node-${nodeIndex.toString().padStart(3, '0')}`,
      name: generateNodeName(type, nodeIndex, false),
      type,
      tier: 1,
      positionX: Math.round(x),
      positionY: Math.round(y),
      regionId,
      isKeyLocation: false,
    });

    nodeIndex++;
  }

  // Generate connections
  const connectionSet = new Set<string>();

  for (const node of nodes) {
    const nearby = nodes
      .filter((n) => n.id !== node.id)
      .map((n) => ({
        node: n,
        dist: distance(node.positionX, node.positionY, n.positionX, n.positionY),
      }))
      .filter((n) => n.dist <= MAX_CONNECTION_DISTANCE)
      .sort((a, b) => a.dist - b.dist);

    const connectionCount = Math.floor(random() * 4) + 2;
    let connected = 0;

    for (const { node: other, dist } of nearby) {
      if (connected >= connectionCount) break;

      const key1 = `${node.id}-${other.id}`;
      const key2 = `${other.id}-${node.id}`;

      if (connectionSet.has(key1) || connectionSet.has(key2)) continue;

      let roadType = RoadType.DIRT;
      if (node.isKeyLocation || other.isKeyLocation) {
        roadType = dist < 200 ? RoadType.HIGHWAY : RoadType.PAVED;
      } else if (dist < 150) {
        roadType = RoadType.PAVED;
      }

      if (node.regionId === 'deadzone' || other.regionId === 'deadzone') {
        roadType = RoadType.HAZARDOUS;
      }

      const baseTime = Math.round(dist / 10);
      const travelTime = Math.round(
        baseTime *
          (roadType === RoadType.HIGHWAY
            ? 0.5
            : roadType === RoadType.PAVED
              ? 0.75
              : roadType === RoadType.HAZARDOUS
                ? 1.5
                : 1.0)
      );

      let dangerLevel = Math.round(random() * 20);
      if (node.regionId === 'deadzone' || other.regionId === 'deadzone') {
        dangerLevel += 50;
      } else if (node.regionId === 'western-frontier' || other.regionId === 'western-frontier') {
        dangerLevel += 30;
      } else if (node.regionId === 'northern-wastes' || other.regionId === 'northern-wastes') {
        dangerLevel += 20;
      }
      dangerLevel = Math.min(100, dangerLevel);

      connections.push({
        fromNodeId: node.id,
        toNodeId: other.id,
        distance: travelTime,
        dangerLevel,
        roadType,
      });

      connectionSet.add(key1);
      connected++;
    }
  }

  // Ensure all nodes are reachable
  const connectedNodes = new Set<string>();
  const queue = [nodes[0].id];
  connectedNodes.add(nodes[0].id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const conn of connections) {
      if (conn.fromNodeId === current && !connectedNodes.has(conn.toNodeId)) {
        connectedNodes.add(conn.toNodeId);
        queue.push(conn.toNodeId);
      }
      if (conn.toNodeId === current && !connectedNodes.has(conn.fromNodeId)) {
        connectedNodes.add(conn.fromNodeId);
        queue.push(conn.fromNodeId);
      }
    }
  }

  // Connect isolated nodes
  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      let nearestConnected: NodeSeed | null = null;
      let nearestDist = Infinity;

      for (const other of nodes) {
        if (connectedNodes.has(other.id)) {
          const dist = distance(node.positionX, node.positionY, other.positionX, other.positionY);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestConnected = other;
          }
        }
      }

      if (nearestConnected) {
        connections.push({
          fromNodeId: node.id,
          toNodeId: nearestConnected.id,
          distance: Math.round(nearestDist / 10),
          dangerLevel: Math.round(random() * 30),
          roadType: RoadType.DIRT,
        });
        connectedNodes.add(node.id);
      }
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
      'The primary map for Nova Fall. 100 nodes across 6 distinct regions with varied terrain and resources.',
    regions: REGIONS,
    nodes,
    connections,
    environmentZones,
  };
}

// Pre-generated map data
export const NOVA_PRIME_MAP = generateMap(42);
