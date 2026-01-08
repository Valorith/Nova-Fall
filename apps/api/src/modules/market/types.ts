import type { ResourceType } from '@nova-fall/shared';

// Tradeable resource type (excludes credits)
export type TradeableResource = Exclude<ResourceType, 'credits'>;

// Market price info returned by API
export interface MarketPriceInfo {
  resourceType: TradeableResource;
  name: string;
  icon: string;
  buyPrice: number;
  sellPrice: number;
  transactionFee: number;
}

// Request body for buying resources
export interface BuyResourceRequest {
  nodeId: string; // Trade Hub node to receive resources
  resourceType: TradeableResource;
  quantity: number;
}

// Request body for selling resources
export interface SellResourceRequest {
  nodeId: string; // Trade Hub node to sell resources from
  resourceType: TradeableResource;
  quantity: number;
}

// Response for buy transaction
export interface BuyTransactionResponse {
  success: boolean;
  resourceType: TradeableResource;
  quantity: number;
  baseCost: number;
  fee: number;
  totalCost: number;
  creditsRemaining: number;
  resourceBalance: number;
}

// Response for sell transaction
export interface SellTransactionResponse {
  success: boolean;
  resourceType: TradeableResource;
  quantity: number;
  baseRevenue: number;
  fee: number;
  netRevenue: number;
  creditsBalance: number;
  resourceRemaining: number;
}

// Market transaction history entry
export interface MarketTransaction {
  id: string;
  playerId: string;
  type: 'BUY' | 'SELL';
  resourceType: TradeableResource;
  quantity: number;
  pricePerUnit: number;
  fee: number;
  totalAmount: number;
  timestamp: Date;
}
