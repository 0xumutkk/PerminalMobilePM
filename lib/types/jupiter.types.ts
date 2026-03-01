/**
 * Jupiter Prediction Market API Types
 * Docs: https://dev.jup.ag/docs/prediction
 *
 * Base URL: https://api.jup.ag/prediction/v1
 * Auth: x-api-key header
 * Price unit: micro USD (1 USD = 1,000,000 μUSD)
 */

// ─── Price Utilities ────────────────────────────────────────────

/** Convert micro USD (API format) to display USD (e.g. 500000 → 0.50) */
export function microUsdToUsd(microUsd: number | string | null | undefined): number {
    const value = typeof microUsd === "string" ? parseInt(microUsd, 10) : (microUsd ?? 0);
    if (!Number.isFinite(value)) return 0;
    return value / 1_000_000;
}

/** Convert display USD to micro USD (e.g. 0.50 → 500000) */
export function usdToMicroUsd(usd: number): string {
    return String(Math.round(usd * 1_000_000));
}

/** Convert micro USD price to probability 0-1 (contracts pay $1 = 1,000,000 μUSD) */
export function microUsdToProbability(microUsd: number | string | null | undefined): number {
    const usd = microUsdToUsd(microUsd);
    return Math.max(0, Math.min(1, usd));
}

// ─── Event & Market Types ───────────────────────────────────────

export interface JupiterMarketPricing {
    buyYesPriceUsd: number | null;
    buyNoPriceUsd: number | null;
    sellYesPriceUsd: number | null;
    sellNoPriceUsd: number | null;
    volume?: number | string;
    volume24h?: number | string;
    openInterest?: number | string;
    liquidityDollars?: number | string;
    notionalValueDollars?: number | string;
}

export interface JupiterMarket {
    marketId: string;
    isYes?: boolean;
    pricing: JupiterMarketPricing;
    status: "open" | "paused" | "closed";
    result: "" | "pending" | "yes" | "no" | null;
    fee?: number;
    metadata?: {
        title?: string;
        closeTime?: number | string;
        openTime?: number | string;
        rulesPrimary?: string;
        rulesSecondary?: string;
        [key: string]: any;
    };
}

export interface JupiterEvent {
    eventId: string;
    category?: string;
    subcategory?: string;
    status?: "open" | "paused" | "closed";
    expiryDate?: string;
    markets: JupiterMarket[];
    volume?: number;
    liquidity?: number;
    provider?: "polymarket" | "kalshi";
    metadata?: {
        eventId?: string;
        title: string;
        subtitle?: string;
        isLive?: boolean;
        slug?: string;
        imageUrl?: string;
        description?: string;
        [key: string]: any;
    };
    // Compatibility fields that might be missing at root but expected by current code
    title?: string;
    description?: string;
    imageUrl?: string;
}


export interface JupiterEventsResponse {
    data: JupiterEvent[];
    pagination?: {
        start?: number;
        end?: number;
        total?: number;
        hasNext?: boolean;
    };
    nextCursor?: string | null;
}

export interface JupiterSearchResponse {
    data: JupiterEvent[];
}

// ─── Order Types ────────────────────────────────────────────────

export interface JupiterCreateOrderRequest {
    ownerPubkey: string;
    marketId: string;
    side: "buy" | "sell";
    isYes: boolean;
    contracts: string; // number of contracts as string
    maxBuyPriceUsd?: string; // micro USD, for buy
    minSellPriceUsd?: string; // micro USD, for sell
}

export interface JupiterCreateOrderResponse {
    /** Base64-encoded unsigned transaction to sign and send */
    transaction: string;
    /** Order ID for tracking */
    orderId: string;
    /** Order details */
    side: "buy" | "sell";
    isYes: boolean;
    contracts: string;
    priceUsd: string;
    totalCostUsd?: string;
    /** For transaction confirmation */
    lastValidBlockHeight?: number;
}

export interface JupiterOrder {
    orderId: string;
    marketId: string;
    ownerPubkey: string;
    side: "buy" | "sell";
    isYes: boolean;
    contracts: string;
    priceUsd: string;
    status: "open" | "filled" | "partially_filled" | "cancelled" | "expired";
    filledContracts?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface JupiterOrdersResponse {
    orders: JupiterOrder[];
}

// ─── Position Types ─────────────────────────────────────────────

export interface JupiterPosition {
    positionPubkey: string;
    marketId: string;
    ownerPubkey: string;
    isYes: boolean;
    contracts: string; // number of contracts
    avgPriceUsd: string; // micro USD
    currentPriceUsd?: string; // micro USD
    costBasisUsd?: string; // micro USD
    currentValueUsd?: string; // micro USD
    pnlUsd?: string; // micro USD
    /** Market metadata (may be included) */
    marketTitle?: string;
    marketStatus?: string;
    marketResult?: "" | "pending" | "yes" | "no";
    imageUrl?: string;
    /** Whether position can be claimed (market resolved + user won) */
    claimable?: boolean;
    payoutUsd?: string; // micro USD
}

export interface JupiterPositionsResponse {
    data: JupiterPosition[];
}

// ─── Claim Types ────────────────────────────────────────────────

export interface JupiterClaimResponse {
    /** Base64-encoded unsigned transaction to sign and send */
    transaction: string;
    positionPubkey: string;
    payoutUsd: string; // micro USD
    lastValidBlockHeight?: number;
}
