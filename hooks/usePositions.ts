import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { fetchJupiterPositions } from "../lib/jupiter";
import { microUsdToUsd } from "../lib/types/jupiter.types";

const SETTLED_STATUS_KEYWORDS = ["closed", "determined", "settled", "finalized", "resolved"];

export interface Position {
    marketId: string;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number; // Shares (contracts)
    currentPrice: number;
    currentValue: number;
    costBasis: number;
    pnl: number;
    pnlPct: number;
    imageUrl?: string;

    // Use position pubkey as the unique identifier where `mint` was used before.
    mint: string;

    marketStatus?: string;
    marketResult?: string | null;
    isClosed?: boolean;
    isWinner?: boolean | null;
    isRedeemable?: boolean;
    redeemPayoutPerShare?: number;
}

function isSettledStatus(status?: string | null): boolean {
    const normalized = (status ?? "").toLowerCase();
    if (!normalized) return false;
    return SETTLED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function usePositions() {
    const { activeWallet } = useAuth();
    const [activePositions, setActivePositions] = useState<Position[]>([]);
    const [closedPositions, setClosedPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPositions = useCallback(async () => {
        if (!activeWallet?.address) {
            setActivePositions([]);
            setClosedPositions([]);
            return;
        }

        console.log("[usePositions] Fetching Jupiter positions for:", activeWallet.address);
        setIsLoading(true);
        setError(null);

        try {
            const jupPositions = await fetchJupiterPositions(activeWallet.address);
            console.log(`[usePositions] Found ${jupPositions.length} positions`);

            const discoveredPositions: Position[] = jupPositions.map((pos) => {
                const amount = parseInt(pos.contracts, 10);
                const avgPrice = microUsdToUsd(pos.avgPriceUsd);
                const currentPrice = pos.currentPriceUsd != null ? microUsdToUsd(pos.currentPriceUsd) : avgPrice; // Fallback to cost basis if unknown
                const costBasis = microUsdToUsd(pos.costBasisUsd) || (amount * avgPrice);
                const currentValue = microUsdToUsd(pos.currentValueUsd) || (amount * currentPrice);
                const pnl = microUsdToUsd(pos.pnlUsd) || (currentValue - costBasis);
                const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

                const result = pos.marketResult?.toLowerCase() || "";
                const hasResult = result === "yes" || result === "no";

                // Determine if closed based on status or result
                const isClosed = hasResult || isSettledStatus(pos.marketStatus);

                let isWinner: boolean | null = null;
                let redeemPayoutPerShare = 0;
                if (hasResult) {
                    isWinner = (result === "yes" && pos.isYes) || (result === "no" && !pos.isYes);
                    redeemPayoutPerShare = isWinner ? 1 : 0;
                }

                const isRedeemable = Boolean(pos.claimable);

                return {
                    marketId: pos.marketId,
                    marketTitle: pos.marketTitle || pos.marketId, // API usually augments this
                    side: (pos.isYes ? "YES" : "NO") as "YES" | "NO",
                    amount,
                    currentPrice,
                    currentValue,
                    costBasis,
                    pnl,
                    pnlPct,
                    imageUrl: pos.imageUrl,
                    mint: pos.positionPubkey, // Important identifier mapped here for UI
                    marketStatus: pos.marketStatus,
                    marketResult: pos.marketResult,
                    isClosed,
                    isWinner,
                    isRedeemable,
                    redeemPayoutPerShare,
                };
            }).filter(p => p.amount > 0);

            const active = discoveredPositions
                .filter((p) => !p.isClosed)
                .sort((a, b) => b.currentValue - a.currentValue);

            const closed = discoveredPositions
                .filter((p) => p.isClosed)
                .sort((a, b) => b.currentValue - a.currentValue); // Just putting largest on top

            setActivePositions(active);
            setClosedPositions(closed);
        } catch (err) {
            console.error("[usePositions] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch positions");
        } finally {
            setIsLoading(false);
        }
    }, [activeWallet]);

    useEffect(() => {
        fetchPositions();
    }, [fetchPositions]);

    return { activePositions, closedPositions, isLoading, error, refresh: fetchPositions };
}
