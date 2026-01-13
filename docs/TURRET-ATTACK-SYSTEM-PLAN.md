# Turret Attack System - Implementation Plan

## Overview

Implement a complete turret attack system with:
1. Turret rotation to face targets
2. Multiple attack types (instant laser, laser burst, bullet projectile, missile)
3. Per-unit/building laser color customization
4. Force Attack command (Ctrl+Click to attack ground)
5. Range circle visualization on selection
6. Target ring visualization on targeted entities

---

## Current State Analysis

### What Exists:
- **Combat Simulator**: Processes attacks with cooldowns, damage calculation with armor/shields
- **Building Rendering**: 3D models loaded via BabylonJS, static rotation applied at placement
- **Input Handling**: Dev panel placement mode, basic click/selection
- **Types Defined**: `ProjectileState` and `EffectState` exist but aren't implemented

### What's Missing:
- Dynamic turret rotation toward targets
- Visual attack effects (lasers, projectiles)
- Attack type configuration per unit/building
- Ctrl+Click force attack
- Range/target visualization

---

## Phase 1: Database Schema Updates

### 1.1 Add Attack Configuration Fields

**Add to `UnitDefinition` and `BuildingDefinition`:**
```prisma
attackType       String   @default("instant")  // 'instant_laser' | 'laser_burst' | 'bullet' | 'missile'
laserColor       String?  // Hex color like "#ff0000", null = default red
projectileSpeed  Float    @default(50)         // Units per second for non-instant attacks
burstCount       Int      @default(1)          // For laser_burst: number of shots
burstInterval    Float    @default(0.1)        // Seconds between burst shots
```

### 1.2 Migration
```bash
pnpm db:migrate --name add_attack_type_fields
```

---

## Phase 2: Attack Type System

### 2.1 Shared Types (`packages/shared/src/types/combat.ts`)

```typescript
export type AttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';

export interface AttackConfig {
  type: AttackType;
  laserColor: string;      // Hex color
  projectileSpeed: number; // For bullet/missile
  burstCount: number;      // For laser_burst
  burstInterval: number;   // Seconds between bursts
}

export interface ActiveLaser {
  id: string;
  sourceId: string;
  sourcePosition: { x: number; y: number; z: number };
  targetPosition: { x: number; y: number; z: number };
  color: string;
  startTime: number;
  duration: number; // Instant lasers: ~200ms, burst: per-shot
}

export interface ActiveProjectile {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'bullet' | 'missile';
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  damage: number;
  startTime: number;
}
```

### 2.2 Attack Defaults

| Attack Type | Description | Visual Duration |
|-------------|-------------|-----------------|
| `instant_laser` | Single beam, instant damage | 200ms beam visible |
| `laser_burst` | Multiple quick shots | 100ms each, configurable count |
| `bullet` | Projectile with travel time | Until impact |
| `missile` | Slower projectile, possibly tracking | Until impact |

---

## Phase 3: Turret Rotation System

### 3.1 Identify Turret Head Mesh

Turret models typically have a rotating "head" or "turret" part. Strategy:

1. **Naming Convention**: Look for child meshes named:
   - `turret`, `head`, `gun`, `barrel`, `top`
   - Or meshes containing these as substrings

2. **Fallback**: If no named part found, rotate entire model

### 3.2 Rotation Logic (`CombatEngine.ts`)

```typescript
interface TurretVisual {
  rootMesh: AbstractMesh;
  rotatablePart: AbstractMesh | null; // The part that rotates
  currentRotation: number;  // Current Y rotation
  targetRotation: number;   // Target Y rotation (toward target)
  rotationSpeed: number;    // Radians per second
}

// In update loop:
private updateTurretRotation(visual: TurretVisual, deltaTime: number): void {
  if (!visual.rotatablePart) return;

  let rotDiff = visual.targetRotation - visual.currentRotation;
  // Normalize to [-PI, PI]
  while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
  while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

  if (Math.abs(rotDiff) > 0.01) {
    const maxRot = visual.rotationSpeed * deltaTime;
    const rotAmount = Math.sign(rotDiff) * Math.min(maxRot, Math.abs(rotDiff));
    visual.currentRotation += rotAmount;
    visual.rotatablePart.rotation.y = visual.currentRotation;
  }
}

// Calculate target rotation from turret position to target position:
private calculateTargetRotation(turretX: number, turretZ: number,
                                 targetX: number, targetZ: number): number {
  return Math.atan2(targetX - turretX, targetZ - turretZ);
}
```

