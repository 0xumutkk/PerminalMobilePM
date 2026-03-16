/**
 * Jupiter Prediction Market API Types
 * Docs: https://dev.jup.ag/docs/prediction
 *
 * Base URL: https://api.jup.ag/prediction/v1
 * Auth: x-api-key header
 * Price unit: micro USD (1 USD = 1,000,000 μUSD)
 */

// ─── Price Utilities ────────────────────────────────────────────

function coerceJupiterNumeric(value: number | string | null | undefined): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;

    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Convert micro USD (API format) to display USD (e.g. 500000 → 0.50) */
export function microUsdToUsd(microUsd: number | string | null | undefined): number {
    const value = coerceJupiterNumeric(microUsd);
    if (value == null) return 0;
    return value / 1_000_000;
}

/** Convert display USD to micro USD (e.g. 0.50 → 500000) */
export function usdToMicroUsd(usd: number): number {
    return Math.round(usd * 1_000_000);
}

/** Convert micro USD price to probability 0-1 (contracts pay $1 = 1,000,000 μUSD) */
export function microUsdToProbability(microUsd: number | string | null | undefined): number {
    const usd = microUsdToUsd(microUsd);
    return Math.max(0, Math.min(1, usd));
}

/** Parse a Jupiter numeric field that is already denominated in display units. */
export function parseJupiterNumber(value: number | string | null | undefined): number | null {
    return coerceJupiterNumeric(value);
}

/** Parse a Jupiter micro-USD field into display USD. */
export function parseJupiterUsd(value: number | string | null | undefined): number | null {
    const parsed = coerceJupiterNumeric(value);
    return parsed == null ? null : parsed / 1_000_000;
}

/** Accept unix seconds, unix milliseconds, or ISO strings and normalize to ms. */
export function parseJupiterTimestampMs(value: number | string | null | undefined): number | null {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return value > 1_000_000_000_000 ? value : value * 1000;
    }

    if (typeof value !== "string") return null;

    const normalized = value.trim();
    if (!normalized) return null;

    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
        return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : parsed;
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

export type JupiterKnownOrderStatus =
    | "open"
    | "filled"
    | "partially_filled"
    | "cancelled"
    | "expired";

export interface JupiterCreateOrderRequest {
    ownerPubkey: string;
    marketId: string;
    isBuy: boolean;
    isYes: boolean;
    depositAmount?: string; // micro USD as string, e.g. "1000000" (Used for buying)
    contracts?: string; // number of contracts as string, e.g. "10" (Used for selling)
    maxBuyPriceUsd?: string; // micro USD as string (Optional, calculated if missing)
    minSellPriceUsd?: string; // micro USD as string
    depositMint?: string; // Optional: USDC or JupUSD mint
    positionPubkey?: string; // Optional: used for closing/selling specific positions
    slippageBps?: number; // Optional: slippage tolerance in basis points
}

export interface JupiterCreateOrderResponse {
    /** Base64-encoded unsigned transaction to sign and send */
    transaction: string;
    /** Metadata about the transaction */
    txMeta: {
        blockhash: string;
        lastValidBlockHeight: number;
    };
    /** Order details */
    order: {
        orderPubkey: string;
        positionPubkey: string;
        contracts: string;
        orderCostUsd: string;
        estimatedTotalFeeUsd: string;
    };
    /** Compatibility legacy ID (if still returned by some endpoints) */
    orderId?: string;
}

