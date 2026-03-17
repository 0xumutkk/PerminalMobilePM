import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartPoint } from "../lib/mock-data";
import {
    fetchJupiterProfile,
    fetchJupiterProfilePnlHistory,
} from "../lib/jupiter";
import {
    parseJupiterNumber,
    parseJupiterTimestampMs,
    parseJupiterUsd,
    type JupiterProfile,
} from "../lib/types/jupiter.types";

export type PortfolioPerformanceRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

const RANGE_TO_WINDOW_MS: Record<Exclude<PortfolioPerformanceRange, "ALL">, number> = {
    "1H": 60 * 60 * 1000,
    "6H": 6 * 60 * 60 * 1000,
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
};

function buildRangeParams(range: PortfolioPerformanceRange): { interval: "24h" | "1w" | "1m"; count: number } {
    if (range === "1W") {
        return { interval: "1w", count: 1000 };
    }
    if (range === "1M" || range === "ALL") {
        return { interval: "1m", count: 1000 };
    }
    return { interval: "24h", count: 1000 };
}

function filterHistoryForRange(
    history: Array<{ timestamp?: number | string | null; realizedPnlUsd?: number | string | null; balanceUsd?: number | string | null }>,
    range: PortfolioPerformanceRange
) {
    if (range === "ALL") return history;

    const cutoffMs = Date.now() - RANGE_TO_WINDOW_MS[range];
    return history.filter((point) => {
        const timestamp = parseJupiterTimestampMs(point.timestamp);
        return timestamp != null && timestamp >= cutoffMs;
    });
}

function calculateRangePnlUsd(series: ChartPoint[]): number | null {
    if (series.length === 0) return null;
    const first = series[0]?.value ?? 0;
    const last = series[series.length - 1]?.value ?? first;
    return last - first;
}

function buildFlatSeries(range: Exclude<PortfolioPerformanceRange, "ALL">, value: number): ChartPoint[] {
    const { startTimestamp, endTimestamp } = getRangeWindow(range);

    return [
        { timestamp: startTimestamp, value },
        { timestamp: endTimestamp, value },
    ];
}

function getRangeWindow(range: Exclude<PortfolioPerformanceRange, "ALL">): { startTimestamp: number; endTimestamp: number } {
    const endTimestamp = Date.now();
    return {
        startTimestamp: endTimestamp - RANGE_TO_WINDOW_MS[range],
        endTimestamp,
    };
}

function extendSeriesToRange(
    series: ChartPoint[],
    range: Exclude<PortfolioPerformanceRange, "ALL">
): ChartPoint[] {
    if (series.length === 0) return series;

    const { startTimestamp, endTimestamp } = getRangeWindow(range);
    const nextSeries = [...series];
    const firstPoint = nextSeries[0];
    const lastPoint = nextSeries[nextSeries.length - 1];

    if (firstPoint.timestamp > startTimestamp) {
        nextSeries.unshift({ timestamp: startTimestamp, value: firstPoint.value });
    }

    if (lastPoint.timestamp < endTimestamp) {
        nextSeries.push({ timestamp: endTimestamp, value: lastPoint.value });
    }

    return nextSeries;
}

function getLatestHistoryValue(
    history: Array<{ balanceUsd?: number | string | null; realizedPnlUsd?: number | string | null; timestamp?: number | string | null }>
): number | null {
    const sortedHistory = [...history].sort(
        (a, b) => (parseJupiterTimestampMs(a.timestamp) ?? 0) - (parseJupiterTimestampMs(b.timestamp) ?? 0)
    );

    for (let index = sortedHistory.length - 1; index >= 0; index -= 1) {
        const point = sortedHistory[index];
        const value = parseJupiterUsd(point.realizedPnlUsd ?? point.balanceUsd);
        if (value != null) return value;
    }

    return null;
}

