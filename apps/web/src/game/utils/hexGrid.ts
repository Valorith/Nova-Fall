/**
 * Hex Grid Utilities
 *
 * Uses axial coordinates (q, r) for flat-top hexagons.
 * q increases to the right, r increases down-right.
 *
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */

export interface HexCoord {
  q: number;
  r: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

// Hex size configuration
export const HEX_SIZE = 28; // Outer radius of hexagon
export const HEX_WIDTH = HEX_SIZE * 2; // Width of flat-top hex
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE; // Height of flat-top hex

// Grid configuration
export const GRID_OFFSET_X = 100; // Offset from left edge
export const GRID_OFFSET_Y = 100; // Offset from top edge

/**
 * Convert axial hex coordinates to pixel coordinates (center of hex)
 */
export function hexToPixel(hex: HexCoord): PixelCoord {
  const x = HEX_SIZE * (3 / 2) * hex.q + GRID_OFFSET_X;
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * hex.q + Math.sqrt(3) * hex.r) + GRID_OFFSET_Y;
  return { x, y };
}

/**
 * Convert pixel coordinates to axial hex coordinates
 */
export function pixelToHex(pixel: PixelCoord): HexCoord {
  const px = pixel.x - GRID_OFFSET_X;
  const py = pixel.y - GRID_OFFSET_Y;

  const q = (2 / 3 * px) / HEX_SIZE;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / HEX_SIZE;

  return hexRound({ q, r });
}

/**
 * Round fractional hex coordinates to nearest hex
 */
export function hexRound(hex: HexCoord): HexCoord {
  const s = -hex.q - hex.r; // Cube coordinate

  let rq = Math.round(hex.q);
  let rr = Math.round(hex.r);
  const rs = Math.round(s);

  const qDiff = Math.abs(rq - hex.q);
  const rDiff = Math.abs(rr - hex.r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/**
 * Get the 6 neighboring hex coordinates
 */
export function hexNeighbors(hex: HexCoord): HexCoord[] {
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

/**
 * Get a specific neighbor by direction (0-5, starting East going counter-clockwise)
 */
export function hexNeighbor(hex: HexCoord, direction: number): HexCoord {
  const directions: HexCoord[] = [
    { q: 1, r: 0 },   // 0: East
    { q: 1, r: -1 },  // 1: Northeast
    { q: 0, r: -1 },  // 2: Northwest
    { q: -1, r: 0 },  // 3: West
    { q: -1, r: 1 },  // 4: Southwest
    { q: 0, r: 1 },   // 5: Southeast
  ];

  const dir = directions[direction % 6];
  if (!dir) return hex; // Should never happen with mod 6
  return { q: hex.q + dir.q, r: hex.r + dir.r };
}

/**
 * Calculate distance between two hexes
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/**
 * Check if two hexes are adjacent
 */
export function hexAdjacent(a: HexCoord, b: HexCoord): boolean {
  return hexDistance(a, b) === 1;
}

/**
 * Get the direction from one hex to an adjacent hex (0-5)
 */
export function hexDirection(from: HexCoord, to: HexCoord): number | null {
  const dq = to.q - from.q;
  const dr = to.r - from.r;

  const directions: [number, number, number][] = [
    [1, 0, 0],   // East
    [1, -1, 1],  // Northeast
    [0, -1, 2],  // Northwest
    [-1, 0, 3],  // West
    [-1, 1, 4],  // Southwest
    [0, 1, 5],   // Southeast
  ];

  for (const [q, r, dir] of directions) {
    if (dq === q && dr === r) return dir;
  }

  return null; // Not adjacent
}

/**
 * Create a hex coordinate key for Map/Set usage
 */
export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

/**
 * Parse a hex key back to coordinates
 */
export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q: q ?? 0, r: r ?? 0 };
}

/**
 * Generate all hex coordinates in a rectangular region
 * Returns hexes that would be visible in the given pixel bounds
 */
export function hexesInRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): HexCoord[] {
  const hexes: HexCoord[] = [];

  // Convert corners to hex coords and expand slightly
  const topLeft = pixelToHex({ x: minX, y: minY });
  const bottomRight = pixelToHex({ x: maxX, y: maxY });

  // Iterate over the range with some padding
  for (let q = topLeft.q - 1; q <= bottomRight.q + 1; q++) {
    for (let r = topLeft.r - 1; r <= bottomRight.r + 1; r++) {
      const pixel = hexToPixel({ q, r });
      // Check if hex center is within bounds (with some margin for hex size)
      if (
        pixel.x >= minX - HEX_SIZE &&
        pixel.x <= maxX + HEX_SIZE &&
        pixel.y >= minY - HEX_SIZE &&
        pixel.y <= maxY + HEX_SIZE
      ) {
        hexes.push({ q, r });
      }
    }
  }

  return hexes;
}

/**
 * Generate a hexagonal ring at a given radius from center
 */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [center];

  const results: HexCoord[] = [];
  let hex: HexCoord = { q: center.q - radius, r: center.r + radius };

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push(hex);
      hex = hexNeighbor(hex, i);
    }
  }

  return results;
}

/**
 * Generate a filled hexagonal area (spiral from center)
 */
export function hexSpiral(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [center];

  for (let r = 1; r <= radius; r++) {
    results.push(...hexRing(center, r));
  }

  return results;
}

/**
 * Get flat-top hexagon vertices for rendering
 * Vertices at 0°, 60°, 120°, 180°, 240°, 300° creates flat edges at top/bottom
 */
export function getHexVertices(centerX: number, centerY: number, size: number): PixelCoord[] {
  const vertices: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i; // Flat-top: vertices at left/right, flat edges at top/bottom
    vertices.push({
      x: centerX + size * Math.cos(angle),
      y: centerY + size * Math.sin(angle),
    });
  }
  return vertices;
}
