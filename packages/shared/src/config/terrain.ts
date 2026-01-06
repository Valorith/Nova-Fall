import { TerrainType } from '../types/enums';

export interface TerrainConfig {
  id: TerrainType;
  displayName: string;
  color: string; // Hex color for rendering
  borderColor: string; // Darker shade for border
  passable: boolean; // Can units move through?
  movementCost: number; // 1 = normal, 2 = double, etc.
  description: string;
}

export const TERRAIN_CONFIGS: Record<TerrainType, TerrainConfig> = {
  [TerrainType.PLAINS]: {
    id: TerrainType.PLAINS,
    displayName: 'Plains',
    color: '#4a5f3d', // Muted green
    borderColor: '#3a4f2d',
    passable: true,
    movementCost: 1,
    description: 'Open grasslands, easy to traverse.',
  },
  [TerrainType.FOREST]: {
    id: TerrainType.FOREST,
    displayName: 'Forest',
    color: '#2d4a2d', // Dark green
    borderColor: '#1d3a1d',
    passable: true,
    movementCost: 1.5,
    description: 'Dense woods that slow movement but provide cover.',
  },
  [TerrainType.MOUNTAIN]: {
    id: TerrainType.MOUNTAIN,
    displayName: 'Mountains',
    color: '#5a5a6a', // Gray
    borderColor: '#4a4a5a',
    passable: false,
    movementCost: Infinity,
    description: 'Impassable mountain peaks.',
  },
  [TerrainType.WATER]: {
    id: TerrainType.WATER,
    displayName: 'Water',
    color: '#2a4a6a', // Dark blue
    borderColor: '#1a3a5a',
    passable: false,
    movementCost: Infinity,
    description: 'Deep water, impassable without boats.',
  },
  [TerrainType.MARSH]: {
    id: TerrainType.MARSH,
    displayName: 'Marsh',
    color: '#4a5a4a', // Murky green
    borderColor: '#3a4a3a',
    passable: true,
    movementCost: 2,
    description: 'Swampy terrain that significantly slows movement.',
  },
  [TerrainType.DESERT]: {
    id: TerrainType.DESERT,
    displayName: 'Desert',
    color: '#8a7a5a', // Sandy brown
    borderColor: '#7a6a4a',
    passable: true,
    movementCost: 1.25,
    description: 'Arid wasteland with harsh conditions.',
  },
  [TerrainType.TUNDRA]: {
    id: TerrainType.TUNDRA,
    displayName: 'Tundra',
    color: '#6a7a8a', // Cold blue-gray
    borderColor: '#5a6a7a',
    passable: true,
    movementCost: 1.25,
    description: 'Frozen plains with bitter cold.',
  },
  [TerrainType.WASTELAND]: {
    id: TerrainType.WASTELAND,
    displayName: 'Wasteland',
    color: '#5a3a3a', // Dark red-brown
    borderColor: '#4a2a2a',
    passable: true,
    movementCost: 1.5,
    description: 'Irradiated zone, hazardous to traverse.',
  },
};
