# AI Behavior Tree Editor - Development Plan

> **Status**: Planning Complete
> **Created**: 2026-01-12
> **Target**: Phase 4+ (after Combat System foundation)

---

## Overview

A visual Behavior Tree Editor for creating AI presets that can be assigned to units and buildings. The editor provides a polished, intuitive UX for designing complex AI behaviors without coding.

### Key Features
- Visual node-based editor using Vue Flow
- Drag-and-drop node creation
- Real-time validation feedback
- Step-through debugging/preview
- Integration with Unit/Building editors

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test Mode | Visual Tree Execution | Highlights nodes as they execute with mock data. Simpler to implement, sufficient for debugging. |
| Extensibility | Built-in Only | ~15 conditions and ~10 actions cover most needs. Safer, easier to balance. |
| Import/Export | Database Only | Simpler implementation. No JSON file sharing for MVP. |

---

## Architecture

### Tech Stack
- **Vue Flow v1.48.1** - Node-based visual editor
- **VueUse `useRefHistory`** - Undo/redo system
- **Prisma** - Database schema for AI presets
- **Existing patterns** - Split-panel layout, dark theme, consistent styling

### Integration Points
AI behavior trees execute during combat ticks in `CombatSimulator.tick()`:
1. `processAttackerUnits()` - Unit target selection & movement
2. `processDefenderUnits()` - Defender target selection
3. `processTurrets()` - Building target selection

---

## Database Schema

### New Model: AIPreset
```prisma
model AIPreset {
  id          String   @id @default(cuid())
  name        String
  description String?
  category    String   // 'unit' | 'building'
  treeData    Json     // Serialized behavior tree
  isTemplate  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  unitDefinitions     UnitDefinition[]
  buildingDefinitions BuildingDefinition[]
}
```

### Updates to Existing Models
```prisma
// Add to UnitDefinition:
aiPresetId String?
aiPreset   AIPreset? @relation(fields: [aiPresetId], references: [id])

// Add to BuildingDefinition:
aiPresetId String?
aiPreset   AIPreset? @relation(fields: [aiPresetId], references: [id])
```

---

## Shared Types

### File: `packages/shared/src/types/ai.ts`

```typescript
// === Node Types ===
export type CompositeNodeType = 'selector' | 'sequence' | 'parallel'
export type DecoratorNodeType = 'inverter' | 'succeeder' | 'repeater' | 'until_fail'
export type LeafNodeType = 'condition' | 'action'
export type BehaviorNodeType = CompositeNodeType | DecoratorNodeType | LeafNodeType

// === Node Structure ===
export interface BehaviorNode {
  id: string
  type: BehaviorNodeType
  label: string
  params: Record<string, unknown>
  position: { x: number; y: number }
}

export interface BehaviorEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  order?: number  // For composite children ordering
}

export interface BehaviorTree {
  version: 1
  category: 'unit' | 'building'
  nodes: BehaviorNode[]
  edges: BehaviorEdge[]
  rootId: string
}

// === Condition/Action Definitions ===
export interface ParamDef {
  name: string
  type: 'number' | 'string' | 'boolean' | 'select'
  label: string
  default?: unknown
  options?: { value: string; label: string }[]  // For select type
  min?: number
  max?: number
}

export interface ConditionDef {
  id: string
  name: string
  description: string
  category: string
  params: ParamDef[]
}

export interface ActionDef {
  id: string
  name: string
  description: string
  category: string
  params: ParamDef[]
}

// === Runtime Types ===
export type NodeResult = 'success' | 'failure' | 'running'

export interface AIContext {
  unit: {
    id: string
    x: number
    z: number
    health: number
    maxHealth: number
    shield: number
    maxShield: number
    state: string
    targetId: string | null
    stats: {
      damage: number
      armor: number
      range: number
      speed: number
      attackSpeed: number
    }
  }
  enemies: Array<{
    id: string
    x: number
    z: number
    health: number
    maxHealth: number
    type: string
  }>
  allies: Array<{
    id: string
    x: number
    z: number
    health: number
    maxHealth: number
    type: string
  }>
  buildings: Array<{
    id: string
    x: number
    z: number
    health: number
    type: string
    isEnemy: boolean
  }>
  core: {
    x: number
    z: number
    health: number
    maxHealth: number
  }
  flowField: {
    getDirection: (x: number, z: number) => { dx: number; dz: number } | null
    getDistance: (x: number, z: number) => number
  }
  currentTime: number
}
```

