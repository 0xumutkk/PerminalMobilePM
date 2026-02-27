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

function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
    return headers;
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
     * Utility method for buying
     */
    buy(params: {
        ownerPubkey: string;
        marketId: string;
        side: "YES" | "NO";
        contracts: number; // e.g. 10 shares
        maxBuyPriceUsd?: number; // e.g. 0.50
    }): Promise<JupiterCreateOrderResponse>;

    /**
     * Utility method for selling
     */
    sell(params: {
        ownerPubkey: string;
        marketId: string;
        side: "YES" | "NO";
        contracts: number; // e.g. 10 shares
        minSellPriceUsd?: number; // e.g. 0.40
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
            throw new Error(`Failed to create Jupiter order (HTTP ${res.status}): ${errorText}`);
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

    async buy(params) {
        return this.createOrder({
            ownerPubkey: params.ownerPubkey,
            marketId: params.marketId,
            side: "buy",
            isYes: params.side === "YES",
            contracts: params.contracts.toString(),
            maxBuyPriceUsd: params.maxBuyPriceUsd != null ? usdToMicroUsd(params.maxBuyPriceUsd) : undefined,
        });
    },

    async sell(params) {
        return this.createOrder({
            ownerPubkey: params.ownerPubkey,
            marketId: params.marketId,
            side: "sell",
            isYes: params.side === "YES",
            contracts: params.contracts.toString(),
            minSellPriceUsd: params.minSellPriceUsd != null ? usdToMicroUsd(params.minSellPriceUsd) : undefined,
        });
    },
};
