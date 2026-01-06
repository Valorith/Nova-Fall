# Nova Fall - Progress Log

> This file tracks session-by-session development progress.  
> Claude Code updates this file at the end of each session.

---

## Project Status Overview

| Metric                 | Value                      |
| ---------------------- | -------------------------- |
| **Project Start Date** | 2026-01-04                 |
| **Current Phase**      | Phase 1 - World & Nodes    |
| **Overall Progress**   | Phase 1.1-1.4 complete     |
| **MVP Target Date**    | 2026-04-04 (3 months)      |
| **Total Sessions**     | 10                         |

---

## Phase Progress Summary

| Phase                             | Status         | Start Date | End Date   | Duration |
| --------------------------------- | -------------- | ---------- | ---------- | -------- |
| Phase 0: Foundation               | 🟢 Complete    | 2026-01-04 | 2026-01-05 | 2 days   |
| Phase 1: World & Nodes            | 🔵 In Progress | 2026-01-05 | -          | -        |
| Phase 2: Economy & Resources      | ⚪ Pending     | -          | -        | -        |
| Phase 3: Buildings & Construction | ⚪ Pending     | -          | -        | -        |
| Phase 4: Combat System            | ⚪ Pending     | -          | -        | -        |
| Phase 5: Trading & Caravans       | ⚪ Pending     | -          | -        | -        |
| Phase 6: Polish & MVP Launch      | ⚪ Pending     | -          | -        | -        |

**Legend:** ⚪ Pending | 🔵 In Progress | 🟢 Complete | 🔴 Blocked

---

## Session Log

<!--
TEMPLATE FOR NEW SESSIONS:
Copy this template and fill it in at the end of each session.

## Session [NUMBER] - [DATE]

**Duration:** [X hours]
**Phase:** [Phase X - Name]
**Focus:** [Main area of work]

### Completed Tasks
- [x] Task description
- [x] Task description

### Partially Complete
- [~] Task description
  - Note: [What remains]

### Blocked
- [!] Task description
  - Blocker: [Description]
  - Resolution: [Pending/In Progress]

### Decisions Made
| Decision | Rationale |
|----------|-----------|
| [Decision] | [Why] |

### Issues Encountered
- [Issue description and resolution]

### Notes
- [Any relevant observations or context]

### Next Session Plan
1. [First priority task]
2. [Second priority task]
3. [Third priority task]

---
-->

## Session 1 - 2026-01-04

**Duration:** ~1 hour
**Phase:** Phase 0 - Foundation
**Focus:** Project Setup (0.1) + Frontend Setup (0.2)

### Completed Tasks

**Section 0.1 - Project Setup:**
- [x] Initialize monorepo with pnpm workspaces
- [x] Create workspace structure (all 6 packages)
- [x] Configure TypeScript with strict settings
- [x] Configure ESLint & Prettier with pre-commit hooks
- [x] Install all dependencies

**Section 0.2 - Frontend Setup:**
- [x] Initialize Vue 3 project with Vite
- [x] Install core dependencies (Vue Router, Pinia, PixiJS, Socket.io-client, Axios, TailwindCSS)
- [x] Configure Vite (dev proxy, env vars, build optimization)
- [x] Create base layout (AppShell, LoadingSpinner, ErrorBoundary)
- [x] Create views (HomeView, LoginView, GameView)
- [x] Set up auth store and router with guards
- [x] Verify build passes

### Decisions Made

| Decision                  | Rationale                                       |
| ------------------------- | ----------------------------------------------- |
| Use pnpm 9.15.4           | Matches packageManager field, stable version    |
| ESLint flat config format | Modern approach, better TypeScript integration  |
| Husky + lint-staged       | Industry standard for pre-commit hooks          |
| vue-tsc 2.2.0             | Compatible with TypeScript 5.9+                 |
| Disable pre-commit hook   | Windows/WSL environment mismatch with GH Desktop|

### Notes

