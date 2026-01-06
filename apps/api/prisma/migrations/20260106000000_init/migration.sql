-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('MINING', 'REFINERY', 'RESEARCH', 'TRADE_HUB', 'FORTRESS', 'AGRICULTURAL', 'POWER_PLANT', 'CAPITAL');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('NEUTRAL', 'CLAIMED', 'CONTESTED', 'UNDER_ATTACK');

-- CreateEnum
CREATE TYPE "RoadType" AS ENUM ('DIRT', 'PAVED', 'HIGHWAY', 'HAZARDOUS');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('IDLE', 'TRAINING', 'MOVING', 'GARRISON', 'IN_COMBAT', 'ESCORTING');

-- CreateEnum
CREATE TYPE "Veterancy" AS ENUM ('ROOKIE', 'REGULAR', 'VETERAN', 'ELITE', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('PREP_PHASE', 'FORCES_LOCKED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BattleResult" AS ENUM ('ATTACKER_VICTORY', 'DEFENDER_VICTORY', 'DRAW');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CaravanStatus" AS ENUM ('LOADING', 'EN_ROUTE', 'ARRIVED', 'INTERCEPTED', 'DESTROYED');

-- CreateEnum
CREATE TYPE "CorpRank" AS ENUM ('CEO', 'DIRECTOR', 'MANAGER', 'VETERAN', 'ASSOCIATE');

-- CreateEnum
CREATE TYPE "DiplomacyType" AS ENUM ('ALLIANCE', 'NON_AGGRESSION', 'TRADE_AGREEMENT', 'WAR');

-- CreateEnum
CREATE TYPE "ThreatStatus" AS ENUM ('ROAMING', 'ATTACKING', 'RETREATING', 'DEFEATED');

-- CreateEnum
CREATE TYPE "StabilityLevel" AS ENUM ('STABLE', 'UNSTABLE', 'HAZARDOUS', 'EXTREME');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "oauthProvider" TEXT NOT NULL,
    "oauthId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "resources" JSONB NOT NULL DEFAULT '{"credits": 1000, "iron": 100, "energy": 50}',
    "research" JSONB NOT NULL DEFAULT '[]',
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "totalNodes" INTEGER NOT NULL DEFAULT 0,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "regionId" TEXT,
    "ownerId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "storage" JSONB NOT NULL DEFAULT '{}',
    "upkeepPaid" TIMESTAMP(3),
    "upkeepDue" TIMESTAMP(3),
    "status" "NodeStatus" NOT NULL DEFAULT 'NEUTRAL',
    "lastAttackedAt" TIMESTAMP(3),
    "attackCooldownUntil" TIMESTAMP(3),
    "attackImmunityUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corpId" TEXT,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeConnection" (
    "id" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,
    "dangerLevel" INTEGER NOT NULL DEFAULT 0,
    "roadType" "RoadType" NOT NULL DEFAULT 'DIRT',

    CONSTRAINT "NodeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "health" INTEGER NOT NULL,
    "maxHealth" INTEGER NOT NULL,
    "gridX" INTEGER NOT NULL,
    "gridY" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConstructing" BOOLEAN NOT NULL DEFAULT false,
    "constructionEnd" TIMESTAMP(3),
    "productionQueue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeId" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT,
    "health" INTEGER NOT NULL,
    "maxHealth" INTEGER NOT NULL,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "veterancy" "Veterancy" NOT NULL DEFAULT 'ROOKIE',
    "status" "UnitStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playerId" TEXT NOT NULL,
    "nodeId" TEXT,
    "caravanId" TEXT,
    "equipment" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "baseStats" JSONB NOT NULL,
    "upgrades" JSONB NOT NULL DEFAULT '[]',
    "upgradeSlots" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "nodeStorageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battle" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT,
    "originNodeId" TEXT NOT NULL,
    "attackForce" JSONB NOT NULL,
    "defenseState" JSONB NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prepEndsAt" TIMESTAMP(3) NOT NULL,
    "forcesLockedAt" TIMESTAMP(3),
    "combatStartedAt" TIMESTAMP(3),
    "combatEndsAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "status" "BattleStatus" NOT NULL DEFAULT 'PREP_PHASE',
    "result" "BattleResult",
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerUnit" INTEGER NOT NULL,
    "filledQty" INTEGER NOT NULL DEFAULT 0,
    "playerId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caravan" (
    "id" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "cargo" JSONB NOT NULL,
    "capacity" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "currentNodeId" TEXT,
    "route" JSONB NOT NULL,
    "routeProgress" INTEGER NOT NULL DEFAULT 0,
    "edgeProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CaravanStatus" NOT NULL DEFAULT 'LOADING',
    "departedAt" TIMESTAMP(3),
    "estimatedArrival" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caravan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchQueue" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "techId" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corporation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "bank" JSONB NOT NULL DEFAULT '{"credits": 0}',
    "influence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Corporation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpMember" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "corpId" TEXT NOT NULL,
    "rank" "CorpRank" NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "contribution" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorpMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpDiplomacy" (
    "id" TEXT NOT NULL,
    "sourceCorpId" TEXT NOT NULL,
    "targetCorpId" TEXT NOT NULL,
    "type" "DiplomacyType" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorpDiplomacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NPCThreat" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "health" INTEGER NOT NULL,
    "maxHealth" INTEGER NOT NULL,
    "currentNodeId" TEXT,
    "targetNodeId" TEXT,
    "behavior" JSONB NOT NULL,
    "route" JSONB,
    "lootTable" JSONB NOT NULL,
    "spawnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "ThreatStatus" NOT NULL DEFAULT 'ROAMING',

    CONSTRAINT "NPCThreat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "stability" "StabilityLevel" NOT NULL DEFAULT 'STABLE',
    "activeEvent" TEXT,
    "eventEndsAt" TIMESTAMP(3),
    "upkeepMod" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "nextChangeAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_oauthProvider_oauthId_idx" ON "User"("oauthProvider", "oauthId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE INDEX "Node_ownerId_idx" ON "Node"("ownerId");

-- CreateIndex
CREATE INDEX "Node_type_idx" ON "Node"("type");

-- CreateIndex
CREATE INDEX "Node_regionId_idx" ON "Node"("regionId");

-- CreateIndex
CREATE INDEX "NodeConnection_fromNodeId_idx" ON "NodeConnection"("fromNodeId");

-- CreateIndex
CREATE INDEX "NodeConnection_toNodeId_idx" ON "NodeConnection"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeConnection_fromNodeId_toNodeId_key" ON "NodeConnection"("fromNodeId", "toNodeId");

-- CreateIndex
CREATE INDEX "Building_nodeId_idx" ON "Building"("nodeId");

-- CreateIndex
CREATE INDEX "Building_typeId_idx" ON "Building"("typeId");

-- CreateIndex
CREATE INDEX "Unit_playerId_idx" ON "Unit"("playerId");

-- CreateIndex
CREATE INDEX "Unit_nodeId_idx" ON "Unit"("nodeId");

-- CreateIndex
CREATE INDEX "Unit_typeId_idx" ON "Unit"("typeId");

-- CreateIndex
CREATE INDEX "Item_playerId_idx" ON "Item"("playerId");

-- CreateIndex
CREATE INDEX "Item_typeId_idx" ON "Item"("typeId");

-- CreateIndex
CREATE INDEX "Battle_nodeId_idx" ON "Battle"("nodeId");

-- CreateIndex
CREATE INDEX "Battle_attackerId_idx" ON "Battle"("attackerId");

-- CreateIndex
CREATE INDEX "Battle_defenderId_idx" ON "Battle"("defenderId");

-- CreateIndex
CREATE INDEX "Battle_status_idx" ON "Battle"("status");

-- CreateIndex
CREATE INDEX "Battle_prepEndsAt_idx" ON "Battle"("prepEndsAt");

-- CreateIndex
CREATE INDEX "MarketOrder_playerId_idx" ON "MarketOrder"("playerId");

-- CreateIndex
CREATE INDEX "MarketOrder_nodeId_idx" ON "MarketOrder"("nodeId");

-- CreateIndex
CREATE INDEX "MarketOrder_resourceType_idx" ON "MarketOrder"("resourceType");

-- CreateIndex
CREATE INDEX "MarketOrder_status_idx" ON "MarketOrder"("status");

-- CreateIndex
CREATE INDEX "Caravan_playerId_idx" ON "Caravan"("playerId");

-- CreateIndex
CREATE INDEX "Caravan_status_idx" ON "Caravan"("status");

-- CreateIndex
CREATE INDEX "ResearchQueue_playerId_idx" ON "ResearchQueue"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Corporation_name_key" ON "Corporation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Corporation_tag_key" ON "Corporation"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "CorpMember_playerId_key" ON "CorpMember"("playerId");

-- CreateIndex
CREATE INDEX "CorpMember_corpId_idx" ON "CorpMember"("corpId");

-- CreateIndex
CREATE UNIQUE INDEX "CorpDiplomacy_sourceCorpId_targetCorpId_key" ON "CorpDiplomacy"("sourceCorpId", "targetCorpId");

-- CreateIndex
CREATE INDEX "NPCThreat_currentNodeId_idx" ON "NPCThreat"("currentNodeId");

-- CreateIndex
CREATE INDEX "NPCThreat_status_idx" ON "NPCThreat"("status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corporation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeConnection" ADD CONSTRAINT "NodeConnection_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeConnection" ADD CONSTRAINT "NodeConnection_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_caravanId_fkey" FOREIGN KEY ("caravanId") REFERENCES "Caravan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caravan" ADD CONSTRAINT "Caravan_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caravan" ADD CONSTRAINT "Caravan_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caravan" ADD CONSTRAINT "Caravan_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caravan" ADD CONSTRAINT "Caravan_currentNodeId_fkey" FOREIGN KEY ("currentNodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueue" ADD CONSTRAINT "ResearchQueue_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpMember" ADD CONSTRAINT "CorpMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpMember" ADD CONSTRAINT "CorpMember_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corporation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpDiplomacy" ADD CONSTRAINT "CorpDiplomacy_sourceCorpId_fkey" FOREIGN KEY ("sourceCorpId") REFERENCES "Corporation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpDiplomacy" ADD CONSTRAINT "CorpDiplomacy_targetCorpId_fkey" FOREIGN KEY ("targetCorpId") REFERENCES "Corporation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
