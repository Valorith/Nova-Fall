# Nova Fall - Claude Code Instructions

## Project Overview

Nova Fall is a browser-based multiplayer territory control game set on a newly colonized planet. Players establish outposts, build defenses, research technologies, manage economies, and compete for territorial dominance through real-time tower defense combat.

- **Project Type:** Browser-based multiplayer game
- **Timeline:** 3 months to MVP
- **Developer:** Solo (with Claude Code assistance)
- **Hosting:** Railway
- **Target Scale:** 50-200 concurrent players

---

## Critical Files - READ THESE FIRST

Before starting ANY work session, you MUST read these files:

| Priority | File                           | Purpose                             |
| -------- | ------------------------------ | ----------------------------------- |
| 1        | `CLAUDE.md` (this file)        | Project rules and conventions       |
| 2        | `docs/DEVELOPMENT-PLAN.md`     | Master checklist and specifications |
| 3        | `docs/GAME-DESIGN-DOCUMENT.md` | Full game design reference          |
| 4        | `docs/PROGRESS.md`             | Session-by-session progress log     |

---

## Development Rules

### Development Environment (macOS)

This project runs on macOS. Claude Code runs in the same environment as the dev server - no platform conflicts.

#### Available Commands

All pnpm/npm commands work normally:

| Command | What it does |
|---------|--------------|
| `pnpm install` | Install/update dependencies |
| `pnpm dev` | Start development servers |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Run TypeScript compiler |
| `pnpm lint` / `pnpm lint:fix` | Run ESLint |
| `pnpm test` | Run tests |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:seed` | Seed the database |
| `pnpm db:reseed-map` | Reseed map nodes only |

#### Initial Setup (if needed)

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Seed database
pnpm db:seed
```

---

### ⚠️ Database Safety (CRITICAL) ⚠️

**Global data (ItemDefinition, Blueprint, User, Player) must NEVER be wiped during routine workflow.**

These tables contain manually configured game data that takes significant time to recreate. Losing this data is extremely costly.

#### ❌ NEVER suggest these commands for routine work:

| Command | Why it's dangerous |
|---------|-------------------|
| `prisma migrate reset` | Drops ALL tables including global data |
| `pnpm db:reset` | Same as above - wipes everything |
| Deleting/recreating the database | Loses all configuration |

#### ✅ SAFE commands for routine workflow:

| Command | What it does |
|---------|--------------|
| `pnpm db:reseed-map` | Reseeds map nodes only, **preserves items/blueprints** |
| `pnpm db:migrate` | Applies new migrations without data loss |
| `pnpm db:generate` | Regenerates Prisma client (no data changes) |

#### 🚨 Before suggesting ANY database command, ask yourself:

1. Will this command drop tables? → **DON'T SUGGEST IT**
2. Will this delete ItemDefinition or Blueprint data? → **DON'T SUGGEST IT**
3. Does the user just need to regenerate map nodes? → Use `pnpm db:reseed-map`

#### When full reset is truly needed (rare):

Only suggest `prisma migrate reset` when:
- Schema changes require it (breaking migration)
- User explicitly requests full wipe
- **ALWAYS warn the user** that ItemDefinition and Blueprint data will be lost

---

### Checklist Discipline (CRITICAL)

The development plan is the single source of truth. Adherence is mandatory.

- **ALWAYS** check `docs/DEVELOPMENT-PLAN.md` before starting new work
- **ALWAYS** update checkbox status immediately after completing a task:
  - `[ ]` → `[x]` for completed
  - `[ ]` → `[~]` for partially complete (add note)
  - `[ ]` → `[!]` for blocked (add note explaining blocker)
- **NEVER** work on tasks from a future phase until current phase is 100% complete
- **NEVER** deviate from documented specifications without explicit user approval
- **NEVER** add features, dependencies, or architectural changes not in the plan
- **ASK** before making any decision not explicitly covered in the documentation

### Session Start Protocol

At the beginning of EVERY coding session:

1. **Read** `docs/DEVELOPMENT-PLAN.md` to identify:
   - Current phase
   - Last completed task
   - Next unchecked task(s)
2. **Read** `docs/PROGRESS.md` to review recent session notes
3. **Summarize** status to the user:
   ```
   📍 Current Phase: [Phase X - Name]
   ✅ Last Completed: [Task description]
   ➡️ Next Up: [Task description]
   🚧 Blockers: [None / Description]
   ```