- Git repository initialized and pushed to GitHub (Valorith/Nova-Fall)
- Sections 0.1 and 0.2 complete
- Frontend build verified (93.5 kB gzipped)
- Pre-commit hook disabled due to Windows/WSL path issues

### Next Session Plan

1. Initialize Fastify project (Section 0.3)
2. Configure Prisma with PostgreSQL schema
3. Set up module-based architecture with logging

---

## Session 2 - 2026-01-05

**Duration:** ~30 minutes
**Phase:** Phase 0 - Foundation
**Focus:** Backend Setup (0.3)

### Completed Tasks

**Section 0.3 - Backend Setup:**
- [x] Initialize Fastify project with all dependencies
- [x] Configure Prisma with full database schema
- [x] Set up module-based architecture (config, lib, plugins, modules)
- [x] Add shared plugins (CORS, cookies, Redis sessions)
- [x] Implement error handling with AppError class
- [x] Configure logging with Pino (pretty in dev, JSON in prod)
- [x] Create health check module
- [x] Add .env.example file
- [x] Create tsup build configuration
- [x] Generate Prisma client
- [x] Verify typecheck passes

### Partially Complete

- [~] Create initial migration
  - Note: Schema ready, migration requires database connection (Railway setup)

### Files Created

- `apps/api/src/config/env.ts` - Environment variable validation with Zod
- `apps/api/src/config/index.ts` - Centralized configuration
- `apps/api/src/lib/prisma.ts` - Prisma client singleton
- `apps/api/src/lib/redis.ts` - Redis client
- `apps/api/src/plugins/cors.ts` - CORS plugin
- `apps/api/src/plugins/session.ts` - Session plugin with Redis store
- `apps/api/src/plugins/error-handler.ts` - Error handling plugin
- `apps/api/src/modules/health/routes.ts` - Health check routes
- `apps/api/src/app.ts` - Fastify app builder
- `apps/api/src/server.ts` - Server entry point
- `apps/api/prisma/schema.prisma` - Full database schema
- `apps/api/tsup.config.ts` - Build configuration
- `apps/api/.env.example` - Environment template

### Dependencies Added

- `fastify-plugin` - For creating Fastify plugins
- `zod` - Environment validation
- `pino-pretty` - Dev logging

### Notes

- Section 0.3 complete (except migration which needs DB)
- Full database schema implemented per DEVELOPMENT-PLAN.md
- All 20 models, 16 enums created
- Module-based architecture ready for feature modules

### Next Session Plan

1. Section 0.4 - Authentication (Discord + Google OAuth)
2. Session management with Redis
3. User creation flow

---

## Session 3 - 2026-01-05

**Duration:** ~45 minutes
**Phase:** Phase 0 - Foundation
**Focus:** Authentication (0.4)

### Completed Tasks

**Section 0.4 - Authentication:**
- [x] Implement OAuth2 with Discord (strategy, routes, callback)
- [x] Implement OAuth2 with Google (strategy, routes, callback)
- [x] Create unified auth handling (findOrCreateUser, account linking)
- [x] Set up session management with Redis/JWT
- [x] Implement refresh token rotation
- [x] Implement session invalidation (logout)
- [x] User creation flow (User + Player, initial resources)
- [x] Username update endpoint
- [x] Frontend auth integration (store, router guards, callback view)
- [x] Token refresh interceptor

### Partially Complete

- [~] Register Discord/Google OAuth applications
  - Note: Code ready, actual app registration on developer portals pending

### Files Created

**Backend (apps/api):**
- `src/lib/jwt.ts` - JWT token creation/verification with jose
- `src/types/passport-discord.d.ts` - TypeScript declarations
- `src/plugins/passport.ts` - Passport plugin with strategies
- `src/modules/auth/types.ts` - Auth types
- `src/modules/auth/service.ts` - Auth business logic
- `src/modules/auth/routes.ts` - Auth API routes
- `src/modules/auth/strategies/discord.ts` - Discord strategy
- `src/modules/auth/strategies/google.ts` - Google strategy

