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

- [~] **Claiming mechanics** (partially implemented via POST /nodes/:id/claim)
  - [x] Validate player can claim
  - [x] Check node is neutral
  - [x] Check adjacency requirement
  - [~] Deduct claiming cost (TODO - skipped for MVP testing)
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

- [~] **Verify Section 2.2:**
  - [ ] Worker starts and runs tick job every 5 seconds
  - [ ] Owned node generates resources over time
  - [ ] Resource generation appears in node storage
  - [ ] WebSocket pushes update to connected clients

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

- [ ] **Verify Section 2.3:**
  - [ ] Upkeep deducts from player credits hourly
  - [ ] Distance from HQ increases upkeep cost
  - [ ] UI shows upkeep breakdown per node
  - [ ] Warning appears when credits low
  - [ ] Node enters decay state when upkeep unpaid

### 2.4 Basic Market

- [ ] **NPC market**
  - [ ] Fixed buy/sell prices
  - [ ] Available at any owned node
  - [ ] 15% fee on transactions

- [ ] **Market UI**
  - [ ] Resource list with prices
  - [ ] Buy/sell interface
  - [ ] Transaction confirmation
  - [ ] History log

- [ ] **API endpoints**
  - [ ] `GET /market/prices` - Current prices
  - [ ] `POST /market/buy` - Buy resources
  - [ ] `POST /market/sell` - Sell resources

- [ ] **Verify Section 2.4:**
  - [ ] Market UI shows resource prices
  - [ ] Buy resources → credits decrease, resource increases
  - [ ] Sell resources → resource decreases, credits increase
  - [ ] 15% transaction fee applied correctly
  - [ ] Cannot buy more than can afford

### 2.5 Resource Transfer

- [ ] **Node-to-node transfer**
  - [ ] Only between adjacent nodes
  - [ ] Transfer time based on distance
  - [ ] Cancel in-progress transfers

- [ ] **UI for transfers**
  - [ ] Select source/destination
  - [ ] Choose resources and amounts
  - [ ] View pending transfers

- [ ] **Verify Section 2.5:**
  - [ ] Transfer resources between two adjacent owned nodes
  - [ ] Transfer shows in pending list with ETA
  - [ ] Resources arrive at destination after transfer time
  - [ ] Cannot transfer to non-adjacent node
  - [ ] Can cancel pending transfer

### Phase 2 Deliverable

✓ Nodes generate resources, upkeep costs money, basic trading works

---

## Phase 3: Buildings & Construction (Week 7-8)

### 3.1 Building Configuration

- [ ] **Define building types**

  ```typescript
  // packages/shared/src/config/structures.ts
  export const STRUCTURES = {
    pulse_turret: {
      id: 'pulse_turret',
      name: 'Pulse Turret',
      category: 'defense',
      tier: 1,
      cost: { credits: 500, iron: 100 },
      buildTime: 300, // seconds
      upkeep: 5, // credits/hour
      health: 100,
      stats: { damage: 10, range: 3, attackSpeed: 1.0 },
      size: { width: 1, height: 1 },
    },
    // ... more structures
  };
  ```

- [ ] **Building categories**
  - [ ] Defense (turrets, walls, traps)
  - [ ] Production (factories, refineries)
  - [ ] Storage (warehouses)
  - [ ] Research (labs)
  - [ ] Command (HQ, barracks)

- [ ] **Verify Section 3.1:**
  - [ ] Building config loads correctly (check one from each category)
  - [ ] Building stats match config values
  - [ ] Tier requirements enforced

### 3.2 Node Grid System

- [ ] **Grid implementation**
  - [ ] Define grid size per node type
  - [ ] Coordinate system (0,0 to N,N)
  - [ ] Collision detection for placement

- [ ] **Grid rendering**
  - [ ] Show grid at zoom level 3
  - [ ] Highlight valid placements
  - [ ] Show occupied cells
  - [ ] Preview building on hover

- [ ] **Verify Section 3.2:**
  - [ ] Zoom to level 3 on owned node → grid visible
  - [ ] Valid placement cells highlighted green
  - [ ] Occupied cells show existing buildings
  - [ ] Hover shows building preview at cursor

