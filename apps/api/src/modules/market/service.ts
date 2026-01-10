import { prisma } from '../../lib/prisma.js';
import {
  RESOURCES,
  NPC_MARKET_PRICES,
  TRADEABLE_RESOURCES,
  MARKET_TRANSACTION_FEE,
  calculateBuyCost,
  calculateSellRevenue,
  type ResourceStorage,
} from '@nova-fall/shared';
import type {
  TradeableResource,
  MarketPriceInfo,
  BuyTransactionResponse,
  SellTransactionResponse,
} from './types.js';

/**
 * Get all market prices for tradeable resources
 */
export function getMarketPrices(): MarketPriceInfo[] {
  return TRADEABLE_RESOURCES.map((resourceType) => {
    const resource = RESOURCES[resourceType];
    const prices = NPC_MARKET_PRICES[resourceType];

    return {
      resourceType,
      name: resource.name,
      icon: resource.icon,
      buyPrice: prices.buyPrice,
      sellPrice: prices.sellPrice,
      transactionFee: MARKET_TRANSACTION_FEE,
    };
  });
}

/**
 * Get market price for a specific resource
 */
export function getResourcePrice(resourceType: TradeableResource): MarketPriceInfo | null {
  if (!TRADEABLE_RESOURCES.includes(resourceType)) {
    return null;
  }

  const resource = RESOURCES[resourceType];
  const prices = NPC_MARKET_PRICES[resourceType];

  return {
    resourceType,
    name: resource.name,
    icon: resource.icon,
    buyPrice: prices.buyPrice,
    sellPrice: prices.sellPrice,
    transactionFee: MARKET_TRANSACTION_FEE,
  };
}

/**
 * Buy resources from the NPC market
 * Credits are deducted from player (global), resources go to node storage
 */
export async function buyResource(
  sessionPlayerId: string,
  nodeId: string,
  resourceType: TradeableResource,
  quantity: number
): Promise<{ success: boolean; error?: string; data?: BuyTransactionResponse }> {
  // Validate resource type
  if (!TRADEABLE_RESOURCES.includes(resourceType)) {
    return { success: false, error: `Invalid resource type: ${resourceType}` };
  }

  // Validate quantity
  if (quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  if (!Number.isInteger(quantity)) {
    return { success: false, error: 'Quantity must be a whole number' };
  }

  // Get session player and their resources
  const sessionPlayer = await prisma.gameSessionPlayer.findUnique({
    where: { id: sessionPlayerId },
    select: {
      id: true,
      playerId: true,
      resources: true,
      gameSession: {
        select: { status: true },
      },
    },
  });

  if (!sessionPlayer) {
    return { success: false, error: 'Session player not found' };
  }

  if (sessionPlayer.gameSession.status !== 'ACTIVE') {
    return { success: false, error: 'Game session is not active' };
  }

  // Get the node and verify ownership, including installed core for efficiency
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      ownerId: true,
      storage: true,
      type: true,
      installedCoreId: true,
    },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== sessionPlayer.playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  if (node.type !== 'TRADE_HUB') {
    return { success: false, error: 'Market transactions require a Trade Hub' };
  }

  // Get core efficiency for fee reduction
  let coreEfficiency = 1;
  if (node.installedCoreId) {
    const coreItem = await prisma.itemDefinition.findUnique({
      where: { id: node.installedCoreId },
      select: { efficiency: true },
    });
    if (coreItem) {
      coreEfficiency = coreItem.efficiency;
    }
  }

  // Calculate cost with efficiency-adjusted fee
  const { cost, fee, total } = calculateBuyCost(resourceType, quantity, coreEfficiency);

  const currentResources = sessionPlayer.resources as ResourceStorage;
  const currentCredits = currentResources.credits ?? 0;

  // Check if player can afford
  if (currentCredits < total) {
    return {
      success: false,
      error: `Insufficient credits. Need ${total}, have ${currentCredits}`,
    };
  }

  // Update player credits (deduct)
  const updatedPlayerResources: ResourceStorage = {
    ...currentResources,
    credits: currentCredits - total,
  };

  // Update node storage (add resources)
  const nodeStorage = node.storage as ResourceStorage;
  const updatedNodeStorage: ResourceStorage = {
    ...nodeStorage,
    [resourceType]: (nodeStorage[resourceType] ?? 0) + quantity,
  };

  // Perform both updates in a transaction
  await prisma.$transaction([
    prisma.gameSessionPlayer.update({
      where: { id: sessionPlayerId },
      data: { resources: updatedPlayerResources },
    }),
    prisma.node.update({
      where: { id: nodeId },
      data: { storage: updatedNodeStorage },
    }),
  ]);

  return {
    success: true,
    data: {
      success: true,
      resourceType,
      quantity,
      baseCost: cost,
      fee,
      totalCost: total,
      creditsRemaining: updatedPlayerResources.credits as number,
      resourceBalance: updatedNodeStorage[resourceType] as number,
    },
  };
}