**Frontend (apps/web):**
- `src/services/api.ts` - Axios instance with interceptors
- `src/views/AuthCallbackView.vue` - OAuth callback handler
- Updated `src/stores/auth.ts` - Full auth state management
- Updated `src/router/index.ts` - Auth guards
- Updated `src/views/LoginView.vue` - Login buttons with loading states

### Dependencies Added

- `jose` - Modern JWT library

### API Endpoints Created

| Method | Route | Description |
|--------|-------|-------------|
| GET | /auth/discord | Initiate Discord OAuth |
| GET | /auth/discord/callback | Discord OAuth callback |
| GET | /auth/google | Initiate Google OAuth |
| GET | /auth/google/callback | Google OAuth callback |
| POST | /auth/refresh | Refresh access token |
| POST | /auth/logout | Revoke session |
| GET | /auth/me | Get current user |
| PATCH | /auth/username | Update username |

### Notes

- Section 0.4 complete (code-wise)
- OAuth apps need to be registered on Discord/Google developer consoles
- Client credentials need to be added to .env before testing
- Full JWT flow with access/refresh tokens implemented
- Account linking by email supported

### Next Session Plan

1. Section 0.5 - Railway Deployment
2. Create PostgreSQL and Redis services
3. Deploy API server
4. Set up CI/CD

---

## Session 4 - 2026-01-05

**Duration:** ~15 minutes
**Phase:** Phase 0 - Foundation
**Focus:** Railway Deployment (0.5)

### Completed Tasks

**Section 0.5 - Railway Deployment:**
- [x] Create railway.toml configuration
- [x] Create nixpacks.toml for build configuration
- [x] Create Dockerfile as alternative deployment
- [x] Create GitHub Actions CI workflow
- [x] Update .env.example with Railway documentation
- [x] Configure build and start commands
- [x] Set up automatic migrations on deploy

### Files Created

- `apps/api/railway.toml` - Railway deployment configuration
- `apps/api/nixpacks.toml` - Nixpacks build configuration
- `apps/api/Dockerfile` - Docker-based deployment alternative
- `.github/workflows/ci.yml` - GitHub Actions CI pipeline

### Manual Steps Required

The following require manual action on railway.app:
1. Create Railway project and link GitHub repo
2. Add PostgreSQL service
3. Add Redis service
4. Deploy API service from `apps/api` directory
5. Set environment variables
6. Configure custom domain (optional)

### Notes

- CI pipeline runs lint, typecheck, tests, and build on every PR
- Migrations run automatically on deploy via start command
- Railway auto-deploys on push to main when linked
- Dockerfile provided as fallback if nixpacks has issues

### Phase 0 Complete!

All code for Phase 0 is complete. Manual Railway setup steps remain.

---

## Session 5 - 2026-01-05

**Duration:** ~30 minutes
**Phase:** Phase 0 - Foundation
**Focus:** Railway Deployment Fixes (0.5)

### Completed Tasks

**Section 0.5 - Railway Deployment (Fixes):**
- [x] Debugged Railway deployment failures
- [x] Removed problematic deployment files (Dockerfile, nixpacks.toml, railway.toml)
- [x] Configured services via Railway dashboard instead
- [x] Verified both API and Frontend services build successfully

### Files Deleted

- `apps/api/Dockerfile` - Caused monorepo context issues
- `apps/api/nixpacks.toml` - Not needed with dashboard config
- `apps/api/railway.toml` - Not needed with dashboard config

### Issue Resolved

The original Dockerfile failed because it tried to copy `packages/` directory but the Root Directory was set to `apps/api`, making the packages inaccessible. Solution: use Railway dashboard configuration with empty Root Directory and pnpm filter commands.

### Railway Dashboard Configuration

