import { useCallback, useEffect, useRef, useState } from "react";
import {
    fetchJupiterAccountHistory,
    fetchJupiterMarket,
} from "../lib/jupiter";
import {
    parseJupiterUsd,
    parseJupiterTimestampMs,
    type JupiterAccountHistoryEvent,
} from "../lib/types/jupiter.types";

export type JupiterHistoryRange = "30D" | "90D" | "ALL";

export interface NormalizedJupiterHistoryItem {
    id: string;
    type: "trade" | "claim" | "other";
    marketId?: string;
    title: string;
    side?: "buy" | "sell";
    outcome?: "YES" | "NO";
    grossUsd?: number;
    feesUsd?: number;
    claimUsd?: number;
    timestamp: number;
    signature?: string;
    positionPubkey?: string;
    message?: string;
}

const HISTORY_RANGE_MS: Record<Exclude<JupiterHistoryRange, "ALL">, number> = {
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
};
const HISTORY_PAGE_SIZE = 200;
const MAX_ALL_HISTORY_PAGES = 5;

function getHistoryCutoffMs(range: JupiterHistoryRange): number | null {
    if (range === "ALL") return null;
    return Date.now() - HISTORY_RANGE_MS[range];
}

function getHistoryItemType(event: JupiterAccountHistoryEvent): "trade" | "claim" | "other" {
    const haystack = `${event.eventType ?? ""} ${event.message ?? ""}`.toLowerCase();
    if (haystack.includes("claim")) return "claim";
    if (event.isBuy != null || haystack.includes("order") || haystack.includes("fill")) return "trade";
    return "other";
}

function pickFirstUsd(...values: Array<number | string | null | undefined>): number | undefined {
    for (const value of values) {
        const parsed = parseJupiterUsd(value);
        if (parsed != null) return parsed;
    }
    return undefined;
}

function normalizeEvent(
    event: JupiterAccountHistoryEvent,
    marketTitles: Record<string, string>
): NormalizedJupiterHistoryItem | null {
    const timestamp = parseJupiterTimestampMs(event.timestamp);
    if (timestamp == null) return null;

    const marketId = event.marketId?.trim() || undefined;
    const message = typeof event.message === "string" ? event.message.trim() : "";
    const embeddedMarketTitle = event.marketMetadata?.title?.trim();
    const embeddedEventTitle = event.eventMetadata?.title?.trim();
    const title =
        embeddedEventTitle ||
        embeddedMarketTitle ||
        (marketId ? (marketTitles[marketId] || marketId) : "") ||
        message ||
        event.eventType ||
        "Activity";
    const type = getHistoryItemType(event);
    const grossUsd = type === "claim"
        ? undefined
        : event.isBuy
            ? pickFirstUsd(event.totalCostUsd, event.depositAmountUsd, event.amountUsd)
            : pickFirstUsd(event.netProceedsUsd, event.grossProceedsUsd, event.amountUsd);
    const feesUsd = pickFirstUsd(event.feeUsd, event.feesPaidUsd);
    const claimUsd = pickFirstUsd(event.payoutAmountUsd, event.claimedUsd);

    return {
        id: String(
            event.id ??
            event.signature ??
            event.orderPubkey ??
            event.orderId ??
            `${marketId ?? "activity"}-${timestamp}`
        ),
        type,
        marketId,
        title,
        side: event.isBuy == null ? undefined : event.isBuy ? "buy" : "sell",
        outcome: event.isYes == null ? undefined : event.isYes ? "YES" : "NO",
        grossUsd,
        feesUsd,
        claimUsd,
        timestamp,
        signature: event.signature,
        positionPubkey: event.positionPubkey,
        message: message || event.eventType || undefined,
    };
}

export function useJupiterAccountHistory(walletAddress: string | null) {
    const [range, setRange] = useState<JupiterHistoryRange>("90D");
    const [events, setEvents] = useState<JupiterAccountHistoryEvent[]>([]);
    const [marketTitles, setMarketTitles] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    const fetchHistory = useCallback(async (targetRange?: JupiterHistoryRange) => {
        const normalizedWallet = walletAddress?.trim() ?? "";
        const nextRange = targetRange ?? range;
        const cutoffMs = getHistoryCutoffMs(nextRange);

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        if (!normalizedWallet) {
            setEvents([]);
            setError(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result: JupiterAccountHistoryEvent[] = [];
            let start = 0;
            let pageCount = 0;

            while (pageCount < MAX_ALL_HISTORY_PAGES) {
                const page = await fetchJupiterAccountHistory(normalizedWallet, {
                    start,
                    end: start + HISTORY_PAGE_SIZE,
                });

                const pageEvents = page.data ?? [];
                if (pageEvents.length === 0) break;

                result.push(...pageEvents);
                pageCount += 1;

                const lastTimestamp = parseJupiterTimestampMs(pageEvents[pageEvents.length - 1]?.timestamp);
                const hasReachedCutoff = cutoffMs != null && lastTimestamp != null && lastTimestamp < cutoffMs;
                const nextStart = page.pagination?.end ?? (start + pageEvents.length);

                if (!page.pagination?.hasNext || hasReachedCutoff || nextStart <= start) {
                    break;
                }

                start = nextStart;
            }

            if (requestId !== requestIdRef.current) return;

            const filteredEvents = cutoffMs == null
                ? result
                : result.filter((event) => (parseJupiterTimestampMs(event.timestamp) ?? 0) >= cutoffMs);

            setEvents(
                [...filteredEvents].sort((a, b) => {
                    const aTimestamp = parseJupiterTimestampMs(a.timestamp) ?? 0;
                    const bTimestamp = parseJupiterTimestampMs(b.timestamp) ?? 0;
                    return bTimestamp - aTimestamp;
                })
            );
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            setError(err instanceof Error ? err.message : "Failed to fetch Jupiter history");
            setEvents([]);
        } finally {
            if (requestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [range, walletAddress]);

    useEffect(() => {
        void fetchHistory(range);
    }, [fetchHistory, range]);

    useEffect(() => {
        const unknownMarketIds = Array.from(
            new Set(
                events
                    .filter((event) => !event.marketMetadata?.title?.trim() && !event.eventMetadata?.title?.trim())
                    .map((event) => event.marketId?.trim())
                    .filter((marketId): marketId is string => !!marketId && !marketTitles[marketId])
            )
        );

        if (unknownMarketIds.length === 0) return;

        let cancelled = false;

        (async () => {
            const fetchedEntries = await Promise.all(
                unknownMarketIds.map(async (marketId) => {
                    const market = await fetchJupiterMarket(marketId);
                    const title = market?.metadata?.title?.trim();
                    return title ? [marketId, title] as const : null;
                })
            );

            if (cancelled) return;

            const nextEntries = fetchedEntries.filter((entry): entry is readonly [string, string] => entry != null);
            if (nextEntries.length === 0) return;

            setMarketTitles((current) => {
                const next = { ...current };
                for (const [marketId, title] of nextEntries) {
                    next[marketId] = title;
                }
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [events, marketTitles]);

    const items = events
        .map((event) => normalizeEvent(event, marketTitles))
        .filter((event): event is NormalizedJupiterHistoryItem => event != null);

    return {
        error,
        isLoading,
        items,
        range,
        refresh: () => fetchHistory(range),
        setRange,
    };
}