---

## Node Types

### Composite Nodes
Execute children based on specific rules.

| Node | Icon | Color | Behavior |
|------|------|-------|----------|
| **Selector** | `?` | Orange (#f59e0b) | Tries children in order until one succeeds |
| **Sequence** | `→` | Blue (#3b82f6) | Runs children in order until one fails |
| **Parallel** | `∥` | Purple (#a855f7) | Runs all children simultaneously |

### Decorator Nodes
Modify the result of a single child.

| Node | Icon | Color | Behavior |
|------|------|-------|----------|
| **Inverter** | `!` | Yellow (#eab308) | Flips success↔failure |
| **Succeeder** | `✓` | Yellow (#eab308) | Always returns success |
| **Repeater** | `↻` | Yellow (#eab308) | Repeats child N times |
| **UntilFail** | `∞` | Yellow (#eab308) | Repeats until child fails |

### Leaf Nodes - Conditions
Evaluate to true/false based on game state.

| Condition | Category | Parameters | Description |
|-----------|----------|------------|-------------|
| `health_check` | Status | operator, value, type(%, abs) | Compare own health |
| `shield_check` | Status | operator, value, type(%, abs) | Compare own shield |
| `has_target` | Targeting | - | Has active attack target |
| `target_in_range` | Targeting | range_mult (0.5-2.0) | Target within modified range |
| `target_health` | Targeting | operator, value, type | Check target's health |
| `ally_nearby` | Awareness | radius (1-20) | Friendly unit within radius |
| `ally_low_health` | Awareness | radius, threshold(%) | Ally below health threshold |
| `enemy_count` | Awareness | operator, value, radius | Count enemies in radius |
| `enemy_type_nearby` | Awareness | type, radius | Specific enemy type nearby |
| `distance_to_core` | Position | operator, value | Tiles from objective |
| `in_spawn_zone` | Position | - | Currently in spawn area |
| `is_state` | Status | state | Check current unit state |
| `cooldown_ready` | Combat | - | Attack cooldown finished |
| `random_chance` | Utility | percent (1-100) | Random probability check |

### Leaf Nodes - Actions
Perform behaviors that affect the game state.

| Action | Category | Parameters | Description |
|--------|----------|------------|-------------|
| `attack_target` | Combat | - | Attack current target |
| `attack_nearest` | Combat | filter (unit/building/any) | Attack nearest matching |
| `attack_priority` | Combat | priorities[] | Attack based on priority list |
| `set_target` | Targeting | filter, sort_by | Select new target |
| `clear_target` | Targeting | - | Remove current target |
| `move_to_target` | Movement | - | Move toward current target |
| `move_to_position` | Movement | x, z | Move to specific tile |
| `follow_flow_field` | Movement | - | Move toward core |
| `retreat_to_spawn` | Movement | - | Move back to spawn |
| `hold_position` | Movement | - | Stop movement |
| `protect_ally` | Support | filter, radius | Move to protect nearby ally |

---

## UI Layout

### Three-Panel Design
```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Editor                                              [Test] [Save]   │
├──────────────┬──────────────────────────────────┬───────────────────────┤
│ Presets      │  Canvas (Vue Flow)               │  Properties           │
│ (280px)      │  (flex)                          │  (320px)              │
│              │                                  │                       │
│ [Search___]  │       ┌──────────┐               │  ┌─────────────────┐  │
│ [Category ▾] │       │ Selector │               │  │ Selector        │  │
│              │       └────┬─────┘               │  └─────────────────┘  │
│ ┌──────────┐ │            │                     │                       │
│ │Aggressive│ │    ┌───────┴───────┐             │  Label:               │
│ │ ⚔ Unit   │ │    │               │             │  [Attack Priority___] │
│ └──────────┘ │ ┌──┴──┐       ┌────┴────┐        │                       │
│ ┌──────────┐ │ │Seq. │       │Condition│        │  Execution:           │
│ │Defensive │ │ └──┬──┘       └─────────┘        │  ○ First success      │
│ │ 🛡 Unit   │ │    │                            │  ○ Random             │
│ └──────────┘ │ ┌──┴──┐                          │                       │
│              │ │Action│                          │  Children: 2          │
│ [+ New]      │ └─────┘    [Minimap]  [Controls] │                       │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

### Header Toolbar
| Position | Elements |
|----------|----------|
| Left | Preset name (editable), Category badge (Unit/Building) |
| Center | Undo, Redo, Zoom In, Zoom Out, Fit View |
| Right | Validate, Test, Save, Delete |

### Left Panel - Preset List
- Search input (filters by name)
- Category dropdown (All / Unit / Building)
- Template toggle (show/hide system templates)
- Scrollable list with:
  - Preset name
  - Category badge with icon
  - Template indicator (lock icon)
  - Link count badge (units/buildings using it)
- "+ New Preset" button (bottom)

### Center Panel - Canvas
- Vue Flow with dark theme grid background
- Minimap (bottom-right, collapsible)
- Zoom/fit controls (bottom-left)
- Drag-and-drop from palette
- Multi-select with Shift+click or drag box
- Connection validation (green/red feedback)

### Right Panel - Properties
**No Selection State:**
- Tree statistics (node count, depth)
- Validation status with error list
- Quick action buttons

**Node Selected State:**
- Node type header with colored icon
- Label text input
- Type-specific parameter editors
- Delete node button

### Node Palette (Floating Panel)
Activated via toolbar button or keyboard shortcut.

```
┌─────────────────────────────┐
│ Add Node              [×]   │
├─────────────────────────────┤
│ COMPOSITES                  │
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ ? │ │ → │ │ ∥ │    │
│ │Sel.│ │Seq.│ │Par.│    │
│ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────┤
│ DECORATORS                  │
│ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ ! │ │ ✓ │ │ ↻ │    │
│ │Inv.│ │Suc.│ │Rep.│    │
│ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────┤
│ CONDITIONS          [▾ All] │
│ ┌───────────────────────┐   │
│ │ Health Check          │   │
│ │ Has Target            │   │
│ │ Target In Range       │   │
│ │ ...                   │   │
│ └───────────────────────┘   │
├─────────────────────────────┤
│ ACTIONS             [▾ All] │
│ ┌───────────────────────┐   │
│ │ Attack Target         │   │
│ │ Attack Nearest        │   │
│ │ Follow Flow Field     │   │
│ │ ...                   │   │
│ └───────────────────────┘   │
└─────────────────────────────┘
```

---

## Tree Validation

### Validation Rules
1. **Single Root**: Exactly one node with no incoming edges
2. **No Cycles**: Directed acyclic graph only
3. **All Connected**: Every node reachable from root
4. **Valid Connections**:
   - Composites: 1+ children
   - Decorators: Exactly 1 child
   - Leaves: 0 children (no outgoing edges)
5. **Required Params**: All required parameters filled
6. **Valid Param Values**: Numbers in range, selects have valid option

### Visual Feedback
| State | Indicator |
|-------|-----------|
| Valid tree | Green checkmark in header |
| Error on node | Red border, red dot |
| Warning | Yellow border (e.g., unreachable node) |
| Hover | Tooltip with specific message |

### Error Messages
```
- "Tree has no root node"
- "Multiple root nodes found"
- "Cycle detected: Node A → Node B → Node A"
- "Node 'Attack Priority' is not connected to tree"
- "Selector 'Main Logic' has no children"
- "Decorator 'Inverter' must have exactly one child"
- "Condition 'Health Check' missing required parameter: value"
- "Parameter 'radius' must be between 1 and 20"
```

---

## Visual Tree Execution Preview

### Test Panel Layout
Opens as right-side panel or modal when "Test" clicked.

```
┌─────────────────────────────────────┐
│ Test Behavior Tree            [×]   │
├─────────────────────────────────────┤
│ MOCK CONTEXT                        │
│                                     │
│ Unit Health:    [====----] 60%      │
│ Unit Shield:    [======--] 75%      │
│ Has Target:     [✓]                 │
│ Target Health:  [==------] 25%      │
│ Target Distance:[___3___] tiles     │
│ Enemies Nearby: [___2___]           │
│ Allies Nearby:  [___1___]           │
├─────────────────────────────────────┤
│ EXECUTION                           │
│                                     │
│ [▶ Run]  [⏭ Step]  [↺ Reset]        │
│                                     │
│ Result: SUCCESS                     │
│ Path: Selector → Sequence → Attack  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Step 1: Selector                │ │
│ │   Trying child 1...             │ │
│ │                                 │ │
│ │ Step 2: Sequence                │ │
│ │   Running child 1...            │ │
│ │                                 │ │
│ │ Step 3: Health Check > 50%      │ │
│ │   Unit health: 60% ✓ SUCCESS    │ │
│ │                                 │ │
│ │ Step 4: Attack Target           │ │
│ │   Has target: true ✓ SUCCESS    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Execution Modes
- **Run**: Execute entire tree, highlight final path
- **Step**: Click through node-by-node, see each evaluation
- **Reset**: Clear execution state, try new scenario

### Visual Feedback on Canvas
- **Success path**: Nodes glow green
- **Failure path**: Nodes glow red
- **Current step**: Node pulses blue
- **Not evaluated**: Nodes stay dim

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected nodes |
| `Ctrl+C` | Copy selected |
| `Ctrl+V` | Paste |
| `Ctrl+D` | Duplicate selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save preset |
| `Escape` | Deselect all / Close palette |
| `Space` + Drag | Pan canvas |
| `Scroll` | Zoom in/out |
| `A` | Open node palette |
| `F` | Fit view to all nodes |
| `L` | Auto-layout tree |

---

## Integration with Unit/Building Editors

### AIPresetSelector Component
Reusable dropdown for selecting AI presets.

```vue
<template>
  <div class="ai-preset-selector">
    <div v-if="selectedPreset" class="selected-preset">
      <span class="preset-icon">🧠</span>
      <span class="preset-name">{{ selectedPreset.name }}</span>
      <button class="btn-edit" @click="editPreset">Edit</button>
      <button class="btn-clear" @click="clearPreset">×</button>
    </div>
    <div v-else class="preset-search">
      <input
        v-model="search"
        placeholder="Search AI presets..."
        @focus="showDropdown = true"
      />
      <div v-if="showDropdown" class="preset-dropdown">
        <div class="dropdown-option create" @click="createNew">
          + Create New Preset
        </div>
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="dropdown-option"
          @click="selectPreset(preset)"
        >
          <span class="preset-name">{{ preset.name }}</span>
          <span v-if="preset.isTemplate" class="template-badge">Template</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

### Unit Editor Integration
Add to `UnitsEditor.vue` form:

```vue
<div class="form-group">
  <label>AI Behavior</label>
  <AIPresetSelector
    v-model="form.aiPresetId"
    category="unit"
    @edit="openAIEditor"
    @create="createAndAssign"
  />
  <span class="hint">Select an AI preset to control this unit's combat behavior</span>
</div>
```

### Building Editor Integration
Same pattern in `BuildingsEditor.vue`.

### Link Display in AI Editor
Show which units/buildings use each preset:
- Badge with count on preset list item
- Expandable section in properties panel
- Warning dialog before deleting used preset

---

## System Templates

Pre-built templates (read-only, can duplicate).

### Unit Templates

**Aggressive Attacker**
```
Selector
├── Sequence [Attack When Able]
│   ├── Condition: Has Target
│   ├── Condition: Target In Range
│   └── Action: Attack Target
├── Sequence [Find and Attack]
│   ├── Action: Set Target (nearest, enemy)
│   └── Action: Move To Target
└── Action: Follow Flow Field
```

**Defensive Holder**
```
Selector
├── Sequence [Retreat When Critical]
│   ├── Condition: Health Check < 20%
│   └── Action: Retreat To Spawn
├── Sequence [Attack Nearby]
│   ├── Condition: Enemy Count > 0 (radius: 5)
│   ├── Action: Set Target (nearest, enemy)
│   └── Action: Attack Target
└── Action: Hold Position
```

**Support Protector**
```
Selector
├── Sequence [Protect Low Ally]
│   ├── Condition: Ally Low Health (radius: 10, threshold: 40%)
│   └── Action: Protect Ally (filter: lowest_health)
├── Sequence [Attack If Safe]
│   ├── Condition: Health Check > 60%
│   ├── Condition: Has Target
│   └── Action: Attack Target
└── Action: Follow Flow Field
```

### Building Templates

**Priority Turret**
```
Selector
├── Sequence [Focus High Threat]
│   ├── Condition: Enemy Type Nearby (combat_vehicle, radius: 8)
│   ├── Action: Set Target (type: combat_vehicle, sort: nearest)
│   └── Action: Attack Target
├── Sequence [Attack Any]
│   ├── Condition: Enemy Count > 0 (radius: 8)
│   └── Action: Attack Nearest
└── Action: Hold Position (idle)
```

**Area Denial**
```
Sequence
├── Condition: Cooldown Ready
├── Action: Set Target (nearest, any)
└── Action: Attack Target
```

---

## Runtime Execution Engine

### BehaviorTreeExecutor Class

```typescript
// packages/game-logic/src/ai/BehaviorTreeExecutor.ts

export class BehaviorTreeExecutor {
  private tree: BehaviorTree
  private nodeMap: Map<string, BehaviorNode>

  constructor(tree: BehaviorTree) {
    this.tree = tree
    this.nodeMap = new Map(tree.nodes.map(n => [n.id, n]))
  }

  tick(context: AIContext): NodeResult {
    const root = this.nodeMap.get(this.tree.rootId)
    if (!root) return 'failure'
    return this.executeNode(root, context)
  }

  private executeNode(node: BehaviorNode, context: AIContext): NodeResult {
    switch (node.type) {
      case 'selector':
        return this.executeSelector(node, context)
      case 'sequence':
        return this.executeSequence(node, context)
      case 'parallel':
        return this.executeParallel(node, context)
      case 'inverter':
        return this.executeInverter(node, context)
      // ... etc
      case 'condition':
        return this.evaluateCondition(node, context)
      case 'action':
        return this.executeAction(node, context)
    }
  }

  private executeSelector(node: BehaviorNode, context: AIContext): NodeResult {
    const children = this.getOrderedChildren(node.id)
    for (const child of children) {
      const result = this.executeNode(child, context)
      if (result === 'success' || result === 'running') {
        return result
      }
    }
    return 'failure'
  }

  private executeSequence(node: BehaviorNode, context: AIContext): NodeResult {
    const children = this.getOrderedChildren(node.id)
    for (const child of children) {
      const result = this.executeNode(child, context)
      if (result === 'failure' || result === 'running') {
        return result
      }
    }
    return 'success'
  }

  // ... additional methods
}
```

### Combat Simulator Integration

```typescript
// In CombatSimulator.processAttackerUnits()

private processAttackerUnits(deltaMs: number): void {
  for (const unit of this.attackerUnits) {
    if (unit.state === UnitState.SPAWNING || unit.state === UnitState.DEAD) {
      continue
    }

    // Check for AI preset
    const aiPreset = this.unitAIPresets.get(unit.typeId)
    if (aiPreset) {
      const executor = this.getOrCreateExecutor(aiPreset)
      const context = this.buildAIContext(unit)
      const result = executor.tick(context)

      // AI has updated context.action - apply it
      this.applyAIAction(unit, context)
    } else {
      // Fallback to default behavior
      this.defaultAttackerBehavior(unit, deltaMs)
    }
  }
}
```

---

## File Structure

```
apps/web/src/
├── views/dev/
│   ├── DevView.vue                     # Add AI Editor tab
│   └── AIEditor.vue                    # Main editor view
├── components/ai-editor/
│   ├── AIEditorCanvas.vue              # Vue Flow wrapper
│   ├── AIPresetList.vue                # Left panel
│   ├── AINodeProperties.vue            # Right panel
│   ├── AINodePalette.vue               # Floating node picker
│   ├── AIPresetSelector.vue            # Dropdown for Unit/Building editors
│   ├── AITreeValidator.vue             # Validation logic & display
│   ├── AITestPanel.vue                 # Visual execution preview
│   └── nodes/
│       ├── BaseNode.vue                # Shared node styling/logic
│       ├── SelectorNode.vue            # Composite: Selector
│       ├── SequenceNode.vue            # Composite: Sequence
│       ├── ParallelNode.vue            # Composite: Parallel
│       ├── DecoratorNode.vue           # All decorator types
│       ├── ConditionNode.vue           # Condition leaves
│       └── ActionNode.vue              # Action leaves
├── composables/
│   └── useAIEditor.ts                  # Editor state management

packages/shared/src/
├── types/
│   └── ai.ts                           # AI type definitions
└── ai/
    ├── index.ts                        # Exports
    ├── conditions.ts                   # Condition definitions
    └── actions.ts                      # Action definitions

packages/game-logic/src/
└── ai/
    ├── index.ts                        # Exports
    ├── BehaviorTreeExecutor.ts         # Runtime executor
    ├── conditions/                     # Condition implementations
    │   ├── index.ts
    │   ├── healthCheck.ts
    │   ├── hasTarget.ts
    │   └── ...
    └── actions/                        # Action implementations
        ├── index.ts
        ├── attackTarget.ts
        ├── moveToTarget.ts
        └── ...

apps/api/src/routes/
└── ai-presets.ts                       # CRUD API endpoints
```

---

## Implementation Checklist

### Sprint 1: Foundation
- [ ] Add AIPreset model to Prisma schema
- [ ] Add aiPresetId to UnitDefinition and BuildingDefinition
- [ ] Create and run migration
- [ ] Create `apps/api/src/routes/ai-presets.ts` with CRUD endpoints
- [ ] Create `packages/shared/src/types/ai.ts` with type definitions
- [ ] Install Vue Flow packages: `@vue-flow/core`, `@vue-flow/minimap`, `@vue-flow/controls`, `@vue-flow/background`
- [ ] Create `AIEditor.vue` shell with three-panel layout
- [ ] Add "AI Editor" tab to `DevView.vue`

### Sprint 2: Vue Flow Canvas
- [ ] Set up Vue Flow with dark theme matching existing editors
- [ ] Create `BaseNode.vue` with shared styling
- [ ] Create `SelectorNode.vue` (orange, ? icon)
- [ ] Create `SequenceNode.vue` (blue, → icon)
- [ ] Create `ParallelNode.vue` (purple, ∥ icon)
- [ ] Create `DecoratorNode.vue` (yellow, supports all decorator types)
- [ ] Create `ConditionNode.vue` (cyan)
- [ ] Create `ActionNode.vue` (green)
- [ ] Implement connection validation (correct handle types)
- [ ] Add minimap component
- [ ] Add zoom/pan controls
- [ ] Implement drag-from-palette to create nodes

### Sprint 3: Properties & Editing
- [ ] Create `AINodeProperties.vue` panel
- [ ] Build parameter editors for each node type
- [ ] Create `AITreeValidator.ts` with all validation rules
- [ ] Add visual validation feedback (red borders, tooltips)
- [ ] Implement undo/redo with VueUse `useRefHistory`
- [ ] Create `AIPresetList.vue` left panel
- [ ] Implement search and category filtering
- [ ] Add save/load functionality via API

### Sprint 4: Polish & Templates
- [ ] Implement all keyboard shortcuts
- [ ] Add auto-layout algorithm (dagre or custom)
- [ ] Implement copy/paste for nodes
- [ ] Create duplicate preset functionality
- [ ] Build system templates (5-8 presets)
- [ ] Add template indicator and read-only mode
- [ ] Style floating node palette

### Sprint 5: Integration
- [ ] Create `AIPresetSelector.vue` component
- [ ] Add AI preset selector to `UnitsEditor.vue`
- [ ] Add AI preset selector to `BuildingsEditor.vue`
- [ ] Implement link tracking (show which units use each preset)
- [ ] Add deletion protection for presets with links
- [ ] Add "Edit" button to jump to AI Editor from selectors

### Sprint 6: Runtime & Test Mode
- [ ] Create `BehaviorTreeExecutor.ts` class
- [ ] Implement all condition evaluators (~15)
- [ ] Implement all action handlers (~10)
- [ ] Integrate executor with `CombatSimulator`
- [ ] Create `AITestPanel.vue` for visual execution preview
- [ ] Implement step-through debugging mode
- [ ] Add execution path highlighting on canvas

---

## API Endpoints

### GET /api/ai-presets
List all presets with optional filters.

**Query params:**
- `category`: 'unit' | 'building' | undefined (all)
- `includeTemplates`: boolean (default true)
- `search`: string (name search)

**Response:**
```json
{
  "presets": [
    {
      "id": "clx...",
      "name": "Aggressive Attacker",
      "description": "Rushes enemies and attacks on sight",
      "category": "unit",
      "isTemplate": true,
      "linkedCount": 3,
      "createdAt": "2026-01-12T...",
      "updatedAt": "2026-01-12T..."
    }
  ]
}
```

### GET /api/ai-presets/:id
Get single preset with full tree data.

**Response:**
```json
{
  "preset": {
    "id": "clx...",
    "name": "Aggressive Attacker",
    "description": "...",
    "category": "unit",
    "isTemplate": true,
    "treeData": {
      "version": 1,
      "nodes": [...],
      "edges": [...],
      "rootId": "node_1"
    },
    "linkedUnits": ["Marine", "Heavy Trooper"],
    "linkedBuildings": []
  }
}
```

### POST /api/ai-presets
Create new preset.

**Body:**
```json
{
  "name": "Custom Attacker",
  "description": "My custom AI",
  "category": "unit",
  "treeData": { ... }
}
```

### PUT /api/ai-presets/:id
Update existing preset.

### DELETE /api/ai-presets/:id
Delete preset (fails if linked to units/buildings).

### POST /api/ai-presets/:id/duplicate
Clone preset with new name.

**Body:**
```json
{
  "name": "Custom Attacker Copy"
}
```

---

## Dependencies

### New Packages
```bash
pnpm add @vue-flow/core @vue-flow/minimap @vue-flow/controls @vue-flow/background
```

### Existing Packages Used
- **VueUse** - `useRefHistory` for undo/redo
- **Pinia** - State management
- **TailwindCSS** - Styling (dark theme)
- **Prisma** - Database ORM

---

## Notes

- All presets are session-independent (global game data like ItemDefinition)
- Templates are seeded during `db:seed`, marked with `isTemplate: true`
- The executor runs server-side in the game-logic package
- Client-side preview uses the same executor with mock context
- Future consideration: export/import JSON for community sharing (post-MVP)