4. **Confirm** the plan before proceeding

### Session End Protocol

Before ending EVERY coding session:

1. **Update** all completed checkboxes in `docs/DEVELOPMENT-PLAN.md`
2. **Add** session entry to `docs/PROGRESS.md` with:
   - Date
   - Tasks completed
   - Decisions made
   - Issues encountered
   - Next steps
3. **Update** the "Current Status" section in this file
4. **Summarize** to the user what was accomplished

### Progress Verification Checkpoints

After completing every 5 tasks, STOP and:

1. Re-read `docs/DEVELOPMENT-PLAN.md` to verify you're still on track
2. Confirm completed work matches specifications
3. Report progress summary to user
4. Get confirmation before continuing

---

## Quick Commands

When the user says these commands, respond accordingly:

| Command     | Action                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| `status`    | Report current phase, completion %, last 3 completed tasks, next 3 pending tasks, blockers |
| `plan`      | Show the next 10 unchecked tasks from the development plan                                 |
| `phase`     | Summarize current phase progress and remaining tasks                                       |
| `blockers`  | List all tasks marked with `[!]` and their blocking reasons                                |
| `decisions` | Show the Key Decisions Log from this file                                                  |
| `verify`    | Re-read DEVELOPMENT-PLAN.md and confirm current work aligns with spec                      |

---

## Technical Standards

### Technology Stack (Do Not Deviate)

**Frontend:**

- Vue 3 + TypeScript
- Vite
- Pinia (state management)
- PixiJS (game rendering)
- Socket.io-client
- TailwindCSS

**Backend:**

- Node.js 20 LTS
- Fastify
- Prisma + PostgreSQL
- Redis
- Socket.io
- BullMQ
- Passport.js (Discord + Google OAuth)

**Infrastructure:**

- Railway (all services). Reference Railway Documentation here when needed: https://docs.railway.com/
- No external paid services

### Code Style

- TypeScript strict mode in all packages
- ESLint + Prettier (run before every commit)
- No `any` types unless absolutely necessary (document why)
- Meaningful variable/function names
- Minimal comments - code should be self-documenting
- Comments only for "why", never for "what"

### File Organization

Follow the structure defined in `docs/DEVELOPMENT-PLAN.md` Section 3 exactly:

```
nova-fall/
├── apps/
│   ├── web/          # Vue 3 frontend
│   ├── api/          # Fastify backend
│   ├── ws-server/    # WebSocket server
│   └── worker/       # Game tick worker
├── packages/
│   ├── shared/       # Shared types, constants, configs
│   └── game-logic/   # Core game calculations
├── docs/             # Documentation
└── data/             # Map data, seeds
```

### Commit Convention

```
type(scope): description

Types: feat, fix, refactor, docs, test, chore
Scopes: api, web, ws, worker, shared, game-logic, db, docs
```

Examples:

- `feat(api): add OAuth2 Discord authentication`
- `fix(web): correct zoom level transition`
- `docs(plan): mark Phase 0.3 complete`

### Testing Requirements

- Unit tests required for `packages/game-logic` (all calculations)
- API endpoint tests for `apps/api` (all routes)
- Integration tests for critical flows (auth, combat resolution)
- Manual testing checklist completed before marking any phase done

### Database Changes

- Always create Prisma migrations (never push directly)
- Migration names should be descriptive: `add_attack_cooldown_fields`
- Test migrations locally before deploying
- Document any data backfills needed

---

## Current Status

<!-- UPDATE THIS SECTION AT THE END OF EVERY SESSION -->

| Field              | Value                                     |
| ------------------ | ----------------------------------------- |
| **Current Phase**  | Phase 4 - Combat System                   |
| **Phase Progress** | Section 4.1 nearly complete               |
| **Current Task**   | WebSocket handlers, camera bounds         |
| **Blockers**       | None                                      |
| **Last Session**   | Session 43 - 2026-01-11                   |
| **Last Updated**   | 2026-01-11                                |

---

## Key Decisions Log

Record ALL significant decisions here. If it's not documented, it didn't happen.