export interface JupiterOrder {
    orderPubkey?: string;
    orderId: string;
    marketId: string;
    ownerPubkey: string;
    side: "buy" | "sell";
    isYes: boolean;
    contracts: string;
    priceUsd: string;
    status: JupiterKnownOrderStatus;
    filledContracts?: string;
    positionPubkey?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface JupiterOrdersResponse {
    orders: JupiterOrder[];
}

// ─── Position Types ─────────────────────────────────────────────

export interface JupiterPosition {
    pubkey: string;
    marketId: string;
    ownerPubkey: string;
    isYes: boolean;
    contracts: string; // number of contracts
    avgPriceUsd: string; // micro USD
    currentPriceUsd?: string; // micro USD
    markPriceUsd?: string; // micro USD
    sizeUsd?: string; // micro USD
    valueUsd?: string; // micro USD
    costBasisUsd?: string; // micro USD
    pnlUsd?: string; // micro USD
    pnlUsdPercent?: number | string;
    pnlUsdAfterFees?: string; // micro USD
    pnlUsdAfterFeesPercent?: number | string;
    /** Market metadata (may be included) */
    marketTitle?: string;
    marketStatus?: string;
    marketResult?: "" | "pending" | "yes" | "no";
    imageUrl?: string;
    /** Whether position can be claimed (market resolved + user won) */
    claimable?: boolean;
    claimableAt?: number | string;
    payoutUsd?: string; // micro USD
}

export interface JupiterPositionsResponse {
    data: JupiterPosition[];
}

// ─── Profile / Social Types ─────────────────────────────────────

export interface JupiterProfile {
    ownerPubkey: string;
    realizedPnlUsd?: number | string | null;
    totalVolumeUsd?: number | string | null;
    predictionsCount?: number | string | null;
    correctPredictions?: number | string | null;
    wrongPredictions?: number | string | null;
    totalActiveContracts?: number | string | null;
    totalPositionsValueUsd?: number | string | null;
    winRatePct?: number | string | null;
    totalFeesPaidUsd?: number | string | null;
    winRate?: number | string | null;
    totalWins?: number | string | null;
    totalLosses?: number | string | null;
    totalShares?: number | string | null;
    avatarUrl?: string | null;
    username?: string | null;
    [key: string]: unknown;
}

export interface JupiterProfilePnlPoint {
    balanceUsd?: number | string | null;
    realizedPnlUsd?: number | string | null;
    timestamp?: number | string | null;
}

export interface JupiterProfilePnlHistoryResponse {
    ownerPubkey?: string;
    history?: JupiterProfilePnlPoint[];
    data?: JupiterProfilePnlPoint[];
}

export interface JupiterAccountHistoryEvent {
    id?: number | string;
    eventType?: string;
    signature?: string;
    slot?: string | number;
    timestamp?: number | string;
    orderPubkey?: string;
    positionPubkey?: string;
    marketId?: string;
    ownerPubkey?: string;
    keeperPubkey?: string;
    externalOrderId?: string;
    orderId?: string;
    isBuy?: boolean;
    isYes?: boolean;
    contracts?: string | number;
    filledContracts?: string | number;
    contractsSettled?: string | number;
    avgFillPriceUsd?: string | number;
    maxFillPriceUsd?: string | number;
    maxBuyPriceUsd?: string | number;
    minSellPriceUsd?: string | number;
    depositAmountUsd?: string | number;
    totalCostUsd?: string | number;
    feeUsd?: string | number | null;
    grossProceedsUsd?: string | number;
    netProceedsUsd?: string | number;
    transferAmountToken?: string | number | null;
    realizedPnl?: string | number | null;
    realizedPnlBeforeFees?: string | number | null;
    payoutAmountUsd?: string | number;
    eventId?: string;
    marketMetadata?: {
        marketId?: string;
        eventId?: string;
        title?: string;
        subtitle?: string;
        description?: string;
        status?: string;
        result?: string | null;
        closeTime?: number | string | null;
        openTime?: number | string | null;
        [key: string]: unknown;
    } | null;
    eventMetadata?: {
        eventId?: string;
        title?: string;
        subtitle?: string;
        imageUrl?: string;
        isLive?: boolean;
        [key: string]: unknown;
    } | null;
    amountUsd?: string | number;
    feesPaidUsd?: string | number;
    claimedUsd?: string | number;
    message?: string;
    [key: string]: unknown;
}

export interface JupiterPagination {
    start?: number;
    end?: number;
    total?: number;
    hasNext?: boolean;
}

export interface JupiterAccountHistoryResponse {
    data: JupiterAccountHistoryEvent[];
    pagination?: JupiterPagination;
}

// ─── Claim Types ────────────────────────────────────────────────

export interface JupiterClaimResponse {
    /** Base64-encoded unsigned transaction to sign and send */
    transaction: string;
    positionPubkey: string;
    payoutUsd: string; // micro USD
    lastValidBlockHeight?: number;
}