### 3.3 Construction System

- [ ] **Build queue**
  - [ ] One active construction per node
  - [ ] Queue additional constructions
  - [ ] Cancel queued items

- [ ] **Construction process**
  - [ ] Validate requirements (tech, resources)
  - [ ] Reserve grid space
  - [ ] Deduct resources
  - [ ] Create building in CONSTRUCTING state
  - [ ] Set completion time

- [ ] **Construction worker job**
  - [ ] Check for completed constructions
  - [ ] Update building status
  - [ ] Emit completion events

- [ ] **API endpoints**
  - [ ] `GET /nodes/:id/buildings` - List buildings
  - [ ] `POST /nodes/:id/buildings` - Start construction
  - [ ] `DELETE /buildings/:id` - Demolish
  - [ ] `POST /buildings/:id/cancel` - Cancel construction

- [ ] **Verify Section 3.3:**
  - [ ] Start building construction → resources deducted
  - [ ] Building appears in CONSTRUCTING state on grid
  - [ ] Progress timer counts down
  - [ ] Building completes and becomes active
  - [ ] Queue second building while first constructs

### 3.4 Building UI

- [ ] **Building placement mode**
  - [ ] Enter placement mode from menu
  - [ ] Show buildable area
  - [ ] Snap to grid
  - [ ] Confirm/cancel buttons

- [ ] **Building info panel**
  - [ ] Stats display
  - [ ] Health bar
  - [ ] Upgrade options
  - [ ] Demolish button

- [ ] **Construction progress**
  - [ ] Progress bar on building
  - [ ] Time remaining
  - [ ] Queue display

- [ ] **Verify Section 3.4:**
  - [ ] Click build button → placement mode activates
  - [ ] Place building on valid cell → construction starts
  - [ ] Click existing building → info panel shows stats
  - [ ] Demolish button removes building
  - [ ] Construction progress bar updates in real-time

### 3.5 Building Effects

- [ ] **Defense buildings**
  - [ ] Auto-targeting system (for combat)
  - [ ] Range visualization
  - [ ] Damage calculation

- [ ] **Production buildings**
  - [ ] Add to node production rate
  - [ ] Crafting queue (basic)

- [ ] **Storage buildings**
  - [ ] Increase node capacity

- [ ] **Verify Section 3.5:**
  - [ ] Defense building shows range circle when selected
  - [ ] Production building adds to node resource generation
  - [ ] Storage building increases node storage capacity
  - [ ] Building upkeep added to node upkeep cost

### Phase 3 Deliverable

✓ Players can construct buildings, see them on the map, buildings affect gameplay

---

## Phase 4: Combat System (Week 9-11)

### 4.1 Unit Configuration

- [ ] **Define unit types**
  ```typescript
  // packages/shared/src/config/units.ts
  export const UNITS = {
    marine: {
      id: 'marine',
      name: 'Marine',
      category: 'infantry',
      tier: 1,
      cost: { credits: 100, iron: 20 },
      trainTime: 60, // seconds
      upkeep: 2, // credits/hour
      stats: {
        health: 50,
        damage: 5,
        armor: 'light',
        speed: 1.0,
        range: 1,
      },
    },
    // ... more units
  };
  ```

- [ ] **Verify Section 4.1:**
  - [ ] Unit config loads correctly
  - [ ] Unit stats accessible from shared package
  - [ ] Multiple unit types defined (infantry, vehicle, etc.)

### 4.2 Unit Recruitment

- [ ] **Barracks building**
  - [ ] Required for recruitment
  - [ ] Training queue
  - [ ] Concurrent training slots

- [ ] **Recruitment process**
  - [ ] Validate requirements
  - [ ] Deduct costs
  - [ ] Add to training queue
  - [ ] Create unit on completion

- [ ] **Unit management UI**
  - [ ] Unit list per node
  - [ ] Training queue display
  - [ ] Unit details panel
  - [ ] Disband option

- [ ] **Verify Section 4.2:**
  - [ ] Build barracks at owned node
  - [ ] Recruit unit → resources deducted, training starts
  - [ ] Training timer counts down
  - [ ] Unit appears in garrison when complete
  - [ ] Disband unit → unit removed

