# NOVA FALL

## Game Design Document

**Version:** 1.0  
**Last Updated:** January 2025  
**Status:** Pre-Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Setting & Theme](#2-setting--theme)
3. [World Structure & Node System](#3-world-structure--node-system)
4. [Combat System](#4-combat-system)
5. [Economy & Trading System](#5-economy--trading-system)
6. [Progression Systems](#6-progression-systems)
7. [Corporation System](#7-corporation-system)
8. [NPC Threats & Environmental Hazards](#8-npc-threats--environmental-hazards)
9. [Monetization Model](#9-monetization-model)
10. [Technical Architecture](#10-technical-architecture)
11. [Extensibility Architecture](#11-extensibility-architecture)
12. [MVP Scope Definition](#12-mvp-scope-definition)

---

## 1. Executive Summary

Nova Fall is a browser-based multiplayer territory control game set on a newly colonized planet. Players establish outposts, build defenses, research technologies, manage economies, and compete for territorial dominance. The game combines real-time tower defense mechanics with strategic empire building, featuring a unique twist where players can both defend their territories and launch attacks against others.

### 1.1 Core Game Loop

1. Claim and develop territory nodes across the planetary surface
2. Build defensive structures and production facilities
3. Research technologies to unlock advanced units and buildings
4. Train military units and form attack forces
5. Trade resources across the map using transport vehicles
6. Defend against NPC threats and player attacks
7. Join corporations for collective benefits and large-scale warfare

### 1.2 Key Differentiators

| Feature                    | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| **Hybrid Combat System**   | Real-time tower defense with offensive army mechanics   |
| **Risk-Reward Trading**    | Physical transport of goods across dangerous territory  |
| **Environmental Pressure** | Dynamic planetary conditions force strategic adaptation |
| **Meaningful Upkeep**      | Territory and army costs prevent unchecked expansion    |
| **Horizontal Progression** | Research unlocks options, not raw power                 |

---

## 2. Setting & Theme

### 2.1 Sci-Fi Frontier Setting

The game takes place on Kepler-442b, a newly discovered habitable planet in the early stages of colonization. Multiple corporate factions have arrived to stake their claims, establishing outposts across the alien landscape. The planet's environment is harsh but resource-rich, with periodic storms, seismic activity, and hostile fauna presenting constant challenges.

### 2.2 Thematic Elements

| Element              | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| Outposts/Colonies    | Player-controlled territorial nodes representing settlements |
| Mining Stations      | Resource extraction facilities for raw materials             |
| Research Labs        | Technology advancement and blueprint discovery               |
| Cargo Transports     | Hover trucks, cargo drones, armored convoys                  |
| Hostile Fauna        | Alien creatures that attack settlements                      |
| Pirates/Raiders      | NPC factions that intercept trade routes                     |
| Environmental Events | Ion storms, seismic shifts, radiation zones                  |
| Corporations         | Player-formed alliances competing for dominance              |

### 2.3 Currency: Credits

The universal currency in Nova Fall is **Credits**. Credits are used for all transactions including building construction, unit recruitment, research costs, market trades, and upkeep payments. Credits can be earned through resource production, trading, completing bounties, and territorial bonuses.

---

## 3. World Structure & Node System

### 3.1 Node-Based Map

The game world consists of 100 interconnected nodes representing locations on the planetary surface. Nodes are connected by paths of varying quality and danger levels. The map uses a hybrid generation system with procedurally generated regions anchored by hand-crafted key locations.

#### Node Types

| Node Type      | Primary Output     | Strategic Value          | Upkeep Modifier |
| -------------- | ------------------ | ------------------------ | --------------- |
| Mining Station | Raw Ores, Minerals | Foundation of production | 1.0x (Base)     |
| Refinery       | Refined Materials  | Mid-chain value add      | 1.2x            |
| Research Lab   | Research Points    | Tech advancement         | 1.5x            |
| Trade Hub      | Passive Credits    | Market fee reduction     | 1.3x            |
| Fortress       | Defense Bonus      | Chokepoint control       | 1.8x            |
| Colony HQ      | All (reduced)      | Command center           | 2.0x            |
| Agricultural   | Food, Organics     | Sustains population      | 0.8x            |
| Power Plant    | Energy Credits     | Powers operations        | 1.1x            |

### 3.2 Zoom Levels

The game features four distinct zoom levels:

**Level 1 - Strategic View:** Shows the entire world map with all nodes as icons. Displays ownership colors, corporation territories, active conflicts, trade routes, and environmental hazard zones. Used for high-level planning and navigation.

**Level 2 - Regional View:** Shows clusters of 5-15 nodes with visible road networks. Moving caravans and military units visible. Resource flow indicators and neighboring corporation influence displayed.

**Level 3 - Node Detail View:** Shows internal node layout with building placement grid, defense positions, unit garrison, storage facilities, and active construction queues. Primary management interface.

**Level 4 - Tactical Combat View:** Activated during battles. Real-time tower defense gameplay with unit positioning, tower targeting, terrain features, and special ability usage.

### 3.3 Territory Upkeep System

Every owned node incurs an upkeep cost, designed to prevent unchecked expansion and create meaningful territorial decisions.

#### Upkeep Formula

```
Hourly Upkeep = Base Cost × Node Modifier × (1 + 0.15 × Distance) × Building Multiplier
```

#### Upkeep Components

| Component           | Description                              |
| ------------------- | ---------------------------------------- |
| Base Cost           | 50 Credits per hour for standard nodes   |
| Node Modifier       | Varies by node type (0.8x to 2.0x)       |
| Distance Penalty    | +15% per node distance from your HQ      |
| Building Multiplier | Sum of all building upkeep rates in node |

#### Upkeep Failure Consequences

| Phase       | Duration    | Effect                                           |
| ----------- | ----------- | ------------------------------------------------ |
| Warning     | 0-12 hours  | Visual indicator, production reduced 25%         |
| Decay       | 12-36 hours | Defenses degraded 50%, some units desert         |
| Collapse    | 36-48 hours | Production halted, buildings take damage         |
| Abandonment | 48+ hours   | Node reverts to neutral, 50% buildings destroyed |

---

## 4. Combat System

### 4.1 Overview

Combat in Nova Fall is real-time tower defense with a twist: players can both defend their nodes and launch offensive attacks against others. The system combines traditional tower defense mechanics with army management and real-time tactical decisions.

### 4.2 Attack Timeline

```
INITIATION ──► PREPARATION ──► FORCES LOCKED ──► COMBAT ──► RESOLUTION ──► COOLDOWN
                (20-28 hrs)      (final 1 hr)     (30 min)                   (3 days)
```

| Phase         | Duration             | Description                                        |
| ------------- | -------------------- | -------------------------------------------------- |
| Initiation    | Instant              | Attacker declares target, both sides notified      |
| Preparation   | 20-28 hours (random) | Both sides prepare forces, upgrade, position       |
| Forces Locked | Final 1 hour         | No changes allowed, countdown to combat            |
| Combat        | 30 minutes           | Real-time tower defense battle                     |
| Resolution    | Instant              | Winner determined, units move, ownership transfers |
| Immunity      | 3 minutes            | No attacks possible on this node                   |
| Cooldown      | 3 days               | No player attacks (NPC attacks still possible)     |

### 4.3 Initiating an Attack

1. Assemble attack force from available units at a staging node
2. Select target node (must be reachable via connected path)
3. System generates random preparation time (24 hours ± 4 hours)
4. Defender receives immediate notification with countdown
5. Both players enter Preparation Mode

### 4.4 Preparation Mode (20-28 Hours)

**Attacker Options:**

- Add or remove units from attack force
- Assign consumable items
- View defender's visible defenses
- Cancel attack (forfeit any deposit)

**Defender Options:**

- Move garrison units from other nodes
- Build or upgrade defenses (if time permits)
- Position defensive structures
- Assign consumable items
- Request corporation reinforcements

**Forces Lock:** One hour before combat begins, all forces are locked. No further changes can be made to either side's composition or positioning.

### 4.5 Real-Time Tower Defense Combat

When combat begins, the tactical view activates. Attacking units spawn at entry points and attempt to reach and destroy the node's Command Center. Defensive structures and garrison units attempt to stop them.

#### Attacker Actions (Real-Time)

| Action             | Description                                              |
| ------------------ | -------------------------------------------------------- |
| Deploy Units       | Choose when and where to spawn units from available pool |
| Issue Commands     | Direct units to specific targets or waypoints            |
| Use Abilities      | Activate unit special abilities (cooldown-based)         |
| Deploy Consumables | Use items like EMP bombs, shield boosters, repair drones |
| Call Retreat       | Withdraw surviving units early to preserve forces        |

#### Defender Actions (Real-Time)

| Action            | Description                                            |
| ----------------- | ------------------------------------------------------ |
| Tower Targeting   | Override auto-targeting to prioritize specific threats |
| Activate Defenses | Trigger traps, shields, emergency protocols            |
| Deploy Garrison   | Send garrison units to intercept attackers             |
| Use Consumables   | Repair kits, reinforcement calls, area denial          |
| Relocate Units    | Move garrison units between defense positions          |

### 4.6 Absent Player Handling

If a player is not present when combat begins, their forces operate on autopilot using AI-controlled default behaviors. Towers auto-target nearest threats, garrison units defend automatically, and attacking units follow basic pathfinding. Active participation provides significant advantages through optimal targeting, ability timing, and tactical positioning.

### 4.7 Battle Resolution

**Attacker Wins:**

- All surviving defending mobile units withdraw to random adjacent friendly node
- If no adjacent friendly node exists, units are captured or destroyed
- All infrastructure (buildings) transfers to attacker ownership
- Attacker's surviving units become new garrison
- Node storage contents transfer to attacker

**Defender Wins:**

- All surviving attack units auto-withdraw to origin node
- Defender retains full control of the node
- All infrastructure remains intact

**Post-Battle Cooldown:**

- 3-minute immunity window (no attacks possible)
- 3-day cooldown from player attacks
- NPC attacks can still occur during cooldown

### 4.8 Defensive Structures

| Structure       | Role          | Special                | Tech Tier | Upkeep/hr |
| --------------- | ------------- | ---------------------- | --------- | --------- |
| Pulse Turret    | Anti-infantry | Rapid fire, low damage | Tier 1    | 5         |
| Railgun Tower   | Anti-armor    | High damage, slow      | Tier 2    | 15        |
| Missile Battery | Area denial   | Splash damage          | Tier 2    | 20        |
| Shield Pylon    | Protection    | Area shield bubble     | Tier 3    | 25        |
| EMP Tower       | Disable       | Stuns vehicles         | Tier 3    | 30        |
| Plasma Cannon   | Heavy assault | Devastating damage     | Tier 4    | 50        |
| Energy Wall     | Barrier       | Blocks movement        | Tier 1    | 3         |
| Minefield       | Trap          | One-time damage        | Tier 1    | 2         |

### 4.9 Military Units

| Unit           | Role             | Special             | Tech Tier | Upkeep/hr |
| -------------- | ---------------- | ------------------- | --------- | --------- |
| Marines        | Basic infantry   | Cheap, numerous     | Tier 1    | 2         |
| Rangers        | Scout/recon      | Fast, reveals traps | Tier 1    | 3         |
| Heavy Troopers | Armored infantry | High HP, slow       | Tier 2    | 5         |
| Engineers      | Support          | Repairs, disables   | Tier 2    | 4         |
| Assault Mech   | Heavy assault    | High damage dealer  | Tier 3    | 15        |
| Siege Tank     | Structure killer | Anti-building       | Tier 3    | 20        |
| Drone Swarm    | Harassment       | Many weak units     | Tier 2    | 8         |
| Commando       | Specialist       | Stealth, sabotage   | Tier 4    | 25        |
| Titan Walker   | Super-heavy      | Ultimate unit       | Tier 5    | 100       |

---

## 5. Economy & Trading System

### 5.1 Resource Types

| Resource        | Source            | Primary Use        | Rarity   |
| --------------- | ----------------- | ------------------ | -------- |
| Credits         | Trade Hubs, Sales | Universal currency | Common   |
| Iron Ore        | Mining Stations   | Basic construction | Common   |
| Rare Minerals   | Deep Mining       | Advanced tech      | Uncommon |
| Energy Cells    | Power Plants      | Operations, combat | Common   |
| Composites      | Refineries        | Advanced building  | Uncommon |
| Tech Components | Factories         | Unit production    | Uncommon |
| Xenotech        | Anomalies, Events | Top-tier upgrades  | Rare     |
| Research Data   | Research Labs     | Tech advancement   | Variable |

### 5.2 Market System

#### Market Types

**Local Market:** Available at any owned node. Limited to NPC trades with fixed prices. Higher fees (15%). Instant transactions.

**Regional Market:** Available at Trade Hub nodes. Player-to-player trading enabled. Dynamic pricing based on supply/demand. Moderate fees (8%). Requires physical delivery.

**Global Exchange:** Accessible from any node with Trade Hub connection. Best prices, full market access. Low fees (3%). Requires transport to designated delivery points.

### 5.3 Trade Caravans

Physical transport of goods creates risk/reward decisions and emergent gameplay through interception, escort contracts, and route optimization.

#### Transport Vehicles

| Vehicle         | Capacity  | Speed     | Defense | Cost           |
| --------------- | --------- | --------- | ------- | -------------- |
| Scout Crawler   | 50 units  | Very Fast | None    | 500 Credits    |
| Cargo Hauler    | 200 units | Medium    | Light   | 2,000 Credits  |
| Armored Convoy  | 300 units | Slow      | Heavy   | 5,000 Credits  |
| Hover Transport | 150 units | Fast      | Medium  | 8,000 Credits  |
| Dropship        | 100 units | Very Fast | Light   | 15,000 Credits |

#### Trade Route Risks

| Risk                  | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| NPC Raiders           | Random encounters based on route danger level                |
| Player Interception   | Other players can attack caravans in neutral/contested zones |
| Environmental Hazards | Storms and anomalies can damage or delay shipments           |
| Toll Zones            | Some routes pass through controlled territory requiring fees |

---

## 6. Progression Systems

Nova Fall emphasizes horizontal progression—unlocking new options and strategies rather than raw numerical power increases.

### 6.1 Research System

Research requires Research Lab nodes. Higher-tier labs unlock advanced research and allow parallel research queues.

#### Research Trees

**Military Branch:** Unlocks unit types, weapon upgrades, combat abilities. Divided into Offensive (assault units, siege weapons) and Defensive (towers, shields, fortifications) paths.

**Economic Branch:** Improves resource production, trading efficiency, storage capacity. Includes Trade (market access, fee reduction) and Industry (production speed, automation) paths.

**Engineering Branch:** Building types, construction speed, durability upgrades. Covers Infrastructure (roads, logistics) and Advanced Structures (specialized buildings) paths.

**Xenotech Branch:** Alien technology integration requiring rare materials from anomalies. Powerful but expensive options.

### 6.2 Item Upgrade System

Equipment and structures can be upgraded to improve their effectiveness.

#### Upgrade Mechanics

- Items have 1-5 upgrade slots based on quality tier
- Each upgrade requires specific materials and Credits
- Upgrades can fail, consuming materials (failure chance based on tier)
- Critical success grants bonus stats or extra slot
- Upgrade types: Damage, Defense, Speed, Efficiency, Special Effects

### 6.3 Unit Veterancy

Units gain experience through combat, increasing their effectiveness and unlocking specializations.

| Veterancy | XP Required | Bonus          | Unlock                |
| --------- | ----------- | -------------- | --------------------- |
| Rookie    | 0           | None           | Base abilities        |
| Regular   | 100         | +10% HP        | None                  |
| Veteran   | 500         | +15% Damage    | Specialization choice |
| Elite     | 2,000       | +20% All Stats | Advanced ability      |
| Legendary | 10,000      | +30% All Stats | Unique ability        |

---

## 7. Corporation System

Corporations are player-formed organizations that provide collective benefits, shared resources, and organized warfare capabilities.

### 7.1 Corporation Features

| Feature            | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Shared Territory   | Connected member nodes form corporate domain with shared bonuses   |
| Corporate Bank     | Shared resource pool for collective projects and emergencies       |
| Research Sharing   | Members benefit from shared tech discoveries (partial)             |
| Diplomacy          | Alliances, non-aggression pacts, trade agreements with other corps |
| Corporate Wars     | Organized conflicts with victory conditions and rewards            |
| Rank System        | Configurable hierarchy with permissions per rank                   |
| Corporate Projects | Large-scale constructions requiring collective investment          |

### 7.2 Corporation Ranks

| Rank      | Default Permissions                    | Notes                     |
| --------- | -------------------------------------- | ------------------------- |
| CEO       | All permissions, cannot be removed     | Corporation founder/owner |
| Director  | Manage members, bank access, diplomacy | Senior leadership         |
| Manager   | Invite members, limited bank access    | Operational leadership    |
| Veteran   | Corp chat, shared research access      | Trusted members           |
| Associate | Corp chat, basic benefits              | New members               |

### 7.3 Corporation Progression

Corporations earn Influence based on collective activities, unlocking organization-wide perks.

- Territory Control: +1 Influence per node per day
- Successful Defenses: +10 Influence per defense
- Trade Volume: +1 Influence per 10,000 Credits traded
- NPC Bounties: +5 Influence per bounty completed
- Corporate Wars: Variable based on war outcome

---

## 8. NPC Threats & Environmental Hazards

### 8.1 Hostile Factions

| Faction             | Behavior                                 | Rewards             | Threat Level |
| ------------------- | ---------------------------------------- | ------------------- | ------------ |
| Feral Fauna         | Roaming creatures, attack on contact     | Organics, XP        | Low          |
| Raider Gangs        | Intercept caravans, raid outposts        | Credits, Equipment  | Medium       |
| Rogue Drones        | Attack infrastructure, disable buildings | Tech components     | Medium       |
| Xeno Hive           | Periodic swarm attacks on regions        | Xenotech, Rare mats | High         |
| Precursor Guardians | Defend anomaly sites                     | Legendary items     | Very High    |

### 8.2 Environmental Pressure System

Dynamic environmental conditions create strategic pressure, preventing players from becoming permanently entrenched and adding variety to gameplay.

#### Environmental Events

| Event           | Effect                                | Mitigation                | Duration    |
| --------------- | ------------------------------------- | ------------------------- | ----------- |
| Ion Storm       | Disables electronics, damages shields | Storm shelters, grounding | 4-12 hours  |
| Seismic Shift   | Damages structures, reveals deposits  | Reinforced foundations    | 1-2 hours   |
| Radiation Surge | Damages unshielded units              | Rad shielding research    | 6-24 hours  |
| Dust Storm      | Reduces visibility, slows movement    | Sealed facilities         | 12-48 hours |
| Solar Flare     | Communication blackout, bonus energy  | Hardened electronics      | 2-6 hours   |

#### Environmental Pressure Rules

- Regions cycle through stability levels (Stable → Unstable → Hazardous → Extreme)
- Higher instability increases upkeep costs by 25-100%
- Extreme conditions may force temporary evacuation
- Conditions cycle over multi-day periods with advance warning
- Mitigation research reduces negative effects by up to 75%
- No region stays at Extreme for more than 48 hours continuously

---

## 9. Monetization Model

Nova Fall uses a subscription model with a free-to-play option that limits access to advanced features.

### 9.1 Tier Comparison

| Feature              | Free       | Premium         |
| -------------------- | ---------- | --------------- |
| Maximum Tech Tier    | Tier 2     | All Tiers       |
| Node Limit           | 5 nodes    | Unlimited       |
| Corporation Features | Join only  | Create & manage |
| Market Access        | Local only | Full access     |
| Research Queues      | 1 queue    | 3 queues        |
| Trade Routes         | 3 active   | Unlimited       |
| Storage Capacity     | Base       | +100% bonus     |
| Cosmetic Access      | Basic      | Full catalog    |

### 9.2 Design Principles

- **No Pay-to-Win:** Premium provides convenience and options, not power advantages
- **Viable Free Experience:** Free players can fully participate and compete within their tier
- **Tier 2 Balance:** Tier 2 content designed to be competitive, not obsolete
- **Cosmetic Revenue:** Additional cosmetic purchases available to all tiers

---

## 10. Technical Architecture

### 10.1 Technology Stack

| Layer              | Technology           | Rationale                  |
| ------------------ | -------------------- | -------------------------- |
| Frontend Framework | Vue 3 + TypeScript   | Reactive UI, strong typing |
| Game Renderer      | PixiJS               | Fast 2D WebGL, zoom levels |
| State Management   | Pinia                | Vue-native, simple         |
| API Framework      | Fastify              | Fast Node.js, TypeScript   |
| ORM                | Prisma               | Type-safe database access  |
| Database           | PostgreSQL           | Complex queries, JSONB     |
| Cache/Realtime     | Redis                | Sessions, pub/sub          |
| WebSocket          | Socket.io            | Real-time communication    |
| Job Queue          | BullMQ               | Game tick processing       |
| Authentication     | Passport.js + OAuth2 | Discord/Google login       |

### 10.2 Railway Services

1. **api-server:** REST API, primary backend
2. **ws-server:** WebSocket server for real-time gameplay
3. **game-worker:** Tick processing, NPC AI, upkeep calculations
4. **postgres:** Primary database
5. **redis:** Cache, sessions, pub/sub

### 10.3 Cost Optimization

- Use Railway's included resources within existing subscription
- Aggressive Redis caching to minimize database queries
- Client-side prediction to reduce server round-trips
- Batch game tick processing (5-second intervals)
- Static asset hosting via free CDN (Cloudflare)

### 10.4 Art Asset Strategy

- **Free Asset Packs:** Kenney.nl (CC0), OpenGameArt.org, itch.io
- **AI-Generated Art:** Building portraits, unit icons, backgrounds
- **Procedural Generation:** Terrain textures, particle effects
- **Icon Libraries:** Game-icons.net (CC BY 3.0)
- **Consistent Style Guide:** Post-processing filters to unify assets

---

## 11. Extensibility Architecture

The game is designed for easy expansion of defensive structures and offensive units through a data-driven approach.

### 11.1 Structure Definition System

All defensive structures are defined in configuration files, allowing new structures to be added without code changes.

**Structure Properties:** ID, name, description, tier requirement, build cost, upkeep cost, build time, health points, damage output, range, attack speed, targeting priority, special abilities, upgrade paths, visual assets.

### 11.2 Unit Definition System

Military units follow the same data-driven pattern for easy expansion.

**Unit Properties:** ID, name, description, tier requirement, recruitment cost, upkeep cost, training time, health points, damage output, armor type, movement speed, special abilities, veterancy bonuses, upgrade slots, visual assets, AI behavior profile.

### 11.3 Ability System

A flexible ability system allows structures and units to have special capabilities.

**Ability Properties:** ID, name, description, cooldown, energy cost, effect type (damage/heal/buff/debuff/summon/teleport), target type (self/single/area), range, duration, effect values, visual effects, sound effects.

> This data-driven approach means new content can be added by creating configuration entries and corresponding assets, without modifying core game logic.

---

## 12. MVP Scope Definition

The Minimum Viable Product targets a 3-month development timeline with a single developer using Claude Code assistance.

### 12.1 MVP Includes

- OAuth2 authentication (Discord and Google)
- World map with 100 nodes (single server)
- 4 zoom levels with full interaction
- 5 node types (Mining, Refinery, Research, Trade, HQ)
- 4 defensive structures (Turret, Wall, Trap, Shield)
- 4 military units (Infantry, Scout, Heavy, Siege)
- Full real-time combat system with prep phase (20-28h) + combat window (30 min)
- Post-battle cooldown system (3 days player protection)
- Resource generation and upkeep
- Local market (NPC trading)
- Basic caravan system (1 vehicle type)
- Simple research tree (10-15 techs, Tier 1-2)
- 1 NPC threat type (Raiders)

### 12.2 Post-MVP Features

**Priority 1 (Month 4):**

- Corporation system
- Full player-to-player market
- Additional unit types (4 more)
- Additional structure types (4 more)

**Priority 2 (Month 5):**

- Environmental hazard system
- Item upgrade system
- More NPC threat types
- Corporation wars

**Priority 3 (Month 6):**

- Subscription system
- Advanced research tree
- Anomaly events
- Leaderboards

---

## Appendix A: Key Values Quick Reference

| Setting                 | Value                        |
| ----------------------- | ---------------------------- |
| Map Size                | 100 nodes                    |
| Attack Prep Time        | 24 hours ± 4 hours (random)  |
| Forces Lock             | 1 hour before combat         |
| Combat Window           | 30 minutes                   |
| Post-Battle Immunity    | 3 minutes                    |
| Post-Battle Cooldown    | 3 days (player attacks only) |
| Starting Credits        | 1,000                        |
| Starting Iron           | 100                          |
| Starting Energy         | 50                           |
| Base Node Upkeep        | 50 Credits/hour              |
| Distance Upkeep Penalty | +15% per node from HQ        |
| Game Tick Interval      | 5 seconds                    |
| Free Tier Max Nodes     | 5                            |
| Free Tier Max Tech      | Tier 2                       |

---

_End of Game Design Document_