### 3.3 Integration Points

- When building attacks, set `targetRotation` toward target
- When force attacking ground, set `targetRotation` toward ground position
- Store rotation state per building in `buildingVisuals` map

---

## Phase 4: Laser Beam Rendering

### 4.1 Laser Mesh Creation

```typescript
private createLaserBeam(
  startPos: Vector3,
  endPos: Vector3,
  color: string,
  duration: number
): Mesh {
  // Create cylinder stretched between points
  const distance = Vector3.Distance(startPos, endPos);
  const laser = MeshBuilder.CreateCylinder('laser', {
    height: distance,
    diameter: 0.15,  // Thin beam
    tessellation: 8
  }, this.scene);

  // Position at midpoint
  const midpoint = Vector3.Lerp(startPos, endPos, 0.5);
  laser.position = midpoint;

  // Rotate to face target
  laser.lookAt(endPos);
  laser.rotation.x += Math.PI / 2; // Cylinders are Y-up by default

  // Material with emissive glow
  const material = new StandardMaterial('laserMat', this.scene);
  material.emissiveColor = Color3.FromHexString(color);
  material.disableLighting = true;
  laser.material = material;

  // Add to glow layer
  this.glowLayer.addIncludedOnlyMesh(laser);

  return laser;
}
```

### 4.2 Laser Lifecycle

```typescript
private activeLasers: Map<string, { mesh: Mesh; endTime: number }> = new Map();

public fireLaser(sourcePos: Vector3, targetPos: Vector3, color: string): void {
  const id = `laser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const duration = 200; // ms

  const mesh = this.createLaserBeam(sourcePos, targetPos, color, duration);
  this.activeLasers.set(id, {
    mesh,
    endTime: Date.now() + duration
  });
}

// In render loop:
private updateLasers(): void {
  const now = Date.now();
  for (const [id, laser] of this.activeLasers) {
    if (now >= laser.endTime) {
      laser.mesh.dispose();
      this.activeLasers.delete(id);
    }
  }
}
```

---

## Phase 5: Range Circle Visualization

### 5.1 Range Circle Mesh (Torus)

```typescript
private rangeCircle: Mesh | null = null;

public showRangeCircle(centerX: number, centerZ: number, range: number): void {
  if (this.rangeCircle) {
    this.rangeCircle.dispose();
  }

  // Torus creates a proper ring without filling center
  this.rangeCircle = MeshBuilder.CreateTorus('rangeCircle', {
    diameter: range * TILE_SIZE * 2,
    thickness: 0.5,
    tessellation: 64
  }, this.scene);

  // Position slightly above ground
  this.rangeCircle.position = new Vector3(
    centerX * TILE_SIZE,
    0.1,
    centerZ * TILE_SIZE
  );
  this.rangeCircle.rotation.x = Math.PI / 2; // Lay flat

  // Semi-transparent material
  const material = new StandardMaterial('rangeMat', this.scene);
  material.diffuseColor = new Color3(0, 0.8, 1); // Cyan
  material.alpha = 0.3;
  material.emissiveColor = new Color3(0, 0.3, 0.4);
  this.rangeCircle.material = material;
}

public hideRangeCircle(): void {
  if (this.rangeCircle) {
    this.rangeCircle.dispose();
    this.rangeCircle = null;
  }
}
```

---

## Phase 6: Target Ring Visualization

### 6.1 Target Ring on Enemy

```typescript
private targetRing: Mesh | null = null;
private targetRingTarget: string | null = null;