function calculateWinRate(profile: JupiterProfile | null): number | null {
    if (!profile) return null;

    const explicitWinRate = parseJupiterNumber(profile.winRatePct ?? profile.winRate);
    if (explicitWinRate != null) return explicitWinRate;

    const wins = parseJupiterNumber(profile.correctPredictions ?? profile.totalWins);
    const losses = parseJupiterNumber(profile.wrongPredictions ?? profile.totalLosses);
    if (wins == null || losses == null || wins + losses <= 0) return null;

    return (wins / (wins + losses)) * 100;
}

function normalizeBalanceSeries(
    history: Array<{ balanceUsd?: number | string | null; realizedPnlUsd?: number | string | null; timestamp?: number | string | null }>
): ChartPoint[] {
    const points = history
        .map((point) => {
            const timestamp = parseJupiterTimestampMs(point.timestamp);
            const value = parseJupiterUsd(point.realizedPnlUsd ?? point.balanceUsd);
            if (timestamp == null || value == null) return null;
            return { timestamp, value } satisfies ChartPoint;
        })
        .filter((point): point is ChartPoint => point != null)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (points.length <= 1) return points;

    const deduped: ChartPoint[] = [];
    for (const point of points) {
        const last = deduped[deduped.length - 1];
        if (last && last.timestamp === point.timestamp) {
            deduped[deduped.length - 1] = point;
            continue;
        }
        deduped.push(point);
    }

    return deduped;
}

export function useJupiterPortfolioPerformance(walletAddress: string | null) {
    const [range, setRange] = useState<PortfolioPerformanceRange>("ALL");
    const [profile, setProfile] = useState<JupiterProfile | null>(null);
    const [balanceSeries, setBalanceSeries] = useState<ChartPoint[]>([]);
    const [rangeRealizedPnlUsd, setRangeRealizedPnlUsd] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    const fetchPerformance = useCallback(async (targetRange?: PortfolioPerformanceRange) => {
        const normalizedWallet = walletAddress?.trim() ?? "";
        const nextRange = targetRange ?? range;

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        if (!normalizedWallet) {
            setProfile(null);
            setBalanceSeries([]);
            setRangeRealizedPnlUsd(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const [profileResult, historyResult] = await Promise.all([
                fetchJupiterProfile(normalizedWallet),
                fetchJupiterProfilePnlHistory(normalizedWallet, buildRangeParams(nextRange)),
            ]);

            if (requestId !== requestIdRef.current) return;

            const filteredHistory = filterHistoryForRange(historyResult, nextRange);
            const latestHistoryValue = getLatestHistoryValue(historyResult);

            let normalizedSeries = normalizeBalanceSeries(filteredHistory);
            if (normalizedSeries.length === 0 && nextRange !== "ALL") {
                const fallbackValue = parseJupiterUsd(profileResult?.realizedPnlUsd) ?? latestHistoryValue;
                if (fallbackValue != null) {
                    normalizedSeries = buildFlatSeries(nextRange, fallbackValue);
                }
            } else if (normalizedSeries.length > 0 && nextRange !== "ALL") {
                normalizedSeries = extendSeriesToRange(normalizedSeries, nextRange);
            }

            setProfile(profileResult);
            setBalanceSeries(normalizedSeries);
            setRangeRealizedPnlUsd(calculateRangePnlUsd(normalizedSeries));
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            setError(err instanceof Error ? err.message : "Failed to fetch Jupiter performance");
            setProfile(null);
            setBalanceSeries([]);
            setRangeRealizedPnlUsd(null);
        } finally {
            if (requestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [range, walletAddress]);

    useEffect(() => {
        void fetchPerformance(range);
    }, [fetchPerformance, range]);

    const allTimeRealizedPnlUsd = parseJupiterUsd(profile?.realizedPnlUsd);
    const realizedPnlUsd =
        range === "ALL"
            ? (allTimeRealizedPnlUsd ?? rangeRealizedPnlUsd)
            : (rangeRealizedPnlUsd ?? 0);

    return {
        profile,
        balanceSeries,
        error,
        isLoading,
        range,
        realizedPnlUsd,
        winRate: calculateWinRate(profile),
        setRange,
        refresh: () => fetchPerformance(range),
    };
}