**API Service:**
- Root Directory: *(empty)*
- Build Command: `pnpm install --frozen-lockfile && pnpm --filter @nova-fall/api db:generate && pnpm --filter @nova-fall/api build`
- Start Command: `pnpm --filter @nova-fall/api db:migrate && pnpm --filter @nova-fall/api start`

**Frontend Service:**
- Root Directory: *(empty)*
- Build Command: `pnpm install --frozen-lockfile && pnpm --filter @nova-fall/web build`
- Start Command: `npx serve apps/web/dist -s -l ${PORT:-3000}`

### Notes

- Both services now building successfully on Railway
- Phase 0 code complete and deployed
- Ready to proceed to Phase 1: World & Nodes

### Next Session Plan

1. Section 1.1 - Map Data Structure
2. Section 1.2 - World Map Rendering
3. Section 1.3 - Node Claiming

---

## Session 6 - 2026-01-06

**Duration:** ~2 hours
**Phase:** Phase 1 - World & Nodes (+ Auth Fixes)
**Focus:** Map rendering, OAuth fixes, local development setup

### Completed Tasks

**Section 1.1 - World Map Data:**
- [x] Created shared types for MapNode, NodeTypeConfig, RegionDefinition
- [x] Created node configuration with bonuses and colors
- [x] Created 6 region definitions with bounds and modifiers
- [x] Created map seed script with 100 nodes

**Section 1.2 - PixiJS Integration:**
- [x] Created GameEngine class with canvas management
- [x] Created Camera system with pan/zoom controls
- [x] Implemented smooth camera interpolation
- [x] Added zoom levels (strategic, regional, node, combat)

**Section 1.3 - Map Rendering:**
- [x] Created WorldRenderer with layered rendering
- [x] Implemented background grid and region coloring
- [x] Implemented node connections with road types
- [x] Implemented node rendering with type/status colors
- [x] Added LOD support and view culling

**Authentication Fixes:**
- [x] Fixed OAuth callback - added req.query for Passport compatibility with Fastify
- [x] Fixed session store - proper callback-based interface for @fastify/session
- [x] Fixed reply.hijack() for direct response handling
- [x] Tested Discord and Google OAuth - both working

**Database:**
- [x] Created initial Prisma migration
- [x] Applied migration to Railway PostgreSQL

**Local Development:**
- [x] Added dotenv for local .env loading
- [x] Created unified `pnpm dev` command for API + web
- [x] Fixed REDIS_URL validation (startsWith instead of url())

### Issues Resolved

| Issue | Resolution |
|-------|------------|
| OAuth callback loop | Added req.query to raw request for Passport |
| Session plugin hanging | Fixed callback-based store interface |
| Fastify double response | Used reply.hijack() for OAuth routes |
| Database tables missing | Created and applied init migration |

### Files Created/Modified

**New Files:**
- `packages/shared/src/types/enums.ts` - Shared enums
- `packages/shared/src/types/node.ts` - Node types
- `packages/shared/src/types/map.ts` - Map seed types
- `packages/shared/src/config/nodes.ts` - Node configs
- `packages/shared/src/config/regions.ts` - Region definitions
- `apps/api/prisma/map-data.ts` - Map generation
- `apps/api/prisma/seed.ts` - Database seeder
- `apps/web/src/game/engine/GameEngine.ts` - Game engine
- `apps/web/src/game/engine/Camera.ts` - Camera system
- `apps/web/src/game/rendering/WorldRenderer.ts` - Map renderer
- `apps/api/prisma/migrations/20260106000000_init/migration.sql` - DB migration

**Modified Files:**
- `apps/api/src/plugins/session.ts` - Fixed callback interface
- `apps/api/src/modules/auth/routes.ts` - Fixed OAuth with Fastify
- `apps/api/src/config/env.ts` - Added dotenv, fixed REDIS_URL validation
- `apps/api/package.json` - Added dotenv dependency
- `apps/web/src/views/GameView.vue` - Added mock data for testing
- `package.json` - Updated dev command

### Notes

