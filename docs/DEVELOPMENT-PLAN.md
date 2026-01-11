# Nova Fall - Development Plan & Checklist

> **Project Type:** Browser-Based Multiplayer Territory Control Game  
> **Timeline:** 3 Months (MVP)  
> **Developer:** Solo (with Claude Code assistance)  
> **Hosting:** Railway  
> **Target Scale:** 50-200 concurrent players  
> **Map Size:** 100 nodes  
> **Auth Providers:** Discord, Google (OAuth2)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Development Phases](#5-development-phases)
6. [Phase 0: Foundation](#phase-0-foundation-week-1-2)
7. [Phase 1: World & Nodes](#phase-1-world--nodes-week-3-4)
8. [Phase 2: Economy & Resources](#phase-2-economy--resources-week-5-6)
9. [Phase 3: Buildings & Construction](#phase-3-buildings--construction-week-7-8)
10. [Phase 4: Combat System](#phase-4-combat-system-week-9-11)
11. [Phase 5: Trading & Caravans](#phase-5-trading--caravans-week-12)
12. [Phase 6: Polish & MVP Launch](#phase-6-polish--mvp-launch-week-13)
13. [Post-MVP Features](#7-post-mvp-features)
14. [Asset Sources](#8-asset-sources)
15. [Asset Acquisition Checklist](#81-asset-acquisition-checklist)
16. [Configuration Files](#9-configuration-files)

---

## 1. Project Overview

### Core Game Loop

1. Players claim and develop territory nodes across the planetary surface
2. Build defensive structures and production facilities
3. Research technologies to unlock advanced units and buildings
4. Train military units and form attack forces
5. Trade resources across the map using transport vehicles
6. Defend against NPC threats and player attacks
7. Join corporations for collective benefits

### Key Constraints

- **Upkeep System:** Territory and units have ongoing costs
- **Tech Tiers:** Free players limited to Tier 2
- **Time-Limited Combat:** Attackers have fixed windows to succeed
- **Environmental Pressure:** Dynamic conditions prevent permanent entrenchment

---

## 2. Technology Stack

### Frontend

| Component        | Technology       | Version |
| ---------------- | ---------------- | ------- |
| Framework        | Vue 3            | ^3.4    |
| Language         | TypeScript       | ^5.3    |
| Build Tool       | Vite             | ^5.0    |
| State Management | Pinia            | ^2.1    |
| Game Renderer    | PixiJS           | ^8.0    |
| HTTP Client      | Axios            | ^1.6    |
| WebSocket        | Socket.io-client | ^4.7    |

### Backend

| Component | Technology  | Version |
| --------- | ----------- | ------- |
| Runtime   | Node.js     | ^20 LTS |
| Framework | Fastify     | ^4.25   |
| Language  | TypeScript  | ^5.3    |
| ORM       | Prisma      | ^5.8    |
| Database  | PostgreSQL  | 16      |
| Cache     | Redis       | 7       |
| WebSocket | Socket.io   | ^4.7    |
| Job Queue | BullMQ      | ^5.1    |
| Auth      | Passport.js | ^0.7    |

### Infrastructure (Railway)

```
railway-project/
├── api-server          # REST API + Auth
├── ws-server           # WebSocket for real-time
├── game-worker         # Tick processing, AI, upkeep
├── postgres            # Primary database
└── redis               # Cache, sessions, pub/sub
```

---

## 3. Project Structure

```
nova-fall/
├── apps/
│   ├── web/                          # Vue 3 Frontend
│   │   ├── src/
│   │   │   ├── assets/               # Static assets
│   │   │   ├── components/           # Vue components
│   │   │   │   ├── common/           # Shared UI components
│   │   │   │   ├── game/             # Game-specific components
│   │   │   │   │   ├── WorldMap.vue
│   │   │   │   │   ├── NodeDetail.vue
│   │   │   │   │   ├── CombatView.vue
│   │   │   │   │   └── ...
│   │   │   │   └── ui/               # UI panels, modals
│   │   │   ├── composables/          # Vue composables
│   │   │   ├── game/                 # PixiJS game engine
│   │   │   │   ├── engine/           # Core engine classes
│   │   │   │   ├── entities/         # Game entities
│   │   │   │   ├── systems/          # ECS-style systems
│   │   │   │   └── rendering/        # Render layers
│   │   │   ├── stores/               # Pinia stores
│   │   │   ├── services/             # API services
│   │   │   ├── types/                # TypeScript types
│   │   │   ├── utils/                # Utility functions
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                          # Fastify Backend
│   │   ├── src/
│   │   │   ├── config/               # Configuration
│   │   │   ├── modules/              # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   ├── player/
│   │   │   │   ├── node/
│   │   │   │   ├── building/
│   │   │   │   ├── unit/
│   │   │   │   ├── combat/
│   │   │   │   ├── market/
│   │   │   │   ├── caravan/
│   │   │   │   └── research/
│   │   │   ├── plugins/              # Fastify plugins
│   │   │   ├── middleware/           # Custom middleware
│   │   │   ├── utils/                # Utility functions
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   ├── ws-server/                    # WebSocket Server
│   │   ├── src/
│   │   │   ├── handlers/             # Socket event handlers
│   │   │   ├── rooms/                # Room management
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── worker/                       # Game Worker
│       ├── src/
│       │   ├── jobs/                 # Job processors
│       │   │   ├── gameTick.ts
│       │   │   ├── upkeep.ts
│       │   │   ├── npcAi.ts
│       │   │   └── environment.ts
│       │   ├── queues/               # Queue definitions
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── shared/                       # Shared code
│   │   ├── src/
│   │   │   ├── types/                # Shared TypeScript types
│   │   │   ├── constants/            # Game constants
│   │   │   ├── config/               # Game configuration
│   │   │   │   ├── structures.ts     # Structure definitions
│   │   │   │   ├── units.ts          # Unit definitions
│   │   │   │   ├── research.ts       # Research tree
│   │   │   │   └── resources.ts      # Resource types
│   │   │   └── utils/                # Shared utilities
│   │   └── package.json
│   │
│   └── game-logic/                   # Core game logic
│       ├── src/
│       │   ├── combat/               # Combat calculations
│       │   ├── economy/              # Economic calculations
│       │   ├── pathfinding/          # Movement algorithms
│       │   └── simulation/           # Game simulation
│       └── package.json
│
├── data/
│   ├── maps/                         # Map definitions
│   └── seed/                         # Database seed data
│
├── tools/
│   ├── map-editor/                   # Map creation tool
│   └── balance-calculator/           # Balance spreadsheets
│
├── docs/
│   ├── api/                          # API documentation
│   └── game/                         # Game documentation
│
├── package.json                      # Root package.json (workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 4. Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== AUTH & USERS ====================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  username      String    @unique
  oauthProvider String    // 'discord', 'google'
  oauthId       String
  avatarUrl     String?
  isPremium     Boolean   @default(false)
  premiumUntil  DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  player   Player?
  sessions Session[]

  @@index([oauthProvider, oauthId])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([token])
  @@index([userId])
}

// ==================== PLAYER ====================

model Player {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName   String

  // Resources stored as JSON for flexibility
  resources     Json     @default("{\"credits\": 1000, \"iron\": 100, \"energy\": 50}")

  // Unlocked research
  research      Json     @default("[]")

  // Stats
  reputation    Int      @default(0)
  totalNodes    Int      @default(0)
  totalUnits    Int      @default(0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  ownedNodes       Node[]
  units            Unit[]
  items            Item[]
  caravans         Caravan[]
  marketOrders     MarketOrder[]
  attacksInitiated Battle[]       @relation("Attacker")
  attacksReceived  Battle[]       @relation("Defender")
  researchQueue    ResearchQueue[]

  // Corporation
  corpMembership   CorpMember?
}

// ==================== WORLD & NODES ====================

model Node {
  id          String    @id @default(cuid())
  name        String
  type        NodeType
  tier        Int       @default(1)

  // Position on world map
  positionX   Float
  positionY   Float
  regionId    String?   // For environmental zones

  // Ownership
  ownerId     String?
  owner       Player?   @relation(fields: [ownerId], references: [id], onDelete: SetNull)
  claimedAt   DateTime?

  // State
  storage     Json      @default("{}")  // Resources stored here
  upkeepPaid  DateTime?
  upkeepDue   DateTime?
  status      NodeStatus @default(NEUTRAL)

  // Attack cooldowns
  lastAttackedAt      DateTime?  // When last attack resolved
  attackCooldownUntil DateTime?  // 3 days after last attack (player attacks blocked)
  attackImmunityUntil DateTime?  // 3 minutes post-battle immunity

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  buildings         Building[]
  garrison          Unit[]
  connectionsFrom   NodeConnection[] @relation("FromNode")
  connectionsTo     NodeConnection[] @relation("ToNode")
  battles           Battle[]
  caravansFrom      Caravan[]        @relation("CaravanOrigin")
  caravansTo        Caravan[]        @relation("CaravanDestination")
  caravansCurrent   Caravan[]        @relation("CaravanCurrent")
  marketOrders      MarketOrder[]

  // Corporation territory
  corpId            String?
  corporation       Corporation?     @relation(fields: [corpId], references: [id])

  @@index([ownerId])
  @@index([type])
  @@index([regionId])
}

model NodeConnection {
  id          String   @id @default(cuid())
  fromNodeId  String
  fromNode    Node     @relation("FromNode", fields: [fromNodeId], references: [id], onDelete: Cascade)
  toNodeId    String
  toNode      Node     @relation("ToNode", fields: [toNodeId], references: [id], onDelete: Cascade)

  distance    Int      // Travel time in seconds
  dangerLevel Int      @default(0)  // 0-100
  roadType    RoadType @default(DIRT)

  @@unique([fromNodeId, toNodeId])
  @@index([fromNodeId])
  @@index([toNodeId])
}

// ==================== BUILDINGS ====================

model Building {
  id            String       @id @default(cuid())
  typeId        String       // References config file
  tier          Int          @default(1)

  // Health
  health        Int
  maxHealth     Int

  // Position within node (grid coordinates)
  gridX         Int
  gridY         Int

  // State
  isActive      Boolean      @default(true)
  isConstructing Boolean     @default(false)
  constructionEnd DateTime?

  // Production queue for factories
  productionQueue Json?

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  // Relations
  nodeId        String
  node          Node         @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@index([nodeId])
  @@index([typeId])
}

// ==================== UNITS ====================

model Unit {
  id            String     @id @default(cuid())
  typeId        String     // References config file
  name          String?    // Custom name (optional)

  // Stats
  health        Int
  maxHealth     Int
  experience    Int        @default(0)
  veterancy     Veterancy  @default(ROOKIE)

  // State
  status        UnitStatus @default(IDLE)

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  // Owner
  playerId      String
  player        Player     @relation(fields: [playerId], references: [id], onDelete: Cascade)

  // Location (one of these)
  nodeId        String?
  node          Node?      @relation(fields: [nodeId], references: [id], onDelete: SetNull)
  caravanId     String?
  caravan       Caravan?   @relation(fields: [caravanId], references: [id], onDelete: SetNull)

  // Equipment
  equipment     Json       @default("[]")

  @@index([playerId])
  @@index([nodeId])
  @@index([typeId])
}

// ==================== ITEMS ====================

model Item {
  id            String   @id @default(cuid())
  typeId        String   // References config file
  name          String
  rarity        Rarity

  // Stats
  baseStats     Json
  upgrades      Json     @default("[]")
  upgradeSlots  Int

  // Owner
  playerId      String
  player        Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  // Location
  nodeStorageId String?

  createdAt     DateTime @default(now())

  @@index([playerId])
  @@index([typeId])
}

// ==================== COMBAT ====================

model Battle {
  id            String       @id @default(cuid())

  // Location
  nodeId        String
  node          Node         @relation(fields: [nodeId], references: [id])

  // Participants
  attackerId    String
  attacker      Player       @relation("Attacker", fields: [attackerId], references: [id])
  defenderId    String?
  defender      Player?      @relation("Defender", fields: [defenderId], references: [id])

  // Origin (where attackers came from, for retreat)
  originNodeId  String

  // Snapshots of forces at battle start
  attackForce   Json
  defenseState  Json

  // Timing - Preparation Phase
  initiatedAt   DateTime     @default(now())  // When attack was declared
  prepEndsAt    DateTime     // Random: initiatedAt + 20-28 hours
  forcesLockedAt DateTime?   // prepEndsAt - 1 hour (no more changes)

  // Timing - Combat Phase
  combatStartedAt DateTime?  // When combat actually began
  combatEndsAt    DateTime?  // combatStartedAt + 30 minutes
  resolvedAt      DateTime?  // When battle ended

  // State
  status        BattleStatus @default(PREP_PHASE)
  result        BattleResult?

  // Battle log
  events        Json         @default("[]")

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@index([nodeId])
  @@index([attackerId])
  @@index([defenderId])
  @@index([status])
  @@index([prepEndsAt])
}

// ==================== ECONOMY ====================

model MarketOrder {
  id            String      @id @default(cuid())
  type          OrderType

  // What's being traded
  resourceType  String
  quantity      Int
  pricePerUnit  Int

  // Filled amount
  filledQty     Int         @default(0)

  // Owner
  playerId      String
  player        Player      @relation(fields: [playerId], references: [id], onDelete: Cascade)

  // Location
  nodeId        String
  node          Node        @relation(fields: [nodeId], references: [id])

  // State
  status        OrderStatus @default(OPEN)
  expiresAt     DateTime?

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([playerId])
  @@index([nodeId])
  @@index([resourceType])
  @@index([status])
}

model Caravan {
  id              String        @id @default(cuid())
  vehicleType     String        // References config file

  // Cargo
  cargo           Json          // { resourceType: quantity }
  capacity        Int

  // Owner
  playerId        String
  player          Player        @relation(fields: [playerId], references: [id], onDelete: Cascade)

  // Route
  originId        String
  origin          Node          @relation("CaravanOrigin", fields: [originId], references: [id])
  destinationId   String
  destination     Node          @relation("CaravanDestination", fields: [destinationId], references: [id])
  currentNodeId   String?
  currentNode     Node?         @relation("CaravanCurrent", fields: [currentNodeId], references: [id])
  route           Json          // Array of node IDs
  routeProgress   Int           @default(0)  // Index in route
  edgeProgress    Float         @default(0)  // 0-1 on current edge

  // State
  status          CaravanStatus @default(LOADING)

  // Timing
  departedAt      DateTime?
  estimatedArrival DateTime?

  // Escorts
  escorts         Unit[]

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([playerId])
  @@index([status])
}

// ==================== RESEARCH ====================

model ResearchQueue {
  id            String   @id @default(cuid())

  playerId      String
  player        Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  techId        String   // References config file
  progress      Float    @default(0)  // 0-1
  completesAt   DateTime

  createdAt     DateTime @default(now())

  @@index([playerId])
}

// ==================== CORPORATIONS ====================

model Corporation {
  id            String   @id @default(cuid())
  name          String   @unique
  tag           String   @unique  // 3-5 character tag
  description   String?

  // Resources
  bank          Json     @default("{\"credits\": 0}")

  // Stats
  influence     Int      @default(0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  members       CorpMember[]
  territories   Node[]
  diplomacy     CorpDiplomacy[] @relation("SourceCorp")
  diplomacyWith CorpDiplomacy[] @relation("TargetCorp")
}

model CorpMember {
  id            String   @id @default(cuid())

  playerId      String   @unique
  player        Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  corpId        String
  corporation   Corporation @relation(fields: [corpId], references: [id], onDelete: Cascade)

  rank          CorpRank
  permissions   Json     @default("[]")
  contribution  Int      @default(0)

  joinedAt      DateTime @default(now())

  @@index([corpId])
}

model CorpDiplomacy {
  id            String         @id @default(cuid())

  sourceCorpId  String
  sourceCorp    Corporation    @relation("SourceCorp", fields: [sourceCorpId], references: [id], onDelete: Cascade)
  targetCorpId  String
  targetCorp    Corporation    @relation("TargetCorp", fields: [targetCorpId], references: [id], onDelete: Cascade)

  type          DiplomacyType
  expiresAt     DateTime?

  createdAt     DateTime       @default(now())

  @@unique([sourceCorpId, targetCorpId])
}

// ==================== NPC THREATS ====================

model NPCThreat {
  id            String     @id @default(cuid())
  typeId        String     // References config file
  name          String

  // Stats
  strength      Int
  health        Int
  maxHealth     Int

  // Location
  currentNodeId String?
  targetNodeId  String?

  // Behavior
  behavior      Json
  route         Json?

  // Loot
  lootTable     Json

  // Timing
  spawnedAt     DateTime   @default(now())
  expiresAt     DateTime?

  status        ThreatStatus @default(ROAMING)

  @@index([currentNodeId])
  @@index([status])
}

// ==================== ENVIRONMENT ====================

model EnvironmentZone {
  id            String   @id @default(cuid())
  name          String

  // Affected region
  regionId      String

  // Current state
  stability     StabilityLevel @default(STABLE)
  activeEvent   String?        // Event type ID
  eventEndsAt   DateTime?

  // Upkeep modifier (1.0 = normal)
  upkeepMod     Float    @default(1.0)

  // Next state change
  nextChangeAt  DateTime

  updatedAt     DateTime @updatedAt
}

// ==================== ENUMS ====================

enum NodeType {
  MINING
  REFINERY
  RESEARCH
  TRADE_HUB
  FORTRESS
  AGRICULTURAL
  POWER_PLANT
  CAPITAL
}

enum NodeStatus {
  NEUTRAL
  CLAIMED
  CONTESTED
  UNDER_ATTACK
}

enum RoadType {
  DIRT
  PAVED
  HIGHWAY
  HAZARDOUS
}

enum UnitStatus {
  IDLE
  TRAINING
  MOVING
  GARRISON
  IN_COMBAT
  ESCORTING
}

enum Veterancy {
  ROOKIE
  REGULAR
  VETERAN
  ELITE
  LEGENDARY
}

enum Rarity {
  COMMON
  UNCOMMON
  RARE
  EPIC
  LEGENDARY
}

enum BattleStatus {
  PREP_PHASE      // 20-28 hour preparation period
  FORCES_LOCKED   // Final hour, no changes allowed
  IN_PROGRESS     // Active combat (30 min window)
  RESOLVED        // Battle complete
  CANCELLED       // Attacker withdrew during prep
}

enum BattleResult {
  ATTACKER_VICTORY
  DEFENDER_VICTORY
  DRAW             // Both sides destroyed (rare)
}

enum OrderType {
  BUY
  SELL
}

enum OrderStatus {
  OPEN
  PARTIAL
  FILLED
  CANCELLED
  EXPIRED
}

enum CaravanStatus {
  LOADING
  EN_ROUTE
  ARRIVED
  INTERCEPTED
  DESTROYED
}

enum CorpRank {
  CEO
  DIRECTOR
  MANAGER
  VETERAN
  ASSOCIATE
}

enum DiplomacyType {
  ALLIANCE
  NON_AGGRESSION
  TRADE_AGREEMENT
  WAR
}

enum ThreatStatus {
  ROAMING
  ATTACKING
  RETREATING
  DEFEATED
}

enum StabilityLevel {
  STABLE
  UNSTABLE
  HAZARDOUS
  EXTREME
}
```

---

## 5. Development Phases

### Timeline Overview (13 Weeks)

| Phase   | Duration  | Focus                            |
| ------- | --------- | -------------------------------- |
| Phase 0 | Week 1-2  | Foundation, Auth, Infrastructure |
| Phase 1 | Week 3-4  | World Map, Nodes, Zoom Levels    |
| Phase 2 | Week 5-6  | Economy, Resources, Upkeep       |
| Phase 3 | Week 7-8  | Buildings, Construction          |
| Phase 4 | Week 9-11 | Combat System                    |
| Phase 5 | Week 12   | Trading, Caravans                |
| Phase 6 | Week 13   | Polish, Testing, MVP Launch      |

---

## Phase 0: Foundation (Week 1-2)

### 0.1 Project Setup

- [x] **Initialize monorepo with pnpm workspaces**

  ```bash
  mkdir nova-fall && cd nova-fall
  pnpm init
  # Create pnpm-workspace.yaml
  ```

- [x] **Create workspace structure**
  - [x] `apps/web` - Vue 3 frontend
  - [x] `apps/api` - Fastify backend
  - [x] `apps/ws-server` - WebSocket server
  - [x] `apps/worker` - Game worker
  - [x] `packages/shared` - Shared types/constants
  - [x] `packages/game-logic` - Core game logic

- [x] **Configure TypeScript**
  - [x] Create `tsconfig.base.json` with strict settings
  - [x] Configure path aliases for packages
  - [x] Set up incremental builds

- [x] **Configure ESLint & Prettier**
  - [x] Shared config for all packages
  - [x] Vue-specific rules
  - [x] Pre-commit hooks with husky

### 0.2 Frontend Setup (apps/web)

- [x] **Initialize Vue 3 project**

  ```bash
  cd apps/web
  pnpm create vite . --template vue-ts
  ```

- [x] **Install core dependencies**
  - [x] Vue Router
  - [x] Pinia
  - [x] PixiJS
  - [x] Socket.io-client
  - [x] Axios
  - [x] TailwindCSS

- [x] **Configure Vite**
  - [x] Proxy API requests in dev
  - [x] Environment variables
  - [x] Build optimization

- [x] **Create base layout**
  - [x] App shell with navigation
  - [x] Loading states
  - [x] Error boundaries

### 0.3 Backend Setup (apps/api)

- [x] **Initialize Fastify project**

  ```bash
  cd apps/api
  pnpm init
  pnpm add fastify @fastify/cors @fastify/cookie @fastify/session
  ```

- [x] **Configure Prisma**
  - [x] Initialize Prisma
  - [x] Create initial schema
  - [x] Configure PostgreSQL connection
  - [x] Create initial migration

- [x] **Set up project structure**
  - [x] Module-based architecture
  - [x] Shared plugins
  - [x] Error handling
  - [x] Logging (pino)

### 0.4 Authentication

- [x] **Implement OAuth2 with Discord**
  - [~] Register Discord application at discord.com/developers (code ready, needs app registration)
  - [x] Configure Passport.js Discord strategy
  - [x] Create `/auth/discord` route
  - [x] Create `/auth/discord/callback` route
  - [x] Handle token exchange

- [x] **Implement OAuth2 with Google**
  - [~] Register Google application at console.cloud.google.com (code ready, needs app registration)
  - [x] Configure Passport.js Google strategy
  - [x] Create `/auth/google` route
  - [x] Create `/auth/google/callback` route
  - [x] Handle token exchange

- [x] **Unified auth handling**
  - [x] Abstract provider-specific logic
  - [x] Support account linking (same email = same account)
  - [x] Handle provider-specific profile data

- [x] **Session management**
  - [x] Redis-based sessions
  - [x] JWT for API access
  - [x] Refresh token rotation
  - [x] Session invalidation

- [x] **User creation flow**
  - [x] Create User on first login
  - [x] Create associated Player
  - [x] Initial resource allocation (1000 Credits, 100 Iron, 50 Energy)
  - [x] Username selection screen (PATCH /auth/username endpoint)

- [x] **Frontend auth integration**
  - [x] Login page with Discord + Google buttons
  - [x] Auth state store (Pinia)
  - [x] Route guards
  - [x] Token refresh logic

### 0.5 Railway Deployment

- [x] **Create Railway project**
  - [~] Link GitHub repository (manual step on railway.app)
  - [x] Configure services (railway.toml, nixpacks.toml, Dockerfile created)

- [x] **Deploy PostgreSQL**
  - [~] Create database service (manual step on railway.app)
  - [~] Configure connection pooling (Railway handles automatically)
  - [~] Set up backups (Railway Pro feature)

- [x] **Deploy Redis**
  - [~] Create Redis service (manual step on railway.app)
  - [~] Configure memory limits (Railway handles automatically)

- [x] **Deploy API server**
  - [x] Configure build command (in railway.toml)
  - [~] Set environment variables (manual step on railway.app)
  - [~] Configure domain/SSL (manual step on railway.app)

- [x] **Configure CI/CD**
  - [x] GitHub Actions workflow (.github/workflows/ci.yml)
  - [x] Run tests before deploy
  - [x] Database migrations on deploy (in start command)

### Phase 0 Deliverable

✓ User can log in with Discord, account persists, basic dashboard visible

---

## Phase 1: World & Nodes (Week 3-4)

### 1.1 World Map Data

- [x] **Define map configuration**
  - [x] Node type definitions in `packages/shared`
  - [x] Map seed data structure
  - [x] Region definitions

- [x] **Create initial map**
  - [x] Design 100 node map (hybrid: procedural regions + hand-crafted key locations)
  - [x] Define node positions (spread across map regions)
  - [x] Create node connections (average 3-4 connections per node)
  - [x] Assign node types (balanced distribution)
  - [x] Set initial resources per node type
  - [x] Define 5-8 distinct regions for environmental zones
  - [x] Place key locations (central trade hub, resource-rich areas, chokepoints)

- [x] **Seed database**
  - [x] Create seed script
  - [x] Insert nodes
  - [x] Insert connections
  - [x] Insert environment zones

### 1.2 PixiJS Integration

- [x] **Set up game engine**
  - [x] Create `GameEngine` class
  - [x] Initialize PixiJS application
  - [x] Handle canvas resize
  - [x] Set up render loop

- [x] **Create camera system**
  - [x] Pan controls (drag)
  - [x] Zoom controls (wheel, pinch)
  - [x] Smooth interpolation
  - [x] Bounds limiting

- [x] **Implement zoom levels**
  - [x] Level 1: Strategic (all nodes visible)
  - [x] Level 2: Regional (node clusters)
  - [x] Level 3: Node detail (building grid)
  - [x] Level 4: Combat (battle view) - placeholder
  - [x] Automatic level switching on zoom

### 1.3 Map Rendering

- [x] **Create render layers**
  - [x] Background layer
  - [x] Connection lines layer
  - [x] Node icons layer
  - [x] UI overlay layer

- [x] **Render node connections**
  - [x] Line rendering with road types
  - [x] Danger level coloring
  - [~] Distance labels (deferred - not essential for MVP)

- [x] **Render nodes**
  - [x] Node type icons
  - [x] Ownership colors
  - [x] Status indicators
  - [~] Name labels (disabled due to PixiJS v8 text rendering bug - TODO)

#### Hexagon Node Design Specification

Nodes are rendered as hexagons with 6 connection faces for visual clarity:

```
        Face 0 (N)
          /\
    5(NW)/  \1(NE)
        |    |
    4(SW)\  /2(SE)
          \/
        Face 3 (S)
```

**Visual Structure:**
- **Shape**: Flat-top hexagon (pointy sides)
- **Size**: ~36px radius at node zoom level, scales with zoom
- **Layers** (inside to outside):
  1. Inner fill: Node type color
  2. Border ring: Ownership/status color
  3. Selection ring: Green glow when selected
  4. Connection anchors: Small dots on active faces

**Connection Rendering:**
- Lines connect from face center to face center
- Road type determines line style:
  - Dirt: Brown dashed (#8b7355)
  - Paved: Gray solid (#a0a0a0)
  - Highway: Gold thick (#ffd700)
  - Hazardous: Red pulsing (#ff4500)
- Danger level adds red overlay (0-100 → 0%-50% alpha)

**Map Layout:**
- Nodes are placed on a hex grid with terrain tiles filling gaps
- ~100 nodes randomly distributed across ~170 hex cells (14x12 grid)
- Non-node hexes are terrain (plains, forest, mountain, water, etc.)
- Connections only between adjacent node hexes
- Each node can have 1-6 connections to neighboring nodes

**Face Calculation:**
```typescript
function getConnectionFace(fromNode, toNode): number {
  const angle = Math.atan2(
    toNode.positionY - fromNode.positionY,
    toNode.positionX - fromNode.positionX
  );
  // Convert angle to face (0-5), 0 = North
  return Math.round(((angle + Math.PI) / Math.PI * 3) + 3) % 6;
}
```

**Implementation Priority:**
1. [x] Update node graphics from circle to hexagon
2. [x] Add face anchor points for connections
3. [x] Update connection lines to use anchors
4. [x] Add visual indicators for used/unused faces

- [x] **Implement culling**
  - [x] Only render visible elements
  - [x] LOD system for zoom levels
  - [~] Object pooling (deferred - optimize if needed)

### 1.4 Node Interaction

- [x] **Click handling**
  - [x] Node selection
  - [x] Deselection
  - [x] Multi-select (shift-click)

- [x] **Node detail panel (Vue)**
  - [x] Basic info display
  - [x] Resource storage (placeholder)
  - [x] Building list (placeholder)
  - [x] Garrison list (placeholder)

- [x] **API endpoints**
  - [x] `GET /nodes` - List all nodes (paginated)
  - [x] `GET /nodes/:id` - Node details
  - [x] `GET /nodes/:id/connections` - Adjacent nodes
  - [x] `POST /nodes/:id/claim` - Claim neutral node

- [x] **Real-time updates**
  - [x] WebSocket connection setup (socket.io-client service)
  - [x] Subscribe to node changes (game store WebSocket handlers)
  - [x] Update local state (reactive node updates from events)
  - [x] Visual change indicators (recentlyUpdatedNodes tracking)

### 1.5 Node Claiming

- [x] **Claiming mechanics** (implemented via POST /nodes/:id/claim)
  - [x] Validate player can claim
  - [x] Check node is neutral
  - [x] Check adjacency requirement
  - [x] Deduct claiming cost
  - [x] Update ownership

- [x] **HQ placement**
  - [x] First node becomes HQ (hqNodeId field on Player)
  - [x] Special HQ rules (isHQ flag in API response)
  - [x] Cannot be abandoned (abandonNode rejects HQ)

- [x] **Verify Section 1.5:** (Unit tests added for service layer)
  - [x] Claim first node as new player → becomes HQ
  - [x] Claim second node → must be adjacent to owned node
  - [x] Attempt non-adjacent claim → fails with error
  - [x] Attempt to abandon HQ → fails (cannot abandon)
  - [x] HQ displays special indicator on map (golden star)
  - [x] Claim button UI in node detail panel (shows for neutral nodes)

### 1.6 Game Lobby & Session System

Transform Nova Fall from a single shared world to a multi-session game with lobby system.

**Key Requirements:**
- One active game per player at a time
- Anyone can create new game sessions
- 2 player minimum to start a game
- Multiple game types with different win conditions
- Post-login landing: Lobby (not game)

**Game Types:**
1. **King of the Hill** - Claim and hold central "Crown Node" for 48 hours to win
2. **Domination** - Conquer all opponent HQs to win (last player standing)

#### 1.6.1 Database Schema Changes

- [x] **Add GameSession model**
  - [x] id, name, gameType, status (LOBBY/ACTIVE/COMPLETED/ABANDONED)
  - [x] minPlayers (default 2), creatorId
  - [x] crownNodeId, crownHeldSince, crownHolderId (KOTH specific)
  - [x] startedAt, endedAt, winnerId
  - [x] Indexes on status, gameType

- [x] **Add GameSessionPlayer model**
  - [x] id, gameSessionId, playerId, role (PLAYER/SPECTATOR)
  - [x] resources (JSON), hqNodeId, totalNodes
  - [x] Unique constraint on [gameSessionId, playerId]

- [x] **Add GameType and GameSessionStatus enums**

- [x] **Modify Node model**
  - [x] Add gameSessionId (foreign key to GameSession)
  - [x] Add index on gameSessionId

- [~] **Modify Player model** (kept session-scoped fields for backwards compatibility)
  - [ ] Remove session-scoped fields (resources, hqNodeId, totalNodes)
  - [x] Add gameSessions relation to GameSessionPlayer

- [x] **Create migration**
  - [x] Add new models
  - [ ] Create default session for existing data
  - [ ] Migrate existing node/player data to default session

#### 1.6.2 Sessions API Module

- [x] **Create sessions module** (`/apps/api/src/modules/sessions/`)
  - [x] routes.ts, service.ts, types.ts

- [x] **Implement endpoints**
  - [x] `GET /sessions` - List sessions (filterable by status)
  - [x] `GET /sessions/:id` - Session details with players
  - [x] `POST /sessions` - Create new session
  - [x] `POST /sessions/:id/join` - Join as player
  - [x] `POST /sessions/:id/spectate` - Join as spectator
  - [x] `POST /sessions/:id/leave` - Leave session
  - [x] `POST /sessions/:id/start` - Start game (creator only, requires 2+ players)
  - [x] `GET /sessions/my` - Get user's active session

- [x] **Update auth service**
  - [~] Remove auto-HQ assignment (HQ now assigned per session in future work)
  - [x] Add activeSession to `/me` response

#### 1.6.3 Scope Node Operations to Sessions

- [x] **Modify node service**
  - [x] Use GameSessionPlayer context for all operations
  - [x] Scope getAllNodes to session
  - [x] Update claimNode for session scope
  - [x] Update abandonNode for session scope

- [x] **Update game tick worker**
  - [x] Scope resource generation to active sessions
  - [x] Scope upkeep processing to active sessions

#### 1.6.4 Frontend Lobby

- [x] **Create LobbyView component** (`/apps/web/src/views/LobbyView.vue`)
  - [x] Your Active Game section (continue/start/leave)
  - [x] Available Games list (join/spectate)
  - [x] Create New Game button

- [x] **Create session store** (`/apps/web/src/stores/session.ts`)
  - [x] currentSession state
  - [x] availableSessions state
  - [x] createSession(), joinSession(), leaveSession(), startSession()

- [x] **Create CreateSessionModal component** (integrated into LobbyView)
  - [x] Game name input
  - [x] Game type selector (KOTH / Domination)

- [x] **Update router**
  - [x] Add `/lobby` route (requiresAuth)
  - [x] Change `/game/:sessionId` route
  - [x] Redirect `/game` → `/lobby`

- [x] **Update AuthCallbackView**
  - [x] Redirect to `/lobby` instead of `/game`

#### 1.6.5 GameView Updates

- [x] **Accept sessionId prop from route**
- [x] **Update game store for session context**
- [x] **Add "Back to Lobby" navigation**
- [x] **Show session name and victory progress**

#### 1.6.6 WebSocket Session Scoping

- [x] **Add session room management**
  - [x] Session rooms: `session:{sessionId}`
  - [x] Clients join room on game load

- [x] **Update event publishers**
  - [x] Include sessionId in all events
  - [x] Publish to session-specific rooms

- [x] **Update frontend socket service**
  - [x] Join/leave session rooms
  - [x] Filter events by session

#### 1.6.7 Victory Conditions

- [x] **King of the Hill victory check**
  - [x] Worker checks crown node holder
  - [x] Track continuous hold time
  - [x] Trigger victory at 48 hours

- [x] **Domination victory check**
  - [x] Check for single remaining player with HQ
  - [x] Handle HQ conquest (eliminate player, neutralize nodes)

- [x] **Victory event and UI**
  - [x] Publish victory event
  - [x] Display victory modal
  - [x] Transition session to COMPLETED status

- [x] **Verify Section 1.6:**
  - [x] User lands at lobby after login
  - [x] Can create new game session
  - [x] Can join existing session
  - [x] Game starts when creator clicks start with 2+ players
  - [x] Game is session-scoped (nodes, resources, HQ)
  - [x] KOTH: Crown node holder wins after 48h
  - [x] Domination: Last player with HQ wins
  - [x] Victory modal displays and session completes

### Phase 1 Deliverable

✓ Players can view world map, zoom in/out, claim initial territory

---

## Phase 2: Economy & Resources (Week 5-6)

### 2.1 Resource System

- [x] **Define resource types**

  ```typescript
  // packages/shared/src/config/resources.ts
  export const RESOURCES = {
    credits: { name: 'Credits', icon: '💰' },
    iron: { name: 'Iron Ore', icon: '⛏️' },
    minerals: { name: 'Rare Minerals', icon: '💎' },
    energy: { name: 'Energy Cells', icon: '⚡' },
    composites: { name: 'Composites', icon: '🔩' },
    techComponents: { name: 'Tech Components', icon: '⚙️' },
  };
  ```

- [x] **Player resource storage**
  - [x] Global inventory (JSON field - ResourceStorage type)
  - [x] Helper methods for add/subtract (addResources, subtractResources, canAfford, deductCost)
  - [x] Validation (non-negative - shortage tracking)

- [x] **Node storage**
  - [x] Per-node storage capacity (NODE_BASE_STORAGE config)
  - [ ] Storage buildings increase cap (Phase 3)
  - [x] Overflow prevention (addResources with maxCapacity param)

- [x] **Verify Section 2.1:**
  - [x] Player resources display correctly in UI (PlayerResourcesPanel in top bar)
  - [~] Add/subtract resources via API → values update (needs API endpoints - Phase 2.2)
  - [x] Node storage shows current/max capacity (ResourceDisplay with capacity bar)
  - [x] Cannot store more than capacity (overflow prevented - addResources helper)
  - [x] Resource tooltips display descriptions (Tooltip component)

### 2.2 Game Tick System

- [x] **Set up BullMQ worker**
  - [x] Configure Redis connection
  - [x] Create repeating job (5-second tick)
  - [x] Job processing with error handling

- [x] **Resource generation**
  - [x] Calculate per-node production
  - [~] Apply research bonuses (deferred - no research system yet)
  - [x] Add to node storage
  - [x] Emit updates via WebSocket

- [x] **Batch processing**
  - [x] Process all nodes efficiently
  - [x] Use database transactions
  - [x] Minimize queries

- [x] **Verify Section 2.2:**
  - [x] Worker starts and runs economy tick hourly (5-second tick removed for efficiency)
  - [x] Owned node generates resources over time
  - [x] Resource generation appears in player inventory
  - [x] WebSocket pushes update to connected clients

### 2.3 Upkeep System

- [x] **Calculate upkeep costs** (game-logic/economy/upkeep.ts)

  ```typescript
  function calculateUpkeep(node: Node, player: Player): number {
    const baseCost = NODE_BASE_UPKEEP[node.type];
    const distanceMod = 1 + 0.15 * getDistanceFromHQ(node, player);
    const buildingMod = sumBuildingUpkeep(node.buildings);
    return Math.floor(baseCost * distanceMod * buildingMod);
  }
  ```

- [x] **Upkeep deduction job** (worker/jobs/upkeep.ts)
  - [x] Run hourly
  - [x] Calculate per-node costs
  - [x] Deduct from player credits
  - [x] Track payment status

- [x] **Failure consequences** (integrated into upkeep job)
  - [x] Warning phase (12h)
  - [x] Decay phase (12-36h)
  - [x] Collapse phase (36-48h)
  - [x] Abandonment (48h+)

- [x] **UI indicators**
  - [~] Upkeep summary panel (tooltip shows base upkeep, full panel deferred)
  - [x] Per-node cost display (in tooltip)
  - [x] Warning alerts (upkeep status in tooltip with color-coded warnings)
  - [~] Projected runway (deferred - needs player resources tracking)

- [x] **Verify Section 2.3:**
  - [x] Upkeep deducts from player credits hourly (fixed to use session-scoped resources)
  - [x] Distance from HQ increases upkeep cost (15% per node via DISTANCE_UPKEEP_MODIFIER)
  - [x] UI shows upkeep breakdown per node (base upkeep in tooltip)
  - [x] Warning appears when credits low (depletion countdown in credits tooltip)
  - [x] Node enters decay state when upkeep unpaid (WARNING→DECAY→COLLAPSE→ABANDONED)

### 2.4 Basic Market

- [x] **NPC market**
  - [x] Fixed buy/sell prices (NPC_MARKET_PRICES in shared/config/resources.ts)
  - [x] Available at any owned node (session-scoped, not node-specific)
  - [x] 15% fee on transactions (MARKET_TRANSACTION_FEE = 0.15)

- [x] **Market UI**
  - [x] Resource list with prices (MarketPanel component)
  - [x] Buy/sell interface (toggle + quantity input)
  - [x] Transaction confirmation (preview shows cost/fee/total)
  - [~] History log (deferred - not essential for MVP)

- [x] **API endpoints**
  - [x] `GET /market/prices` - Current prices
  - [x] `POST /market/buy` - Buy resources
  - [x] `POST /market/sell` - Sell resources

- [x] **Verify Section 2.4:**
  - [x] Market UI shows resource prices
  - [x] Buy resources → credits decrease, resource increases
  - [x] Sell resources → resource decreases, credits increase
  - [x] 15% transaction fee applied correctly
  - [x] Cannot buy more than can afford

### 2.5 Resource Transfer

- [x] **Node-to-node transfer**
  - [x] Only between adjacent nodes
  - [x] Transfer time based on distance (30 seconds for adjacent)
  - [x] Cancel in-progress transfers

- [x] **UI for transfers**
  - [x] Select source/destination
  - [x] Choose resources and amounts
  - [x] View pending transfers

- [x] **Verify Section 2.5:**
  - [x] Transfer resources between two adjacent owned nodes
  - [x] Transfer shows in pending list with ETA
  - [x] Resources arrive at destination after transfer time
  - [x] Cannot transfer to non-adjacent node
  - [x] Can cancel pending transfer

### Phase 2 Deliverable

✓ Nodes generate resources, upkeep costs money, basic trading works

---

## Phase 2.5: Node Activation & Production Systems

### 2.5.1 Resource Updates

- [x] **Add new resources**
  - [x] Add "Coal" resource (icon, description)
  - [x] Add "Grain" resource (icon, description)
  - [x] Add "Steel Bar" resource (refined material)

- [x] **Rename and update existing resources**
  - [x] Rename "Iron" → "Iron Ore" throughout codebase (display name was already correct)
  - [x] Update Iron Ore production rate: 100/hr → 50/hr

- [x] **Update production rates**
  - [x] Agricultural Center: +25 Coal/hr, +50 Grain/hr
  - [x] Mining Outpost: 50 Iron Ore/hr (reduced from 100)

- [ ] **Verify Section 2.5.1:**
  - [ ] New resources display correctly in UI
  - [ ] Production rates match specification
  - [ ] Iron Ore rename applied everywhere

### 2.5.2 New Node Type

- [x] **Add MANUFACTURING_PLANT node type**
  - [x] Add to NodeType enum in Prisma schema
  - [x] Add to shared types and configs
  - [x] Configure base stats (storage: 30000, upkeep: 65)
  - [x] Add to map generation (seed data)
  - [x] Create migration (20260109031813_add_manufacturing_plant_node_type)

- [ ] **Verify Section 2.5.2:**
  - [ ] Manufacturing Plant appears on map
  - [ ] Node tooltip shows correct type info
  - [ ] Node can be claimed like other nodes

### 2.5.3 Flexible Node Storage

- [x] **Update node storage system**
  - [x] Change storage from fixed ResourceStorage to flexible item storage
  - [x] Support any item type (resources, cores, crafted items)
  - [x] Update storage capacity logic
  - [x] Update storage UI to handle dynamic item types

- [ ] **Verify Section 2.5.3:**
  - [ ] Node can store base resources
  - [ ] Node can store crafted items (Steel Bar)
  - [ ] Node can store node cores
  - [ ] Storage UI displays all item types correctly

### 2.5.4 Node Core System

- [x] **Define node core types**
  ```typescript
  // packages/shared/src/config/nodeCores.ts
  export const NODE_CORES = {
    solar_farm: { id: 'solar_farm', name: 'Solar Farm', targetNode: 'POWER_PLANT', cost: 100 },
    laboratory: { id: 'laboratory', name: 'Laboratory', targetNode: 'RESEARCH', cost: 100 },
    refinery: { id: 'refinery', name: 'Refinery', targetNode: 'REFINERY', cost: 100 },
    greenhouse_biome: { id: 'greenhouse_biome', name: 'Greenhouse Biome', targetNode: 'AGRICULTURAL', cost: 100 },
    strip_miner: { id: 'strip_miner', name: 'Strip Miner', targetNode: 'MINING', cost: 100 },
    trading_complex: { id: 'trading_complex', name: 'Trading Complex', targetNode: 'TRADE_HUB', cost: 100 },
    factory: { id: 'factory', name: 'Factory', targetNode: 'MANUFACTURING_PLANT', cost: 100 },
    training_facility: { id: 'training_facility', name: 'Training Facility', targetNode: 'BARRACKS', cost: 100 },
  };
  ```

- [x] **Database changes**
  - [x] Add `installedCoreId` field to Node model
  - [x] Add `isActive` computed/virtual field based on core installation
  - [x] Create migration (20260109034817_add_installed_core_id)

- [x] **Node activation logic**
  - [x] Nodes without cores produce nothing (skip in economy tick)
  - [x] HQ and Crown nodes are always active (no core needed)
  - [x] Installing core activates the node

- [x] **HQ Core Shop UI**
  - [x] Create core purchase interface accessible from HQ (modal: "HQ Planetary Drop Terminal")
  - [x] List all core types with costs
  - [x] Purchase button deducts credits, adds core to HQ storage
  - [x] Show current inventory of cores at HQ

- [x] **Core installation UI**
  - [x] Add core slot visual in node details panel
  - [x] Show slot as empty/filled based on installed core
  - [x] If node has matching core in storage, allow installation
  - [x] Confirmation dialog before installing (destroy has confirmation)
  - [x] Core destruction option (with confirmation)

- [x] **API endpoints**
  - [x] `POST /nodes/:id/cores/purchase` - Buy core (HQ only)
  - [x] `POST /nodes/:id/cores/install` - Install core from storage
  - [x] `DELETE /nodes/:id/cores` - Destroy installed core

- [x] **Visual indicators**
  - [x] Inactive nodes show muted/grayed appearance on map (dimmed with amber dashed border)
  - [x] Active nodes show normal/vibrant appearance
  - [x] Tooltip indicates active/inactive status (warning banner in details panel)

- [x] **Verify Section 2.5.4:**
  - [x] Can purchase cores from HQ UI
  - [x] Cores appear in HQ storage after purchase
  - [x] Can transfer cores to other nodes
  - [x] Can install core in matching node type
  - [x] Node becomes active after core installation
  - [x] Active node produces resources
  - [x] Inactive node produces nothing
  - [x] Visual distinction between active/inactive nodes
  - [x] Can destroy installed core (node becomes inactive)

### 2.5.5 Crafting System

- [x] **Define blueprint system**
  ```typescript
  // packages/shared/src/config/blueprints.ts
  export interface Blueprint {
    id: string;
    name: string;
    category: 'refinement' | 'manufacturing' | 'training';
    craftingNode: NodeType[];  // Which node types can craft this
    inputs: { itemId: string; quantity: number }[];
    outputs: { itemId: string; quantity: number }[];
    craftTime: number;  // seconds
  }

  export const BLUEPRINTS = {
    steel_bar: {
      id: 'steel_bar',
      name: 'Steel Bar',
      category: 'refinement',
      craftingNode: ['REFINERY'],
      inputs: [
        { itemId: 'iron_ore', quantity: 1 },
        { itemId: 'coal', quantity: 1 },
      ],
      outputs: [{ itemId: 'steel_bar', quantity: 1 }],
      craftTime: 60,
    },
  };
  ```

- [x] **Crafting queue system**
  - [x] Add crafting queue to Node model (JSON field)
  - [x] Queue items with blueprint, quantity, start time, completion time
  - [x] Process completed crafts in dedicated worker job (instant via delayed BullMQ jobs)

- [x] **API endpoints**
  - [x] `GET /nodes/:id/blueprints` - Available blueprints for node type
  - [x] `POST /nodes/:id/craft` - Start crafting (add to queue)
  - [x] `DELETE /nodes/:id/craft/:queueId` - Cancel queued craft
  - [x] `GET /nodes/:id/craft/queue` - Get current crafting queue

- [x] **Verify Section 2.5.5:**
  - [x] Blueprints load correctly for each node type
  - [x] Can start crafting with sufficient materials
  - [x] Materials deducted when crafting starts
  - [x] Crafting completes after craft time
  - [x] Output items added to node storage
  - [x] Can cancel queued crafts (materials refunded)

### 2.5.6 Crafting UI

- [x] **Create reusable CraftingPanel component**
  - [x] Left section: Blueprint list (filterable by category)
  - [x] Middle section: Selected blueprint material requirements
    - [x] Show required items with current inventory counts
    - [x] Visual indicator for sufficient/insufficient materials
  - [x] Right section: Crafting controls
    - [x] Quantity selector
    - [x] Craft button (disabled if insufficient materials)
    - [x] Output preview (what you'll receive)
    - [x] Estimated completion time

- [x] **Crafting queue display**
  - [x] Show active crafting with progress bar (continuously updating)
  - [x] Show queued items with position and ETA
  - [x] Cancel button for queued items

- [x] **Integrate with node types**
  - [x] Refinery Complex: Show refinement blueprints
  - [x] Manufacturing Plant: Show manufacturing blueprints
  - [x] Barracks: Show unit training blueprints
  - [ ] (Future) Research Station: Blueprint discovery

- [x] **Verify Section 2.5.6:**
  - [x] Crafting UI opens for applicable node types
  - [x] Blueprint list displays correctly
  - [x] Material requirements update based on selection
  - [x] Can craft items through UI
  - [x] Queue displays with progress
  - [x] Can cancel queued items

### 2.5.7 Unit Training Framework

- [x] **Define initial unit types**
  - [x] Basic infantry unit (trained at Barracks) - 3 units defined: Militia, Marine, Heavy Trooper
  - [x] Unit stats structure (health, shield, damage, armor, speed, range, attackSpeed)
  - [x] Training cost and time - defined in UNIT_TYPES with costs and trainingTime

- [x] **Barracks training integration**
  - [x] Use crafting system for unit training - blueprints with BARRACKS nodeType
  - [x] Units added to node storage on completion (handled by crafting system)

- [x] **Verify Section 2.5.7:**
  - [x] Can train basic unit at Barracks
  - [x] Unit appears in storage after training
  - [x] Training uses crafting UI

### Phase 2.5 Deliverable

✓ Nodes require cores to activate, crafting system works, basic unit training available

---

## Phase 3: Building Items (Week 7-8)

> **Design Note:** Buildings exist as items in the tactical hex view. They are manufactured
> at Manufacturing Plant nodes using the crafting/blueprint system. The actual 3D placement
> and construction of buildings in Combat Mode is handled in Phase 4. Building quality/tiers
> come from blueprint quality, not upgrades.

### 3.1 Building Item Configuration

- [x] **Add BUILDING category to schema**
  - [x] Add BUILDING to ItemCategory enum in Prisma schema
  - [x] Run migration
  - [x] Regenerate Prisma client

- [x] **Define BuildingStats interface**
  ```typescript
  // packages/shared/src/config/buildings.ts
  export interface BuildingStats {
    health: number;
    shield: number;      // Shield hit points (absorbs damage before health)
    shieldRange: number; // 0 = personal shield, >0 = AOE radius protecting allies
    damage: number;      // For defense buildings (turrets)
    armor: number;
    range: number;       // Attack/effect range
    attackSpeed: number; // For defense buildings
  }
  ```

- [x] **Define building types**
  ```typescript
  export const BUILDING_TYPES: Record<string, BuildingTypeDefinition> = {
    // Defense
    pulse_turret: {
      id: 'pulse_turret',
      name: 'Pulse Turret',
      description: 'Basic defensive turret. Fires energy bolts at enemies.',
      icon: '🔫',
      tier: 1,
      category: 'defense',
      baseStats: { health: 100, shield: 0, damage: 15, armor: 10, range: 3, attackSpeed: 1.0 },
      craftTime: 120,
      craftCost: { credits: 200, steelBar: 3, energy: 20 },
    },
    shield_generator: {
      id: 'shield_generator',
      name: 'Shield Generator',
      description: 'Provides shield protection to nearby units and buildings.',
      icon: '🛡️',
      tier: 1,
      category: 'defense',
      baseStats: { health: 80, shield: 50, damage: 0, armor: 5, range: 4, attackSpeed: 0 },
      craftTime: 180,
      craftCost: { credits: 300, steelBar: 2, energy: 50 },
    },
    wall_segment: {
      id: 'wall_segment',
      name: 'Wall Segment',
      description: 'Sturdy defensive wall. Blocks enemy movement.',
      icon: '🧱',
      tier: 1,
      category: 'defense',
      baseStats: { health: 200, shield: 0, damage: 0, armor: 30, range: 0, attackSpeed: 0 },
      craftTime: 60,
      craftCost: { credits: 50, steelBar: 2 },
    },
    // Support
    repair_station: {
      id: 'repair_station',
      name: 'Repair Station',
      description: 'Repairs nearby friendly units and buildings over time.',
      icon: '🔧',
      tier: 1,
      category: 'support',
      baseStats: { health: 60, shield: 0, damage: 0, armor: 5, range: 3, attackSpeed: 0 },
      craftTime: 150,
      craftCost: { credits: 250, steelBar: 4, energy: 30 },
    },
  };
  ```

- [x] **Building sub-categories**
  - [x] Defense (turrets, walls, shield generators)
  - [x] Support (repair stations, buff stations)

- [x] **Verify Section 3.1:**
  - [x] BUILDING category exists in schema
  - [x] BuildingStats interface includes shield field
  - [x] Building types defined with stats

### 3.2 Building Items & Blueprints

- [x] **Create seed-buildings.ts script**
  - [x] Create ItemDefinition entries for each building type
  - [x] Set category to BUILDING
  - [x] Include buildingStats (reuses unitStats field)
  - [x] Create Blueprint entries for Manufacturing Plant

- [x] **Update ItemDefinition schema if needed**
  - [x] Reuse unitStats JSON field (same structure)
  - [x] Buildings use same stats structure as units

- [x] **Add db:seed-buildings script to package.json**

- [x] **Verify Section 3.2:**
  - [x] Run seed script successfully
  - [x] Building items appear in Item Editor with BUILDING category
  - [x] Building blueprints appear in Blueprint Editor
  - [x] Can craft buildings at Manufacturing Plant
  - [x] Buildings appear in node storage after crafting

### 3.3 Building Stats in UI

- [x] **Update ItemsEditor for BUILDING category**
  - [x] Show "Building Stats" section for BUILDING items
  - [x] Display all stats: health, shield, shieldRange, damage, armor, range, attackSpeed

- [x] **Verify Section 3.3:**
  - [x] ItemsEditor shows building stats for BUILDING category items
  - [x] Can edit building stats in dev panel
  - [x] Stats persist correctly

### Phase 3 Deliverable

✅ **PHASE 3 COMPLETE** (2026-01-11)

✓ Building items can be manufactured at Manufacturing Plant, stored in nodes, ready for Phase 4 3D placement

> **Deferred to Phase 4:** 3D grid placement, construction in Combat Mode, building effects during combat

---

## Phase 4: Combat System (Week 9-14)

> **Design Document:** See `docs/COMBAT-MODE-DESIGN.md` for complete technical specification.
>
> **Priority:** 3D Combat Mode is the primary focus of this phase. The real-time Babylon.js battle
> system is a massive undertaking and should be built first. Battle lifecycle and other features
> integrate with the combat mode once it's functional.

### Already Complete (from earlier phases)

The following combat prerequisites were completed in Phase 2.5:

- [x] **Unit types defined** (`packages/shared/src/config/units.ts`)
  - [x] UnitStats interface with health, shield, shieldRange, damage, armor, speed, range, attackSpeed
  - [x] 3 unit types: Militia, Marine, Heavy Trooper
  - [x] Veterancy system with multipliers

- [x] **Building types defined** (`packages/shared/src/config/buildings.ts`)
  - [x] BuildingStats interface with health, shield, shieldRange, damage, armor, range, attackSpeed
  - [x] 7 building types: turrets, walls, shield generator, repair station, supply depot

- [x] **Unit training via Barracks**
  - [x] Uses crafting system for training queue
  - [x] Units stored in node storage after training

- [x] **Building manufacturing via Manufacturing Plant**
  - [x] Uses crafting system
  - [x] Buildings stored in node storage after crafting

---

### 4.1 Combat Foundation (Babylon.js Integration)

> Corresponds to Phase A in COMBAT-MODE-DESIGN.md

- [x] **Babylon.js integration with Vue**
  - [x] Add @babylonjs/core, @babylonjs/loaders, @babylonjs/gui to apps/web
  - [x] Create CombatEngine class (engine initialization, scene setup)
  - [x] Create useCombatEngine composable
  - [x] Implement view switching (v-show toggle, NOT v-if)
  - [x] Engine pause/resume for hidden canvas
  - [x] WebGL context preservation strategy
  - [x] High-DPI display support (devicePixelRatio handling)

- [x] **Basic arena rendering**
  - [x] Flat 60x60 tile grid (120m x 120m arena)
  - [x] Ground texture with ThinInstances for performance
  - [x] HQ placeholder at center (2x2 tiles)
  - [x] Spawn zone visualization (arena perimeter)
  - [x] Basic lighting and skybox

- [x] **Camera system**
  - [x] ArcRotateCamera with isometric default (45° angle)
  - [x] Pan controls (WASD, drag, edge scroll)
  - [x] Zoom controls (mouse wheel, pinch)
  - [x] Q/E rotation (45° increments)
  - [x] Camera bounds limiting to arena

- [x] **WebSocket combat events**
  - [x] Define CombatInput type (deploy, move, attack, ability)
  - [x] Define CombatState type (tick, units, projectiles, HQ health)
  - [x] Client → Server event handling
  - [x] Server → Client state broadcast
  - [x] Connection/reconnection handling

- [x] **Verify Section 4.1:**
  - [x] Toggle combat view without WebGL context loss
  - [x] Basic arena renders with grid and HQ placeholder
  - [x] Camera controls work (pan, zoom, rotate)
  - [x] WebSocket events send/receive correctly
  - [x] Performance acceptable (60 FPS empty arena)

---

### 4.2 Core Combat Mechanics

> Corresponds to Phase B in COMBAT-MODE-DESIGN.md

- [x] **Unit spawning and movement**
  - [x] Create UnitManager class
  - [x] Spawn units at perimeter spawn zones
  - [x] Basic unit meshes (placeholder boxes initially)
  - [x] Movement system (grid-based logic, smooth visual interpolation)
  - [x] Unit state machine (SPAWNING, IDLE, MOVING, ATTACKING, DEAD)

- [x] **Flow Field pathfinding**
  - [x] Implement Dijkstra integration field from HQ
  - [x] Generate flow direction per tile
  - [x] Units follow flow toward HQ (siege behavior)
  - [x] Obstacle handling (walls block tiles, recalculate flow)
  - [x] Flow field visualization (debug mode)

- [x] **Basic combat (hitscan damage)**
  - [x] Target acquisition system (nearest enemy in range)
  - [x] Hitscan weapon implementation
  - [x] Damage calculation with armor reduction
  - [x] Health tracking and death handling
  - [ ] Damage numbers (floating text)

- [x] **HQ health and destruction**
  - [x] HQ health bar UI (prominent display)
  - [x] Damage accumulation tracking
  - [x] Visual damage states (HEALTHY → DAMAGED → CRITICAL)
  - [ ] Destruction animation sequence
  - [x] Victory condition detection (HQ destroyed)

- [ ] **Verify Section 4.2:**
  - [ ] Units spawn from perimeter
  - [ ] Units follow Flow Field toward HQ
  - [ ] Units attack enemies in range
  - [ ] Health bars update correctly
  - [ ] HQ destruction triggers victory

---

### 4.3 Full Combat Features

> Corresponds to Phase C in COMBAT-MODE-DESIGN.md

- [ ] **A* manual orders**
  - [ ] Implement A* pathfinding for player-issued moves
  - [ ] Click-to-move with path preview
  - [ ] Order queue (shift-click waypoints)
  - [ ] Order completion → AI behavior reverts

- [ ] **Tower targeting and firing**
  - [ ] Tower placement from defense state
  - [ ] Auto-target nearest enemy in range
  - [ ] Priority override (player selects target)
  - [ ] Target cooldown to prevent flicker
  - [ ] Range circle visualization

- [ ] **Projectile system**
  - [ ] Create ProjectileManager class
  - [ ] Travel time projectiles
  - [ ] Homing missiles (with turn rate)
  - [ ] Area damage with falloff
  - [ ] Projectile visual effects (trails, impacts)

- [ ] **Shield mechanics**
  - [ ] Shield generator placement
  - [ ] Shield bubble rendering (Fresnel shader)
  - [ ] Sphere-ray intersection for projectile blocking
  - [ ] Shield health pool and recharge delay
  - [ ] Visual feedback on shield hit

- [ ] **Verify Section 4.3:**
  - [ ] Click-to-move works with path preview
  - [ ] Towers target and fire at enemies
  - [ ] Projectiles travel and hit targets
  - [ ] Shields block projectiles from outside
  - [ ] Shield recharges after delay

---

### 4.4 Multiplayer Sync

> Corresponds to Phase D in COMBAT-MODE-DESIGN.md

- [ ] **Server-authoritative state**
  - [ ] Combat server with 20 TPS tick rate (50ms)
  - [ ] Authoritative game state on server
  - [ ] Input validation and anti-cheat basics
  - [ ] State broadcasting to both players

- [ ] **Client prediction/reconciliation**
  - [ ] Local prediction for responsive feel
  - [ ] Server state reconciliation on mismatch
  - [ ] Smooth correction of prediction errors
  - [ ] Lag compensation for fairness

- [ ] **Real-time state synchronization**
  - [ ] Delta compression (only send changes)
  - [ ] Interpolation buffer (100ms behind server)
  - [ ] Priority updates (nearby units > distant)
  - [ ] Bandwidth optimization

- [ ] **Latency compensation**
  - [ ] Ping/pong latency measurement
  - [ ] Display latency indicator in UI
  - [ ] Input buffering for stability
  - [ ] Graceful disconnection handling
  - [ ] Mid-battle reconnection support

- [ ] **Verify Section 4.4:**
  - [ ] Both players see same game state (within 100ms)
  - [ ] Actions feel responsive (prediction works)
  - [ ] State syncs correctly after network hiccup
  - [ ] Reconnection works mid-battle

---

### 4.5 Combat UI

- [ ] **Combat HUD**
  - [ ] Timer display (countdown from 30:00)
  - [ ] HQ health bar (prominent, central)
  - [ ] Menu and Surrender buttons
  - [ ] Minimap with unit positions

- [ ] **Selection system**
  - [ ] Click to select unit
  - [ ] Ctrl+click for multi-select
  - [ ] Drag box selection
  - [ ] Selection ring under units
  - [ ] Selected unit stats panel

- [ ] **Attacker deployment UI**
  - [ ] Deployment bar with unit types
  - [ ] Click unit → click spawn zone to deploy
  - [ ] Unit count display per type
  - [ ] Deploy All button

- [ ] **Defender controls**
  - [ ] Tower list panel
  - [ ] Target priority override
  - [ ] Tower enable/disable toggle
  - [ ] Garrison unit management

- [ ] **Verify Section 4.5:**
  - [ ] Timer counts down correctly
  - [ ] Can select and control units
  - [ ] Deployment UI works for attacker
  - [ ] Tower controls work for defender

---

### 4.6 Battle Lifecycle

- [ ] **Attack initiation (from tactical map)**
  - [ ] Select attacking units at staging node
  - [ ] Choose target enemy node
  - [ ] Validate attack (not on cooldown, valid path)
  - [ ] Generate random prep time (24h ± 4h)
  - [ ] Create Battle record with PREP_PHASE status
  - [ ] Notify defender immediately

- [ ] **Preparation Mode (20-28 hours)**
  - [ ] Attacker: add/remove units, assign consumables
  - [ ] Defender: move garrison, position defenses
  - [ ] Countdown timer visible to both
  - [ ] Final 1 hour: forces locked

- [ ] **Combat Mode transition**
  - [ ] Automatic transition when prep timer ends
  - [ ] Snapshot attack force and defense state
  - [ ] Start 30-minute combat window
  - [ ] Launch 3D combat view for online players

- [ ] **Battle resolution**
  - [ ] Victory conditions: destroy HQ (attacker) or survive 30 min (defender)
  - [ ] Time limit warnings (10m, 5m, 2m, 1m, 30s)
  - [ ] Node ownership transfer on attacker victory
  - [ ] Unit retreat to adjacent node on defender loss
  - [ ] 3-day attack cooldown on node

- [ ] **Post-battle processing**
  - [ ] Award experience to surviving units
  - [ ] Generate battle report
  - [ ] Update player statistics
  - [ ] Corporation notifications

- [ ] **Absent player AI**
  - [ ] Attacker AI: deploy units gradually, follow Flow Field
  - [ ] Defender AI: towers auto-target, garrison defends
  - [ ] Battle proceeds without human intervention

- [ ] **Verify Section 4.6:**
  - [ ] Attack initiation creates battle with correct prep time
  - [ ] Prep phase allows force modification
  - [ ] Combat starts automatically when timer ends
  - [ ] Victory/defeat resolved correctly
  - [ ] Cooldown applies after battle

---

### 4.7 Polish & Assets

> Corresponds to Phase E in COMBAT-MODE-DESIGN.md

- [ ] **Visual effects (Babylon.js)**
  - [ ] GlowLayer for lasers/shields/abilities
  - [ ] Particle systems (explosions, smoke, sparks)
  - [ ] Cascaded Shadow Maps
  - [ ] Post-processing (bloom, vignette, color grading)

- [ ] **Animations**
  - [ ] Unit idle/walk/attack animations
  - [ ] Tower rotation and firing
  - [ ] Building destruction sequences
  - [ ] Spawn/death effects

- [ ] **Audio integration**
  - [ ] Spatial audio setup
  - [ ] Weapon firing sounds
  - [ ] Explosion/impact sounds
  - [ ] UI feedback sounds
  - [ ] Victory/defeat fanfare

- [ ] **Asset acquisition**
  - [ ] Unit models (Quaternius, Kenney, or purchased)
  - [ ] Tower/structure models
  - [ ] Terrain tiles and props by node type
  - [ ] Effect textures and particles

- [ ] **Asset pipeline**
  - [ ] GLB format standardization
  - [ ] Scale normalization (1 unit = 1 meter)
  - [ ] Animation setup (Mixamo for humanoids)
  - [ ] Texture optimization (KTX2 compression)
  - [ ] Asset manifest for preloading

- [ ] **Style unification**
  - [ ] Faction color shader
  - [ ] Consistent low-poly aesthetic
  - [ ] Post-processing for visual cohesion

- [ ] **Performance optimization**
  - [ ] ThinInstances for terrain/props
  - [ ] LOD for units at distance
  - [ ] Object pooling for projectiles/particles
  - [ ] Spatial hash for collision queries
  - [ ] Profiling and optimization pass

- [ ] **Verify Section 4.7:**
  - [ ] Visual effects render correctly
  - [ ] Animations play smoothly
  - [ ] Audio plays with spatial positioning
  - [ ] 60 FPS with 50+ units on mid-range hardware
  - [ ] 3D models load correctly
  - [ ] Load times < 5 seconds

---

### 4.8 Unit Movement (Tactical Map)

> This section covers unit movement on the tactical hex map, outside of combat

- [ ] **Movement orders**
  - [ ] Select units in node storage
  - [ ] Choose destination node (owned nodes only for now)
  - [ ] Calculate route (shortest path through owned territory)
  - [ ] Calculate travel time based on distance

- [ ] **Movement execution**
  - [ ] Update unit status to MOVING
  - [ ] Track position along route
  - [ ] Handle arrival at destination

- [ ] **Movement UI**
  - [ ] Show moving units indicator on map
  - [ ] Movement path visualization
  - [ ] ETA display
  - [ ] Cancel movement option

- [ ] **Verify Section 4.8:**
  - [ ] Select units and order move to adjacent owned node
  - [ ] Units show as moving on map
  - [ ] ETA displays correctly
  - [ ] Units arrive at destination after travel time

---

### Phase 4 Deliverable

✓ Full combat loop works: schedule attack → preparation phase → real-time 3D battle → resolution

---

## Phase 5: Trading & Caravans (Week 12)

### 5.1 Caravan System

- [ ] **Vehicle types**

  ```typescript
  export const VEHICLES = {
    cargo_hauler: {
      id: 'cargo_hauler',
      name: 'Cargo Hauler',
      capacity: 200,
      speed: 1.0,
      defense: 'light',
      cost: { credits: 2000 },
    },
  };
  ```

- [ ] **Create caravan**
  - [ ] Select origin node
  - [ ] Select destination
  - [ ] Choose vehicle
  - [ ] Load cargo
  - [ ] Assign escorts (optional)

- [ ] **Verify Section 5.1:**
  - [ ] Create caravan with cargo from owned node
  - [ ] Vehicle type selected and capacity shown
  - [ ] Resources deducted from origin storage
  - [ ] Optional escorts assigned to caravan

### 5.2 Caravan Movement

- [ ] **Route calculation**
  - [ ] Find path between nodes
  - [ ] Calculate total travel time
  - [ ] Identify danger zones

- [ ] **Movement processing**
  - [ ] Update position each tick
  - [ ] Check for interception events
  - [ ] Handle arrival

- [ ] **Caravan tracking UI**
  - [ ] Show caravans on map
  - [ ] Route line display
  - [ ] Progress indicator
  - [ ] ETA countdown

- [ ] **Verify Section 5.2:**
  - [ ] Caravan appears on map moving along route
  - [ ] Route line visible between origin and destination
  - [ ] Progress indicator shows current position
  - [ ] ETA updates as caravan travels

### 5.3 Interception

- [ ] **NPC raiders**
  - [ ] Random encounter chance based on route danger
  - [ ] Mini-combat or auto-resolve
  - [ ] Escorts reduce risk

- [ ] **Arrival handling**
  - [ ] Unload cargo to destination storage
  - [ ] Return vehicle to pool
  - [ ] Release escorts

- [ ] **Verify Section 5.3:**
  - [ ] Caravan on dangerous route encounters NPC raiders
  - [ ] Mini-combat resolves (escorts fight raiders)
  - [ ] Caravan arrives at destination with cargo intact
  - [ ] Cargo deposited into destination storage
  - [ ] Escorts return to garrison

### Phase 5 Deliverable

✓ Players can send trade caravans between nodes with risk/reward

---

## Phase 6: Polish & MVP Launch (Week 13)

### 6.1 Research System (Basic)

- [ ] **Research tree**
  - [ ] 10-15 technologies
  - [ ] Tier 1-2 only for MVP
  - [ ] Prerequisites

- [ ] **Research queue**
  - [ ] One active research
  - [ ] Progress tracking
  - [ ] Completion handling

- [ ] **Research UI**
  - [ ] Tech tree visualization
  - [ ] Research panel
  - [ ] Unlock notifications

- [ ] **Verify Section 6.1:**
  - [ ] Research tree displays with techs and prerequisites
  - [ ] Start research → progress timer begins
  - [ ] Research completes → tech unlocked notification
  - [ ] Unlocked tech enables new buildings/units

### 6.2 NPC Threats (Basic)

- [ ] **Raider spawning**
  - [ ] Periodic spawn in unclaimed areas
  - [ ] Target nearby player nodes
  - [ ] Simple attack behavior

- [ ] **Raider combat**
  - [ ] Use existing combat system
  - [ ] AI-controlled attacker
  - [ ] Loot drops on victory

- [ ] **Verify Section 6.2:**
  - [ ] NPC raiders spawn in unclaimed areas
  - [ ] Raiders move toward player nodes
  - [ ] Combat triggers when raiders reach node
  - [ ] Defeating raiders drops loot

### 6.3 UI/UX Polish

- [ ] **Tutorial system**
  - [ ] First-time player flow
  - [ ] Claim first node guide
  - [ ] Build first structure guide
  - [ ] Basic combat tutorial

- [ ] **Notifications**
  - [ ] Attack warnings
  - [ ] Construction complete
  - [ ] Research complete
  - [ ] Low resources warning

- [ ] **Visual polish**
  - [ ] Loading screens
  - [ ] Transitions
  - [ ] Sound effects (optional)
  - [ ] Particle effects

- [ ] **Verify Section 6.3:**
  - [ ] New player sees tutorial on first login
  - [ ] Tutorial guides through claiming first node
  - [ ] Notifications appear for key events
  - [ ] Loading screens display during transitions

### 6.4 Testing & Balance

- [ ] **Automated tests**
  - [ ] Unit tests for game logic
  - [ ] API endpoint tests
  - [ ] Integration tests

- [ ] **Manual testing**
  - [ ] Full gameplay loop
  - [ ] Edge cases
  - [ ] Performance testing

- [ ] **Balance pass**
  - [ ] Resource generation rates
  - [ ] Building costs/upkeep
  - [ ] Combat balance
  - [ ] Upkeep sustainability

### 6.5 Documentation

- [ ] **Player documentation**
  - [ ] Getting started guide
  - [ ] Game mechanics overview
  - [ ] FAQ

- [ ] **Developer documentation**
  - [ ] API documentation
  - [ ] Architecture overview
  - [ ] Deployment guide

- [ ] **Verify Section 6.5:**
  - [ ] Player documentation accessible in-game or via link
  - [ ] Getting started guide covers basics
  - [ ] API docs accurate and complete

### Phase 6 Deliverable

✓ MVP ready for alpha testing with core gameplay loop complete

---

## 7. Post-MVP Features

### Priority 1 (Month 4)

- [ ] Corporation system
- [ ] Full player-to-player market
- [ ] Additional unit types (4 more)
- [ ] Additional structure types (4 more)

### Priority 2 (Month 5)

- [ ] Environmental hazard system
- [ ] Item upgrade system
- [ ] More NPC threat types
- [ ] Corporation wars

### Priority 3 (Month 6)

- [ ] Subscription system
- [ ] Advanced research tree
- [ ] Anomaly events
- [ ] Leaderboards

---

## 8. Asset Sources

### Free Asset Packs

- **Kenney.nl** - CC0 licensed game assets
  - Sci-fi UI pack
  - RTS buildings pack
  - Character sprites
- **OpenGameArt.org** - Various licenses
  - Space/sci-fi themes
  - Particle effects
- **itch.io** - Free game assets section
- **Game-icons.net** - CC BY 3.0 icons

### AI Generation

- Unit portraits
- Building illustrations
- Backgrounds
- Icons (with post-processing)

### Style Guide

- Color palette: Deep space blues, industrial grays, accent oranges
- UI: Clean, minimal, sci-fi inspired
- Consistent post-processing filters to unify assets

---

## 8.1 Asset Acquisition Checklist

> Assets should be acquired/created BEFORE the phase that needs them.

### Phase 1 Assets (World & Nodes)

- [ ] **Node graphics**
  - [ ] Hexagon base shape (6 node types × 4 status states)
  - [ ] Node type icons (Outpost, Mining, Factory, Research, Fortress, Capital)
  - [ ] Tier indicators (I, II, III visual markers)
  - [ ] Selection ring / highlight effect
  - [ ] Connection line textures (dirt, paved, highway, hazardous)

- [ ] **Map elements**
  - [ ] Region background textures (6 regions)
  - [ ] Grid overlay pattern
  - [ ] Fog of war texture (if needed)

- [ ] **UI assets**
  - [ ] Node detail panel background
  - [ ] Resource icons (Credits, Iron, Minerals, Energy, Composites, Tech)
  - [ ] Status icons (Neutral, Claimed, Contested, Under Attack)

### Phase 2 Assets (Economy)

- [ ] **Resource visuals**
  - [ ] Resource icons (refined versions for UI)
  - [ ] Storage indicators (empty → full gradient)
  - [ ] Production rate indicators (+/- arrows)

- [ ] **Market UI**
  - [ ] Buy/sell button states
  - [ ] Transaction confirmation modal
  - [ ] Price trend indicators

### Phase 3 Assets (Buildings)

- [ ] **Building sprites** (per category, ~3-5 each)
  - [ ] Defense: Pulse Turret, Missile Battery, Shield Generator, Wall, Trap
  - [ ] Production: Factory, Refinery, Assembler
  - [ ] Storage: Warehouse, Silo
  - [ ] Research: Lab, Data Center
  - [ ] Command: HQ, Barracks

- [ ] **Construction states**
  - [ ] Foundation/scaffolding sprite
  - [ ] Progress bar overlay
  - [ ] Completion particle effect

- [ ] **Building UI**
  - [ ] Category icons
  - [ ] Upgrade arrow indicators
  - [ ] Health bar sprites

### Phase 4 Assets (Combat) - CRITICAL

- [ ] **Unit sprites** (idle, move, attack animations)
  - [ ] Infantry: Marine, Heavy, Medic
  - [ ] Vehicles: Tank, APC, Artillery
  - [ ] Air: Drone, Gunship
  - [ ] Special: Engineer, Commander

- [ ] **Combat effects**
  - [ ] Projectile sprites (bullets, missiles, lasers)
  - [ ] Explosion animations
  - [ ] Shield/barrier effects
  - [ ] Healing/buff indicators
  - [ ] Death/destruction animations

- [ ] **Combat UI**
  - [ ] Unit health bars
  - [ ] Ability icons
  - [ ] Consumable icons
  - [ ] Timer/countdown display
  - [ ] Victory/defeat screens

- [ ] **Battlefield elements**
  - [ ] Spawn point markers
  - [ ] Objective indicators
  - [ ] Range circles
  - [ ] Movement path preview

### Phase 5 Assets (Trading)

- [ ] **Caravan sprites**
  - [ ] Cargo Hauler (light, medium, heavy variants)
  - [ ] Movement animation
  - [ ] Loading/unloading states

- [ ] **Trade route visuals**
  - [ ] Route line style (different from connections)
  - [ ] Progress indicator on route
  - [ ] Danger zone overlay

- [ ] **Interception**
  - [ ] NPC raider sprites
  - [ ] Combat encounter UI

### Phase 6 Assets (Polish)

- [ ] **Research tree**
  - [ ] Tech icons (10-15 technologies)
  - [ ] Tree connection lines
  - [ ] Locked/unlocked states

- [ ] **Tutorial**
  - [ ] Highlight overlays
  - [ ] Arrow/pointer indicators
  - [ ] Tooltip backgrounds

- [ ] **Audio** (stretch goal)
  - [ ] UI click/hover sounds
  - [ ] Combat sound effects
  - [ ] Ambient background music

### Asset Pipeline Notes

1. **Format requirements:**
   - Sprites: PNG with transparency, power-of-2 dimensions preferred
   - Sprite sheets: Use TexturePacker or similar for batching
   - Icons: SVG for UI, PNG for game world

2. **Resolution targets:**
   - Node sprites: 64×64 base, 128×128 for high DPI
   - Building sprites: 32×32 to 64×64 depending on size
   - Unit sprites: 32×32 base with animation frames
   - UI icons: 24×24, 32×32, 48×48 variants

3. **Licensing:**
   - Track all asset sources in `LICENSES.md`
   - Prefer CC0 or MIT licensed assets
   - AI-generated assets: document prompts used

---

## 9. Configuration Files

### Structure Definition Template

```typescript
// packages/shared/src/config/structures.ts
export interface StructureDefinition {
  id: string;
  name: string;
  description: string;
  category: 'defense' | 'production' | 'storage' | 'research' | 'command';
  tier: number;
  cost: Record<string, number>;
  buildTime: number;
  upkeep: number;
  health: number;
  size: { width: number; height: number };
  stats: Record<string, number>;
  abilities?: string[];
  upgradeTo?: string;
  requirements?: {
    research?: string[];
    buildings?: string[];
  };
}
```

### Unit Definition Template

```typescript
// packages/shared/src/config/units.ts
export interface UnitDefinition {
  id: string;
  name: string;
  description: string;
  category: 'infantry' | 'vehicle' | 'mech' | 'specialist';
  tier: number;
  cost: Record<string, number>;
  trainTime: number;
  upkeep: number;
  stats: {
    health: number;
    damage: number;
    armor: 'none' | 'light' | 'medium' | 'heavy';
    speed: number;
    range: number;
    attackSpeed: number;
  };
  abilities?: string[];
  specializations?: string[];
  requirements?: {
    research?: string[];
    buildings?: string[];
  };
}
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/nova_fall

# Redis
REDIS_URL=redis://host:6379

# Auth - Discord
DISCORD_CLIENT_ID=xxx
DISCORD_CLIENT_SECRET=xxx

# Auth - Google
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Session
SESSION_SECRET=xxx

# Server
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://nova-fall.com

# Game Settings
GAME_TICK_INTERVAL=5000
UPKEEP_CHECK_INTERVAL=3600000
ATTACK_PREP_BASE_HOURS=24
ATTACK_PREP_VARIANCE_HOURS=4
COMBAT_WINDOW_MINUTES=30
POST_BATTLE_COOLDOWN_DAYS=3
POST_BATTLE_IMMUNITY_MINUTES=3
```

---

## Quick Reference Commands

```bash
# Development
pnpm dev                    # Run all services in dev mode
pnpm dev:web               # Frontend only
pnpm dev:api               # API only
pnpm dev:worker            # Worker only

# Database
pnpm db:generate           # Generate Prisma client
pnpm db:migrate            # Run migrations
pnpm db:seed               # Seed initial data
pnpm db:studio             # Open Prisma Studio

# Testing
pnpm test                  # Run all tests
pnpm test:unit            # Unit tests only
pnpm test:e2e             # E2E tests

# Build & Deploy
pnpm build                 # Build all packages
pnpm lint                  # Lint all code
pnpm typecheck            # TypeScript check

# Railway
railway up                 # Deploy to Railway
railway logs              # View logs
```

---

## Daily Development Checklist

Before starting:

- [ ] Pull latest changes
- [ ] Check for dependency updates
- [ ] Review current phase tasks

Before committing:

- [ ] Run linter (`pnpm lint`)
- [ ] Run type check (`pnpm typecheck`)
- [ ] Run tests (`pnpm test`)
- [ ] Update documentation if needed

Before deploying:

- [ ] Test locally end-to-end
- [ ] Check environment variables
- [ ] Run database migrations
- [ ] Verify Railway service health

---

_Last Updated: January 2026_
_Version: 1.0.0-MVP_