| Date       | Decision                                  | Rationale                                          | Approved By |
| ---------- | ----------------------------------------- | -------------------------------------------------- | ----------- |
| 2025-01-04 | 100 nodes for MVP map                     | Balance between scope and playability              | User        |
| 2025-01-04 | 24h ± 4h random attack prep time          | Strategic preparation without being instant        | User        |
| 2025-01-04 | 30 minute combat window                   | Long enough for tactics, short enough for sessions | User        |
| 2025-01-04 | 3-day post-battle cooldown                | Prevents griefing, allows recovery                 | User        |
| 2025-01-04 | Discord + Google OAuth                    | Two popular options, both free                     | User        |
| 2025-01-04 | 1000 Credits + 100 Iron + 50 Energy start | Reasonable starting resources                      | User        |
| 2025-01-04 | Infrastructure transfers on capture       | Meaningful territory control                       | User        |
| 2025-01-04 | Defending units retreat to adjacent node  | Prevents total loss, allows recovery               | User        |
| 2026-01-04 | pnpm 9.15.4 as package manager            | Stable version, efficient workspace support        | Claude      |
| 2026-01-04 | ESLint flat config format                 | Modern approach, better TypeScript integration     | Claude      |
| 2026-01-04 | Husky + lint-staged for pre-commit        | Industry standard, ensures code quality            | Claude      |
| 2026-01-05 | Hexagon nodes with connection faces       | Visual clarity for node connections                | User        |
| 2026-01-04 | vue-tsc 2.2.0                             | Compatible with TypeScript 5.9+                    | Claude      |
| 2026-01-06 | Section-level verification tasks          | Lightweight testing before moving to next feature  | User        |
| 2026-01-06 | Hex grid with terrain tiles               | Full hex map, nodes + terrain, no whitespace       | User        |
| 2026-01-06 | RenderTexture caching for map rendering   | 1000+ objects → 2 sprites, critical for performance| Claude      |
| 2026-01-06 | 1000 nodes for development testing        | Stress test rendering, user requested scale        | User        |
| 2026-01-06 | Default map is 4-player (1000 nodes)      | Capitals at corners, balanced starting positions   | User        |
| 2026-01-06 | Future maps: variable sizes/player counts | Different configurations for 2, 6, 8+ players      | User        |
| 2026-01-06 | Node color shows ownership only           | Clear territory visualization, type in panel       | User        |
| 2026-01-06 | Capitals at grid corners                  | Fair starting positions, max distance between HQs  | User        |
| 2026-01-06 | ~15 starting nodes per player             | BFS from HQ, enough to develop with room to expand | User        |
| 2026-01-06 | Golden ratio hash for player colors       | Ensures distinct colors even for similar IDs       | Claude      |
| 2026-01-06 | Default zoom 0.55 (Regional View)         | Map fills viewport on load, better first impression| User        |
| 2026-01-06 | Thematic faction names                    | Sci-fi colonization theme (Helios, Cryo, etc.)     | User        |
| 2026-01-06 | Multi-session game with lobby system      | Transform from shared world to session-based games | User        |
| 2026-01-06 | Two game types: KOTH and Domination       | KOTH: 48h crown hold; Domination: last HQ standing | User        |
| 2026-01-06 | 2 player minimum to start games           | Prevents single-player games, ensures competition  | User        |
| 2026-01-06 | One active game per player                | Simplifies resource/state management               | User        |
| 2026-01-06 | Consolidated hourly economy tick          | Upkeep, income, and resource gen on single event   | User        |
| 2026-01-06 | Shared package uses tsc (not tsup)        | ESM compatibility with .js extensions required     | Claude      |
| 2026-01-06 | Removed 30s game tick (for now)           | Saves ~120 DB queries/hr; reintroduce for combat   | User        |
| 2026-01-06 | Conditional tick strategy for combat      | Rapid ticks only when viewers present or combat active | User     |
| 2026-01-06 | Redis-based session viewer tracking       | INCR/DECR counters for live player counts per session | Claude   |
| 2026-01-06 | Global economy tick (all sessions)        | Single hourly tick processes all sessions at once    | User        |
| 2026-01-07 | CROWN nodes reset on session end          | Prevents orphaned crown nodes from accumulating      | Claude      |
| 2026-01-07 | Session-scoped crown detection            | Only use crownNodeId for session queries, not type   | Claude      |
| 2026-01-07 | Market access via Trade Hub nodes only    | Thematic - trade hubs unlock commerce, not global    | User        |
| 2026-01-07 | 4 Trade Hubs per quadrant (16 total)      | Even distribution, strategic resource placement      | User        |
| 2026-01-07 | Trade Hub icon on map (money bag)         | Visual distinction for special node type             | User        |
| 2026-01-07 | Real-time credits via economy:processed   | WebSocket event updates UI without page refresh      | Claude      |
| 2026-01-07 | Transfer time: 1 min/node + 1 sec/resource | Both distance and quantity affect transfer duration  | User        |
| 2026-01-07 | Transfer paths through owned nodes only   | Resources can't traverse neutral/enemy territory     | User        |
| 2026-01-07 | Animated transfer flow lines on map       | Visual feedback showing resource movement direction  | User        |
| 2026-01-07 | Single transfers job (removed from upkeep)| Prevents race condition causing double resource transfer | Claude   |
| 2026-01-07 | WebSocket transfer:completed event        | Real-time UI updates without page refresh            | Claude      |
| 2026-01-07 | Transfer animations private to owner      | Strategic - opponents can't see your resource movements | User     |
| 2026-01-08 | Event-based victory conditions            | No polling; crown/HQ events trigger victory checks     | User        |
| 2026-01-11 | shieldRange: 0=personal, >0=AOE           | Personal shield = extra HP, AOE protects nearby allies | User        |
| 2026-01-08 | HQ only passive credit income (20/hr)     | All other credits come from trading/selling resources  | User        |
| 2026-01-08 | Node core activation system               | Non-HQ/Crown nodes inactive until core installed       | User        |
| 2026-01-08 | 8 node core types (one per node type)     | Solar Farm, Laboratory, Refinery, etc. - 100 credits each | User     |
| 2026-01-08 | Cores purchased at HQ, transferred/installed | Cannot withdraw once installed, can destroy            | User        |
| 2026-01-08 | New resources: Coal, Grain, Steel Bar     | Coal/Grain from Agricultural; Steel Bar crafted        | User        |
| 2026-01-08 | Rename Iron → Iron Ore, reduce to 50/hr   | Clarity for crafting system                            | User        |
| 2026-01-08 | MANUFACTURING_PLANT new node type         | Creates non-biological units/items with Factory core   | User        |
| 2026-01-08 | Flexible node storage for any item type   | Supports resources, cores, crafted items               | User        |
| 2026-01-08 | Reusable crafting UI component            | Left: recipes, Middle: materials, Right: controls      | User        |
| 2026-01-08 | Refinery Complex for refinement recipes   | First recipe: 1 Iron Ore + 1 Coal = 1 Steel Bar        | User        |
| 2026-01-08 | Unified ItemStorage type (items.ts)       | Generic Record<string, number> for any item category   | Claude      |
| 2026-01-09 | Refinery has no passive production        | Only serves as crafting facility, no passive output    | User        |
| 2026-01-09 | HOURLY_PRODUCTION in shared package       | Single source of truth for frontend and backend        | Claude      |
| 2026-01-10 | NEVER wipe global tables in routine work  | ItemDefinition/Blueprint data is costly to recreate    | User        |
| 2026-01-10 | Use db:reseed-map for map regeneration    | Preserves items/blueprints, only resets game nodes     | User        |
| 2026-01-10 | CoreShopPanel fetches from ItemDefinition | Cores configured in Item Editor, not hardcoded         | User        |
| 2026-01-10 | Blueprints filtered by learned status     | Only show unlearned or player-learned blueprints       | User        |
| 2026-01-11 | Combat arena size 60x60 tiles (120m)      | 50% larger than initial 40x40 for better gameplay      | User        |
| 2026-01-10 | Session-scoped learned blueprints         | Players learn blueprints per game session, not globally| Claude      |
| 2026-01-10 | Harvesting efficiency: chance-based bonus | 10% per efficiency point for +1 extra resource         | User        |
| 2026-01-10 | Quality colors follow MMORPG conventions  | Legendary=orange, Epic=purple, Rare=yellow, etc.       | Claude      |
| 2026-01-10 | Buildings are items (like units)          | Manufactured at Manufacturing Plant, 3D placement in Phase 4 | User   |
| 2026-01-10 | No building upgrades                      | Quality comes from blueprint tiers, not upgrade system | User        |
| 2026-01-10 | Buildings have shield stat                | Same combat stats as units: health, shield, damage, etc. | User      |
| 2026-01-11 | New blueprints require learning by default | More control over game progression                     | User        |
| 2026-01-11 | Reuse unitStats field for buildings       | Same structure, avoids schema change                   | Claude      |
| 2026-01-11 | Switched to macOS development             | Traveling with MacBook Pro                             | User        |