- Text rendering in PixiJS v8 disabled due to canvas pattern error (TODO)
- Map renders with 100 mock nodes locally
- Both OAuth providers working with proper Fastify integration
- Railway frontend build command updated for shared package

### Next Session Plan

1. Fix PixiJS text rendering
2. Section 1.4 - Node selection and details panel
3. Deploy updated auth to Railway
4. Test production OAuth flow

---

## Session 7 - 2026-01-05

**Duration:** ~1 hour
**Phase:** Phase 1 - World & Nodes
**Focus:** Node interaction and API endpoints

### Completed Tasks

**Section 1.4 - Node Interaction:**
- [x] Implemented node click selection with visual feedback (green ring)
- [x] Implemented deselection when clicking empty space
- [x] Implemented multi-select with shift-click
- [x] Created node detail panel (Vue) with sliding animation
- [x] Display node info: name, type, tier, status, owner
- [x] Placeholders for resources, buildings, garrison
- [x] Multi-select view showing list of selected nodes
- [x] Focus on Node button to pan and zoom

**Node API Endpoints:**
- [x] `GET /nodes` - List all nodes (with optional pagination)
- [x] `GET /nodes/connections` - All connections for map rendering
- [x] `GET /nodes/:id` - Full node details with connections
- [x] `GET /nodes/:id/connections` - Adjacent nodes only
- [x] `POST /nodes/:id/claim` - Claim neutral node (with adjacency check)

**Design Update:**
- [x] Added hexagon node design note to DEVELOPMENT-PLAN.md

### Files Created/Modified

**New Files:**
- `apps/api/src/modules/nodes/index.ts` - Module exports
- `apps/api/src/modules/nodes/types.ts` - Node API types
- `apps/api/src/modules/nodes/service.ts` - Node business logic
- `apps/api/src/modules/nodes/routes.ts` - Node HTTP routes

**Modified Files:**
- `apps/api/src/app.ts` - Registered node routes
- `apps/web/src/game/engine/GameEngine.ts` - Selection management
- `apps/web/src/game/rendering/WorldRenderer.ts` - Selection ring graphics
- `apps/web/src/views/GameView.vue` - Node detail panel UI
- `docs/DEVELOPMENT-PLAN.md` - Marked tasks complete, added hexagon note

### Notes

- Selection state managed in GameEngine with visual feedback in WorldRenderer
- API supports both paginated and full node lists for different use cases
- Node claiming validates adjacency (first node is free HQ)
- TypeScript exactOptionalPropertyTypes required careful handling

### Next Session Plan

1. Set up WebSocket real-time updates for nodes
2. Connect frontend to real API (replace mock data)
3. Test node claiming flow end-to-end
4. Section 1.5 - Node Claiming mechanics

---

## Session 8 - 2026-01-05

**Duration:** ~30 minutes
**Phase:** Phase 1 - World & Nodes
**Focus:** WebSocket real-time updates

### Completed Tasks

**Section 1.4 - Real-time Updates:**
- [x] Created WebSocket server (`apps/ws-server/src/index.ts`) with Socket.IO
- [x] Implemented Redis pub/sub for event broadcasting
- [x] Created event publisher utility (`apps/api/src/lib/events.ts`)
- [x] Updated node service to publish `node:claimed` events
- [x] Created frontend socket service (`apps/web/src/services/socket.ts`)
- [x] Created game store (`apps/web/src/stores/game.ts`) for state management
- [x] Integrated WebSocket events with Pinia store
- [x] Updated GameView to use game store and connect to WebSocket
- [x] Added fallback to mock data when API unavailable
- [x] Implemented `recentlyUpdatedNodes` tracking for visual feedback

### Files Created/Modified

**New Files:**
- `apps/ws-server/src/index.ts` - WebSocket server with Socket.IO and Redis
- `apps/api/src/lib/events.ts` - Redis event publisher functions
- `apps/web/src/services/socket.ts` - Frontend WebSocket service
- `apps/web/src/stores/game.ts` - Pinia game state store