public showTargetRing(targetId: string, x: number, z: number, radius: number): void {
  if (this.targetRing) {
    this.targetRing.dispose();
  }

  this.targetRingTarget = targetId;

  // Create animated ring
  this.targetRing = MeshBuilder.CreateTorus('targetRing', {
    diameter: radius * 2,
    thickness: 0.2,
    tessellation: 32
  }, this.scene);

  this.targetRing.position = new Vector3(x, 0.2, z);
  this.targetRing.rotation.x = Math.PI / 2;

  // Red/orange material
  const material = new StandardMaterial('targetMat', this.scene);
  material.emissiveColor = new Color3(1, 0.3, 0);
  material.alpha = 0.8;
  this.targetRing.material = material;

  // Add to glow layer for visibility
  this.glowLayer.addIncludedOnlyMesh(this.targetRing);
}

public hideTargetRing(): void {
  if (this.targetRing) {
    this.targetRing.dispose();
    this.targetRing = null;
    this.targetRingTarget = null;
  }
}

// Update position if target moves
public updateTargetRingPosition(x: number, z: number): void {
  if (this.targetRing) {
    this.targetRing.position.x = x;
    this.targetRing.position.z = z;
  }
}
```

---

## Phase 7: Force Attack Command (Ctrl+Click)

### 7.1 Input Detection

**In CombatView.vue or CombatEngine.ts:**

```typescript
private handleCanvasClick(event: MouseEvent): void {
  const position = this.screenToArena(event.clientX, event.clientY);
  if (!position) return;

  // Ctrl+Click = Force Attack
  if (event.ctrlKey && this.selectedBuildingId) {
    this.forceAttackGround(this.selectedBuildingId, position);
    return;
  }

  // Normal click handling...
}
```

### 7.2 Force Attack Implementation

```typescript
public forceAttackGround(buildingId: string, targetPos: ArenaPosition): void {
  const building = this.buildingVisuals.get(buildingId);
  if (!building) return;

  // Get building world position
  const buildingWorldX = building.x * TILE_SIZE;
  const buildingWorldZ = building.z * TILE_SIZE;

  // Target world position
  const targetWorldX = targetPos.x * TILE_SIZE;
  const targetWorldZ = targetPos.z * TILE_SIZE;

  // Calculate distance
  const distance = Math.sqrt(
    Math.pow(targetWorldX - buildingWorldX, 2) +
    Math.pow(targetWorldZ - buildingWorldZ, 2)
  );

  // Check if in range
  const rangeInMeters = building.range * TILE_SIZE;
  if (distance > rangeInMeters) {
    console.log('Target out of range');
    return;
  }

  // Set turret rotation toward target
  building.targetRotation = this.calculateTargetRotation(
    buildingWorldX, buildingWorldZ,
    targetWorldX, targetWorldZ
  );

  // Fire laser at ground position
  const sourcePos = new Vector3(buildingWorldX, TILE_SIZE, buildingWorldZ);
  const targetVec = new Vector3(targetWorldX, 0.1, targetWorldZ);

  this.fireLaser(sourcePos, targetVec, building.laserColor || '#ff0000');
}
```

### 7.3 Selection State for Buildings

```typescript
private selectedBuildingId: string | null = null;

public selectBuilding(buildingId: string): void {
  // Clear previous selection
  if (this.selectedBuildingId) {
    this.hideRangeCircle();
  }

  this.selectedBuildingId = buildingId;

  const building = this.buildingVisuals.get(buildingId);
  if (building && building.range > 0) {
    this.showRangeCircle(building.x, building.z, building.range);
  }
}