---

## Game Specifications Quick Reference

### Attack System Timeline

```
INITIATION → PREPARATION (20-28h) → LOCKED (1h) → COMBAT (30m) → COOLDOWN (3d)
```

### Key Values

| Setting                 | Value                        |
| ----------------------- | ---------------------------- |
| Map size                | 100 nodes                    |
| Attack prep time        | 24 hours ± 4 hours (random)  |
| Forces lock             | 1 hour before combat         |
| Combat window           | 30 minutes                   |
| Post-battle immunity    | 3 minutes                    |
| Post-battle cooldown    | 3 days (player attacks only) |
| Starting Credits        | 1,000                        |
| Starting Iron           | 100                          |
| Starting Energy         | 50                           |
| Base node upkeep        | 50 Credits/hour              |
| Distance upkeep penalty | +15% per node from HQ        |

### Free Tier Limitations

- Max Tech Tier: 2
- Max Nodes: 5
- Research Queues: 1
- Active Trade Routes: 3
- Corporation: Join only (cannot create)
- Market Access: Local only

---

## Prohibited Actions

**DO NOT** do any of the following without explicit user approval:

1. ❌ Add features not in `docs/DEVELOPMENT-PLAN.md`
2. ❌ Install npm packages not specified in the tech stack
3. ❌ Change the database schema beyond what's documented
4. ❌ Modify the project structure
5. ❌ Skip ahead to future phases
6. ❌ "Improve" or "optimize" architecture without discussion
7. ❌ Skip writing tests to save time
8. ❌ Use external services beyond Railway
9. ❌ Add authentication providers beyond Discord/Google
10. ❌ Change game balance values without approval