**Modified Files:**
- `apps/api/src/modules/nodes/service.ts` - Added publishNodeClaimed call
- `apps/web/src/views/GameView.vue` - Integrated game store and WebSocket

### Architecture

```
Browser <--Socket.IO--> WS Server <--Redis PubSub--> API
   |                                                  |
   +------ HTTP/REST for initial load ----------------+
```

**Event Flow:**
1. API performs action (e.g., node claimed)
2. API publishes event to Redis channel
3. WS server receives Redis message
4. WS server broadcasts to all connected clients
5. Frontend game store updates local state
6. WorldRenderer re-renders affected nodes

### Notes

- WebSocket server subscribes to: `node:update`, `node:claimed`, `battle:start`, `battle:update`
- Frontend falls back to mock data if API unavailable (dev convenience)
- Recently updated nodes tracked for 3 seconds for visual feedback
- All typechecks pass

### Next Session Plan

1. Test WebSocket connection end-to-end
2. Connect frontend to real API data (seed database first)
3. Section 1.5 - HQ placement and special rules
4. Test full node claiming flow

---

## Session 9 - 2026-01-05

**Duration:** ~20 minutes
**Phase:** Phase 1 - World & Nodes
**Focus:** Production OAuth fixes

### Completed Tasks

**Production Deployment Fixes:**
- [x] Fixed OAuth redirecting to localhost after authentication
- [x] Made `FRONTEND_URL` and `API_URL` required in production (fail-fast)
- [x] Fixed Discord OAuth `reply.hijack()` ordering (must be before passport.authenticate)
- [x] Added `VITE_API_URL` documentation for frontend deployment
- [x] Updated `.env.example` files with clearer production instructions

### Issues Resolved

| Issue | Root Cause | Resolution |
|-------|------------|------------|
| OAuth redirects to localhost (frontend) | `VITE_API_URL` not set on Railway frontend | Added env var, documented in `.env.example` |
| Discord OAuth still redirecting to localhost | `reply.hijack()` called after `passport.authenticate()` | Moved `reply.hijack()` before passport call, matching Google implementation |

### Files Modified

- `apps/api/src/config/env.ts` - URLs required in production
- `apps/api/src/modules/auth/routes.ts` - Fixed Discord OAuth ordering
- `apps/api/.env.example` - Clearer production documentation
- `apps/web/.env.example` - Added `VITE_API_URL` documentation

### Notes

- Both Discord and Google OAuth now working in production
- Frontend requires `VITE_API_URL` set at build time (Vite bakes env vars into bundle)
- API will fail to start in production if `FRONTEND_URL` or `API_URL` not set

### Next Session Plan

1. Test WebSocket connection end-to-end (local)
2. Section 1.5 - HQ placement and special rules
3. Seed production database with map data
4. Connect frontend to real API
5. Test node claiming end-to-end

---

## Session 10 - 2026-01-06

**Duration:** ~2 hours
**Phase:** Phase 1 - World & Nodes (paused)
**Focus:** Landing page animation revitalization

### Completed Tasks

**Landing Page Animation:**
- [x] Created looping 18-second spaceship landing animation
- [x] Implemented starfield background with twinkling stars
- [x] SVG spaceship with engine thrust effects descending to planet
- [x] Planet surface with landing pad and atmospheric glow
- [x] Progressive space complex construction (7 rings of buildings)
- [x] Central hub, habitat modules, solar panels, communication antenna, reactor
- [x] Glass dome structures with growing plants
- [x] Construction cranes with swinging arms and hooks
- [x] Laser defense turret (aims and fires at enemy ships)
- [x] Missile battery (launches missiles at enemy ships)
- [x] Two enemy spaceships that approach and flee when engaged
- [x] Laser beam attached to turret barrel (rotates with cannon)
- [x] Missiles point in direction of travel
- [x] Enemy ships move at reasonable speed

