import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { fetchJupiterPositions, fetchMarketForApp } from "../lib/jupiter";
import { microUsdToUsd } from "../lib/types/jupiter.types";

const SETTLED_STATUS_KEYWORDS = ["closed", "determined", "settled", "finalized", "resolved"];
const OPTIMISTIC_POSITION_TTL_MS = 5 * 60 * 1000;

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

interface OptimisticPositionEntry extends Position {
    updatedAt: number;
}

interface ApplyOptimisticTradeParams {
    ownerPubkey: string;
    mode: "BUY" | "SELL";
    marketId: string;
    marketTitle?: string;
    side: "YES" | "NO";
    contracts: number;
    price: number;
    positionPubkey: string;
    imageUrl?: string;
    basePosition?: Position | null;
}

const optimisticPositionsByWallet = new Map<string, OptimisticPositionEntry[]>();
const positionsCacheByWallet = new Map<string, {
    activePositions: Position[];
    closedPositions: Position[];
}>();

function isSettledStatus(status?: string | null): boolean {
    const normalized = (status ?? "").toLowerCase();
    if (!normalized) return false;
    return SETTLED_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasReadableMarketTitle(title: string | null | undefined, marketId: string): boolean {
    const normalizedTitle = title?.trim() ?? "";
    const normalizedMarketId = marketId.trim();

    if (!normalizedTitle) return false;
    if (normalizedTitle === normalizedMarketId) return false;
    if (normalizedTitle.startsWith("POLY-")) return false;
    return true;
}

function hasRenderableImage(url: string | null | undefined): boolean {
    return !!url?.trim();
}

function buildPositionValuation(amount: number, currentPrice: number, costBasis: number) {
    const currentValue = amount * currentPrice;
    const pnl = currentValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return {
        currentValue,
        pnl,
        pnlPct,
    };
}

function normalizeOwnerPubkey(ownerPubkey: string): string {
    return ownerPubkey.trim();
}

function getActiveOptimisticEntries(ownerPubkey: string): OptimisticPositionEntry[] {
    const normalizedOwner = normalizeOwnerPubkey(ownerPubkey);
    if (!normalizedOwner) return [];

    const now = Date.now();
    const cached = optimisticPositionsByWallet.get(normalizedOwner) ?? [];
    const fresh = cached.filter((entry) => (
        entry.amount > 0 &&
        now - entry.updatedAt <= OPTIMISTIC_POSITION_TTL_MS
    ));

    if (fresh.length === 0) {
        optimisticPositionsByWallet.delete(normalizedOwner);
        return [];
    }

    if (fresh.length !== cached.length) {
        optimisticPositionsByWallet.set(normalizedOwner, fresh);
    }

    return fresh;
}

function setOptimisticEntries(ownerPubkey: string, entries: OptimisticPositionEntry[]) {
    const normalizedOwner = normalizeOwnerPubkey(ownerPubkey);
    if (!normalizedOwner) return;

    if (entries.length === 0) {
        optimisticPositionsByWallet.delete(normalizedOwner);
        return;
    }

    optimisticPositionsByWallet.set(normalizedOwner, entries);
}

function getCachedPositions(ownerPubkey: string) {
    const normalizedOwner = normalizeOwnerPubkey(ownerPubkey);
    if (!normalizedOwner) return null;
    return positionsCacheByWallet.get(normalizedOwner) ?? null;
}

function setCachedPositions(ownerPubkey: string, activePositions: Position[], closedPositions: Position[]) {
    const normalizedOwner = normalizeOwnerPubkey(ownerPubkey);
    if (!normalizedOwner) return;

    positionsCacheByWallet.set(normalizedOwner, {
        activePositions,
        closedPositions,
    });
}

function positionsMatch(fetched: Position, optimistic: OptimisticPositionEntry): boolean {
    return fetched.marketId === optimistic.marketId
        && fetched.side === optimistic.side
        && Math.abs(fetched.amount - optimistic.amount) < 0.000001
        && Math.abs(fetched.costBasis - optimistic.costBasis) < 0.000001;
}

export function applyOptimisticTrade({
    ownerPubkey,
    mode,
    marketId,
    marketTitle,
    side,
    contracts,
    price,
    positionPubkey,
    imageUrl,
    basePosition,
}: ApplyOptimisticTradeParams) {
    const normalizedOwner = normalizeOwnerPubkey(ownerPubkey);
    const normalizedPositionPubkey = positionPubkey.trim();
    const wholeContracts = Math.max(0, Math.floor(contracts));

    if (!normalizedOwner || !normalizedPositionPubkey || wholeContracts <= 0) return;

    const now = Date.now();
    const existingEntries = getActiveOptimisticEntries(normalizedOwner);
    const nextEntries = [...existingEntries];
    const existingIndex = nextEntries.findIndex((entry) => entry.mint === normalizedPositionPubkey);
    const existingEntry = existingIndex >= 0 ? nextEntries[existingIndex] : null;
    const resolvedPrice = price > 0 ? price : existingEntry?.currentPrice ?? basePosition?.currentPrice ?? 0;

    if (mode === "BUY") {
        const previousAmount = existingEntry?.amount ?? 0;
        const nextAmount = previousAmount + wholeContracts;
        const nextCostBasis = (existingEntry?.costBasis ?? 0) + wholeContracts * resolvedPrice;
        const valuation = buildPositionValuation(nextAmount, resolvedPrice, nextCostBasis);
        const nextEntry: OptimisticPositionEntry = {
            marketId,
            marketTitle: existingEntry?.marketTitle || marketTitle?.trim() || basePosition?.marketTitle || marketId,
            side,
            amount: nextAmount,
            currentPrice: resolvedPrice,
            currentValue: valuation.currentValue,
            costBasis: nextCostBasis,
            pnl: valuation.pnl,
            pnlPct: valuation.pnlPct,
            imageUrl: existingEntry?.imageUrl || imageUrl || basePosition?.imageUrl,
            mint: normalizedPositionPubkey,
            marketStatus: existingEntry?.marketStatus || basePosition?.marketStatus || "open",
            marketResult: existingEntry?.marketResult || basePosition?.marketResult || null,
            isClosed: false,
            isWinner: existingEntry?.isWinner ?? basePosition?.isWinner ?? null,
            isRedeemable: false,
            redeemPayoutPerShare: existingEntry?.redeemPayoutPerShare ?? basePosition?.redeemPayoutPerShare ?? 0,
            updatedAt: now,
        };

        if (existingIndex >= 0) {
            nextEntries[existingIndex] = nextEntry;
        } else {
            nextEntries.unshift(nextEntry);
        }

        setOptimisticEntries(normalizedOwner, nextEntries);
        return;
    }

    const sourceEntry = existingEntry ?? (basePosition ? { ...basePosition, updatedAt: now } : null);
    if (!sourceEntry) return;

    const nextAmount = Math.max(0, sourceEntry.amount - wholeContracts);
    if (nextAmount <= 0.000001) {
        const filteredEntries = nextEntries.filter((entry) => entry.mint !== normalizedPositionPubkey);
        setOptimisticEntries(normalizedOwner, filteredEntries);
        return;
    }

    const averageCost = sourceEntry.amount > 0 ? sourceEntry.costBasis / sourceEntry.amount : 0;
    const nextCostBasis = Math.max(0, sourceEntry.costBasis - averageCost * wholeContracts);
    const valuation = buildPositionValuation(nextAmount, resolvedPrice, nextCostBasis);
    const nextEntry: OptimisticPositionEntry = {
        ...sourceEntry,
        marketId,
        marketTitle: sourceEntry.marketTitle || marketTitle?.trim() || marketId,
        side,
        amount: nextAmount,
        currentPrice: resolvedPrice,
        currentValue: valuation.currentValue,
        costBasis: nextCostBasis,
        pnl: valuation.pnl,
        pnlPct: valuation.pnlPct,
        imageUrl: sourceEntry.imageUrl || imageUrl,
        mint: normalizedPositionPubkey,
        isClosed: false,
        isRedeemable: false,
        updatedAt: now,
    };

    if (existingIndex >= 0) {
        nextEntries[existingIndex] = nextEntry;
    } else {
        nextEntries.unshift(nextEntry);
    }

    setOptimisticEntries(normalizedOwner, nextEntries);
}

export function usePositions() {
    const { activeWallet } = useAuth();
    const [activePositions, setActivePositions] = useState<Position[]>([]);
    const [closedPositions, setClosedPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeWallet?.address) {
            setActivePositions([]);
            setClosedPositions([]);
            return;
        }

        const cachedPositions = getCachedPositions(activeWallet.address);
        if (!cachedPositions) return;

        setActivePositions(cachedPositions.activePositions);
        setClosedPositions(cachedPositions.closedPositions);
    }, [activeWallet?.address]);

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

            const missingMetadataIds = Array.from(
                new Set(
                    jupPositions
                        .filter((pos) =>
                            !hasReadableMarketTitle(pos.marketTitle, pos.marketId) ||
                            !hasRenderableImage(pos.imageUrl)
                        )
                        .map((pos) => pos.marketId?.trim())
                        .filter((marketId): marketId is string => !!marketId)
                )
            );

            const fetchedMetadata = await Promise.all(
                missingMetadataIds.map(async (marketId) => {
                    const market = await fetchMarketForApp(marketId);
                    if (!market) return null;

                    const title = market.title?.trim();
                    const imageUrl = market.imageUrl?.trim();

                    if (!title && !imageUrl) return null;

                    return [
                        marketId,
                        {
                            title,
                            imageUrl,
                        },
                    ] as const;
                })
            );

            const resolvedMetadata = fetchedMetadata.reduce<Record<string, { title?: string; imageUrl?: string }>>(
                (acc, entry) => {
                    if (!entry) return acc;
                    acc[entry[0]] = entry[1];
                    return acc;
                },
                {}
            );

            const discoveredPositions: Position[] = jupPositions.map((pos) => {
                const amount = parseFloat(pos.contracts || "0");
                const avgPrice = microUsdToUsd(pos.avgPriceUsd);
                const currentPrice = pos.currentPriceUsd != null
                    ? microUsdToUsd(pos.currentPriceUsd)
                    : pos.markPriceUsd != null
                        ? microUsdToUsd(pos.markPriceUsd)
                        : avgPrice;
                const costBasis = pos.costBasisUsd != null
                    ? microUsdToUsd(pos.costBasisUsd)
                    : amount * avgPrice;
                const valuation = buildPositionValuation(amount, currentPrice, costBasis);
                const currentValue = pos.valueUsd != null
                    ? microUsdToUsd(pos.valueUsd)
                    : valuation.currentValue;
                const pnl = pos.pnlUsd != null
                    ? microUsdToUsd(pos.pnlUsd)
                    : valuation.pnl;
                const pnlPct = parseFiniteNumber(pos.pnlUsdPercent) ?? valuation.pnlPct;

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
                const metadata = resolvedMetadata[pos.marketId];
                const marketTitle =
                    metadata?.title ||
                    (hasReadableMarketTitle(pos.marketTitle, pos.marketId) ? pos.marketTitle!.trim() : "") ||
                    pos.marketId;
                const imageUrl = metadata?.imageUrl || pos.imageUrl;

                return {
                    marketId: pos.marketId,
                    marketTitle,
                    side: (pos.isYes ? "YES" : "NO") as "YES" | "NO",
                    amount,
                    currentPrice,
                    currentValue,
                    costBasis,
                    pnl,
                    pnlPct,
                    imageUrl,
                    mint: pos.pubkey, // Important identifier mapped here for UI
                    marketStatus: pos.marketStatus,
                    marketResult: pos.marketResult,
                    isClosed,
                    isWinner,
                    isRedeemable,
                    redeemPayoutPerShare,
                };
            }).filter((position) => position.amount > 0);

            const optimisticEntries = getActiveOptimisticEntries(activeWallet.address);
            const mergedPositionsMap = new Map<string, Position>(discoveredPositions.map((position) => [position.mint, position]));
            const unresolvedOptimisticEntries: OptimisticPositionEntry[] = [];

            for (const optimisticEntry of optimisticEntries) {
                const fetchedPosition = mergedPositionsMap.get(optimisticEntry.mint);
                if (fetchedPosition && positionsMatch(fetchedPosition, optimisticEntry)) {
                    continue;
                }

                unresolvedOptimisticEntries.push(optimisticEntry);
                mergedPositionsMap.set(optimisticEntry.mint, optimisticEntry);
            }

            setOptimisticEntries(activeWallet.address, unresolvedOptimisticEntries);
            const mergedPositions = Array.from(mergedPositionsMap.values()).filter((position) => position.amount > 0);

            const active = mergedPositions
                .filter((p) => !p.isClosed)
                .sort((a, b) => b.currentValue - a.currentValue);

            const closed = mergedPositions
                .filter((p) => p.isClosed)
                .sort((a, b) => b.currentValue - a.currentValue); // Just putting largest on top

            setCachedPositions(activeWallet.address, active, closed);
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
