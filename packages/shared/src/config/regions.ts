import { StabilityLevel } from '../types/enums.js';
import type { RegionDefinition } from '../types/map.js';

// Region definitions for the Nova Fall world map
// The map is 2000x2000 units, divided into 6 distinct regions

export const REGIONS: RegionDefinition[] = [
  {
    id: 'central-plains',
    name: 'Central Plains',
    description: 'Fertile lands at the heart of the colony. Stable conditions and balanced resources.',
    color: '#7CFC00',
    defaultStability: StabilityLevel.STABLE,
    upkeepModifier: 1.0,
    resourceModifiers: { credits: 1.0, iron: 1.0, energy: 1.0 },
    bounds: { minX: 700, maxX: 1300, minY: 700, maxY: 1300 },
  },
  {
    id: 'northern-wastes',
    name: 'Northern Wastes',
    description: 'Frozen tundra with rich mineral deposits. Harsh conditions increase upkeep.',
    color: '#B0E0E6',
    defaultStability: StabilityLevel.UNSTABLE,
    upkeepModifier: 1.25,
    resourceModifiers: { credits: 0.8, iron: 1.5, energy: 0.75 },
    bounds: { minX: 400, maxX: 1600, minY: 0, maxY: 600 },
  },
  {
    id: 'eastern-highlands',
    name: 'Eastern Highlands',
    description: 'Mountainous terrain with abundant energy sources. Difficult to traverse.',
    color: '#DEB887',
    defaultStability: StabilityLevel.STABLE,
    upkeepModifier: 1.15,
    resourceModifiers: { credits: 0.9, iron: 1.2, energy: 1.5 },
    bounds: { minX: 1400, maxX: 2000, minY: 400, maxY: 1600 },
  },
  {
    id: 'southern-marshes',
    name: 'Southern Marshes',
    description: 'Swamplands hiding rare crystal formations. Unpredictable environment.',
    color: '#556B2F',
    defaultStability: StabilityLevel.UNSTABLE,
    upkeepModifier: 1.2,
    resourceModifiers: { credits: 1.0, iron: 0.8, energy: 1.0, minerals: 1.75 },
    bounds: { minX: 400, maxX: 1600, minY: 1400, maxY: 2000 },
  },
  {
    id: 'western-frontier',
    name: 'Western Frontier',
    description: 'Untamed wilderness with lucrative trade opportunities. Watch for raiders.',
    color: '#CD853F',
    defaultStability: StabilityLevel.HAZARDOUS,
    upkeepModifier: 1.1,
    resourceModifiers: { credits: 1.5, iron: 1.0, energy: 0.9 },
    bounds: { minX: 0, maxX: 600, minY: 400, maxY: 1600 },
  },
  {
    id: 'deadzone',
    name: 'The Deadzone',
    description: 'Irradiated wastelands from the initial landing. Extreme hazards but rare resources.',
    color: '#8B0000',
    defaultStability: StabilityLevel.EXTREME,
    upkeepModifier: 1.5,
    resourceModifiers: { credits: 0.5, iron: 0.5, energy: 0.5, composites: 2.0, minerals: 2.0 },
    bounds: { minX: 0, maxX: 400, minY: 0, maxY: 400 },
  },
];

// Get region by ID
export function getRegion(regionId: string): RegionDefinition | undefined {
  return REGIONS.find((r) => r.id === regionId);
}

// Get region for a position
export function getRegionAtPosition(x: number, y: number): RegionDefinition | undefined {
  return REGIONS.find(
    (r) => x >= r.bounds.minX && x <= r.bounds.maxX && y >= r.bounds.minY && y <= r.bounds.maxY
  );
}

// Map dimensions (expanded to allow panning at all zoom levels)
// Game content is 1600x1600 centered at (950, 950) with padding
// Bounds set very large to never restrict panning on wide viewports
export const MAP_BOUNDS = {
  minX: -2000,
  maxX: 4000,
  minY: -2000,
  maxY: 4000,
  width: 6000,
  height: 6000,
};
