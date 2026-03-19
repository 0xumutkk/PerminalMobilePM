import type { Position } from "../hooks/usePositions";
import type { Market } from "./mock-data";
import { supabase } from "./supabase";

export type TradePostMode = "BUY" | "SELL";
export type TradePostSide = "YES" | "NO";

export interface ExecutedTradeResult {
    signature: string;
    outcome: TradePostSide;
    amount: number;
    sharesCount?: number;
    totalValue?: number;
    price: number;
    mode: TradePostMode;
    marketId: string;
    resolutionStatus: "filled" | "partially_filled";
}

export interface SharedPositionSnapshot {
    marketId: string;
    marketTitle: string;
    side: TradePostSide;
    amount: number;
    currentPrice: number;
    currentValue: number;
    costBasis: number;
    pnl: number;
    pnlPct: number;
    imageUrl?: string;
    mint: string;
}

export function buildTradePostMetadata(market: Market, details: ExecutedTradeResult) {
    const resolvedMarketId = market.marketId || market.id;
    const sharesCount = Number.isFinite(details.sharesCount) ? Math.max(0, details.sharesCount ?? 0) : Math.max(0, details.amount);
    const totalValue = Number.isFinite(details.totalValue)
        ? Math.max(0, details.totalValue ?? 0)
        : Math.max(0, sharesCount * details.price);
    const currentPrice = details.outcome === "YES" ? market.yesPrice : (1 - market.yesPrice);

    return {
        signature: details.signature,
        marketId: resolvedMarketId,
        marketQuestion: market.eventTitle || market.title,
        marketTitle: market.title,
        side: details.outcome,
        outcome: details.outcome,
        mode: details.mode,
        shares_count: sharesCount,
        total_value: totalValue,
        avg_entry: details.price,
        current_price: currentPrice,
        resolutionStatus: details.resolutionStatus,
    };
}

export function buildPositionPostMetadata(
    position: SharedPositionSnapshot | Position,
    market?: Market | null
) {
    const resolvedMarketId = market?.marketId || market?.id || position.marketId;
    const marketQuestion = market?.eventTitle || market?.title || position.marketTitle;
    const avgEntry = position.amount > 0 ? position.costBasis / position.amount : 0;
    const currentPrice = position.currentPrice > 0
        ? position.currentPrice
        : position.side === "YES"
            ? (market?.yesPrice ?? 0)
            : market
                ? (1 - market.yesPrice)
                : 0;

    return {
        source: "position_snapshot",
        marketId: resolvedMarketId,
        marketQuestion,
        marketTitle: market?.title || position.marketTitle,
        side: position.side,
        outcome: position.side,
        mode: "HOLD",
        shares_count: Math.max(0, position.amount),
        total_value: Math.max(0, position.currentValue),
        current_value: Math.max(0, position.currentValue),
        cost_basis: Math.max(0, position.costBasis),
        avg_entry: Math.max(0, avgEntry),
        current_price: Math.max(0, currentPrice),
        unrealized_pnl: position.pnl,
        unrealized_pnl_percent: position.pnlPct,
        position_mint: position.mint,
        captured_at: new Date().toISOString(),
    };
}

export async function requestTradeVerification(postId: string, txHash: string, userWalletAddress: string) {
    return supabase.functions.invoke("verify-trade", {
        body: {
            postId,
            txHash,
            userWalletAddress,
        },
    });
}