---

## Asking for Clarification

When you encounter ambiguity or need to make a decision not covered in documentation:

1. **STOP** - Do not guess or assume
2. **ASK** - Clearly explain the ambiguity and present options
3. **WAIT** - Get explicit approval before proceeding
4. **DOCUMENT** - Add the decision to the Key Decisions Log
5. **UPDATE** - Modify relevant documentation if needed

Format for asking:

```
🤔 **Clarification Needed**

**Context:** [What you're working on]
**Question:** [Specific question]
**Options:**
A) [Option with pros/cons]
B) [Option with pros/cons]
**Recommendation:** [Your suggestion and why]

Please confirm which approach to take.
```

---

## Phase Completion Checklist

Before marking ANY phase complete, verify:

- [ ] All tasks in the phase have `[x]` checkmarks
- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Manual testing completed for all new features
- [ ] `docs/PROGRESS.md` updated with phase summary
- [ ] `docs/DEVELOPMENT-PLAN.md` phase marked complete with date
- [ ] This file's "Current Status" section updated
- [ ] User has confirmed phase completion

---

## Emergency Procedures

### If You Realize You've Deviated From the Plan

1. STOP immediately
2. Document what was done differently
3. Report to user with full transparency
4. Wait for instructions on how to proceed
5. May need to revert changes

### If You Find a Bug in Completed Work

1. Document the bug clearly
2. Check if it blocks current work
3. If blocking: fix immediately, document fix
4. If not blocking: add to backlog, continue current task
5. Update progress log

### If the Plan Has an Error or Omission

1. Do not silently work around it
2. Stop and report the issue
3. Propose a correction
4. Wait for approval before updating docs
5. Document the change in Key Decisions Log

---

## Remember

> The development plan exists to keep this project on track for a 3-month MVP.
> Every deviation, no matter how well-intentioned, risks scope creep and delays.
> When in doubt, ask. When certain, still verify.

**Your primary job is to execute the plan faithfully, not to improve it.**

---

_Last Updated: 2026-01-11 (Session 43 - synced with Windows)_
_Version: 2.0.1 (macOS)_