**Bug Fixes:**
- [x] Fixed TypeScript error in socket.ts (`delete` instead of `undefined` assignment)
- [x] Fixed turret rotation direction (positive = clockwise = upward aim)
- [x] Fixed laser beam origin to match cannon barrel
- [x] Fixed missile rotation to point nose-first
- [x] Fixed animation loop reset (structures don't disappear prematurely)

### Files Modified

- `apps/web/src/views/HomeView.vue` - Complete landing page animation (~1900 lines)
- `apps/web/src/services/socket.ts` - Fixed TypeScript error on line 119

### Animation Timeline (18 seconds)

| Time | Event |
|------|-------|
| 0-44% | Spaceship descends through starfield |
| 44% | Ship lands on pad |
| 50-85% | Complex buildings construct progressively (7 rings) |
| 85-87% | Defense systems appear |
| 78-98% | Left enemy ship approaches, laser fires, ship flees |
| 79-99% | Right enemy ship approaches, missiles launch, ship flees |
| 93-100% | Animation fades, loop restarts |

### Notes

- Animation uses pure CSS keyframes (no JavaScript animation libraries)
- All buildings are CSS shapes with gradients and box-shadows
- Enemy ships are SVG with detailed design (engine pods, hostile markings)
- Laser beam is `::after` pseudo-element on turret cannon for automatic rotation
- Complex container is 900px wide to accommodate 7 rings of structures

### Next Session Plan

1. Test WebSocket connection end-to-end (local)
2. Section 1.5 - HQ placement and special rules
3. Seed production database with map data
4. Connect frontend to real API
5. Test node claiming end-to-end

---

---

## Blockers Log

<!-- Track all blockers here for visibility -->

| ID  | Date Identified | Description     | Phase | Status | Resolution Date |
| --- | --------------- | --------------- | ----- | ------ | --------------- |
| -   | -               | No blockers yet | -     | -      | -               |

---

## Key Decisions Timeline

<!-- Major decisions are also logged in CLAUDE.md, but this provides chronological view -->

| Date       | Session | Decision                   | Impact              |
| ---------- | ------- | -------------------------- | ------------------- |
| 2025-01-04 | Pre-dev | 100 nodes for MVP          | Map size finalized  |
| 2025-01-04 | Pre-dev | 24h±4h attack prep         | Combat timing set   |
| 2025-01-04 | Pre-dev | 30 min combat window       | Battle duration set |
| 2025-01-04 | Pre-dev | 3-day post-battle cooldown | Anti-grief mechanic |
| 2025-01-04 | Pre-dev | Discord + Google OAuth     | Auth providers set  |
| 2026-01-05 | 7       | Hexagon nodes with faces   | Visual clarity      |

---

## Milestone Targets

| Milestone                       | Target Date | Actual Date | Status |
| ------------------------------- | ----------- | ----------- | ------ |
| Project Setup Complete          | Week 1      | 2026-01-05  | 🟢     |
| Auth Working (Discord + Google) | Week 2      | 2026-01-06  | 🟢     |
| World Map Viewable              | Week 4      | -           | 🔵     |
| First Node Claimed              | Week 4      | -           | 🔵     |
| First Building Constructed      | Week 8      | -           | ⚪     |
| First Combat Completed          | Week 11     | -           | ⚪     |
| First Trade Caravan Sent        | Week 12     | -           | ⚪     |
| MVP Feature Complete            | Week 13     | -           | ⚪     |
| MVP Deployed to Production      | Week 13     | -           | ⚪     |

---

## Technical Debt Log

<!-- Track shortcuts taken that need future attention -->

| ID  | Date Added | Description                                    | Priority | Resolved |
| --- | ---------- | ---------------------------------------------- | -------- | -------- |
| TD1 | 2026-01-06 | PixiJS v8 text rendering disabled (canvas bug) | Medium   | No       |
| TD2 | 2026-01-05 | Node claiming cost not deducted (skipped MVP)  | Low      | No       |
| TD3 | 2026-01-05 | HQ special rules not implemented               | Medium   | No       |
| TD4 | 2026-01-05 | WebSocket infrastructure untested E2E          | High     | No       |
| TD5 | 2026-01-05 | Rework nodes to hexagon design (see spec)      | Medium   | No       |
| TD6 | 2026-01-05 | Replace programmatic shapes with sprite assets | Medium   | No       |

---

## Testing Checklist by Phase

### Phase 0: Foundation

- [x] OAuth login works (Discord) - tested locally and production
- [x] OAuth login works (Google) - tested locally and production
- [ ] Session persists across page refresh
- [ ] Logout works correctly
- [x] New user creation flow complete
- [x] Database migrations run successfully
- [x] All services deploy to Railway
- [x] Production OAuth redirects correctly (fixed Session 9)

### Phase 1: World & Nodes

- [~] World map renders all 100 nodes (mock data works, real API pending)
- [x] Zoom levels transition smoothly
- [x] Node selection works
- [x] Node details panel displays correctly
- [~] Node claiming works (API ready, frontend not connected)
- [ ] WebSocket server connects and receives events
- [ ] Real-time node updates display in multiple browser tabs
- [~] Real-time updates work between clients (infrastructure ready, needs E2E test)
- [ ] Nodes reworked to hexagon design with 6 connection faces (TD5)

### Phase 2: Economy & Resources

- [ ] Resources generate on tick
- [ ] Upkeep deducts correctly
- [ ] Upkeep failure triggers consequences
- [ ] NPC market buy/sell works
- [ ] Resource display updates in real-time

### Phase 3: Buildings & Construction

- [ ] Building placement works on grid
- [ ] Construction queue processes
- [ ] Building effects apply correctly
- [ ] Upkeep includes buildings

### Phase 4: Combat System

- [ ] Attack initiation creates battle
- [ ] Prep phase countdown works
- [ ] Forces lock 1 hour before combat
- [ ] Combat view renders correctly
- [ ] Real-time combat simulation works
- [ ] Victory/defeat resolution correct
- [ ] 3-day cooldown applies

### Phase 5: Trading & Caravans

- [ ] Caravan creation works
- [ ] Route calculation correct
- [ ] Caravan movement on map
- [ ] Arrival/delivery works
- [ ] NPC interception works

### Phase 6: Polish & MVP Launch

- [ ] All tests pass
- [ ] Performance acceptable
- [ ] No critical bugs
- [ ] Tutorial complete
- [ ] Production deployment works

---

## Performance Benchmarks

<!-- Track key performance metrics as development progresses -->

| Metric                       | Target  | Current | Status |
| ---------------------------- | ------- | ------- | ------ |
| Initial page load            | < 3s    | -       | ⚪     |
| World map render (100 nodes) | < 1s    | -       | ⚪     |
| API response time (p95)      | < 200ms | -       | ⚪     |
| WebSocket latency            | < 100ms | -       | ⚪     |
| Combat tick rate             | 60ms    | -       | ⚪     |
| Memory usage (client)        | < 200MB | -       | ⚪     |

---

## Weekly Summary

<!-- Update weekly for high-level progress tracking -->

| Week | Dates | Phase | Key Accomplishments | Blockers |
| ---- | ----- | ----- | ------------------- | -------- |
| 1    | -     | -     | -                   | -        |
| 2    | -     | -     | -                   | -        |
| 3    | -     | -     | -                   | -        |
| 4    | -     | -     | -                   | -        |
| 5    | -     | -     | -                   | -        |
| 6    | -     | -     | -                   | -        |
| 7    | -     | -     | -                   | -        |
| 8    | -     | -     | -                   | -        |
| 9    | -     | -     | -                   | -        |
| 10   | -     | -     | -                   | -        |
| 11   | -     | -     | -                   | -        |
| 12   | -     | -     | -                   | -        |
| 13   | -     | -     | -                   | -        |

---

_Last Updated: 2026-01-06_
