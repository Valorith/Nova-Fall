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
15. [Configuration Files](#9-configuration-files)

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
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Vue 3 | ^3.4 |
| Language | TypeScript | ^5.3 |
| Build Tool | Vite | ^5.0 |
| State Management | Pinia | ^2.1 |
| Game Renderer | PixiJS | ^8.0 |
| HTTP Client | Axios | ^1.6 |
| WebSocket | Socket.io-client | ^4.7 |

### Backend
| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | ^20 LTS |
| Framework | Fastify | ^4.25 |
| Language | TypeScript | ^5.3 |
| ORM | Prisma | ^5.8 |
| Database | PostgreSQL | 16 |
| Cache | Redis | 7 |
| WebSocket | Socket.io | ^4.7 |
| Job Queue | BullMQ | ^5.1 |
| Auth | Passport.js | ^0.7 |

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

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 0 | Week 1-2 | Foundation, Auth, Infrastructure |
| Phase 1 | Week 3-4 | World Map, Nodes, Zoom Levels |
| Phase 2 | Week 5-6 | Economy, Resources, Upkeep |
| Phase 3 | Week 7-8 | Buildings, Construction |
| Phase 4 | Week 9-11 | Combat System |
| Phase 5 | Week 12 | Trading, Caravans |
| Phase 6 | Week 13 | Polish, Testing, MVP Launch |

---

## Phase 0: Foundation (Week 1-2)

### 0.1 Project Setup

- [ ] **Initialize monorepo with pnpm workspaces**
  ```bash
  mkdir nova-fall && cd nova-fall
  pnpm init
  # Create pnpm-workspace.yaml
  ```

- [ ] **Create workspace structure**
  - [ ] `apps/web` - Vue 3 frontend
  - [ ] `apps/api` - Fastify backend
  - [ ] `apps/ws-server` - WebSocket server
  - [ ] `apps/worker` - Game worker
  - [ ] `packages/shared` - Shared types/constants
  - [ ] `packages/game-logic` - Core game logic

- [ ] **Configure TypeScript**
  - [ ] Create `tsconfig.base.json` with strict settings
  - [ ] Configure path aliases for packages
  - [ ] Set up incremental builds

- [ ] **Configure ESLint & Prettier**
  - [ ] Shared config for all packages
  - [ ] Vue-specific rules
  - [ ] Pre-commit hooks with husky

### 0.2 Frontend Setup (apps/web)

- [ ] **Initialize Vue 3 project**
  ```bash
  cd apps/web
  pnpm create vite . --template vue-ts
  ```

- [ ] **Install core dependencies**
  - [ ] Vue Router
  - [ ] Pinia
  - [ ] PixiJS
  - [ ] Socket.io-client
  - [ ] Axios
  - [ ] TailwindCSS

- [ ] **Configure Vite**
  - [ ] Proxy API requests in dev
  - [ ] Environment variables
  - [ ] Build optimization

- [ ] **Create base layout**
  - [ ] App shell with navigation
  - [ ] Loading states
  - [ ] Error boundaries

### 0.3 Backend Setup (apps/api)

- [ ] **Initialize Fastify project**
  ```bash
  cd apps/api
  pnpm init
  pnpm add fastify @fastify/cors @fastify/cookie @fastify/session
  ```

- [ ] **Configure Prisma**
  - [ ] Initialize Prisma
  - [ ] Create initial schema
  - [ ] Configure PostgreSQL connection
  - [ ] Create initial migration

- [ ] **Set up project structure**
  - [ ] Module-based architecture
  - [ ] Shared plugins
  - [ ] Error handling
  - [ ] Logging (pino)

### 0.4 Authentication

- [ ] **Implement OAuth2 with Discord**
  - [ ] Register Discord application at discord.com/developers
  - [ ] Configure Passport.js Discord strategy
  - [ ] Create `/auth/discord` route
  - [ ] Create `/auth/discord/callback` route
  - [ ] Handle token exchange

- [ ] **Implement OAuth2 with Google**
  - [ ] Register Google application at console.cloud.google.com
  - [ ] Configure Passport.js Google strategy
  - [ ] Create `/auth/google` route
  - [ ] Create `/auth/google/callback` route
  - [ ] Handle token exchange

- [ ] **Unified auth handling**
  - [ ] Abstract provider-specific logic
  - [ ] Support account linking (same email = same account)
  - [ ] Handle provider-specific profile data

- [ ] **Session management**
  - [ ] Redis-based sessions
  - [ ] JWT for API access
  - [ ] Refresh token rotation
  - [ ] Session invalidation

- [ ] **User creation flow**
  - [ ] Create User on first login
  - [ ] Create associated Player
  - [ ] Initial resource allocation (1000 Credits, 100 Iron, 50 Energy)
  - [ ] Username selection screen

- [ ] **Frontend auth integration**
  - [ ] Login page with Discord + Google buttons
  - [ ] Auth state store (Pinia)
  - [ ] Route guards
  - [ ] Token refresh logic

### 0.5 Railway Deployment

- [ ] **Create Railway project**
  - [ ] Link GitHub repository
  - [ ] Configure services

- [ ] **Deploy PostgreSQL**
  - [ ] Create database service
  - [ ] Configure connection pooling
  - [ ] Set up backups

- [ ] **Deploy Redis**
  - [ ] Create Redis service
  - [ ] Configure memory limits

- [ ] **Deploy API server**
  - [ ] Configure build command
  - [ ] Set environment variables
  - [ ] Configure domain/SSL

- [ ] **Configure CI/CD**
  - [ ] GitHub Actions workflow
  - [ ] Run tests before deploy
  - [ ] Database migrations on deploy

### Phase 0 Deliverable
✓ User can log in with Discord, account persists, basic dashboard visible

---

## Phase 1: World & Nodes (Week 3-4)

### 1.1 World Map Data

- [ ] **Define map configuration**
  - [ ] Node type definitions in `packages/shared`
  - [ ] Map seed data structure
  - [ ] Region definitions

- [ ] **Create initial map**
  - [ ] Design 100 node map (hybrid: procedural regions + hand-crafted key locations)
  - [ ] Define node positions (spread across map regions)
  - [ ] Create node connections (average 3-4 connections per node)
  - [ ] Assign node types (balanced distribution)
  - [ ] Set initial resources per node type
  - [ ] Define 5-8 distinct regions for environmental zones
  - [ ] Place key locations (central trade hub, resource-rich areas, chokepoints)

- [ ] **Seed database**
  - [ ] Create seed script
  - [ ] Insert nodes
  - [ ] Insert connections
  - [ ] Insert environment zones

### 1.2 PixiJS Integration

- [ ] **Set up game engine**
  - [ ] Create `GameEngine` class
  - [ ] Initialize PixiJS application
  - [ ] Handle canvas resize
  - [ ] Set up render loop

- [ ] **Create camera system**
  - [ ] Pan controls (drag)
  - [ ] Zoom controls (wheel, pinch)
  - [ ] Smooth interpolation
  - [ ] Bounds limiting

- [ ] **Implement zoom levels**
  - [ ] Level 1: Strategic (all nodes visible)
  - [ ] Level 2: Regional (node clusters)
  - [ ] Level 3: Node detail (building grid)
  - [ ] Level 4: Combat (battle view) - placeholder
  - [ ] Automatic level switching on zoom

### 1.3 Map Rendering

- [ ] **Create render layers**
  - [ ] Background layer
  - [ ] Connection lines layer
  - [ ] Node icons layer
  - [ ] UI overlay layer

- [ ] **Render node connections**
  - [ ] Line rendering with road types
  - [ ] Danger level coloring
  - [ ] Distance labels

- [ ] **Render nodes**
  - [ ] Node type icons
  - [ ] Ownership colors
  - [ ] Status indicators
  - [ ] Name labels

- [ ] **Implement culling**
  - [ ] Only render visible elements
  - [ ] LOD system for zoom levels
  - [ ] Object pooling

### 1.4 Node Interaction

- [ ] **Click handling**
  - [ ] Node selection
  - [ ] Deselection
  - [ ] Multi-select (shift-click)

- [ ] **Node detail panel (Vue)**
  - [ ] Basic info display
  - [ ] Resource storage
  - [ ] Building list (placeholder)
  - [ ] Garrison list (placeholder)

- [ ] **API endpoints**
  - [ ] `GET /nodes` - List all nodes (paginated)
  - [ ] `GET /nodes/:id` - Node details
  - [ ] `GET /nodes/:id/connections` - Adjacent nodes
  - [ ] `POST /nodes/:id/claim` - Claim neutral node

- [ ] **Real-time updates**
  - [ ] WebSocket connection setup
  - [ ] Subscribe to node changes
  - [ ] Update local state
  - [ ] Visual change indicators

### 1.5 Node Claiming

- [ ] **Claiming mechanics**
  - [ ] Validate player can claim
  - [ ] Check node is neutral
  - [ ] Check adjacency requirement
  - [ ] Deduct claiming cost
  - [ ] Update ownership

- [ ] **HQ placement**
  - [ ] First node becomes HQ
  - [ ] Special HQ rules
  - [ ] Cannot be abandoned

### Phase 1 Deliverable
✓ Players can view world map, zoom in/out, claim initial territory

---

## Phase 2: Economy & Resources (Week 5-6)

### 2.1 Resource System

- [ ] **Define resource types**
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

- [ ] **Player resource storage**
  - [ ] Global inventory (JSON field)
  - [ ] Helper methods for add/subtract
  - [ ] Validation (non-negative)

- [ ] **Node storage**
  - [ ] Per-node storage capacity
  - [ ] Storage buildings increase cap
  - [ ] Overflow prevention

### 2.2 Game Tick System

- [ ] **Set up BullMQ worker**
  - [ ] Configure Redis connection
  - [ ] Create repeating job (5-second tick)
  - [ ] Job processing with error handling

- [ ] **Resource generation**
  - [ ] Calculate per-node production
  - [ ] Apply research bonuses
  - [ ] Add to node storage
  - [ ] Emit updates via WebSocket

- [ ] **Batch processing**
  - [ ] Process all nodes efficiently
  - [ ] Use database transactions
  - [ ] Minimize queries

### 2.3 Upkeep System

- [ ] **Calculate upkeep costs**
  ```typescript
  function calculateUpkeep(node: Node, player: Player): number {
    const baseCost = NODE_BASE_UPKEEP[node.type];
    const distanceMod = 1 + (0.15 * getDistanceFromHQ(node, player));
    const buildingMod = sumBuildingUpkeep(node.buildings);
    return Math.floor(baseCost * distanceMod * buildingMod);
  }
  ```

- [ ] **Upkeep deduction job**
  - [ ] Run hourly
  - [ ] Calculate per-node costs
  - [ ] Deduct from player credits
  - [ ] Track payment status

- [ ] **Failure consequences**
  - [ ] Warning phase (12h)
  - [ ] Decay phase (12-36h)
  - [ ] Collapse phase (36-48h)
  - [ ] Abandonment (48h+)

- [ ] **UI indicators**
  - [ ] Upkeep summary panel
  - [ ] Per-node cost display
  - [ ] Warning alerts
  - [ ] Projected runway

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

### 2.5 Resource Transfer

- [ ] **Node-to-node transfer**
  - [ ] Only between adjacent nodes
  - [ ] Transfer time based on distance
  - [ ] Cancel in-progress transfers

- [ ] **UI for transfers**
  - [ ] Select source/destination
  - [ ] Choose resources and amounts
  - [ ] View pending transfers

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

### 5.3 Interception

- [ ] **NPC raiders**
  - [ ] Random encounter chance based on route danger
  - [ ] Mini-combat or auto-resolve
  - [ ] Escorts reduce risk

- [ ] **Arrival handling**
  - [ ] Unload cargo to destination storage
  - [ ] Return vehicle to pool
  - [ ] Release escorts

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

### 6.2 NPC Threats (Basic)

- [ ] **Raider spawning**
  - [ ] Periodic spawn in unclaimed areas
  - [ ] Target nearby player nodes
  - [ ] Simple attack behavior

- [ ] **Raider combat**
  - [ ] Use existing combat system
  - [ ] AI-controlled attacker
  - [ ] Loot drops on victory

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

*Last Updated: January 2026*
*Version: 1.0.0-MVP*
