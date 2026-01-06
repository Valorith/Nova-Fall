import type { NodeType, RoadType, StabilityLevel } from './enums';
import type { NodeResources } from './node';

// Map seed data structure for generating the world

// Region definition for environmental zones
export interface RegionDefinition {
  id: string;
  name: string;
  description: string;
  color: string; // Hex color for map rendering
  defaultStability: StabilityLevel;
  upkeepModifier: number; // 1.0 = normal, higher = more expensive
  resourceModifiers: Partial<Record<keyof NodeResources, number>>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// Node seed data (for generating initial map)
export interface NodeSeed {
  id: string;
  name: string;
  type: NodeType;
  tier: number;
  positionX: number;
  positionY: number;
  regionId: string;
  initialResources?: Partial<NodeResources>;
  isKeyLocation?: boolean; // Central hub, chokepoint, etc.
}

// Connection seed data
export interface ConnectionSeed {
  fromNodeId: string;
  toNodeId: string;
  distance: number; // Travel time in seconds
  dangerLevel: number; // 0-100
  roadType: RoadType;
}

// Environment zone seed
export interface EnvironmentZoneSeed {
  id: string;
  name: string;
  regionId: string;
  stability: StabilityLevel;
  upkeepMod: number;
}

// Complete map seed
export interface MapSeed {
  version: string;
  name: string;
  description: string;
  regions: RegionDefinition[];
  nodes: NodeSeed[];
  connections: ConnectionSeed[];
  environmentZones: EnvironmentZoneSeed[];
}

// Map bounds for camera constraints
export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}