/**
 * Sell resources to the NPC market
 * Resources are deducted from node storage, credits go to player (global)
 */
export async function sellResource(
  sessionPlayerId: string,
  nodeId: string,
  resourceType: TradeableResource,
  quantity: number
): Promise<{ success: boolean; error?: string; data?: SellTransactionResponse }> {
  // Validate resource type
  if (!TRADEABLE_RESOURCES.includes(resourceType)) {
    return { success: false, error: `Invalid resource type: ${resourceType}` };
  }

  // Validate quantity
  if (quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  if (!Number.isInteger(quantity)) {
    return { success: false, error: 'Quantity must be a whole number' };
  }

  // Get session player and their resources
  const sessionPlayer = await prisma.gameSessionPlayer.findUnique({
    where: { id: sessionPlayerId },
    select: {
      id: true,
      playerId: true,
      resources: true,
      gameSession: {
        select: { status: true },
      },
    },
  });

  if (!sessionPlayer) {
    return { success: false, error: 'Session player not found' };
  }

  if (sessionPlayer.gameSession.status !== 'ACTIVE') {
    return { success: false, error: 'Game session is not active' };
  }

  // Get the node and verify ownership, including installed core for efficiency
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      ownerId: true,
      storage: true,
      type: true,
      installedCoreId: true,
    },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== sessionPlayer.playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  if (node.type !== 'TRADE_HUB') {
    return { success: false, error: 'Market transactions require a Trade Hub' };
  }

  // Get core efficiency for fee reduction
  let coreEfficiency = 1;
  if (node.installedCoreId) {
    const coreItem = await prisma.itemDefinition.findUnique({
      where: { id: node.installedCoreId },
      select: { efficiency: true },
    });
    if (coreItem) {
      coreEfficiency = coreItem.efficiency;
    }
  }

  // Calculate revenue with efficiency-adjusted fee
  const { revenue, fee, net } = calculateSellRevenue(resourceType, quantity, coreEfficiency);

  const nodeStorage = node.storage as ResourceStorage;
  const currentAmount = nodeStorage[resourceType] ?? 0;

  // Check if node has enough to sell
  if (currentAmount < quantity) {
    return {
      success: false,
      error: `Insufficient ${resourceType} in node. Have ${currentAmount}, trying to sell ${quantity}`,
    };
  }

  // Update player credits (add)
  const currentResources = sessionPlayer.resources as ResourceStorage;
  const updatedPlayerResources: ResourceStorage = {
    ...currentResources,
    credits: (currentResources.credits ?? 0) + net,
  };

  // Update node storage (deduct)
  const newResourceAmount = currentAmount - quantity;
  let updatedNodeStorage: ResourceStorage;
  if (newResourceAmount === 0) {
    // Remove the key by creating a new object without it
    const { [resourceType]: _, ...rest } = nodeStorage;
    updatedNodeStorage = rest;
  } else {
    updatedNodeStorage = { ...nodeStorage, [resourceType]: newResourceAmount };
  }

  // Perform both updates in a transaction
  await prisma.$transaction([
    prisma.gameSessionPlayer.update({
      where: { id: sessionPlayerId },
      data: { resources: updatedPlayerResources },
    }),
    prisma.node.update({
      where: { id: nodeId },
      data: { storage: updatedNodeStorage },
    }),
  ]);

  return {
    success: true,
    data: {
      success: true,
      resourceType,
      quantity,
      baseRevenue: revenue,
      fee,
      netRevenue: net,
      creditsBalance: updatedPlayerResources.credits as number,
      resourceRemaining: newResourceAmount,
    },
  };
}

/**
 * Validate that a resource type is tradeable
 */
export function isTradeableResource(
  resourceType: string
): resourceType is TradeableResource {
  return TRADEABLE_RESOURCES.includes(resourceType as TradeableResource);
}
