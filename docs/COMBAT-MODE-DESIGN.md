# NOVA FALL - Combat Mode Design Document

## Technical & Gameplay Specification

**Version:** 1.0
**Created:** January 2026
**Status:** Design Complete - Pending Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Combat Overview](#2-combat-overview)
3. [Technical Architecture](#3-technical-architecture)
4. [Combat Arena System](#4-combat-arena-system)
5. [Unit System](#5-unit-system)
6. [Pathfinding System](#6-pathfinding-system)
7. [Combat Resolution](#7-combat-resolution)
8. [Camera System](#8-camera-system)
9. [Attacker Mechanics](#9-attacker-mechanics)
10. [Defender Mechanics](#10-defender-mechanics)
11. [Victory & Loss Conditions](#11-victory--loss-conditions)
12. [UI/UX Design](#12-uiux-design)
13. [Visual Effects & Polish](#13-visual-effects--polish)
14. [Audio Design](#14-audio-design)
15. [Performance Optimization](#15-performance-optimization)
16. [Asset Strategy](#16-asset-strategy)
17. [Network Architecture](#17-network-architecture)
18. [Implementation Phases](#18-implementation-phases)
19. [File Structure](#19-file-structure)
20. [Testing & Verification](#20-testing--verification)

---

## 1. Executive Summary

### 1.1 What is Combat Mode?

Combat Mode is the real-time 3D battle view activated when a declared attack enters its 30-minute combat window. Players transition from the 2D tactical hex map (PixiJS) to a 3D arena (Babylon.js) where:

- **Attackers** deploy units from the arena perimeter to destroy the defender's HQ
- **Defenders** manage towers and garrison units to protect their HQ until time expires

### 1.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **3D Engine** | Babylon.js | Best-in-class WebGL, native TypeScript, batteries-included |
| **Arena Layout** | Modular Tiles | Generic base with node-type specific props for variety |
| **Unit Control** | Selective Full Control | Manual orders override AI temporarily, then revert |
| **Multiplayer** | Shared Real-Time View | Both players see same battle, server-authoritative |
| **Deployment** | Wave-Based | Attacker chooses when/where to spawn units |
| **Camera** | Hybrid Isometric | Default 45° angle with rotation/tilt option |
| **Victory** | HQ + Time Limits | Destroy HQ to win; survive 30 min or eliminate attackers to defend |
| **Assets** | Mixed (Free + Low-Budget) | Free CC0 for terrain/props, purchased for hero units/structures |

### 1.3 Combat in Context

Combat occurs within the broader attack timeline defined in the Game Design Document:

```
INITIATION ──► PREPARATION ──► FORCES LOCKED ──► COMBAT ──► RESOLUTION ──► COOLDOWN
                (20-28 hrs)      (final 1 hr)     (30 min)                   (3 days)
```

Combat Mode handles the "COMBAT" phase - the 30-minute real-time battle window.

---

## 2. Combat Overview

### 2.1 Combat Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMBAT PHASE (30 MINUTES)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   LOADING    │───►│   DEPLOY     │───►│   BATTLE     │───►│ RESOLVE   │ │
│  │   (5 sec)    │    │   PHASE      │    │   PHASE      │    │           │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│        │                    │                    │                   │      │
│        ▼                    ▼                    ▼                   ▼      │
│   Load arena,         Attacker deploys     Real-time combat    Determine   │
│   sync state,         units from           with manual         winner,     │
│   show countdown      perimeter            orders & AI         transfer    │
│                                                                 ownership  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Player Objectives

**Attacker Goal:** Destroy the HQ structure within the 30-minute time limit.

**Defender Goal:** Survive until time expires OR eliminate all attacking units.

### 2.3 Absent Player Handling

If a player is not present when combat begins or disconnects during combat:

1. **AI Takeover:** Units operate on autopilot using default behaviors
2. **Towers:** Continue auto-targeting nearest threats
3. **Garrison:** Defend automatically, engaging enemies in range
4. **Attackers:** Follow Flow Field to HQ, attack obstacles in path
5. **Reconnection:** Player can rejoin and resume manual control at any time

**Important:** Active participation provides significant advantages through:
- Optimal target prioritization
- Timed ability usage
- Coordinated unit positioning
- Strategic deployment timing

---

## 3. Technical Architecture

### 3.1 View Switching System

The game uses a layered approach with CSS to manage the 2D tactical map and 3D combat view.

```
┌────────────────────────────────────────────────────────────────┐
│                        Vue App Container                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layer 1: Tactical Map (PixiJS Canvas)                   │  │
│  │  - v-show="!inCombat"                                    │  │
│  │  - engine.stopRenderLoop() when hidden                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layer 2: Combat View (Babylon.js Canvas)                │  │
│  │  - v-show="inCombat"                                     │  │
│  │  - engine.runRenderLoop() when shown                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layer 3: Vue UI Overlay (HTML/CSS)                      │  │
│  │  - Combat HUD, panels, modals                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Critical Rules:**
- **NEVER** use `v-if` on canvas elements (causes WebGL context loss)
- **ALWAYS** use `v-show` for visibility toggling
- **PAUSE** render loops for hidden canvases to save CPU/GPU

### 3.2 Babylon.js Integration

#### 3.2.1 Engine Initialization

```typescript
// CombatEngine.ts
export class CombatEngine {
  private engine: Engine;
  private scene: Scene;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    this.scene = new Scene(this.engine);
    this.setupEnvironment();
  }

  private setupEnvironment(): void {
    // IBL for realistic lighting
    this.scene.createDefaultEnvironment({
      createGround: false,
      createSkybox: true,
      skyboxSize: 1000
    });

    // Enable glow for effects
    const glowLayer = new GlowLayer("glow", this.scene);
    glowLayer.intensity = 0.5;
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  stop(): void {
    this.engine.stopRenderLoop();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
```

#### 3.2.2 Vue Composable

```typescript
// useCombatEngine.ts
export function useCombatEngine() {
  const engine = ref<CombatEngine | null>(null);
  const isActive = ref(false);

  const initEngine = (canvas: HTMLCanvasElement) => {
    engine.value = new CombatEngine(canvas);
  };

  const enterCombat = (battleId: string) => {
    if (!engine.value) return;
    engine.value.start();
    engine.value.loadBattle(battleId);
    isActive.value = true;
  };

  const exitCombat = () => {
    if (!engine.value) return;
    engine.value.stop();
    isActive.value = false;
  };

  onUnmounted(() => {
    engine.value?.dispose();
  });

  return { engine, isActive, initEngine, enterCombat, exitCombat };
}
```

### 3.3 Server-Authoritative Combat

All combat logic runs on the server. Clients send inputs and receive state updates.

#### 3.3.1 Tick Rate

| Component | Rate | Purpose |
|-----------|------|---------|
| Server Tick | 20 TPS (50ms) | Authoritative game state updates |
| Client Render | 60 FPS | Smooth visual interpolation |
| Input Send | 20 Hz | Player command transmission |
| State Broadcast | 20 Hz | Full state sync to clients |

#### 3.3.2 State Synchronization Flow

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│ Client A │                    │  Server  │                    │ Client B │
│(Attacker)│                    │          │                    │(Defender)│
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │─── deploy_unit(unitId, pos) ─►│                               │
     │                               │                               │
     │                               │◄── target_tower(towerId) ─────│
     │                               │                               │
     │                    ┌──────────┴──────────┐                    │
     │                    │  Process tick:       │                    │
     │                    │  - Apply inputs      │                    │
     │                    │  - Update positions  │                    │
     │                    │  - Resolve combat    │                    │
     │                    │  - Check victory     │                    │
     │                    └──────────┬──────────┘                    │
     │                               │                               │
     │◄────────── state_update ──────┼───────── state_update ───────►│
     │                               │                               │
```

#### 3.3.3 WebSocket Events

**Client → Server:**
```typescript
interface CombatInput {
  type: 'deploy' | 'move' | 'attack' | 'ability' | 'target_priority';
  unitIds?: string[];
  targetId?: string;
  position?: { x: number; z: number };
  abilityId?: string;
}
```

**Server → Client:**
```typescript
interface CombatState {
  tick: number;
  timestamp: number;
  timeRemaining: number; // seconds
  hqHealth: number;
  hqMaxHealth: number;
  units: CombatUnitState[];
  projectiles: ProjectileState[];
  effects: EffectState[];
  events: CombatEvent[]; // damage, kills, abilities this tick
}
```

---

## 4. Combat Arena System

### 4.1 Grid-Based Terrain

The combat arena uses a strict integer grid for all logic, with smooth visual rendering.

#### 4.1.1 Grid Specifications

| Property | Value | Notes |
|----------|-------|-------|
| Grid Size | 60 x 60 tiles | 3600 total tiles |
| Tile Size | 2 meters | 80m x 80m arena |
| HQ Position | Center (20, 20) | Occupies 2x2 tiles |
| Spawn Zones | Perimeter (edge tiles) | Attackers deploy here |
| Coordinate System | X (east), Z (north) | Y is up/height |

#### 4.1.2 Tile Types

```typescript
enum TileType {
  WALKABLE = 'walkable',      // Normal movement
  BLOCKED = 'blocked',        // Impassable (walls, structures)
  SLOW = 'slow',              // 50% movement speed
  HQ_ZONE = 'hq_zone',        // HQ footprint
  SPAWN_ZONE = 'spawn_zone',  // Attacker deployment area
  HAZARD = 'hazard'           // Damage over time
}
```

#### 4.1.3 Terrain Rendering

Use ThinInstances for massive performance gains:

```typescript
class TerrainManager {
  private groundMesh: Mesh;
  private tileInstances: InstancedMesh[];

  createTerrain(layout: TileType[][]): void {
    // Single draw call for all ground tiles
    const baseGround = MeshBuilder.CreateGround("ground", {
      width: 2,
      height: 2
    }, this.scene);

    const matrices: Matrix[] = [];
    for (let x = 0; x < 40; x++) {
      for (let z = 0; z < 40; z++) {
        const matrix = Matrix.Translation(x * 2, 0, z * 2);
        matrices.push(matrix);
      }
    }

    baseGround.thinInstanceSetBuffer("matrix",
      matrices.flatMap(m => m.toArray()), 16);
  }
}
```

### 4.2 Modular Props by Node Type

Each node type has a unique visual theme achieved through procedurally placed props.

#### 4.2.1 Node Type Themes

| Node Type | Theme | Ground Color | Unique Props |
|-----------|-------|--------------|--------------|
| **Mining Station** | Industrial/Rocky | Brown/Gray | Ore extractors, conveyor belts, rubble piles, mining carts |
| **Refinery** | Factory/Metal | Dark Gray | Smokestacks, pipes, storage tanks, chemical vats |
| **Research Lab** | High-Tech/Clean | White/Blue | Antenna arrays, glowing panels, holographic displays |
| **Barracks** | Military/Fortified | Olive/Tan | Bunkers, sandbags, watch towers, weapon racks |
| **Agricultural** | Rural/Organic | Green/Brown | Crop fields, silos, irrigation systems, greenhouses |
| **Power Plant** | Energy/Glowing | Blue/Yellow | Reactors, power lines, cooling towers, capacitors |
| **Trade Hub** | Commercial/Open | Gray/White | Landing pads, cargo containers, cranes, warehouses |
| **Colony HQ** | Command/Central | Player Color | Command center, comm arrays, defensive hardpoints |

#### 4.2.2 Prop Placement Algorithm

```typescript
interface PropDefinition {
  meshId: string;
  tileTypes: TileType[];      // Where this prop can spawn
  density: number;            // 0-1, chance per valid tile
  scale: { min: number; max: number };
  rotationVariance: number;   // Radians
  blocksMovement: boolean;
}

function generateProps(nodeType: NodeType, layout: TileType[][]): PropInstance[] {
  const props: PropInstance[] = [];
  const definitions = PROP_DEFINITIONS[nodeType];

  for (const def of definitions) {
    for (let x = 0; x < layout.length; x++) {
      for (let z = 0; z < layout[x].length; z++) {
        if (!def.tileTypes.includes(layout[x][z])) continue;
        if (Math.random() > def.density) continue;

        props.push({
          meshId: def.meshId,
          position: { x: x * 2 + Math.random(), z: z * 2 + Math.random() },
          rotation: Math.random() * def.rotationVariance,
          scale: def.scale.min + Math.random() * (def.scale.max - def.scale.min)
        });

        if (def.blocksMovement) {
          layout[x][z] = TileType.BLOCKED;
        }
      }
    }
  }

  return props;
}
```

### 4.3 HQ Structure

The HQ is the central objective - the structure attackers must destroy.

#### 4.3.1 HQ Properties

| Property | Value | Notes |
|----------|-------|-------|
| Position | Center (20, 20) | Fixed location |
| Footprint | 2x2 tiles | 4x4 meters |
| Base Health | 10,000 HP | Scales with node tier |
| Armor | 50 | Reduces incoming damage |
| Self-Repair | None | No passive regeneration |

#### 4.3.2 Health Scaling by Tier

| Node Tier | Health Multiplier | Total HP |
|-----------|-------------------|----------|
| Tier 1 | 1.0x | 10,000 |
| Tier 2 | 1.5x | 15,000 |
| Tier 3 | 2.0x | 20,000 |

#### 4.3.3 HQ Visual States

```typescript
enum HQVisualState {
  HEALTHY = 'healthy',      // > 75% HP - Normal appearance
  DAMAGED = 'damaged',      // 25-75% HP - Smoke, cracks
  CRITICAL = 'critical',    // < 25% HP - Fires, sparks
  DESTROYED = 'destroyed'   // 0 HP - Explosion, collapse
}
```

---

## 5. Unit System

### 5.1 Unit Data Structure

```typescript
interface CombatUnit {
  // Identity
  id: string;
  typeId: string;                // References UNIT_TYPES config
  ownerId: string;               // Player ID
  name?: string;                 // Custom name (optional)

  // Position & Movement
  position: Vector3;             // Current world position
  targetPosition: Vector3 | null; // Movement destination
  rotation: number;              // Y-axis rotation (radians)

  // Combat Stats
  health: number;
  maxHealth: number;
  damage: number;
  armor: number;
  range: number;                 // Attack range in meters
  attackSpeed: number;           // Attacks per second
  moveSpeed: number;             // Meters per second

  // State
  state: UnitState;
  veterancy: Veterancy;
  experience: number;

  // AI & Orders
  currentOrder: UnitOrder | null;
  targetId: string | null;       // Current attack target
  lastTargetAcquired: number;    // Timestamp

  // Cooldowns
  attackCooldown: number;        // Time until next attack
  abilityCooldowns: Map<string, number>;

  // Visual
  meshId: string;                // Babylon mesh reference
  animationState: string;
}

enum UnitState {
  SPAWNING = 'spawning',         // Brief spawn animation
  IDLE = 'idle',                 // No orders, will seek targets
  MOVING = 'moving',             // Moving to position
  ATTACKING = 'attacking',       // Engaged with target
  ABILITY_CAST = 'ability_cast', // Using special ability
  RETREATING = 'retreating',     // Fleeing (defender loss)
  DEAD = 'dead'                  // Destroyed
}

interface UnitOrder {
  type: 'move' | 'attack' | 'patrol' | 'hold';
  targetPosition?: Vector3;
  targetId?: string;
  issuedAt: number;
  completedAt?: number;
}
```

### 5.2 Unit Types

Based on existing `packages/shared/src/config/units.ts`:

| Unit Type | Role | HP | Damage | Armor | Speed | Range | Special |
|-----------|------|----|----- --|-------|-------|-------|---------|
| **Militia** | Basic Infantry | 100 | 10 | 5 | 3 m/s | 5m | Cheap, numerous |
| **Marine** | Standard Infantry | 150 | 15 | 10 | 3.5 m/s | 8m | Balanced |
| **Heavy Trooper** | Armored Infantry | 300 | 20 | 25 | 2 m/s | 6m | High HP, slow |
| **Ranger** | Scout | 80 | 12 | 3 | 5 m/s | 12m | Fast, reveals traps |
| **Engineer** | Support | 100 | 8 | 8 | 3 m/s | 4m | Repairs, disables |
| **Assault Mech** | Heavy Assault | 500 | 40 | 30 | 2.5 m/s | 10m | High damage |
| **Siege Tank** | Structure Killer | 400 | 60 | 20 | 1.5 m/s | 15m | Anti-building |
| **Drone Swarm** | Harassment | 40 | 5 | 0 | 6 m/s | 3m | Many weak units |
| **Commando** | Specialist | 200 | 25 | 10 | 4 m/s | 8m | Stealth, sabotage |

### 5.3 Unit AI Behavior

#### 5.3.1 Default Behaviors

**Attacker Units (No Manual Order):**
1. Follow Flow Field toward HQ
2. If obstacle in path, attack it (walls, towers)
3. If defender unit in range, engage
4. Priority: Threats > Obstacles > HQ

**Defender Units (No Manual Order):**
1. Patrol assigned zone (if set)
2. Engage any enemy in detection range
3. Prioritize threats to HQ
4. Fall back if overwhelmed (< 20% HP)

**Both:**
- Auto-acquire nearest valid target when idle
- Re-evaluate targets every 0.5 seconds
- Prefer attacking current target unless better option

#### 5.3.2 Target Priority Algorithm

```typescript
function calculateTargetPriority(
  unit: CombatUnit,
  target: CombatUnit | Structure,
  hqPosition: Vector3
): number {
  let priority = 0;
  const distance = Vector3.Distance(unit.position, target.position);

  // Base priority by target type
  if (target.type === 'unit') {
    priority += 100;
  } else if (target.type === 'tower') {
    priority += 80;
  } else if (target.type === 'wall') {
    priority += 30;
  } else if (target.type === 'hq') {
    priority += 200;
  }

  // Adjust by distance (closer = higher priority)
  priority -= distance * 2;

  // Adjust by health (lower = higher priority for finishing)
  const healthPercent = target.health / target.maxHealth;
  priority += (1 - healthPercent) * 50;

  // Adjust by threat to HQ (for defenders)
  if (unit.ownerId === 'defender') {
    const distToHQ = Vector3.Distance(target.position, hqPosition);
    priority += (40 - distToHQ) * 3; // Closer to HQ = higher priority
  }

  return priority;
}
```

### 5.4 Manual Order System

Players can issue orders that temporarily override AI behavior.

#### 5.4.1 Order Types

| Order | Input | Effect | Completion |
|-------|-------|--------|------------|
| **Move** | Right-click ground | Move to position via A* | Reached destination |
| **Attack** | Right-click enemy | Chase and attack target | Target destroyed or lost |
| **Attack-Move** | A + click ground | Move, engaging enemies | Reached destination |
| **Hold Position** | H key | Stop and engage in place | New order issued |
| **Patrol** | P + click points | Loop between points | Manual cancel |

#### 5.4.2 Order Queue

- **Shift+Click** appends orders to queue
- Queue max: 5 orders per unit
- Visual waypoint markers show queued positions

#### 5.4.3 Order Completion → AI Revert

When a manual order completes:
1. `currentOrder` set to `null`
2. Unit enters `IDLE` state
3. AI behavior resumes on next tick
4. Unit auto-acquires new target

```typescript
function processUnitTick(unit: CombatUnit, deltaTime: number): void {
  // Check if current order is complete
  if (unit.currentOrder && isOrderComplete(unit, unit.currentOrder)) {
    unit.currentOrder.completedAt = Date.now();
    unit.currentOrder = null;
    unit.state = UnitState.IDLE;
  }

  // If no order, run AI behavior
  if (!unit.currentOrder) {
    runAIBehavior(unit);
  }
}
```

### 5.5 Veterancy System

Units gain experience from combat, improving their effectiveness.

```typescript
// From existing shared/config/units.ts
const VETERANCY_THRESHOLDS = {
  [Veterancy.ROOKIE]: 0,
  [Veterancy.REGULAR]: 50,
  [Veterancy.VETERAN]: 150,
  [Veterancy.ELITE]: 400,
  [Veterancy.LEGENDARY]: 1500
};

const VETERANCY_MULTIPLIERS = {
  [Veterancy.ROOKIE]: 1.0,
  [Veterancy.REGULAR]: 1.1,
  [Veterancy.VETERAN]: 1.2,
  [Veterancy.ELITE]: 1.35,
  [Veterancy.LEGENDARY]: 1.5
};
```

**Experience Sources:**
- Dealing damage: 1 XP per 10 damage dealt
- Killing units: 10 XP per kill
- Destroying structures: 20 XP per structure
- Surviving battle: 25 XP bonus

---

## 6. Pathfinding System

### 6.1 Flow Field (Siege AI)

Flow Fields provide efficient pathfinding for many units toward a single destination (the HQ).

#### 6.1.1 How Flow Fields Work

1. **Integration Field:** Dijkstra's algorithm from HQ, calculating cost to reach HQ from each tile
2. **Flow Field:** For each tile, store direction to lowest-cost neighbor
3. **Movement:** Units simply move in the direction their current tile indicates

```
Integration Field (costs)    Flow Field (directions)
┌────┬────┬────┬────┐       ┌────┬────┬────┬────┐
│ 8  │ 7  │ 6  │ 7  │       │ ↘  │ ↓  │ ↙  │ ←  │
├────┼────┼────┼────┤       ├────┼────┼────┼────┤
│ 7  │ 6  │ 5  │ 6  │       │ ↓  │ ↘  │ ↙  │ ←  │
├────┼────┼────┼────┤       ├────┼────┼────┼────┤
│ 6  │ 5  │ HQ │ 5  │       │ →  │ →  │ HQ │ ←  │
├────┼────┼────┼────┤       ├────┼────┼────┼────┤
│ 7  │ 6  │ 5  │ 6  │       │ ↑  │ ↗  │ ↑  │ ↖  │
└────┴────┴────┴────┘       └────┴────┴────┴────┘
```

#### 6.1.2 Implementation

```typescript
class FlowFieldManager {
  private integrationField: number[][];  // Cost to HQ per tile
  private flowField: Vector2[][];        // Direction per tile
  private gridSize: number = 40;

  generate(hqPosition: Vector2, obstacles: Set<string>): void {
    // Initialize integration field with infinity
    this.integrationField = Array(this.gridSize).fill(null)
      .map(() => Array(this.gridSize).fill(Infinity));

    // BFS from HQ
    const queue: Array<{x: number, z: number, cost: number}> = [];
    queue.push({ x: hqPosition.x, z: hqPosition.y, cost: 0 });
    this.integrationField[hqPosition.x][hqPosition.y] = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of this.getNeighbors(current.x, current.z)) {
        const key = `${neighbor.x},${neighbor.z}`;
        if (obstacles.has(key)) continue;

        const newCost = current.cost + this.getTileCost(neighbor.x, neighbor.z);
        if (newCost < this.integrationField[neighbor.x][neighbor.z]) {
          this.integrationField[neighbor.x][neighbor.z] = newCost;
          queue.push({ ...neighbor, cost: newCost });
        }
      }
    }

    // Generate flow directions
    this.flowField = Array(this.gridSize).fill(null)
      .map(() => Array(this.gridSize).fill(new Vector2(0, 0)));

    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        this.flowField[x][z] = this.calculateFlowDirection(x, z);
      }
    }
  }

  getDirection(x: number, z: number): Vector2 {
    const tileX = Math.floor(x / 2);
    const tileZ = Math.floor(z / 2);
    return this.flowField[tileX]?.[tileZ] ?? new Vector2(0, 0);
  }

  private calculateFlowDirection(x: number, z: number): Vector2 {
    let bestNeighbor = { x, z };
    let bestCost = this.integrationField[x][z];

    for (const neighbor of this.getNeighbors(x, z)) {
      const cost = this.integrationField[neighbor.x]?.[neighbor.z] ?? Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        bestNeighbor = neighbor;
      }
    }

    return new Vector2(bestNeighbor.x - x, bestNeighbor.z - z).normalize();
  }
}
```

#### 6.1.3 Performance Benefits

| Units | A* Paths/Frame | Flow Field Lookups/Frame |
|-------|----------------|-------------------------|
| 10 | 10 | 10 |
| 50 | 50 | 50 |
| 100 | 100 (expensive!) | 100 (cheap!) |
| 200 | 200 (very slow) | 200 (still cheap) |

Flow Field cost is O(1) per unit vs O(N*M) for A* per unit.

### 6.2 A* Pathfinding (Manual Orders)

A* is used only for manual move commands where the destination differs from HQ.

#### 6.2.1 When to Use A*

- Player right-clicks a specific position
- Unit needs to navigate around obstacles to a custom destination
- Calculated once per order, not per frame

#### 6.2.2 Implementation

```typescript
function findPath(
  start: Vector2,
  goal: Vector2,
  obstacles: Set<string>
): Vector2[] {
  const openSet = new PriorityQueue<PathNode>();
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, Vector2>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const startKey = `${start.x},${start.y}`;
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(start, goal));
  openSet.enqueue({ position: start, f: fScore.get(startKey)! });

  while (!openSet.isEmpty()) {
    const current = openSet.dequeue()!.position;
    const currentKey = `${current.x},${current.y}`;

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current);
    }

    closedSet.add(currentKey);

    for (const neighbor of getNeighbors(current)) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(neighborKey) || obstacles.has(neighborKey)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, goal));
        openSet.enqueue({ position: neighbor, f: fScore.get(neighborKey)! });
      }
    }
  }

  return []; // No path found
}

function heuristic(a: Vector2, b: Vector2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan distance
}
```

#### 6.2.3 Path Smoothing

Raw A* paths have jagged corners. Apply smoothing for natural movement:

```typescript
function smoothPath(path: Vector2[]): Vector2[] {
  if (path.length <= 2) return path;

  const smoothed: Vector2[] = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    // Find furthest visible point
    let furthest = current + 1;
    for (let i = path.length - 1; i > current + 1; i--) {
      if (hasLineOfSight(path[current], path[i])) {
        furthest = i;
        break;
      }
    }
    smoothed.push(path[furthest]);
    current = furthest;
  }

  return smoothed;
}
```

### 6.3 Dynamic Obstacle Updates

When terrain changes (wall destroyed, building placed), update pathfinding:

1. **Flow Field:** Regenerate from HQ (takes ~10ms for 60x60 grid)
2. **Active A* Paths:** Mark affected paths as invalid, recalculate
3. **Throttling:** Max 1 flow field regeneration per 100ms

```typescript
function onObstacleChanged(position: Vector2, added: boolean): void {
  if (added) {
    obstacles.add(`${position.x},${position.y}`);
  } else {
    obstacles.delete(`${position.x},${position.y}`);
  }

  // Throttle flow field regeneration
  if (!this.flowFieldPending) {
    this.flowFieldPending = true;
    setTimeout(() => {
      this.flowField.generate(this.hqPosition, this.obstacles);
      this.flowFieldPending = false;
    }, 100);
  }
}
```

---

## 7. Combat Resolution

### 7.1 Damage System

#### 7.1.1 Damage Types

| Type | Behavior | Visual |
|------|----------|--------|
| **Hitscan** | Instant raycast, immediate damage | Laser beam (fade) |
| **Projectile** | Travel time, can miss | Bullet/missile |
| **Area** | Splash damage with falloff | Explosion |
| **Beam** | Continuous damage over time | Sustained laser |

#### 7.1.2 Damage Calculation

```typescript
function calculateDamage(
  attacker: CombatUnit | Tower,
  target: CombatUnit | Structure,
  weaponType: WeaponType
): number {
  const baseDamage = attacker.damage;

  // Apply veterancy bonus (units only)
  let damage = baseDamage;
  if ('veterancy' in attacker) {
    damage *= VETERANCY_MULTIPLIERS[attacker.veterancy];
  }

  // Apply armor reduction
  // Formula: finalDamage = damage * (100 / (100 + armor))
  const armorReduction = 100 / (100 + target.armor);
  damage *= armorReduction;

  // Apply damage type modifiers
  if (weaponType === 'anti_armor' && target.armor > 20) {
    damage *= 1.5; // Bonus vs armored
  }
  if (weaponType === 'anti_structure' && target.type === 'structure') {
    damage *= 2.0; // Bonus vs buildings
  }

  // Critical hit (5% chance, 2x damage)
  if (Math.random() < 0.05) {
    damage *= 2;
  }

  return Math.floor(damage);
}
```

#### 7.1.3 Armor Examples

| Target | Armor | Damage Reduction |
|--------|-------|------------------|
| Militia | 5 | 4.8% |
| Marine | 10 | 9.1% |
| Heavy Trooper | 25 | 20% |
| Assault Mech | 30 | 23.1% |
| Wall | 50 | 33.3% |
| HQ | 50 | 33.3% |
| Tower | 20 | 16.7% |

### 7.2 Weapon Systems

#### 7.2.1 Hitscan Weapons

Instant hit detection using raycasting.

```typescript
function fireHitscan(
  attacker: CombatUnit,
  target: CombatUnit,
  scene: Scene
): HitResult {
  const direction = target.position.subtract(attacker.position).normalize();
  const ray = new Ray(attacker.position, direction, attacker.range);

  const hit = scene.pickWithRay(ray, (mesh) => {
    return mesh.metadata?.isTarget === true;
  });

  if (hit?.pickedMesh?.metadata?.id === target.id) {
    return {
      hit: true,
      damage: calculateDamage(attacker, target, 'hitscan'),
      position: hit.pickedPoint!
    };
  }

  return { hit: false, damage: 0, position: null };
}
```

**Visual Effect:**
```typescript
function createLaserBeam(start: Vector3, end: Vector3, scene: Scene): void {
  const points = [start, end];
  const laser = MeshBuilder.CreateGreasedLine("laser", {
    points,
    widths: [0.1, 0.1]
  }, scene);

  laser.material = new StandardMaterial("laserMat", scene);
  laser.material.emissiveColor = new Color3(1, 0.2, 0.2);

  // Add to glow layer
  scene.getGlowLayerByName("glow")?.addIncludedOnlyMesh(laser);

  // Fade out
  Animation.CreateAndStartAnimation("fadeOut", laser, "visibility",
    60, 15, 1, 0, Animation.ANIMATIONLOOPMODE_CONSTANT, null, () => {
      laser.dispose();
    });
}
```

#### 7.2.2 Projectile Weapons

Projectiles travel over time and can miss.

```typescript
interface Projectile {
  id: string;
  position: Vector3;
  velocity: Vector3;
  targetId: string;
  damage: number;
  speed: number;           // m/s
  turnRate: number;        // radians/s (for homing)
  splashRadius: number;    // 0 for single target
  timeToLive: number;      // seconds
}

function updateProjectile(proj: Projectile, deltaTime: number): void {
  // Homing behavior
  const target = getUnitById(proj.targetId);
  if (target && proj.turnRate > 0) {
    const toTarget = target.position.subtract(proj.position).normalize();
    const currentDir = proj.velocity.normalize();

    // Lerp toward target direction
    const maxTurn = proj.turnRate * deltaTime;
    const newDir = Vector3.Lerp(currentDir, toTarget, maxTurn);
    proj.velocity = newDir.scale(proj.speed);
  }

  // Move projectile
  proj.position.addInPlace(proj.velocity.scale(deltaTime));
  proj.timeToLive -= deltaTime;

  // Check collision
  if (target) {
    const distance = Vector3.Distance(proj.position, target.position);
    if (distance < 1) { // Hit radius
      applyProjectileDamage(proj, target);
      destroyProjectile(proj);
    }
  }

  // Timeout
  if (proj.timeToLive <= 0) {
    destroyProjectile(proj);
  }
}
```

#### 7.2.3 Area Damage

Splash damage with distance falloff.

```typescript
function applyAreaDamage(
  center: Vector3,
  baseDamage: number,
  radius: number,
  targets: CombatUnit[]
): void {
  for (const target of targets) {
    const distance = Vector3.Distance(center, target.position);

    if (distance <= radius) {
      // Linear falloff from center
      const falloff = 1 - (distance / radius);
      const damage = Math.floor(baseDamage * falloff);

      applyDamage(target, damage);
    }
  }
}
```

### 7.3 Tower System

#### 7.3.1 Tower Types

| Tower | Damage | Range | Rate | Target | Special |
|-------|--------|-------|------|--------|---------|
| **Pulse Turret** | 15 | 10m | 3/s | Single | Anti-infantry |
| **Railgun Tower** | 80 | 18m | 0.5/s | Single | Anti-armor |
| **Missile Battery** | 50 | 15m | 1/s | Area (3m) | Splash damage |
| **EMP Tower** | 0 | 12m | 0.2/s | Area (5m) | Stuns 3s |
| **Plasma Cannon** | 150 | 20m | 0.3/s | Single | Heavy damage |

#### 7.3.2 Tower Targeting

```typescript
class Tower {
  currentTarget: CombatUnit | null = null;
  targetLockTime: number = 0;

  updateTargeting(enemies: CombatUnit[], deltaTime: number): void {
    this.targetLockTime += deltaTime;

    // Re-evaluate target every 0.5s or if current target invalid
    if (this.targetLockTime >= 0.5 || !this.isValidTarget(this.currentTarget)) {
      this.currentTarget = this.selectTarget(enemies);
      this.targetLockTime = 0;
    }
  }

  private selectTarget(enemies: CombatUnit[]): CombatUnit | null {
    // Filter to enemies in range
    const inRange = enemies.filter(e =>
      Vector3.Distance(this.position, e.position) <= this.range &&
      e.state !== UnitState.DEAD
    );

    if (inRange.length === 0) return null;

    // Check for player-designated priority target
    if (this.priorityTargetId) {
      const priority = inRange.find(e => e.id === this.priorityTargetId);
      if (priority) return priority;
    }

    // Default: nearest enemy
    return inRange.reduce((nearest, e) => {
      const distA = Vector3.Distance(this.position, nearest.position);
      const distB = Vector3.Distance(this.position, e.position);
      return distB < distA ? e : nearest;
    });
  }
}
```

### 7.4 Shield Mechanics

Shield generators create protective bubbles that block incoming projectiles.

#### 7.4.1 Shield Properties

| Property | Value |
|----------|-------|
| Base Radius | 6 meters |
| Shield Health | 2,000 HP |
| Recharge Rate | 50 HP/s (when not hit for 5s) |
| Recharge Delay | 5 seconds after last hit |

#### 7.4.2 Shield Collision

```typescript
function checkShieldCollision(
  projectile: Projectile,
  shields: Shield[]
): Shield | null {
  for (const shield of shields) {
    if (shield.health <= 0) continue;

    // Only block projectiles from outside
    const projectileInside = Vector3.Distance(
      projectile.position, shield.position
    ) < shield.radius;

    if (projectileInside) continue;

    // Check ray-sphere intersection
    const ray = new Ray(
      projectile.position,
      projectile.velocity.normalize(),
      projectile.speed * 0.1 // Check next 100ms of travel
    );

    const intersection = ray.intersectsSphere(
      new BoundingSphere(shield.position, shield.radius)
    );

    if (intersection) {
      return shield;
    }
  }

  return null;
}
```

---

## 8. Camera System

### 8.1 Default Isometric View

The combat camera defaults to a classic RTS isometric perspective.

#### 8.1.1 Camera Settings

| Property | Default Value | Range |
|----------|---------------|-------|
| Angle | 45° | 30° - 60° |
| Distance | 30m | 15m - 60m |
| FOV | 45° | Fixed |
| Target | Arena center | Bounded to arena |

#### 8.1.2 Implementation

```typescript
class CombatCamera {
  private camera: ArcRotateCamera;
  private minDistance = 15;
  private maxDistance = 60;
  private defaultAlpha = Math.PI / 4; // 45° azimuth
  private defaultBeta = Math.PI / 4;  // 45° elevation

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera(
      "combatCamera",
      this.defaultAlpha,
      this.defaultBeta,
      30,
      new Vector3(60, 0, 60), // Arena center
      scene
    );

    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = this.minDistance;
    this.camera.upperRadiusLimit = this.maxDistance;

    // Constrain panning to arena bounds
    this.camera.panningDistanceLimit = 50;
  }
}
```

### 8.2 Camera Controls

#### 8.2.1 Panning

| Input | Action |
|-------|--------|
| WASD | Pan camera |
| Middle-click drag | Pan camera |
| Edge scroll | Pan toward screen edge |

```typescript
function setupPanning(camera: ArcRotateCamera, scene: Scene): void {
  let isPanning = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.event.button === 1) { // Middle click
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        isPanning = true;
        lastPointerX = pointerInfo.event.clientX;
        lastPointerY = pointerInfo.event.clientY;
      } else if (pointerInfo.type === PointerEventTypes.POINTERUP) {
        isPanning = false;
      }
    }

    if (isPanning && pointerInfo.type === PointerEventTypes.POINTERMOVE) {
      const dx = pointerInfo.event.clientX - lastPointerX;
      const dy = pointerInfo.event.clientY - lastPointerY;

      // Pan in camera's local XZ plane
      const right = camera.getDirection(Axis.X);
      const forward = camera.getDirection(Axis.Z);

      camera.target.addInPlace(right.scale(-dx * 0.1));
      camera.target.addInPlace(forward.scale(dy * 0.1));

      lastPointerX = pointerInfo.event.clientX;
      lastPointerY = pointerInfo.event.clientY;
    }
  });
}
```

#### 8.2.2 Zooming

| Input | Action |
|-------|--------|
| Mouse wheel | Zoom in/out |
| Pinch (touch) | Zoom in/out |

```typescript
function setupZoom(camera: ArcRotateCamera): void {
  camera.wheelPrecision = 20; // Lower = faster zoom
  camera.pinchPrecision = 200;
}
```

#### 8.2.3 Rotation

| Input | Action |
|-------|--------|
| Q | Rotate 45° counter-clockwise |
| E | Rotate 45° clockwise |
| Middle-drag + Shift | Free rotation |

```typescript
function setupRotation(camera: ArcRotateCamera, scene: Scene): void {
  scene.onKeyboardObservable.add((kbInfo) => {
    if (kbInfo.type !== KeyboardEventTypes.KEYDOWN) return;

    const rotationStep = Math.PI / 4; // 45 degrees

    if (kbInfo.event.key === 'q') {
      animateCameraRotation(camera, camera.alpha - rotationStep);
    } else if (kbInfo.event.key === 'e') {
      animateCameraRotation(camera, camera.alpha + rotationStep);
    }
  });
}

function animateCameraRotation(camera: ArcRotateCamera, targetAlpha: number): void {
  Animation.CreateAndStartAnimation(
    "rotateCamera",
    camera,
    "alpha",
    60,
    15,
    camera.alpha,
    targetAlpha,
    Animation.ANIMATIONLOOPMODE_CONSTANT
  );
}
```

### 8.3 Unit Following

Double-click a unit to have the camera follow it.

```typescript
class CameraFollow {
  private followTarget: CombatUnit | null = null;
  private smoothing = 0.1;

  setFollowTarget(unit: CombatUnit | null): void {
    this.followTarget = unit;
  }

  update(camera: ArcRotateCamera): void {
    if (!this.followTarget) return;

    const targetPos = this.followTarget.position;
    camera.target = Vector3.Lerp(
      camera.target,
      targetPos,
      this.smoothing
    );
  }
}
```

### 8.4 Reset View

Button to return camera to default position and rotation.

```typescript
function resetCameraView(camera: ArcRotateCamera): void {
  Animation.CreateAndStartAnimation(
    "resetAlpha", camera, "alpha",
    60, 30, camera.alpha, Math.PI / 4, Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  Animation.CreateAndStartAnimation(
    "resetBeta", camera, "beta",
    60, 30, camera.beta, Math.PI / 4, Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  Animation.CreateAndStartAnimation(
    "resetRadius", camera, "radius",
    60, 30, camera.radius, 30, Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  Animation.CreateAndStartAnimation(
    "resetTarget", camera, "target",
    60, 30, camera.target, new Vector3(60, 0, 60), Animation.ANIMATIONLOOPMODE_CONSTANT
  );
}
```

---

## 9. Attacker Mechanics

### 9.1 Deployment System

Attackers deploy their units from the arena perimeter during combat.

#### 9.1.1 Spawn Zones

```
        ┌───────────────────────────────────┐
        │ S   S   S   S   S   S   S   S   S │  ← North spawn zone
        │ S                               S │
        │ S                               S │
        │ S           ┌─────┐             S │
        │ S           │ HQ  │             S │
        │ S           └─────┘             S │
        │ S                               S │
        │ S                               S │
        │ S   S   S   S   S   S   S   S   S │  ← South spawn zone
        └───────────────────────────────────┘
          ↑                               ↑
        West                            East
        spawn                           spawn
        zone                            zone
```

- **Spawn Zone Width:** 2 tiles from edge
- **Valid Spawn Tiles:** Any non-blocked perimeter tile
- **Restricted Areas:** Near defender structures, hazard tiles

#### 9.1.2 Deployment UI

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT BAR                                      │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐  │
│  │ Militia │  │ Marine  │  │  Heavy  │  │  Mech   │  │   DEPLOY ALL    │  │
│  │  x15    │  │   x8    │  │   x4    │  │   x2    │  │                 │  │
│  │ [Click] │  │ [Click] │  │ [Click] │  │ [Click] │  │     [Click]     │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

#### 9.1.3 Deployment Flow

1. Click unit type in deployment bar
2. Cursor changes to deployment cursor
3. Valid spawn zones highlight
4. Click on valid spawn tile
5. Unit appears with brief invulnerability (0.5s)
6. Unit count decrements in deployment bar

```typescript
interface DeploymentState {
  selectedUnitType: string | null;
  remainingUnits: Map<string, number>;
  isDeploying: boolean;
}

function handleDeploymentClick(
  state: DeploymentState,
  worldPosition: Vector3,
  arena: Arena
): boolean {
  if (!state.selectedUnitType || !state.isDeploying) return false;

  const tile = arena.worldToTile(worldPosition);

  if (!arena.isValidSpawnTile(tile)) {
    showError("Invalid spawn location");
    return false;
  }

  const remaining = state.remainingUnits.get(state.selectedUnitType) ?? 0;
  if (remaining <= 0) {
    showError("No units of this type remaining");
    return false;
  }

  // Send deploy command to server
  sendCombatInput({
    type: 'deploy',
    unitType: state.selectedUnitType,
    position: { x: tile.x, z: tile.z }
  });

  state.remainingUnits.set(state.selectedUnitType, remaining - 1);
  return true;
}
```

### 9.2 Wave Strategy

Attackers have full control over deployment timing.

#### 9.2.1 Strategic Options

| Strategy | Description | Best Against |
|----------|-------------|--------------|
| **Rush** | Deploy all units immediately | Weak defenses, no towers |
| **Waves** | Deploy in groups every 2-3 min | Strong towers, need to overwhelm |
| **Trickle** | Deploy 2-3 units at a time | Energy-based defenses |
| **Pincer** | Deploy from multiple directions | Single-sided defenses |

#### 9.2.2 Deploy All Button

For players who prefer to commit everything at once:

```typescript
function deployAllUnits(state: DeploymentState, arena: Arena): void {
  const spawnTiles = arena.getValidSpawnTiles();
  let tileIndex = 0;

  for (const [unitType, count] of state.remainingUnits) {
    for (let i = 0; i < count; i++) {
      const tile = spawnTiles[tileIndex % spawnTiles.length];

      sendCombatInput({
        type: 'deploy',
        unitType,
        position: { x: tile.x, z: tile.z }
      });

      tileIndex++;
    }
  }

  state.remainingUnits.clear();
}
```

### 9.3 Consumables

Consumables are assigned during the prep phase and activated during combat.

#### 9.3.1 Available Consumables

| Consumable | Effect | Cooldown | Cost |
|------------|--------|----------|------|
| **EMP Blast** | Stun all enemies in area 3s | 60s | 500 Credits |
| **Repair Drones** | Heal all friendly units 20% | 90s | 300 Credits |
| **Artillery Strike** | Heavy damage in target area | 120s | 800 Credits |
| **Shield Boost** | Temporary shield on units | 45s | 400 Credits |
| **Speed Boost** | +50% move speed for 10s | 30s | 200 Credits |

#### 9.3.2 Consumable UI

```
┌───────────────────────────────────┐
│         CONSUMABLES               │
├───────────────────────────────────┤
│  [1]     [2]     [3]     [4]     │
│  EMP    Repair  Arty   Shield    │
│  READY  45s     READY   READY    │
└───────────────────────────────────┘
```

---

## 10. Defender Mechanics

### 10.1 Tower Control

Defenders manage their towers to maximize defensive efficiency.

#### 10.1.1 Tower Selection

- Click tower to select
- Multi-select with Ctrl+Click or drag box
- Selected towers show range circles

#### 10.1.2 Target Priority

```typescript
interface TowerControl {
  towerId: string;
  priorityTargetId: string | null;
  isEnabled: boolean;
}

function setTowerPriority(
  towerId: string,
  targetId: string | null
): void {
  sendCombatInput({
    type: 'target_priority',
    structureId: towerId,
    targetId: targetId
  });
}
```

#### 10.1.3 Tower Toggle

Towers can be disabled to:
- Conserve energy (if energy-based)
- Deceive attackers about defensive strength
- Focus fire from specific towers

### 10.2 Garrison Management

Garrison units provide mobile defense.

#### 10.2.1 Rally Points

Set a rally point where garrison units gather:

```typescript
function setRallyPoint(position: Vector3): void {
  sendCombatInput({
    type: 'rally_point',
    position: { x: position.x, z: position.z }
  });
}
```

#### 10.2.2 Zone Defense

Assign units to patrol specific zones:

```
┌───────────────────────────────────────┐
│             DEFENSE ZONES             │
├───────┬───────┬───────┬───────┬───────┤
│       │       │       │       │       │
│ Zone  │ Zone  │  HQ   │ Zone  │ Zone  │
│   A   │   B   │ Zone  │   C   │   D   │
│       │       │       │       │       │
└───────┴───────┴───────┴───────┴───────┘
```

### 10.3 Traps & One-Time Defenses

#### 10.3.1 Trap Types

| Trap | Trigger | Effect | Quantity |
|------|---------|--------|----------|
| **Minefield** | First contact | 200 damage (area) | Placed pre-combat |
| **Energy Barrier** | Manual toggle | Blocks movement | 3 uses |
| **EMP Mine** | First contact | 5s stun (area) | Placed pre-combat |

#### 10.3.2 Trap Reveal

- Rangers reveal traps in their sight radius
- Revealed traps show to attacker
- Unrevealed traps are invisible to attacker

---

## 11. Victory & Loss Conditions

### 11.1 Attacker Victory

**Condition:** HQ health reaches 0.

**Resolution:**
1. HQ destruction animation plays
2. Combat immediately ends
3. Surviving attacker units become garrison
4. Node ownership transfers to attacker
5. Defender garrison retreats to random adjacent friendly node
6. If no adjacent friendly node: units captured/destroyed

### 11.2 Defender Victory

**Primary Condition:** HQ survives until 30-minute timer expires.

**Early Victory Condition:** All attacking units eliminated (none remaining in deploy pool or on field).

**Resolution:**
1. Victory fanfare plays
2. Combat ends
3. Node remains with defender
4. Any surviving defender units gain XP bonus

### 11.3 Draw Conditions

**Condition:** HQ destroyed AND last attacking unit killed in same tick.

**Resolution:**
1. Node remains with defender (tie goes to defender)
2. No unit transfer occurs
3. Both sides receive reduced XP

### 11.4 Post-Combat

Regardless of outcome:
1. **3-minute immunity** - No attacks possible on this node
2. **3-day cooldown** - No player attacks (NPC attacks still possible)
3. **Battle log saved** - Full replay available
4. **Results broadcast** - Other players notified via WebSocket

---

## 12. UI/UX Design

### 12.1 Combat HUD Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────┐                                    ┌────────┐  ┌──────────┐  │
│ │ HQ: 8,540   │           TIME: 24:35              │  Menu  │  │Surrender │  │
│ │ ████████░░  │                                    └────────┘  └──────────┘  │
│ └─────────────┘                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│   ┌───────────┐                                                              │
│   │  MINIMAP  │                                                              │
│   │           │                            3D COMBAT ARENA                   │
│   │     ▪     │                                                              │
│   │   ▪ █ ▪   │                                                              │
│   │     ▪     │                                                              │
│   └───────────┘                                                              │
│                                                                              │
│                                                         ┌──────────────────┐ │
│                                                         │ SELECTED UNIT    │ │
│                                                         │ Marine (Veteran) │ │
│                                                         │ HP: 135/150      │ │
│                                                         │ DMG: 18  ARM: 12 │ │
│                                                         └──────────────────┘ │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────┐  ┌────────────────────────────────┐  │
│ │ ATTACKER: [Unit Icons & Counts]    │  │ CONSUMABLES: [1] [2] [3] [4]   │  │
│ │ DEFENDER: [Tower List]             │  │              EMP Heal Art Shld │  │
│ └────────────────────────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Selection System

#### 12.2.1 Selection Methods

| Input | Selection |
|-------|-----------|
| Left-click unit | Select single unit |
| Ctrl + Left-click | Add to selection |
| Drag box | Select all units in box |
| Double-click | Select all units of type |
| Ctrl + A | Select all own units |
| Escape | Deselect all |

#### 12.2.2 Selection Feedback

- **Ring:** Green glowing ring under selected units
- **Health Bar:** Floating bar above selected units
- **Stats Panel:** Right sidebar shows details
- **Range Circle:** Optional toggle for selected towers

### 12.3 Minimap

#### 12.3.1 Minimap Elements

| Element | Color | Shape |
|---------|-------|-------|
| HQ | Gold | Square |
| Friendly units | Green | Dots |
| Enemy units | Red | Dots |
| Towers | Blue | Triangles |
| Walls | Gray | Lines |
| Camera view | White | Rectangle outline |

#### 12.3.2 Minimap Interaction

- Click minimap to pan camera
- Drag on minimap for quick navigation
- Right-click minimap to issue move order

### 12.4 Damage Numbers

Floating combat text provides immediate feedback.

```typescript
function showDamageNumber(
  position: Vector3,
  damage: number,
  isCritical: boolean,
  isHealing: boolean
): void {
  const color = isHealing ? "green" : (isCritical ? "yellow" : "white");
  const size = isCritical ? 1.5 : 1.0;
  const text = isHealing ? `+${damage}` : `-${damage}`;

  // Create Babylon GUI text
  const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("damageUI");
  const textBlock = new TextBlock();
  textBlock.text = text;
  textBlock.color = color;
  textBlock.fontSize = 24 * size;

  // Position in 3D space
  textBlock.linkWithMesh(createInvisibleMarker(position));

  // Animate up and fade
  animateDamageNumber(textBlock);
}
```

---

## 13. Visual Effects & Polish

### 13.1 Babylon.js Visual Features

#### 13.1.1 Lighting

```typescript
function setupLighting(scene: Scene): void {
  // Ambient light
  const ambient = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene
  );
  ambient.intensity = 0.4;

  // Directional sun
  const sun = new DirectionalLight(
    "sun",
    new Vector3(-1, -2, -1),
    scene
  );
  sun.intensity = 0.8;

  // Cascaded Shadow Maps for RTS camera
  const shadowGen = new CascadedShadowGenerator(1024, sun);
  shadowGen.autoCalcDepthBounds = true;
}
```

#### 13.1.2 Glow Effects

```typescript
function setupGlowLayer(scene: Scene): void {
  const glow = new GlowLayer("glow", scene, {
    mainTextureFixedSize: 512,
    blurKernelSize: 64
  });
  glow.intensity = 0.5;

  // Add emissive meshes automatically
  glow.addIncludedOnlyMesh(laserMesh);
  glow.addIncludedOnlyMesh(shieldMesh);
}
```

#### 13.1.3 Post-Processing

```typescript
function setupPostProcessing(scene: Scene, camera: Camera): void {
  const pipeline = new DefaultRenderingPipeline(
    "pipeline",
    true, // HDR
    scene,
    [camera]
  );

  // Bloom for bright effects
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.8;
  pipeline.bloomWeight = 0.3;

  // Subtle vignette
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 0.5;
}
```

### 13.2 Particle Systems

#### 13.2.1 Explosion Effect

```typescript
function createExplosion(position: Vector3, scene: Scene): void {
  const particleSystem = new ParticleSystem("explosion", 200, scene);
  particleSystem.particleTexture = new Texture("assets/particles/fire.png", scene);

  particleSystem.emitter = position;
  particleSystem.minEmitBox = new Vector3(-0.5, 0, -0.5);
  particleSystem.maxEmitBox = new Vector3(0.5, 1, 0.5);

  particleSystem.color1 = new Color4(1, 0.5, 0, 1);
  particleSystem.color2 = new Color4(1, 0.2, 0, 1);
  particleSystem.colorDead = new Color4(0.2, 0.2, 0.2, 0);

  particleSystem.minSize = 0.3;
  particleSystem.maxSize = 1.0;

  particleSystem.minLifeTime = 0.2;
  particleSystem.maxLifeTime = 0.5;

  particleSystem.emitRate = 500;
  particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;

  particleSystem.gravity = new Vector3(0, 5, 0);
  particleSystem.direction1 = new Vector3(-1, 3, -1);
  particleSystem.direction2 = new Vector3(1, 5, 1);

  particleSystem.minEmitPower = 3;
  particleSystem.maxEmitPower = 6;

  particleSystem.start();

  // Stop after burst
  setTimeout(() => {
    particleSystem.stop();
    setTimeout(() => particleSystem.dispose(), 1000);
  }, 100);
}
```

#### 13.2.2 Muzzle Flash

```typescript
function createMuzzleFlash(position: Vector3, direction: Vector3, scene: Scene): void {
  const flash = MeshBuilder.CreatePlane("flash", { size: 0.5 }, scene);
  flash.position = position;
  flash.billboardMode = Mesh.BILLBOARDMODE_ALL;

  const mat = new StandardMaterial("flashMat", scene);
  mat.emissiveColor = new Color3(1, 0.8, 0.3);
  mat.disableLighting = true;
  flash.material = mat;

  // Quick fade
  Animation.CreateAndStartAnimation(
    "flashFade", flash, "scaling",
    60, 6,
    new Vector3(1, 1, 1),
    new Vector3(2, 2, 2),
    Animation.ANIMATIONLOOPMODE_CONSTANT,
    null,
    () => flash.dispose()
  );
}
```

### 13.3 Unit Animations

#### 13.3.1 Animation States

| State | Animation | Loop |
|-------|-----------|------|
| IDLE | idle | Yes |
| MOVING | walk/run | Yes |
| ATTACKING | attack | No (return to idle) |
| DEAD | death | No (hold final frame) |

#### 13.3.2 Animation Blending

```typescript
class UnitAnimator {
  private animationGroups: Map<string, AnimationGroup>;
  private currentAnimation: string = 'idle';

  playAnimation(name: string, loop: boolean = true): void {
    if (name === this.currentAnimation) return;

    // Stop current
    this.animationGroups.get(this.currentAnimation)?.stop();

    // Start new with blend
    const anim = this.animationGroups.get(name);
    if (anim) {
      anim.start(loop, 1.0, anim.from, anim.to, false);
      this.currentAnimation = name;
    }
  }
}
```

---

## 14. Audio Design

### 14.1 Sound Categories

| Category | Examples | Volume Level |
|----------|----------|--------------|
| **Ambient** | Wind, machinery hum | 30% |
| **Combat** | Gunfire, explosions | 70% |
| **UI** | Clicks, alerts | 50% |
| **Voice** | Unit responses | 60% |
| **Music** | Battle theme | 40% |

### 14.2 Sound Triggers

| Event | Sound |
|-------|-------|
| Unit selected | "Ready" voice line |
| Unit ordered | "Moving out" / "Attacking" |
| Weapon fired | Weapon-specific SFX |
| Explosion | Boom + debris |
| Unit death | Death cry + thud |
| Tower destroyed | Metal collapse |
| HQ damaged | Warning siren |
| Victory | Fanfare |
| Defeat | Somber tone |

### 14.3 Spatial Audio

```typescript
function setupSpatialAudio(scene: Scene): void {
  // Create audio engine
  const audioEngine = new AudioEngine();
  scene.audioEnabled = true;

  // Attach listener to camera
  scene.audioListenerPositionProvider = () => {
    return scene.activeCamera!.position;
  };
}

function playSpatialSound(
  soundName: string,
  position: Vector3,
  scene: Scene
): void {
  const sound = new Sound(
    soundName,
    `assets/audio/${soundName}.mp3`,
    scene,
    null,
    {
      spatialSound: true,
      distanceModel: "linear",
      maxDistance: 50,
      rolloffFactor: 1
    }
  );

  sound.setPosition(position);
  sound.play();
}
```

---

## 15. Performance Optimization

This section provides comprehensive optimization strategies critical for achieving 60 FPS with 100+ units on mid-range hardware.

### 15.1 Rendering Optimizations

#### 15.1.1 ThinInstances for Terrain and Props

```typescript
// Instead of 1600 individual tile meshes:
const tiles = 3600; // 60x60 grid

// Use ThinInstances: 1 mesh, 1600 instances = 1 draw call
const baseTile = MeshBuilder.CreateGround("tile", { width: 2, height: 2 });
baseTile.thinInstanceSetBuffer("matrix", matricesArray, 16);
baseTile.thinInstanceSetBuffer("color", colorsArray, 4); // Per-instance color

// CRITICAL: Freeze matrices for static instances
baseTile.freezeWorldMatrix();
baseTile.doNotSyncBoundingInfo = true;
```

**Extend to Props:**
```typescript
// Group props by mesh type for instancing
const propInstances = new Map<string, Matrix[]>();

for (const prop of props) {
  if (!propInstances.has(prop.meshId)) {
    propInstances.set(prop.meshId, []);
  }
  propInstances.get(prop.meshId)!.push(
    Matrix.Compose(
      new Vector3(prop.scale, prop.scale, prop.scale),
      Quaternion.RotationY(prop.rotation),
      new Vector3(prop.position.x, 0, prop.position.z)
    )
  );
}

// Single draw call per prop type
for (const [meshId, matrices] of propInstances) {
  const baseMesh = getMesh(meshId);
  baseMesh.thinInstanceSetBuffer("matrix", flattenMatrices(matrices), 16);
  baseMesh.freezeWorldMatrix();
}
```

**Performance Impact:**
- Without ThinInstances: ~1600+ draw calls
- With ThinInstances: ~10-15 draw calls (terrain + prop types)
- FPS improvement: 10x+ on mobile

#### 15.1.2 GPU Instancing for Units

Units of the same type should share geometry via InstancedMesh:

```typescript
class UnitInstanceManager {
  private instancedMeshes: Map<string, InstancedMesh[]> = new Map();
  private baseMeshes: Map<string, Mesh> = new Map();

  getUnitMesh(unitTypeId: string, unitId: string): InstancedMesh {
    const base = this.baseMeshes.get(unitTypeId);
    if (!base) throw new Error(`No mesh for ${unitTypeId}`);

    const instance = base.createInstance(unitId);

    if (!this.instancedMeshes.has(unitTypeId)) {
      this.instancedMeshes.set(unitTypeId, []);
    }
    this.instancedMeshes.get(unitTypeId)!.push(instance);

    return instance;
  }

  // Batch update all instances of a type (more efficient than individual updates)
  updateAllPositions(unitTypeId: string, positions: Float32Array): void {
    const instances = this.instancedMeshes.get(unitTypeId);
    if (!instances) return;

    for (let i = 0; i < instances.length; i++) {
      instances[i].position.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );
    }
  }
}
```

#### 15.1.3 Level of Detail (LOD) with Aggressive Distances

```typescript
function setupUnitLOD(mesh: Mesh, scene: Scene): void {
  // Aggressive LOD for RTS camera distances
  mesh.addLODLevel(15, highDetailMesh);   // Full detail < 15m (selected/nearby)
  mesh.addLODLevel(30, mediumDetailMesh); // Medium 15-30m
  mesh.addLODLevel(50, lowDetailMesh);    // Low 30-50m
  mesh.addLODLevel(80, null);             // CULLED beyond 80m (billboard or nothing)
}

// Billboard sprites for distant units (much cheaper than 3D)
function createUnitBillboard(unitTypeId: string): Sprite {
  const billboard = new Sprite("unitSprite", spriteManager);
  billboard.width = 1;
  billboard.height = 1;
  return billboard;
}
```

#### 15.1.4 Shadow Optimization

```typescript
function setupOptimizedShadows(scene: Scene, sun: DirectionalLight): void {
  const shadowGen = new CascadedShadowGenerator(1024, sun);

  // Only 2 cascades (RTS typically only needs near + mid)
  shadowGen.numCascades = 2;
  shadowGen.cascadeBlendPercentage = 0.1;
  shadowGen.lambda = 0.9; // Bias toward near cascade

  // Use PCF for soft shadows (cheaper than PCSS)
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_LOW;

  // CRITICAL: Only large objects cast shadows
  shadowGen.addShadowCaster(hqMesh);
  shadowGen.addShadowCaster(towerMesh);
  // Units do NOT cast shadows (massive performance save)

  // Freeze shadow map when camera is still
  shadowGen.freezeShadowCastersBoundingInfo = true;
}
```

#### 15.1.5 Freeze Static Objects

```typescript
function freezeStaticMeshes(scene: Scene): void {
  // Freeze all terrain, props, and structures
  scene.meshes.forEach(mesh => {
    if (mesh.metadata?.isStatic) {
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;

      // Freeze material if not animated
      if (mesh.material && !mesh.metadata?.hasAnimatedMaterial) {
        mesh.material.freeze();
      }
    }
  });

  // Build octree for large scenes
  scene.createOrUpdateSelectionOctree(64, 2);
}
```

#### 15.1.6 Texture Optimization

```typescript
// Use KTX2 compressed textures (GPU-native compression)
const ktxLoader = new KTX2Loader();
ktxLoader.setDecoderPath('libs/basis/');

// Texture atlas for units (single texture, multiple UV regions)
class TextureAtlas {
  private atlas: Texture;
  private regions: Map<string, { u: number; v: number; w: number; h: number }>;

  getUVsForUnit(unitTypeId: string): { u: number; v: number; w: number; h: number } {
    return this.regions.get(unitTypeId)!;
  }
}

// Mipmapping settings
texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
texture.anisotropicFilteringLevel = 4; // Balance quality/perf
```

### 15.2 Logic Optimizations

#### 15.2.1 Spatial Partitioning with Typed Arrays

```typescript
class OptimizedSpatialHash {
  private cellSize: number = 5;
  private gridWidth: number;
  private gridHeight: number;

  // Use TypedArrays for cache-friendly access
  private cellCounts: Uint16Array;
  private cellOffsets: Uint32Array;
  private entityIds: Uint16Array;
  private entityPositions: Float32Array;

  constructor(arenaSize: number, maxEntities: number) {
    this.gridWidth = Math.ceil(arenaSize / this.cellSize);
    this.gridHeight = this.gridWidth;

    const totalCells = this.gridWidth * this.gridHeight;
    this.cellCounts = new Uint16Array(totalCells);
    this.cellOffsets = new Uint32Array(totalCells);
    this.entityIds = new Uint16Array(maxEntities);
    this.entityPositions = new Float32Array(maxEntities * 2);
  }

  // Rebuild entire hash each frame (faster than incremental for moving entities)
  rebuild(entities: { id: number; x: number; z: number }[]): void {
    // Reset counts
    this.cellCounts.fill(0);

    // Count entities per cell
    for (const entity of entities) {
      const cellIdx = this.getCellIndex(entity.x, entity.z);
      this.cellCounts[cellIdx]++;
    }

    // Compute offsets (prefix sum)
    let offset = 0;
    for (let i = 0; i < this.cellCounts.length; i++) {
      this.cellOffsets[i] = offset;
      offset += this.cellCounts[i];
    }

    // Reset counts and fill entity arrays
    const tempCounts = new Uint16Array(this.cellCounts.length);
    for (const entity of entities) {
      const cellIdx = this.getCellIndex(entity.x, entity.z);
      const idx = this.cellOffsets[cellIdx] + tempCounts[cellIdx];
      this.entityIds[idx] = entity.id;
      this.entityPositions[idx * 2] = entity.x;
      this.entityPositions[idx * 2 + 1] = entity.z;
      tempCounts[cellIdx]++;
    }
  }

  // Query with squared distance (avoid sqrt)
  queryRadius(x: number, z: number, radius: number): number[] {
    const results: number[] = [];
    const radiusSq = radius * radius;
    const cellRadius = Math.ceil(radius / this.cellSize);

    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellZ = Math.floor(z / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cellX = centerCellX + dx;
        const cellZ = centerCellZ + dz;

        if (cellX < 0 || cellX >= this.gridWidth) continue;
        if (cellZ < 0 || cellZ >= this.gridHeight) continue;

        const cellIdx = cellZ * this.gridWidth + cellX;
        const start = this.cellOffsets[cellIdx];
        const count = this.cellCounts[cellIdx];

        for (let i = 0; i < count; i++) {
          const idx = start + i;
          const ex = this.entityPositions[idx * 2];
          const ez = this.entityPositions[idx * 2 + 1];

          const distSq = (ex - x) * (ex - x) + (ez - z) * (ez - z);
          if (distSq <= radiusSq) {
            results.push(this.entityIds[idx]);
          }
        }
      }
    }

    return results;
  }

  private getCellIndex(x: number, z: number): number {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    return cellZ * this.gridWidth + cellX;
  }
}
```

#### 15.2.2 Object Pooling (Extended)

```typescript
// Generic pool factory
class ObjectPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 50
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;

    // Pre-warm pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn());
    }
  }

  acquire(): T {
    const obj = this.pool.pop() ?? this.createFn();
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    this.resetFn(obj);
    this.pool.push(obj);
  }

  releaseAll(): void {
    for (const obj of this.active) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
    this.active.clear();
  }
}

// Pools for common objects
const pools = {
  projectiles: new ObjectPool<Projectile>(
    () => new Projectile(scene),
    (p) => { p.mesh.setEnabled(false); p.reset(); },
    100
  ),

  damageNumbers: new ObjectPool<TextBlock>(
    () => createDamageTextBlock(),
    (t) => { t.isVisible = false; },
    50
  ),

  particles: new ObjectPool<ParticleSystem>(
    () => createPooledParticleSystem(scene),
    (ps) => { ps.stop(); ps.reset(); },
    20
  ),

  sounds: new ObjectPool<Sound>(
    () => createPooledSound(scene),
    (s) => { s.stop(); },
    30
  )
};
```

#### 15.2.3 Flow Field Optimization

```typescript
class OptimizedFlowField {
  // Use TypedArrays for better cache performance
  private integrationField: Float32Array;
  private flowFieldX: Int8Array;  // -1, 0, or 1 for direction
  private flowFieldZ: Int8Array;
  private gridSize: number;

  constructor(gridSize: number) {
    this.gridSize = gridSize;
    const totalCells = gridSize * gridSize;
    this.integrationField = new Float32Array(totalCells);
    this.flowFieldX = new Int8Array(totalCells);
    this.flowFieldZ = new Int8Array(totalCells);
  }

  generate(hqX: number, hqZ: number, obstacles: Uint8Array): void {
    // Initialize with infinity (use large number for TypedArray)
    this.integrationField.fill(65535);

    // Use proper deque for BFS (array.shift() is O(n))
    const queue = new Deque<number>();
    const hqIdx = hqZ * this.gridSize + hqX;
    this.integrationField[hqIdx] = 0;
    queue.pushBack(hqIdx);

    while (!queue.isEmpty()) {
      const currentIdx = queue.popFront()!;
      const currentCost = this.integrationField[currentIdx];
      const cx = currentIdx % this.gridSize;
      const cz = Math.floor(currentIdx / this.gridSize);

      // Check 8 neighbors (including diagonals)
      for (const [dx, dz, cost] of NEIGHBOR_OFFSETS) {
        const nx = cx + dx;
        const nz = cz + dz;

        if (nx < 0 || nx >= this.gridSize || nz < 0 || nz >= this.gridSize) continue;

        const neighborIdx = nz * this.gridSize + nx;
        if (obstacles[neighborIdx]) continue;

        const newCost = currentCost + cost;
        if (newCost < this.integrationField[neighborIdx]) {
          this.integrationField[neighborIdx] = newCost;
          queue.pushBack(neighborIdx);
        }
      }
    }

    // Generate flow directions
    for (let z = 0; z < this.gridSize; z++) {
      for (let x = 0; x < this.gridSize; x++) {
        const idx = z * this.gridSize + x;
        const [bestDx, bestDz] = this.findBestNeighbor(x, z);
        this.flowFieldX[idx] = bestDx;
        this.flowFieldZ[idx] = bestDz;
      }
    }
  }

  // O(1) lookup per unit per frame
  getDirection(x: number, z: number): [number, number] {
    const tileX = Math.floor(x / 2);
    const tileZ = Math.floor(z / 2);
    if (tileX < 0 || tileX >= this.gridSize || tileZ < 0 || tileZ >= this.gridSize) {
      return [0, 0];
    }
    const idx = tileZ * this.gridSize + tileX;
    return [this.flowFieldX[idx], this.flowFieldZ[idx]];
  }

  private findBestNeighbor(x: number, z: number): [number, number] {
    const currentIdx = z * this.gridSize + x;
    const currentCost = this.integrationField[currentIdx];

    let bestDx = 0, bestDz = 0;
    let bestCost = currentCost;

    for (const [dx, dz] of CARDINAL_DIRECTIONS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= this.gridSize || nz < 0 || nz >= this.gridSize) continue;

      const neighborIdx = nz * this.gridSize + nx;
      const cost = this.integrationField[neighborIdx];
      if (cost < bestCost) {
        bestCost = cost;
        bestDx = dx;
        bestDz = dz;
      }
    }

    return [bestDx, bestDz];
  }
}

// Neighbor offsets with diagonal costs (sqrt(2) ≈ 1.414)
const NEIGHBOR_OFFSETS: [number, number, number][] = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],  // Cardinals
  [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414]  // Diagonals
];

const CARDINAL_DIRECTIONS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1]
];

// Simple deque implementation for O(1) operations
class Deque<T> {
  private head: number = 0;
  private tail: number = 0;
  private data: T[];

  constructor(capacity: number = 2048) {
    this.data = new Array(capacity);
  }

  pushBack(item: T): void {
    this.data[this.tail] = item;
    this.tail = (this.tail + 1) % this.data.length;
  }

  popFront(): T | undefined {
    if (this.isEmpty()) return undefined;
    const item = this.data[this.head];
    this.head = (this.head + 1) % this.data.length;
    return item;
  }

  isEmpty(): boolean {
    return this.head === this.tail;
  }
}
```

#### 15.2.4 Target Acquisition Optimization

```typescript
// Cache distance calculations, use squared distance
class TargetingSystem {
  private spatialHash: OptimizedSpatialHash;
  private targetCache: Map<string, { targetId: string; expiry: number }> = new Map();
  private cacheDurationMs = 200; // Re-evaluate every 200ms

  findTarget(
    unit: CombatUnit,
    allUnits: Map<string, CombatUnit>,
    currentTime: number
  ): CombatUnit | null {
    // Check cache first
    const cached = this.targetCache.get(unit.id);
    if (cached && cached.expiry > currentTime) {
      const target = allUnits.get(cached.targetId);
      if (target && target.health > 0) {
        return target;
      }
    }

    // Use spatial hash for nearby enemies only
    const nearbyIds = this.spatialHash.queryRadius(
      unit.position.x,
      unit.position.z,
      unit.range * 1.5 // Slightly larger to account for movement
    );

    let bestTarget: CombatUnit | null = null;
    let bestPriority = -Infinity;

    for (const id of nearbyIds) {
      const candidate = allUnits.get(String(id));
      if (!candidate || candidate.ownerId === unit.ownerId || candidate.health <= 0) {
        continue;
      }

      // Use squared distance (avoid sqrt)
      const distSq = distanceSquared(unit.position, candidate.position);
      const rangeSq = unit.range * unit.range;

      if (distSq > rangeSq) continue;

      const priority = this.calculatePriorityFast(unit, candidate, distSq);
      if (priority > bestPriority) {
        bestPriority = priority;
        bestTarget = candidate;
      }
    }

    // Cache result
    if (bestTarget) {
      this.targetCache.set(unit.id, {
        targetId: bestTarget.id,
        expiry: currentTime + this.cacheDurationMs
      });
    }

    return bestTarget;
  }

  // Simplified priority without Vector3 allocations
  private calculatePriorityFast(
    unit: CombatUnit,
    target: CombatUnit,
    distSq: number
  ): number {
    let priority = 100 - Math.sqrt(distSq) * 2; // Closer = better
    priority += (1 - target.health / target.maxHealth) * 30; // Lower HP = better
    return priority;
  }
}

// Avoid Vector3 allocations
function distanceSquared(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
```

#### 15.2.5 Batch Processing

```typescript
// Process units in batches to improve cache locality
class BatchUnitProcessor {
  private readonly BATCH_SIZE = 32;

  processAllUnits(units: CombatUnit[], deltaTime: number): void {
    const unitArray = Array.from(units);

    // Process in batches
    for (let i = 0; i < unitArray.length; i += this.BATCH_SIZE) {
      const batch = unitArray.slice(i, i + this.BATCH_SIZE);
      this.processBatch(batch, deltaTime);
    }
  }

  private processBatch(batch: CombatUnit[], deltaTime: number): void {
    // Phase 1: Update all positions (cache-friendly)
    for (const unit of batch) {
      if (unit.state === UnitState.MOVING) {
        this.updatePosition(unit, deltaTime);
      }
    }

    // Phase 2: Update all cooldowns
    for (const unit of batch) {
      unit.attackCooldown = Math.max(0, unit.attackCooldown - deltaTime);
    }

    // Phase 3: Combat resolution
    for (const unit of batch) {
      if (unit.state === UnitState.ATTACKING && unit.attackCooldown <= 0) {
        this.processAttack(unit);
      }
    }
  }
}
```

### 15.3 Network Optimizations

#### 15.3.1 Binary Serialization

```typescript
// Use binary encoding instead of JSON for state updates
class CombatStateSerializer {
  private buffer: ArrayBuffer;
  private view: DataView;

  constructor() {
    // Pre-allocate buffer for max state size
    this.buffer = new ArrayBuffer(64 * 1024); // 64KB
    this.view = new DataView(this.buffer);
  }

  serialize(state: CombatState): ArrayBuffer {
    let offset = 0;

    // Header
    this.view.setUint32(offset, state.tick); offset += 4;
    this.view.setFloat32(offset, state.timeRemaining); offset += 4;
    this.view.setUint16(offset, state.units.length); offset += 2;

    // Units (fixed-size records for efficiency)
    for (const unit of state.units) {
      // ID as 16-bit index (max 65535 units)
      this.view.setUint16(offset, unit.numericId); offset += 2;

      // Position (3 floats)
      this.view.setFloat32(offset, unit.position.x); offset += 4;
      this.view.setFloat32(offset, unit.position.y); offset += 4;
      this.view.setFloat32(offset, unit.position.z); offset += 4;

      // Health (16-bit, max 65535)
      this.view.setUint16(offset, unit.health); offset += 2;

      // State (8-bit enum)
      this.view.setUint8(offset, unit.state); offset += 1;

      // Target ID (16-bit, 0 = no target)
      this.view.setUint16(offset, unit.targetNumericId ?? 0); offset += 2;
    }

    return this.buffer.slice(0, offset);
  }

  deserialize(buffer: ArrayBuffer): CombatState {
    const view = new DataView(buffer);
    let offset = 0;

    const state: CombatState = {
      tick: view.getUint32(offset),
      timeRemaining: view.getFloat32(offset += 4),
      units: []
    };

    const unitCount = view.getUint16(offset += 4);
    offset += 2;

    for (let i = 0; i < unitCount; i++) {
      state.units.push({
        numericId: view.getUint16(offset),
        position: {
          x: view.getFloat32(offset += 2),
          y: view.getFloat32(offset += 4),
          z: view.getFloat32(offset += 4)
        },
        health: view.getUint16(offset += 4),
        state: view.getUint8(offset += 2),
        targetNumericId: view.getUint16(offset += 1) || null
      });
      offset += 2;
    }

    return state;
  }
}

// Per-unit size: 2 + 12 + 2 + 1 + 2 = 19 bytes
// vs JSON ~200+ bytes per unit
// 100 units: 1.9KB binary vs 20KB+ JSON
```

#### 15.3.2 Delta Compression (Fixed)

```typescript
// Proper delta with numeric comparison
function computeDelta(
  previous: CombatState,
  current: CombatState
): DeltaState {
  const delta: DeltaState = { tick: current.tick, units: {} };

  // Build lookup for previous state
  const prevUnits = new Map(previous.units.map(u => [u.numericId, u]));

  for (const unit of current.units) {
    const prevUnit = prevUnits.get(unit.numericId);

    if (!prevUnit) {
      delta.units[unit.numericId] = unit; // New unit
      continue;
    }

    const changes: Partial<CombatUnitState> = {};

    // Compare with tolerance for floats
    if (Math.abs(unit.position.x - prevUnit.position.x) > 0.01 ||
        Math.abs(unit.position.z - prevUnit.position.z) > 0.01) {
      changes.position = unit.position;
    }

    if (unit.health !== prevUnit.health) {
      changes.health = unit.health;
    }

    if (unit.state !== prevUnit.state) {
      changes.state = unit.state;
    }

    if (unit.targetNumericId !== prevUnit.targetNumericId) {
      changes.targetNumericId = unit.targetNumericId;
    }

    if (Object.keys(changes).length > 0) {
      delta.units[unit.numericId] = changes;
    }
  }

  // Track removed units
  for (const [id] of prevUnits) {
    if (!current.units.find(u => u.numericId === id)) {
      delta.removedUnits = delta.removedUnits ?? [];
      delta.removedUnits.push(id);
    }
  }

  return delta;
}
```

#### 15.3.3 Adaptive Update Rate

```typescript
// Send updates less frequently for distant/stationary units
class AdaptiveStateSync {
  private lastFullSync: number = 0;
  private unitPriorities: Map<number, number> = new Map();

  getUnitsToUpdate(
    units: CombatUnit[],
    viewerPosition: Vector3,
    currentTick: number
  ): CombatUnit[] {
    const toUpdate: CombatUnit[] = [];

    for (const unit of units) {
      const distSq = distanceSquared(unit.position, viewerPosition);
      const priority = this.getUpdatePriority(unit, distSq);
      const lastUpdate = this.unitPriorities.get(unit.numericId) ?? 0;

      // Higher priority = more frequent updates
      const updateInterval = Math.floor(5 / priority); // 1-5 ticks

      if (currentTick - lastUpdate >= updateInterval) {
        toUpdate.push(unit);
        this.unitPriorities.set(unit.numericId, currentTick);
      }
    }

    // Always include units that changed state
    for (const unit of units) {
      if (unit.stateChangedThisTick && !toUpdate.includes(unit)) {
        toUpdate.push(unit);
      }
    }

    return toUpdate;
  }

  private getUpdatePriority(unit: CombatUnit, distSq: number): number {
    let priority = 1;

    // Nearby units = high priority
    if (distSq < 400) priority += 3;  // < 20m
    else if (distSq < 1600) priority += 2;  // < 40m
    else if (distSq < 3600) priority += 1;  // < 60m

    // Moving/attacking units = high priority
    if (unit.state === UnitState.MOVING || unit.state === UnitState.ATTACKING) {
      priority += 1;
    }

    return Math.min(5, priority);
  }
}
```

### 15.4 Memory Management

#### 15.4.1 Avoid Allocations in Hot Paths

```typescript
// Pre-allocate reusable vectors
const _tempVec3A = new Vector3();
const _tempVec3B = new Vector3();
const _tempMatrix = new Matrix();

function updateUnitPosition(unit: CombatUnit, direction: Vector2, speed: number, dt: number): void {
  // Reuse pre-allocated vector instead of creating new one
  _tempVec3A.set(direction.x * speed * dt, 0, direction.y * speed * dt);
  unit.mesh.position.addInPlace(_tempVec3A);
}

// Pre-allocate arrays for common operations
const _nearbyUnitsBuffer: CombatUnit[] = new Array(100);

function getNearbyUnits(spatial: OptimizedSpatialHash, x: number, z: number, radius: number): CombatUnit[] {
  const ids = spatial.queryRadius(x, z, radius);
  // Reuse buffer instead of allocating new array
  for (let i = 0; i < ids.length && i < _nearbyUnitsBuffer.length; i++) {
    _nearbyUnitsBuffer[i] = unitMap.get(ids[i])!;
  }
  _nearbyUnitsBuffer.length = Math.min(ids.length, _nearbyUnitsBuffer.length);
  return _nearbyUnitsBuffer;
}
```

#### 15.4.2 Dispose Resources Properly

```typescript
class CombatEngine {
  dispose(): void {
    // Dispose pools
    pools.projectiles.releaseAll();
    pools.damageNumbers.releaseAll();
    pools.particles.releaseAll();
    pools.sounds.releaseAll();

    // Dispose GPU resources
    for (const [, instances] of this.unitInstanceManager.instancedMeshes) {
      for (const instance of instances) {
        instance.dispose();
      }
    }

    // Clear textures from GPU
    for (const texture of this.scene.textures) {
      texture.dispose();
    }

    // Clear scene
    this.scene.dispose();
    this.engine.dispose();

    // Clear references
    this.spatialHash = null!;
    this.flowField = null!;
  }
}
```

### 15.5 Performance Budgets

| System | Budget per Frame | Notes |
|--------|------------------|-------|
| **Rendering** | 8ms | Target 60 FPS with headroom |
| **Unit AI** | 2ms | For 100 units |
| **Pathfinding** | 1ms | Flow field lookup only |
| **Collision** | 1ms | Spatial hash queries |
| **Network** | 2ms | Serialize + send |
| **Audio** | 1ms | Spatial sound updates |
| **Total** | <16ms | Must hit 60 FPS |

### 15.6 Performance Monitoring

```typescript
class PerformanceMonitor {
  private frameTimes: number[] = [];
  private systemTimes: Map<string, number[]> = new Map();

  startFrame(): void {
    performance.mark('frame-start');
  }

  endFrame(): void {
    performance.mark('frame-end');
    performance.measure('frame', 'frame-start', 'frame-end');

    const measure = performance.getEntriesByName('frame').pop()!;
    this.frameTimes.push(measure.duration);

    if (this.frameTimes.length > 120) {
      this.frameTimes.shift();
    }

    performance.clearMarks();
    performance.clearMeasures();
  }

  measureSystem(name: string, fn: () => void): void {
    const start = performance.now();
    fn();
    const duration = performance.now() - start;

    if (!this.systemTimes.has(name)) {
      this.systemTimes.set(name, []);
    }
    const times = this.systemTimes.get(name)!;
    times.push(duration);
    if (times.length > 120) times.shift();
  }

  getStats(): PerformanceStats {
    const avgFrame = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const maxFrame = Math.max(...this.frameTimes);

    const systems: Record<string, { avg: number; max: number }> = {};
    for (const [name, times] of this.systemTimes) {
      systems[name] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        max: Math.max(...times)
      };
    }

    return {
      fps: 1000 / avgFrame,
      frameTime: { avg: avgFrame, max: maxFrame },
      systems
    };
  }
}
```

---

## 16. Asset Strategy

The project uses a **mixed asset approach**: free CC0 assets for common elements combined with low-budget purchased assets for hero units, key structures, and visual polish.

### 16.1 Asset Sourcing Strategy

#### Priority Allocation

| Asset Category | Source Strategy | Rationale |
|----------------|-----------------|-----------|
| **Hero Units** (Assault Mech, Commando) | Purchased | High visibility, unique silhouettes |
| **HQ Structure** | Purchased | Central focus of every battle |
| **Towers** | Purchased | Key defensive visuals |
| **Basic Infantry** (Militia, Marine) | Free/Purchased | Volume units, consistency matters |
| **Terrain Tiles** | Free | Background, less scrutiny |
| **Props** | Free | Decorative, variety over quality |
| **Particles/VFX** | Free | Often custom-made anyway |
| **UI Elements** | Free | Kenney has excellent UI packs |
| **Animations** | Free (Mixamo) | Works with any humanoid rig |

#### Free Asset Sources

| Source | URL | License | Best For |
|--------|-----|---------|----------|
| **Kenney** | kenney.nl | CC0 | UI, props, terrain, prototyping |
| **Quaternius** | quaternius.com | CC0 | Characters, vehicles |
| **Poly Pizza** | poly.pizza | CC0 | Structures, scenery |
| **Mixamo** | mixamo.com | Free use | Animations (humanoid rigs) |
| **Freesound** | freesound.org | Various | Sound effects |
| **OpenGameArt** | opengameart.org | Various | Mixed assets |

#### Low-Budget Purchased Sources

| Source | URL | Price Range | Best For |
|--------|-----|-------------|----------|
| **Itch.io** | itch.io/game-assets | $1-20 | Indie packs, unique styles |
| **Synty Studios** | syntystore.com | $20-50 | Polygon style packs (consistent) |
| **Sketchfab** | sketchfab.com/store | $5-30 | Individual hero models |
| **CGTrader** | cgtrader.com | $5-50 | Varied quality, large selection |
| **TurboSquid** | turbosquid.com | $10-100 | Professional quality |
| **Unity Asset Store** | assetstore.unity.com | $5-50 | Often includes FBX exports |
| **Humble Bundle** | humblebundle.com | Varies | Occasional game dev bundles |

#### Budget Allocation Suggestion

| Category | % of Asset Budget | Notes |
|----------|-------------------|-------|
| Units (purchased) | 40% | 3-5 hero unit packs |
| Structures (purchased) | 30% | HQ, towers, key buildings |
| Environment (free) | 0% | Kenney/Quaternius terrain |
| VFX (free + custom) | 10% | Particle textures |
| Audio (mixed) | 20% | Some purchased SFX packs |

### 16.2 Style Consistency Guidelines

When mixing assets from multiple sources:

#### Visual Style Target
- **Aesthetic:** Low-poly with flat/gradient shading
- **Polygon Count:** 500-3000 triangles per unit
- **Color Palette:** Muted bases with vibrant faction accents
- **Scale:** 1 unit = 1 meter (normalize all imports)

#### Compatibility Checklist

Before purchasing/using an asset:
- [ ] Art style matches existing assets (low-poly, similar edge hardness)
- [ ] Polygon count within budget (see specifications below)
- [ ] Rigged for Mixamo (humanoids) or includes animations
- [ ] Textures are PBR or can be converted
- [ ] License allows use in commercial multiplayer games
- [ ] Format is FBX or GLB (avoid proprietary formats)

#### Style Unification Techniques

```typescript
// Unified PBR material with faction coloring
function applyUnifiedMaterial(
  mesh: Mesh,
  baseColor: Color3,
  factionColor: Color3,
  scene: Scene
): void {
  const mat = new PBRMaterial("unifiedMat", scene);

  // Consistent material properties across all assets
  mat.albedoColor = baseColor;
  mat.metallic = 0.2;
  mat.roughness = 0.7;

  // Faction accent via emissive
  mat.emissiveColor = factionColor.scale(0.15);

  // Consistent ambient occlusion strength
  mat.ambientTextureStrength = 0.8;

  mesh.material = mat;
}

// Post-process for visual cohesion
function setupStyleUnification(scene: Scene, camera: Camera): void {
  const pipeline = new DefaultRenderingPipeline("style", true, scene, [camera]);

  // Subtle color grading for cohesion
  pipeline.imageProcessing.colorCurvesEnabled = true;
  pipeline.imageProcessing.colorCurves = new ColorCurves();
  pipeline.imageProcessing.colorCurves.globalSaturation = 20; // Slight desaturation

  // Consistent contrast
  pipeline.imageProcessing.contrast = 1.1;
  pipeline.imageProcessing.exposure = 1.0;
}
```

### 16.3 Asset Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Source    │────►│   Process   │────►│   Optimize  │────►│   Bundle    │
│   (FBX/GLB) │     │   (Blender) │     │   (gltf-    │     │   (Vite)    │
│             │     │             │     │   pipeline) │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Texture     │
                    │ Atlas       │
                    │ Generation  │
                    └─────────────┘
```

### 16.3 Asset Specifications

| Asset Type | Format | Max Triangles | Texture Size |
|------------|--------|---------------|--------------|
| Unit (high LOD) | GLB | 2,000 | 512x512 |
| Unit (low LOD) | GLB | 200 | 256x256 |
| Tower | GLB | 3,000 | 512x512 |
| Prop | GLB | 500 | 256x256 |
| Terrain tile | GLB | 100 | Atlas |
| Particle | PNG | N/A | 64x64 |

### 16.4 Style Unification

Apply consistent shaders to unify assets from different sources:

```typescript
function applyFactionShader(
  mesh: Mesh,
  factionColor: Color3,
  scene: Scene
): void {
  const mat = new PBRMaterial("factionMat", scene);

  // Base color with faction tint
  mat.albedoColor = factionColor;
  mat.metallic = 0.3;
  mat.roughness = 0.6;

  // Slight emissive for visibility
  mat.emissiveColor = factionColor.scale(0.1);

  mesh.material = mat;
}
```

---

## 17. Network Architecture

### 17.1 Combat Server Design

```typescript
interface CombatServer {
  battleId: string;
  state: CombatState;
  attackerSocket: Socket;
  defenderSocket: Socket;
  tickInterval: NodeJS.Timer;

  start(): void;
  processInput(playerId: string, input: CombatInput): void;
  tick(): void;
  broadcast(event: string, data: any): void;
  end(result: BattleResult): void;
}
```

### 17.2 WebSocket Events

#### 17.2.1 Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `combat:input` | `CombatInput` | Player action |
| `combat:ping` | `{ timestamp }` | Latency check |
| `combat:ready` | `{}` | Player loaded |

#### 17.2.2 Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `combat:state` | `CombatState` | Full state update |
| `combat:delta` | `DeltaState` | Incremental update |
| `combat:event` | `CombatEvent` | Kill, damage, ability |
| `combat:end` | `BattleResult` | Battle concluded |
| `combat:pong` | `{ timestamp, serverTime }` | Latency response |

### 17.3 Latency Compensation

#### 17.3.1 Interpolation

Smooth movement between server updates:

```typescript
class InterpolationBuffer {
  private buffer: Array<{ state: UnitState; timestamp: number }> = [];
  private interpolationDelay = 100; // 100ms behind server

  addState(state: UnitState, serverTime: number): void {
    this.buffer.push({ state, timestamp: serverTime });

    // Keep only recent states
    const cutoff = serverTime - 500;
    this.buffer = this.buffer.filter(s => s.timestamp > cutoff);
  }

  getInterpolatedState(currentTime: number): UnitState {
    const renderTime = currentTime - this.interpolationDelay;

    // Find surrounding states
    let before = this.buffer[0];
    let after = this.buffer[0];

    for (const state of this.buffer) {
      if (state.timestamp <= renderTime) before = state;
      if (state.timestamp >= renderTime) {
        after = state;
        break;
      }
    }

    // Interpolate
    const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
    return interpolateStates(before.state, after.state, t);
  }
}
```

---

## 18. Implementation Phases

### Phase A: Foundation (2-3 weeks)

- [ ] Babylon.js integration with Vue
  - [ ] Create CombatEngine class
  - [ ] Implement view switching (v-show)
  - [ ] Set up engine pause/resume
- [ ] Basic arena rendering
  - [ ] Flat 60x60 grid
  - [ ] Simple ground texture
  - [ ] HQ placeholder (cube)
- [ ] Camera system
  - [ ] Isometric default view
  - [ ] Pan/zoom controls
  - [ ] Q/E rotation
- [ ] WebSocket combat event structure
  - [ ] Define message types
  - [ ] Basic send/receive
  - [ ] Connection handling

### Phase B: Core Mechanics (3-4 weeks)

- [ ] Unit spawning and basic movement
  - [ ] Spawn from perimeter
  - [ ] Basic movement system
  - [ ] Unit mesh loading
- [ ] Flow Field pathfinding
  - [ ] Integration field generation
  - [ ] Flow direction calculation
  - [ ] Unit following flow
- [ ] Basic combat (hitscan damage)
  - [ ] Target acquisition
  - [ ] Damage application
  - [ ] Death handling
- [ ] HQ health and destruction
  - [ ] Health bar UI
  - [ ] Damage accumulation
  - [ ] Victory/loss detection

### Phase C: Full Combat (3-4 weeks)

- [ ] A* manual orders
  - [ ] Click-to-move
  - [ ] Path visualization
  - [ ] Order queue
- [ ] Tower targeting and firing
  - [ ] Tower placement
  - [ ] Auto-targeting AI
  - [ ] Priority override
- [ ] Projectile system
  - [ ] Travel time
  - [ ] Homing missiles
  - [ ] Area damage
- [ ] Shield mechanics
  - [ ] Shield bubbles
  - [ ] Collision detection
  - [ ] Recharge system

### Phase D: Multiplayer Sync (2-3 weeks)

- [ ] Server-authoritative state
  - [ ] Server tick loop
  - [ ] State validation
  - [ ] Anti-cheat basics
- [ ] Client prediction/reconciliation
  - [ ] Local prediction
  - [ ] Server correction
  - [ ] Smooth reconciliation
- [ ] Real-time state synchronization
  - [ ] Delta compression
  - [ ] Priority updates
  - [ ] Bandwidth optimization
- [ ] Latency compensation
  - [ ] Interpolation buffer
  - [ ] Input delay handling
  - [ ] Lag indicators

### Phase E: Polish (2-3 weeks)

- [ ] Visual effects
  - [ ] Particle systems
  - [ ] Glow effects
  - [ ] Post-processing
- [ ] Audio integration
  - [ ] Sound loading
  - [ ] Spatial audio
  - [ ] Music system
- [ ] UI polish
  - [ ] Animations
  - [ ] Feedback sounds
  - [ ] Tooltips
- [ ] Performance pass
  - [ ] Profiling
  - [ ] Optimization
  - [ ] Mobile testing

---

## 19. File Structure

### 19.1 New Directories

```
apps/web/src/
├── game/
│   ├── combat/                    # NEW - Combat mode module
│   │   ├── CombatEngine.ts        # Main Babylon.js orchestrator
│   │   ├── CombatCamera.ts        # Hybrid camera controller
│   │   ├── ArenaRenderer.ts       # Terrain and props
│   │   ├── UnitManager.ts         # Unit lifecycle
│   │   ├── TowerManager.ts        # Tower system
│   │   ├── ProjectileManager.ts   # Projectile physics
│   │   ├── PathfindingManager.ts  # Flow field + A*
│   │   ├── SelectionManager.ts    # Unit selection
│   │   ├── CombatUI.ts            # Babylon GUI
│   │   └── index.ts               # Module exports
│   └── engine/                    # Existing PixiJS engine
│
├── components/
│   └── combat/                    # NEW - Combat Vue components
│       ├── CombatView.vue         # Main container
│       ├── CombatHUD.vue          # Overlay UI
│       ├── DeploymentBar.vue      # Attacker deployment
│       ├── TowerPanel.vue         # Defender controls
│       ├── UnitStatsPanel.vue     # Selected unit info
│       ├── CombatMinimap.vue      # Tactical minimap
│       └── CombatTimer.vue        # Countdown display
│
└── composables/
    └── useCombatEngine.ts         # NEW - Combat engine composable

packages/shared/src/
├── types/
│   └── combat.ts                  # NEW - Shared combat types
└── config/
    └── combatSettings.ts          # NEW - Combat constants

apps/api/src/
└── modules/
    └── combat/                    # NEW - Combat backend
        ├── routes.ts              # Combat endpoints
        ├── service.ts             # Combat logic
        ├── CombatServer.ts        # Real-time combat server
        └── types.ts               # Backend types
```

### 19.2 Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/views/GameView.vue` | Add combat view layer, switch logic |
| `apps/web/package.json` | Add @babylonjs/* dependencies |
| `packages/shared/src/types/enums.ts` | Add CombatUnitState, etc. |
| `apps/api/src/modules/battles/service.ts` | Integration with combat server |

---

## 20. Testing & Verification

### 20.1 Unit Tests

| Test Area | Test Cases |
|-----------|------------|
| Pathfinding | Flow field generation, A* correctness, obstacle handling |
| Damage | Armor calculation, critical hits, area damage falloff |
| Unit AI | Target acquisition, state transitions, order completion |
| Victory | HQ destruction, time expiry, all units eliminated |

### 20.2 Integration Tests

| Test | Description |
|------|-------------|
| View Switch | Toggle combat ↔ tactical without WebGL errors |
| State Sync | Both clients receive same state within 100ms |
| Reconnection | Player can rejoin mid-combat |
| Battle Flow | Full battle from start to resolution |

### 20.3 Performance Benchmarks

| Metric | Target | Measurement |
|--------|--------|-------------|
| FPS (50 units) | 60 FPS | Mid-range desktop |
| FPS (100 units) | 45 FPS | Mid-range desktop |
| State update latency | < 50ms | Server → Client |
| Input latency | < 100ms | Client → Server → Client |
| Memory usage | < 500MB | Chrome DevTools |
| Load time | < 5s | Arena + assets |

### 20.4 Manual Testing Checklist

- [ ] Combat loads without errors
- [ ] Camera controls work (pan, zoom, rotate)
- [ ] Units deploy correctly
- [ ] Units follow AI to HQ
- [ ] Manual orders override AI
- [ ] Towers target and fire
- [ ] Damage numbers appear
- [ ] Health bars update
- [ ] HQ destruction ends battle
- [ ] Timer expiry ends battle
- [ ] Both players see same state
- [ ] Sound effects play
- [ ] Victory/defeat screens show

---

## Appendix A: Type Definitions

```typescript
// packages/shared/src/types/combat.ts

export enum CombatPhase {
  LOADING = 'loading',
  DEPLOYMENT = 'deployment',
  BATTLE = 'battle',
  RESOLVED = 'resolved'
}

export enum UnitState {
  SPAWNING = 'spawning',
  IDLE = 'idle',
  MOVING = 'moving',
  ATTACKING = 'attacking',
  ABILITY_CAST = 'ability_cast',
  RETREATING = 'retreating',
  DEAD = 'dead'
}

export interface CombatUnit {
  id: string;
  typeId: string;
  ownerId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  health: number;
  maxHealth: number;
  state: UnitState;
  targetId: string | null;
  veterancy: Veterancy;
}

export interface CombatTower {
  id: string;
  typeId: string;
  position: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  targetId: string | null;
  cooldown: number;
}

export interface Projectile {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  targetId: string;
  damage: number;
  splashRadius: number;
}

export interface CombatState {
  battleId: string;
  tick: number;
  phase: CombatPhase;
  timeRemaining: number;
  hq: {
    health: number;
    maxHealth: number;
    position: { x: number; z: number };
  };
  units: CombatUnit[];
  towers: CombatTower[];
  projectiles: Projectile[];
  events: CombatEvent[];
}

export interface CombatInput {
  type: 'deploy' | 'move' | 'attack' | 'ability' | 'target_priority';
  unitIds?: string[];
  unitType?: string;
  targetId?: string;
  position?: { x: number; z: number };
  abilityId?: string;
}

export interface CombatEvent {
  type: 'damage' | 'kill' | 'ability' | 'spawn' | 'victory';
  tick: number;
  sourceId?: string;
  targetId?: string;
  value?: number;
  position?: { x: number; z: number };
}

export interface BattleResult {
  battleId: string;
  winner: 'attacker' | 'defender';
  reason: 'hq_destroyed' | 'time_expired' | 'attackers_eliminated';
  duration: number;
  attackerUnitsRemaining: number;
  defenderUnitsRemaining: number;
}
```

---

## Appendix B: Configuration Constants

```typescript
// packages/shared/src/config/combatSettings.ts

export const COMBAT_SETTINGS = {
  // Timing
  COMBAT_DURATION: 30 * 60, // 30 minutes in seconds
  TICK_RATE: 20, // Server ticks per second
  LOADING_TIME: 5, // Seconds before combat starts

  // Arena
  ARENA_SIZE: 60, // 60x60 tiles
  TILE_SIZE: 2, // 2 meters per tile
  HQ_POSITION: { x: 20, z: 20 },
  SPAWN_ZONE_DEPTH: 2, // 2 tiles from edge

  // HQ
  HQ_BASE_HEALTH: 10000,
  HQ_ARMOR: 50,
  HQ_TIER_MULTIPLIERS: {
    1: 1.0,
    2: 1.5,
    3: 2.0
  },

  // Combat
  CRITICAL_CHANCE: 0.05,
  CRITICAL_MULTIPLIER: 2.0,
  TARGET_REEVAL_INTERVAL: 0.5, // Seconds

  // Spawning
  SPAWN_INVULNERABILITY: 0.5, // Seconds

  // Network
  INTERPOLATION_DELAY: 100, // Milliseconds
  STATE_BUFFER_SIZE: 500, // Milliseconds of history

  // Performance
  MAX_PATHFIND_PER_FRAME: 5,
  FLOW_FIELD_THROTTLE: 100, // Milliseconds
};
```

---

_End of Combat Mode Design Document_
