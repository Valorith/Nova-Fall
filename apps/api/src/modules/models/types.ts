/**
 * Model file information
 */
export interface ModelFile {
  /** File path relative to models root (e.g., "/models/buildings/turret.glb") */
  path: string;
  /** Just the filename (e.g., "turret.glb") */
  filename: string;
  /** Category based on directory (e.g., "buildings", "units") */
  category: 'buildings' | 'units' | 'other';
  /** File size in bytes */
  size: number;
  /** Whether this is a pack file (contains multiple models) */
  isPack?: boolean;
  /** Available meshes if inspected */
  meshes?: string[];
}

/**
 * Response for listing models
 */
export interface ModelListResponse {
  buildings: ModelFile[];
  units: ModelFile[];
  other: ModelFile[];
}
