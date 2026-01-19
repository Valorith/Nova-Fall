# Combat Simulation Plan (Server-Authoritative)

## 1) Goals

- Authoritative, deterministic combat simulation that drives client rendering.
- Support manual unit orders (move/attack) that override AI until resolved.
- Maintain performance for 50-200 concurrent players with multiple battles.
- Keep architecture aligned with existing `apps/ws-server`, Redis Pub/Sub, and `packages/game-logic`.

## 2) Non-Goals (for this phase)

- Client prediction/reconciliation (Phase 4.4).
- Delta compression or rollback.
- Persistent combat state storage (in-memory only for now).

## 3) Existing Components We Will Reuse

- **Simulation core:** `packages/game-logic/src/combat/simulator.ts`
- **Combat types:** `packages/shared/src/types/combat.ts`
- **Redis Pub/Sub + WS relay:** `apps/ws-server/src/index.ts`
  - Already handles `combat:setup`, `combat:state`, `combat:end`, `combat:error`
- **Client renderer:** `apps/web/src/game/combat/CombatEngine.ts` + `useCombatEngine`

## 4) Architecture Overview

### 4.1 Service Placement (No New Service)

- Add a long-running **CombatServer module inside `apps/worker`** (no new service).
- Process uses Redis Pub/Sub directly (not BullMQ), so no extra queue overhead.

### 4.2 Data Flow

1. Client sends `CombatInput` -> `apps/ws-server` -> Redis `combat:input`
2. Combat server consumes input and applies to simulator.
3. Simulator ticks at fixed rate.
4. Combat server publishes `combat:state` -> Redis -> ws-server -> clients.
5. On completion, combat server publishes `combat:end`.

## 5) Combat Server Responsibilities

### 5.1 Battle Lifecycle

- Maintain `Map<battleId, BattleRuntime>`
- `BattleRuntime` contains:
  - `CombatSimulator`
  - `lastTickTime`
  - `tickAccumulator`
  - `tickIntervalMs` (recommended 50ms = 20 TPS)
  - `lastStateBroadcastTime`
  - `players` (attacker/defender IDs)
  - `createdAt`, `lastInputAt`

### 5.2 Tick Loop (Reliability + Determinism)

- Fixed step simulation (`deltaMs = 50`).
- Accumulator loop:
  - Add elapsed time.
  - Process up to `MAX_CATCHUP_TICKS` (suggest 5).
  - Drop remaining accumulated time beyond the cap and log once per battle (prevents spiral-of-death).
- Broadcast cadence:
  - **Sim tick:** 20 TPS.
  - **Broadcast:** 10 TPS (every other tick) for bandwidth control.
  - **Viewer-aware throttle:** if no viewers, suppress `combat:state` and switch to low-frequency sim (see 5.4).

### 5.3 Input Processing (Manual Override)

- Validate input:
  - Unit ownership
  - Unit alive
  - Battle phase allows inputs
  - Destination in bounds
- Apply manual orders to unit state (see Section 7)
- Manual orders override AI until resolved

### 5.4 Recovery + Cleanup

- **No viewers optimization:** if no sockets are in `battle:{battleId}`, switch to a low-frequency sim tick (e.g., 2 TPS) and suppress `combat:state` broadcast.
  - Continue simulating to determine outcome deterministically while minimizing CPU/bandwidth.
  - If a viewer rejoins, restore normal 20 TPS + broadcast cadence and send a full `combat:setup` + latest `combat:state`.
- If battle has no active players for N minutes -> teardown runtime and free memory.
- When `CombatSimulator` reports win condition:
  - Publish `combat:end`
  - Stop runtime and free memory.
- Defensive fail-safes:
  - Catch exceptions per tick, log, and mark battle errored.

## 6) Simulator Extensions (game-logic)

### 6.1 Manual Orders Data Model

Add to `SimUnit`:

- `currentOrder: UnitOrder | null`

UnitOrder shape:

```
type UnitOrder =
  | { type: 'move'; path: { x: number; z: number }[]; targetX: number; targetZ: number; issuedAt: number }
  | { type: 'attack'; targetId: string; issuedAt: number };
```

### 6.2 A\* Pathfinding + Smoothing

- Implement grid A\* in `packages/game-logic/src/combat/pathfinding.ts`.
- Inputs:
  - `layout` (TileType[][])
  - `start`, `goal`
- Obstacles:
  - `TileType.BLOCKED` + buildings/walls.
- Return array of waypoints (grid).
- **Safety limits:** cap node expansions (e.g., 2,500) and abort with empty path if exceeded.
- **Smoothing:** line-of-sight culling:
  - Start at path[0], greedily skip to furthest visible node.
  - Use Bresenham grid ray to test line-of-sight.
- **Dynamic obstacles:** if a waypoint becomes blocked, invalidate the current path and recompute once; if recompute fails, clear order and resume AI.

### 6.3 Order Execution

In `CombatSimulator.tick()`:

- If `unit.currentOrder` exists:
  - Execute until completion
  - When complete, clear and resume AI
- If no order:
  - Run AI preset or default behavior

Completion rules:

- **Move:** reached last waypoint within epsilon.
- **Attack:** target dead, unreachable, or exceeds chase radius/time budget -> clear order.

## 7) AI + Manual Priority Rules

- Manual order always takes precedence.
- AI runs only when `currentOrder == null`.
- After manual completion, unit state returns to `IDLE`.

## 8) Combat State Output

- `CombatState` already exists.
- Ensure we output:
  - `units[]` with `position`, `targetPosition`, `state`, `rotation`, `targetId`
- For clients, `targetPosition` used for interpolation.
- Snapshot strategy:
  - Always emit full state on viewer join/rejoin.
  - For steady updates, emit full state at 10 TPS (keep simple) but structure code to allow delta later.

## 9) Performance Strategies

- Use **tick cache** (already in simulator) to avoid repeated allocations.
- Precompute arrays of units/buildings per tick.
- Avoid per-tick `Array.sort` in hot paths.
- Keep pathfinding per input (not per tick).
- Broadcast at 10 TPS to reduce bandwidth.
- Avoid large object churn when emitting `CombatState` by reusing buffers and only reserializing changed arrays.
- Pause or slow sim to low TPS when no viewers (see 5.4).

## 10) Reliability Strategies

- Defensive validation of all inputs.
- Clamp catch-up ticks and drop excess accumulated time when lagging.
- Log structured warnings for failed inputs and throttled tick drops.
- Timeout battles with no activity.
- Define reconnection behavior: on rejoin, send `combat:setup` + latest snapshot immediately.

## 11) Integration Steps (Execution Plan)

1. Create `CombatServer` module inside `apps/worker`.
2. Subscribe to Redis channels:
   - `combat:input`, `combat:player_joined`, `combat:request_state`
3. Manage `BattleRuntime` map.
4. Extend simulator with:
   - `currentOrder`
   - A\* + smoothing
5. Implement input handlers for move/attack.
6. Emit `combat:state` every 100ms.
7. Add unit tests for:
   - A\* correctness
   - Smoothing (line-of-sight)
   - Manual order completion -> AI resume
