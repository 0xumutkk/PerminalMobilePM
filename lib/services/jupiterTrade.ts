/**
 * Jupiter Prediction Market Trade Service
 * Replaces dflowTradeService logic directly with Jupiter order endpoints.
 */

import Constants from "expo-constants";
import {
    usdToMicroUsd,
    type JupiterCreateOrderRequest,
    type JupiterCreateOrderResponse,
    type JupiterClaimResponse,
    type JupiterOrder,
} from "../types/jupiter.types";

const extra = Constants.expoConfig?.extra ?? {};
const JUPITER_API_KEY = (extra.jupiterApiKey ?? process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "").trim();
const JUPITER_BASE_URL = "https://api.jup.ag/prediction/v1";
const MIN_BUY_ORDER_MESSAGE = "Minimum order is above $1.00 on Jupiter. Try $1.01 or more.";

function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
    return headers;
}

function formatJupiterApiError(status: number, errorText: string): string {
    const trimmed = errorText.trim();
    if (!trimmed) {
        return `Jupiter trade failed (${status}).`;
    }

    try {
        const parsed = JSON.parse(trimmed) as { message?: string; code?: string; type?: string };
        const message = String(parsed.message ?? "").trim();
        if (/minimum order is \$?1\b/i.test(message)) {
            return MIN_BUY_ORDER_MESSAGE;
        }
        if (message) {
            return message;
        }
    } catch {
        if (/minimum order is \$?1\b/i.test(trimmed)) {
            return MIN_BUY_ORDER_MESSAGE;
        }
    }

    return `Jupiter trade failed (${status}): ${trimmed}`;
}

export interface JupiterTradeServiceProps {
    /**
     * Create an order (buy or sell)
     * returns base64 transaction and order metadata.
     */
    createOrder(req: JupiterCreateOrderRequest): Promise<JupiterCreateOrderResponse>;

    /**
     * Claim payout for a winning position
     * returns base64 transaction and payout metadata.
     */
    claimPosition(positionPubkey: string): Promise<JupiterClaimResponse>;

    /**
     * Get an order by ID (e.g. to poll status)
     */
    getOrder(orderId: string): Promise<JupiterOrder>;

    /**
     * Get an order by pubkey to track fill status after tx confirmation.
     */
    getOrderStatus(orderPubkey: string): Promise<JupiterOrder>;

    /**
     * Utility method for buying
     */
    buy(params: {
        ownerPubkey: string;
        marketId: string;
        side: "YES" | "NO";
        amountUsdc: number; // Spend amount in USD
        maxBuyPriceUsd?: number;
        slippageBps?: number;
    }): Promise<JupiterCreateOrderResponse>;

    /**
     * Utility method for selling
     */
    sell(params: {
        ownerPubkey: string;
        marketId: string;
        side: "YES" | "NO";
        contracts: number; // Quantity of shares to sell
        minSellPriceUsd?: number;
        positionPubkey: string;
        slippageBps?: number;
    }): Promise<JupiterCreateOrderResponse>;
}

export const jupiterTradeService: JupiterTradeServiceProps = {
    async createOrder(req: JupiterCreateOrderRequest): Promise<JupiterCreateOrderResponse> {
        const url = `${JUPITER_BASE_URL}/orders`;
        const res = await fetch(url, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(req),
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            // Use warn instead of error to avoid triggering the global crash handler/redbox in dev
            console.warn(`[JupiterTrade] API returned ${res.status}. Body: ${errorText}`);
            console.warn(`[JupiterTrade] Failed Payload:`, JSON.stringify(req));
            throw new Error(formatJupiterApiError(res.status, errorText));
        }

        return (await res.json()) as JupiterCreateOrderResponse;
    },

    async claimPosition(positionPubkey: string): Promise<JupiterClaimResponse> {
        const url = `${JUPITER_BASE_URL}/positions/${encodeURIComponent(positionPubkey)}/claim`;
        const res = await fetch(url, {
            method: "POST",
            headers: getHeaders(),
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            throw new Error(`Failed to claim Jupiter position (HTTP ${res.status}): ${errorText}`);
        }

        return (await res.json()) as JupiterClaimResponse;
    },

    async getOrder(orderId: string): Promise<JupiterOrder> {
        const url = `${JUPITER_BASE_URL}/orders/${encodeURIComponent(orderId)}`;
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            throw new Error(`Failed to fetch Jupiter order (HTTP ${res.status}): ${errorText}`);
        }
        return (await res.json()) as JupiterOrder;
    },

    async getOrderStatus(orderPubkey: string): Promise<JupiterOrder> {
        const url = `${JUPITER_BASE_URL}/orders/status/${encodeURIComponent(orderPubkey)}`;
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            throw new Error(`Failed to fetch Jupiter order status (HTTP ${res.status}): ${errorText}`);
        }
        return (await res.json()) as JupiterOrder;
    },

    async buy(params) {
        return this.createOrder({
            ownerPubkey: params.ownerPubkey,
            marketId: params.marketId,
            isBuy: true,
            isYes: params.side === "YES",
            depositAmount: String(usdToMicroUsd(params.amountUsdc)),
            maxBuyPriceUsd: params.maxBuyPriceUsd != null ? String(usdToMicroUsd(params.maxBuyPriceUsd)) : undefined,
            depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Explicitly use USDC on Solana
            slippageBps: params.slippageBps ?? 100, // Default 1%
        });
    },

    async sell(params) {
        return this.createOrder({
            ownerPubkey: params.ownerPubkey,
            marketId: params.marketId,
            isBuy: false,
            isYes: params.side === "YES",
            contracts: String(params.contracts),
            minSellPriceUsd: params.minSellPriceUsd != null ? String(usdToMicroUsd(params.minSellPriceUsd)) : undefined,
            positionPubkey: params.positionPubkey,
            slippageBps: params.slippageBps ?? 100, // Default 1%
        });
    },
};