public deselectBuilding(): void {
  this.selectedBuildingId = null;
  this.hideRangeCircle();
  this.hideTargetRing();
}
```

---

## Phase 8: API & Editor Updates

### 8.1 Update Building/Unit Types

**`apps/api/src/modules/buildings/types.ts`:**
```typescript
export interface BuildingDefinitionInput {
  // ... existing fields
  attackType?: 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';
  laserColor?: string | null;
  projectileSpeed?: number;
  burstCount?: number;
  burstInterval?: number;
}
```

### 8.2 Update Editors

**BuildingsEditor.vue** - Add attack configuration section:
- Attack Type dropdown
- Laser Color picker (with preview)
- Projectile speed slider (for bullet/missile)
- Burst settings (for laser_burst)

---

## Implementation Order

### Sprint 1: Foundation
1. [ ] Add schema fields (attackType, laserColor, projectileSpeed, burstCount, burstInterval)
2. [ ] Run migration
3. [ ] Update API types and services for buildings
4. [ ] Update API types and services for units

### Sprint 2: Visual Systems
5. [ ] Add selection state tracking in CombatEngine
6. [ ] Implement range circle (torus mesh)
7. [ ] Implement target ring visualization
8. [ ] Wire up selection click handlers

### Sprint 3: Turret Rotation
9. [ ] Add TurretVisual interface with rotation tracking
10. [ ] Implement findRotatablePart() for turret meshes
11. [ ] Add rotation update in render loop
12. [ ] Test with existing turret models

### Sprint 4: Laser Attack
13. [ ] Implement createLaserBeam() with glow
14. [ ] Implement fireLaser() and laser lifecycle
15. [ ] Add updateLasers() cleanup in render loop
16. [ ] Integrate with turret attacks

### Sprint 5: Force Attack
17. [ ] Add Ctrl+Click detection
18. [ ] Implement forceAttackGround()
19. [ ] Add visual feedback (cursor change when Ctrl held?)
20. [ ] Test end-to-end with configured turret

### Sprint 6: Editor Integration
21. [ ] Add attack config fields to BuildingsEditor
22. [ ] Add attack config fields to UnitsEditor
23. [ ] Add color picker for laser color
24. [ ] Test configuration persistence

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add attack fields to Unit/BuildingDefinition |
| `packages/shared/src/types/combat.ts` | Add AttackConfig, ActiveLaser types |
| `apps/web/src/game/combat/CombatEngine.ts` | Turret rotation, lasers, range/target circles |
| `apps/api/src/modules/buildings/types.ts` | Add attack fields |
| `apps/api/src/modules/buildings/service.ts` | Handle new fields |
| `apps/api/src/modules/units/types.ts` | Add attack fields |
| `apps/api/src/modules/units/service.ts` | Handle new fields |
| `apps/web/src/views/dev/BuildingsEditor.vue` | Attack config UI |
| `apps/web/src/views/dev/UnitsEditor.vue` | Attack config UI |

---

## Verification Plan

### Manual Testing Checklist
1. [ ] Create a turret building with `attackType: instant_laser`, `laserColor: #00ff00`
2. [ ] Place turret in combat dev panel
3. [ ] Click turret to select it → range circle appears
4. [ ] Click elsewhere → range circle disappears
5. [ ] Ctrl+Click ground within range → turret rotates and fires laser
6. [ ] Ctrl+Click ground outside range → nothing happens (or "out of range" feedback)
7. [ ] Laser appears for ~200ms with correct color
8. [ ] Turret rotation is smooth, not instant

### Edge Cases
- Turret with no rotatable part (falls back to full model rotation)
- Multiple rapid force attacks
- Laser color validation (hex format)
- Zero range turrets (should not show range circle)

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Laser rendering | Cylinder mesh with emissive | Simple, performant, looks good with glow layer |
| Range circle | Torus mesh | Clean ring without filling, single mesh |
| Turret part detection | Name-based search | Matches common 3D modeling conventions |
| Rotation speed | Configurable per-turret | Different turrets can have different responsiveness |
| Force attack | Ctrl+Click | Standard RTS convention, doesn't conflict with other inputs |

---

_Created: 2026-01-12_
_Status: Ready for Implementation_
