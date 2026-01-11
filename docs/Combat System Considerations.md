# Sci-Fi Siege RTS - Technical Design Document

## 1. Project Overview
**Concept:** A hybrid "Siege Defense" and Light RTS game.
**Core Loop:**
1.  **Strategy Phase (2D):** Turn-based movement on a Hex Grid map.
2.  **Combat Phase (3D):** Real-time defensive battles where attackers spawn from the perimeter (360°) to destroy a central HQ.
**Platform:** Browser-based (Mobile/Desktop).

---

## 2. Technology Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **Vue 3 (Composition API)** | Handles UI, State, and the 2D Strategy Map. |
| **3D Engine** | **Babylon.js** | Best-in-class WebGL engine with native TypeScript support and "batteries-included" features. |
| **State Management** | **Pinia** | Serves as the bridge between Vue UI and Babylon Logic. |
| **Build Tool** | **Vite** | Fast HMR (Hot Module Replacement). |
| **Asset Format** | **.GLB (Compressed)** | Standard 3D model format. |
| **Backend (Dev Only)** | **Node.js Script** | Simple middleware to write JSON configs to disk during development. |

---

## 3. Core Architecture

### A. The Hybrid View Strategy
The app consists of two "layers" stacked via CSS.
* **Layer 1 (Strategy):** A standard HTML/CSS Grid for the Hex Map.
* **Layer 2 (Combat):** A full-screen `<canvas>` for Babylon.js.

**Implementation Rules:**
* **Switching:** Use `v-show` (CSS `display: none`) to toggle views. **Never** use `v-if` on the canvas (avoids WebGL context loss).
* **Performance:** Implement a `useCombatEngine` composable.
    * When Layer 2 is hidden: Call `engine.stopRenderLoop()`.
    * When Layer 2 is shown: Call `engine.runRenderLoop()`.

### B. The "CMS" Dev Pipeline
To facilitate rapid balancing without hardcoding values, the game uses a **Configuration-Driven** approach.

* **Single Source of Truth:** `src/data/units.json`, `weapons.json`, `levels.json`.
* **Dev-Mode Editor:** A hidden Vue Admin Panel overlay in the game.
    * **Visuals:** Dropdowns populated by scanning the `/public/assets` folder.
    * **Logic:** Frontend sends JSON to a local Node script (`POST /api/save`) to overwrite files on disk.
    * **AI Benefit:** The AI reads the JSON files to understand game balance, separating data from code.

---

## 4. Gameplay Systems (Combat Mode)

### A. Terrain & Grid
* **Logic:** Strict Integer Grid (e.g., 50x50) for all collision/placement logic.
* **Visuals:** **3D Tiles** (Modular Assets: Grass, Road, Water).
* **Rendering:** Use **`ThinInstances`** to render thousands of tiles with a single draw call.
* **Aesthetics:** Use **Interpolation** (Tweening) for unit movement to create fluid curves between grid centers.

### B. Pathfinding (The Hybrid Brain)
Since enemies spawn from all angles, standard A* is too expensive for swarms.

1.  **Siege Logic (Flow Fields):**
    * **Algorithm:** Dijkstra Flow Field (Heatmap).
    * **Behavior:** Units step to the neighbor tile with the lowest "Distance to HQ" value.
    * **Benefit:** Extremely cheap for hundreds of units. Handles "breaching" (attacking walls) naturally.
2.  **Manual Override (A*):**
    * **Algorithm:** A* (via Babylon RecastJS or pathfinding lib).
    * **Usage:** Only calculated when the player explicitly Right-Clicks a destination.

### C. Combat Logic (No Physics Engine)
* **Hitscan (Lasers):** Instant raycast. Visualized using `CreateGreasedLine` (fading glow).
* **Projectiles (Missiles):**
    * **Movement:** Frame-by-frame Vector update.
    * **Collision:** Simple `Vector3.Distance` check.
    * **Tracking:** Use `Vector3.Lerp` on the rotation vector to create "Turn Rate" (curved homing).
* **Shields (Area):**
    * **Mechanic:** Sphere-Ray Intersection.
    * **Rule:** If a projectile originates *outside* the bubble radius and intersects the sphere, it is blocked.
    * **Visual:** Child Sphere Mesh with Fresnel Shader.

### D. Unit State Machine
Units follow a strict priority system to handle Player vs. AI commands.

| State | Priority | Behavior | Trigger |
| :--- | :--- | :--- | :--- |
| **AUTO_SIEGE** | Low | Follow Flow Field to HQ. Attack walls if blocked. | Spawn / Idle |
| **MANUAL_MOVE** | High | Ignore Flow Field. Follow A* path to click. | Right-Click Ground |
| **MANUAL_ATTACK** | High | Chase specific `targetID`. | Right-Click Enemy |

---

## 5. Visual Polish & Performance

### "The Pro Checklist"
1.  **Glow Layer:** Enable `BABYLON.GlowLayer` for instant bloom on lasers/shields.
2.  **Environment:** Use `createDefaultEnvironment()` for IBL (Image-Based Lighting) so metals reflect the sky.
3.  **Shadows:** Use **Cascaded Shadow Maps (CSM)** for crisp shadows at RTS camera angles.
4.  **Freezing:** Call `mesh.freezeWorldMatrix()` on all static walls/terrain to save CPU.
5.  **Textures:** Use **.ktx2** compressed textures for mobile memory safety.
6.  **UI:** Use **Babylon GUI** for health bars (linked to meshes) to prevent DOM lag.

---

## 6. Implementation Roadmap

### Phase 1: The Foundation
1.  Setup Vue 3 + Babylon.js boilerplate.
2.  Implement `App.vue` with `v-show` toggle and Engine Pause logic.
3.  Create the `server.js` script for JSON saving.

### Phase 2: The World
1.  Implement `TerrainManager` using `ThinInstances`.
2.  Build the Vue "Dev Editor" to create a `level.json` map file.

### Phase 3: The Units (Skeleton)
1.  Create `UnitManager` (spawning Red Boxes).
2.  Implement `FlowField` pathfinding logic.
3.  Implement the **State Machine** (`AUTO` vs `MANUAL`).

### Phase 4: Combat
1.  Implement `ProjectileManager` (Lasers/Missiles).
2.  Add Shield Logic (Ray intersection).
3.  Connect the UI "Unit Editor" to tweak weapon stats live.

### Phase 5: Polish
1.  Swap Red Boxes for `.glb` models.
2.  Add Particle Effects and Glow Layer.
3.  Add Sound FX.

---

## 7. AI Prompting Strategy
*When asking Claude for code, use these specific constraints:*

> "I am using a **Code-First, Physics-Free** approach.
> Please separate **Game Logic** (State) from **Rendering** (Babylon).
> For movement, use **Vector3.Lerp** on a Grid, do not use physics impostors.
> For collision, use **Mathematical Distance checks**.
> Use **ThinInstances** for the terrain."