### 4.3 Unit Movement

- [ ] **Movement orders**
  - [ ] Select units
  - [ ] Choose destination node
  - [ ] Calculate route (shortest path)
  - [ ] Calculate travel time

- [ ] **Movement execution**
  - [ ] Update unit status
  - [ ] Track position along route
  - [ ] Handle arrival

- [ ] **Movement UI**
  - [ ] Show moving units on map
  - [ ] Movement indicators
  - [ ] ETA display
  - [ ] Cancel movement

- [ ] **Verify Section 4.3:**
  - [ ] Select units and order move to adjacent owned node
  - [ ] Units show as moving on map
  - [ ] ETA displays correctly
  - [ ] Units arrive at destination after travel time
  - [ ] Cancel movement returns units to origin

### 4.4 Battle System - Phases

#### Attack Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ATTACK TIMELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INITIATION ──► PREPARATION MODE ──► COMBAT MODE ──► RESOLUTION ──► COOLDOWN│
│      │              (20-28 hours)      (~30 min)         │         (3 days) │
│      │                   │                │              │            │     │
│      │         Both sides prepare    Real-time TD    Winner         No new  │
│      │         Move units, upgrade   Attacker has    determined     player  │
│      │         Position defenses     time limit      Units move     attacks │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- [ ] **Attack initiation**
  - [ ] Select attacking units at staging node
  - [ ] Choose target node (must be reachable)
  - [ ] Validate attack is possible (not on cooldown, valid path)
  - [ ] Generate random prep time (24h ± 4h = 20-28 hours)
  - [ ] Create Battle record with PREP_PHASE status
  - [ ] Notify defender immediately
  - [ ] Both players see countdown timer

- [ ] **Preparation Mode (20-28 hours)**
  - [ ] Attacker can:
    - [ ] Add/remove units from attack force
    - [ ] Assign consumable items
    - [ ] View defender's visible defenses
    - [ ] Cancel attack (forfeit deposit if any)
  - [ ] Defender can:
    - [ ] Move garrison units from other nodes
    - [ ] Build/upgrade defenses (if time permits)
    - [ ] Position defensive structures
    - [ ] Assign consumable items
    - [ ] Request corporation reinforcements
  - [ ] Countdown timer visible to both
  - [ ] Final 1 hour: Forces locked, no changes allowed

- [ ] **Combat Mode Transition**
  - [ ] Automatic transition when prep timer ends
  - [ ] Snapshot attack force and defense state
  - [ ] Start 30-minute combat window timer
  - [ ] Switch both players to tactical view (if online)
  - [ ] Begin real-time simulation

- [ ] **Verify Section 4.4:**
  - [ ] Initiate attack on enemy node → Battle created with PREP_PHASE
  - [ ] Prep timer shows 20-28 hour countdown
  - [ ] Defender receives notification immediately
  - [ ] Both sides can modify forces during prep
  - [ ] Forces lock 1 hour before combat (no more changes)
  - [ ] Combat mode starts automatically when timer ends

### 4.5 Battle System - Execution

- [ ] **Combat view (PixiJS)**
  - [ ] Switch to zoom level 4
  - [ ] Render node defense layout
  - [ ] Show spawn points
  - [ ] Unit sprites
  - [ ] Health bars

- [ ] **Real-time simulation**
  - [ ] Server-authoritative with client prediction
  - [ ] 60ms tick rate during combat
  - [ ] State synchronization via WebSocket

- [ ] **Attacker mechanics**
  - [ ] Unit deployment from spawn points
  - [ ] Pathfinding to objectives
  - [ ] Auto-attack nearest enemy
  - [ ] Player can issue move/attack commands

- [ ] **Defender mechanics**
  - [ ] Tower auto-targeting
  - [ ] Player can override targets
  - [ ] Garrison unit deployment
  - [ ] Trap activation

- [ ] **Verify Section 4.5:**
  - [ ] Combat view renders with defense layout
  - [ ] Attacker units spawn and move toward objective
  - [ ] Defender towers auto-target attackers
  - [ ] Units take damage and health bars update
  - [ ] State syncs between server and clients

### 4.6 Combat Actions

- [ ] **Attacker actions**
  - [ ] Deploy unit (from reserve)
  - [ ] Move unit to position
  - [ ] Attack specific target
  - [ ] Use ability
  - [ ] Use consumable item
  - [ ] Retreat (withdraw forces)

- [ ] **Defender actions**
  - [ ] Retarget tower
  - [ ] Activate trap
  - [ ] Deploy garrison unit
  - [ ] Use consumable item
  - [ ] Emergency repairs

- [ ] **Combat consumables**
  - [ ] EMP bomb (disable electronics)
  - [ ] Repair drone (heal units/buildings)
  - [ ] Shield booster (temp defense)
  - [ ] Rally flag (buff nearby units)

- [ ] **Verify Section 4.6:**
  - [ ] Attacker can deploy units from reserve
  - [ ] Attacker can issue move/attack commands
  - [ ] Defender can retarget towers
  - [ ] Consumable items can be activated
  - [ ] Actions execute in real-time

### 4.7 Battle Resolution

- [ ] **Victory conditions**
  - [ ] Attacker Victory: Destroy Command Center within time limit
  - [ ] Defender Victory: Timer expires (30 min) OR all attackers destroyed

- [ ] **Time limit enforcement**
  - [ ] 30-minute combat window
  - [ ] Warnings at 10 min, 5 min, 2 min, 1 min, 30 sec
  - [ ] Auto-resolve at timeout (defender wins)

- [ ] **Attack Failed (Defender Wins)**
  - [ ] All surviving attack units auto-withdraw to origin node
  - [ ] Attacker receives casualty report
  - [ ] Defender units remain in place
  - [ ] Node enters 3-minute attack immunity (brief cooldown)
  - [ ] Node then enters 3-day player attack cooldown
  - [ ] NPC attacks still possible during cooldown

- [ ] **Attack Succeeded (Attacker Wins)**
  - [ ] All surviving defending mobile units withdraw to random adjacent friendly node
    - [ ] If no adjacent friendly node, units are captured/destroyed
  - [ ] All infrastructure (buildings) transfers to attacker ownership
  - [ ] Node ownership transfers to attacker
  - [ ] Attacker's surviving units become garrison
  - [ ] Node storage contents transfer to attacker
  - [ ] Node enters 3-minute attack immunity
  - [ ] Node then enters 3-day player attack cooldown

- [ ] **Post-Battle Processing**
  - [ ] Calculate and award experience to surviving units
  - [ ] Generate battle report for both players
  - [ ] Update player statistics
  - [ ] Trigger corporation notifications if applicable
  - [ ] Store battle log for replay (stretch goal)

- [ ] **Cooldown System**
  - [ ] Track `lastAttackedAt` timestamp on node
  - [ ] Track `attackCooldownUntil` timestamp (3 days from resolution)
  - [ ] Validate cooldown before allowing new player attacks
  - [ ] Display cooldown timer in node info panel
  - [ ] NPC attacks bypass player cooldown

- [ ] **Verify Section 4.7:**
  - [ ] Attacker destroys Command Center → attacker wins
  - [ ] Timer expires with Command Center intact → defender wins
  - [ ] Winner determined correctly, node ownership transfers if attacker wins
  - [ ] Surviving defender units retreat to adjacent node
  - [ ] 3-day cooldown applies to node after battle

### 4.8 Absent Player AI

- [ ] **Attacker AI (if absent)**
  - [ ] Deploy all units gradually
  - [ ] Basic pathfinding to objective
  - [ ] No ability usage
  - [ ] No consumable usage

- [ ] **Defender AI (if absent)**
  - [ ] Tower auto-target: nearest
  - [ ] Deploy garrison automatically
  - [ ] No manual interventions

- [ ] **Verify Section 4.8:**
  - [ ] Battle proceeds when attacker is offline (AI deploys units)
  - [ ] Battle proceeds when defender is offline (AI manages defense)
  - [ ] Battle resolves correctly with no human intervention

### Phase 4 Deliverable

✓ Full combat loop works: schedule attack, real-time battle, resolution

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
