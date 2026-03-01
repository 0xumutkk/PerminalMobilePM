import Constants from "expo-constants";
import type { ChartPoint } from "./mock-data";

const extra = Constants.expoConfig?.extra ?? {};
const JUPITER_API_KEY = (extra.jupiterApiKey ?? process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "").trim();
const JUPITER_BASE_URL = "https://api.jup.ag/prediction/v1";
const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_CLOB_BASE_URL = "https://clob.polymarket.com";

export type ChartRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

const CLUSTER_COLORS = ["#178CFF", "#FF3B30", "#FFD60A", "#32D74B", "#AF52DE", "#5AC8FA"];

export interface MarketActivityTrade {
    side: "buy" | "sell";
    outcome: "yes" | "no";
    price: number; // 0-1 probability
    size: number;
    sizeUnit: "shares" | "usd";
    timestamp: number; // unix seconds
    txHash: string;
}

export interface ClusteredMarketInput {
    marketId: string;
    label?: string;
    color?: string;
    provider?: string;
    polymarketAssetId?: string;
}

export interface ClusteredMarketSeries {
    key: string;
    label: string;
    color: string;
    data: ChartPoint[];
}

interface JupiterTradesResponse {
    data: Array<{
        id?: number;
        ownerPubkey?: string;
        marketId?: string;
        message?: string;
        timestamp?: number;
        action?: "buy" | "sell";
        side?: "yes" | "no";
        amountUsd?: string | number;
        priceUsd?: string | number;
        eventId?: string;
    }>;
}

interface JupiterOrdersResponse {
    data: Array<{
        marketId?: string;
        status?: "pending" | "filled" | "failed" | string;
        isYes?: boolean;
        isBuy?: boolean;
        createdAt?: number;
        updatedAt?: number;
        filledAt?: number;
        avgFillPriceUsd?: string | number;
        maxFillPriceUsd?: string | number;
        maxBuyPriceUsd?: string | number;
        minSellPriceUsd?: string | number;
        filledContracts?: string | number;
        contracts?: string | number;
        sizeUsd?: string | number;
        orderId?: string;
        pubkey?: string;
    }>;
    pagination?: {
        start?: number;
        end?: number;
        total?: number;
        hasNext?: boolean;
    };
}

interface JupiterHistoryResponse {
    data: Array<{
        id?: number;
        eventType?: string;
        signature?: string;
        timestamp?: number;
        marketId?: string;
        isBuy?: boolean;
        isYes?: boolean;
        contracts?: string | number;
        filledContracts?: string | number;
        maxFillPriceUsd?: string | number;
        avgFillPriceUsd?: string | number;
        maxBuyPriceUsd?: string | number;
        minSellPriceUsd?: string | number;
        orderId?: string;
    }>;
    pagination?: {
        start?: number;
        end?: number;
        total?: number;
        hasNext?: boolean;
    };
}

interface JupiterOrderbookResponse {
    yes?: number[][];
    no?: number[][];
}

interface KalshiBatchCandlesticksResponse {
    markets?: Array<{
        market_ticker?: string;
        candlesticks?: Array<{
            end_period_ts?: number;
            price?: {
                close?: number | string;
                close_dollars?: number | string;
                mean?: number | string;
                mean_dollars?: number | string;
                previous?: number | string;
                previous_dollars?: number | string;
            };
            yes_bid?: {
                close?: number | string;
                close_dollars?: number | string;
            };
            yes_ask?: {
                close?: number | string;
                close_dollars?: number | string;
            };
        }>;
    }>;
}

interface PolymarketMarketPrice {
    t: number;
    p: number;
}

interface PolymarketPricesHistoryResponse {
    history?: PolymarketMarketPrice[];
}

function isLikelyPolymarketAssetId(value: string | undefined | null): boolean {
    if (!value) return false;
    const trimmed = String(value).trim();
    // Polymarket CLOB asset IDs are very long positive integers (dozens of digits).
    // Treat anything that is all digits and reasonably long as an asset id.
    return /^[0-9]{20,}$/.test(trimmed);
}

async function resolvePolymarketAssetIdFromSlug(slug: string): Promise<string | null> {
    const cleanedSlug = String(slug ?? "").trim();
    if (!cleanedSlug) return null;

    const url = new URL("https://gamma-api.polymarket.com/markets");
    url.searchParams.set("slug", cleanedSlug);
    url.searchParams.set("limit", "1");

    try {
        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!res.ok) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.warn(
                    "[JupiterChart] Polymarket Gamma /markets non-200",
                    res.status,
                    url.toString()
                );
            }
            return null;
        }
        const data = (await res.json()) as any;
        const firstMarket = Array.isArray(data) ? data[0] : null;
        if (!firstMarket) return null;

        const rawClobTokenIds = firstMarket.clobTokenIds;
        if (!rawClobTokenIds) return null;

        if (Array.isArray(rawClobTokenIds) && typeof rawClobTokenIds[0] === "string") {
            return rawClobTokenIds[0];
        }

        if (typeof rawClobTokenIds === "string") {
            try {
                const parsed = JSON.parse(rawClobTokenIds);
                if (Array.isArray(parsed) && typeof parsed[0] === "string") {
                    return parsed[0];
                }
            } catch {
                const first = String(rawClobTokenIds)
                    .split(/[,\\s]+/)
                    .filter(Boolean)[0];
                if (first) return first;
            }
        }
        return null;
    } catch (error) {
        console.warn("[JupiterChart] Polymarket Gamma /markets failed:", error);
        return null;
    }
}

async function resolveAllPolymarketAssetIdsFromSlug(slug: string): Promise<Record<string, string>> {
    const cleanedSlug = String(slug ?? "").trim();
    if (!cleanedSlug) return {};

    try {
        const eventUrl = new URL("https://gamma-api.polymarket.com/events");
        eventUrl.searchParams.set("slug", cleanedSlug);
        const eventRes = await fetch(eventUrl.toString(), { headers: { Accept: "application/json" } });
        if (eventRes.ok) {
            const eventData = (await eventRes.json()) as any;
            if (Array.isArray(eventData) && eventData[0]?.markets) {
                const map: Record<string, string> = {};
                for (const m of eventData[0].markets) {
                    const label = (m.groupItemTitle || m.question || "").trim();
                    let clob = "";
                    if (Array.isArray(m.clobTokenIds) && m.clobTokenIds.length > 0) {
                        clob = m.clobTokenIds[0];
                    } else if (typeof m.clobTokenIds === "string") {
                        try {
                            const parsed = JSON.parse(m.clobTokenIds);
                            if (Array.isArray(parsed) && parsed.length > 0) clob = parsed[0];
                        } catch {
                            clob = String(m.clobTokenIds).split(/[,\\s]+/)[0];
                        }
                    }
                    if (label && clob) {
                        map[label] = clob;
                    }
                }
                if (Object.keys(map).length > 0) {
                    return map;
                }
            }
        }
    } catch (e) {
        // Fallback to markets query
    }

    const url = new URL("https://gamma-api.polymarket.com/markets");
    url.searchParams.set("slug", cleanedSlug);
    url.searchParams.set("limit", "1");

    try {
        const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
        if (!res.ok) return {};
        const data = (await res.json()) as any;
        const firstMarket = Array.isArray(data) ? data[0] : null;
        if (!firstMarket || !Array.isArray(firstMarket.outcomes) || !firstMarket.clobTokenIds) return {};

        let clobs: string[] = [];
        const rawClobTokenIds = firstMarket.clobTokenIds;
        if (Array.isArray(rawClobTokenIds)) {
            clobs = rawClobTokenIds.map(String);
        } else if (typeof rawClobTokenIds === "string") {
            try {
                const parsed = JSON.parse(rawClobTokenIds);
                if (Array.isArray(parsed)) clobs = parsed.map(String);
            } catch {
                clobs = String(rawClobTokenIds).split(/[,\\s]+/).filter(Boolean);
            }
        }

        const map: Record<string, string> = {};
        for (let i = 0; i < firstMarket.outcomes.length; i++) {
            const outcomeLabel = String(firstMarket.outcomes[i]).trim();
            const clob = clobs[i];
            if (outcomeLabel && clob) {
                map[outcomeLabel] = clob;
            }
        }
        return map;
    } catch (error) {
        console.warn("[JupiterChart] Polymarket Gamma all-slugs failed:", error);
        return {};
    }
}

function getHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
    return headers;
}

function parseNumberish(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function toUnixSeconds(value: unknown): number | null {
    const raw = parseNumberish(value);
    if (raw == null) return null;
    if (raw > 1_000_000_000_000) return Math.floor(raw / 1000);
    return Math.floor(raw);
}

function toUnixMs(value: unknown): number | null {
    const sec = toUnixSeconds(value);
    if (sec == null) return null;
    return sec * 1000;
}

function normalizeProbability(rawValue: unknown): number | null {
    const raw = parseNumberish(rawValue);
    if (raw == null) return null;

    if (raw >= 0 && raw <= 1) return raw;
    if (raw >= 0 && raw <= 100) return raw / 100;
    if (raw >= 0) return raw / 1_000_000;
    return null;
}

function getRangeWindowMs(range: ChartRange): number {
    if (range === "1H") return 1 * 60 * 60 * 1000;
    if (range === "6H") return 6 * 60 * 60 * 1000;
    if (range === "1D") return 24 * 60 * 60 * 1000;
    if (range === "1W") return 7 * 24 * 60 * 60 * 1000;
    if (range === "1M") return 30 * 24 * 60 * 60 * 1000;
    return Number.POSITIVE_INFINITY;
}

function getRangeWindowSec(range: ChartRange): number {
    if (range === "1H") return 1 * 60 * 60;
    if (range === "6H") return 6 * 60 * 60;
    if (range === "1D") return 24 * 60 * 60;
    if (range === "1W") return 7 * 24 * 60 * 60;
    if (range === "1M") return 30 * 24 * 60 * 60;
    return 365 * 24 * 60 * 60;
}

function getKalshiPeriodIntervalMinutes(range: ChartRange): number {
    if (range === "1H") return 1;
    if (range === "6H") return 5;
    if (range === "1D") return 15;
    if (range === "1W") return 60;
    if (range === "1M") return 240;
    return 1440;
}

function getPolymarketIntervalForRange(range: ChartRange): string {
    if (range === "1H" || range === "6H") return "1m";
    if (range === "1D") return "1h";
    if (range === "1W") return "6h";
    if (range === "1M") return "1d";
    return "all";
}

function toYesProbability(priceUsd: unknown, side: "yes" | "no"): number | null {
    const probability = normalizeProbability(priceUsd);
    if (probability == null) return null;
    const yes = side === "no" ? 1 - probability : probability;
    if (!Number.isFinite(yes)) return null;
    return Math.max(0, Math.min(1, yes));
}

async function fetchTradesRaw(): Promise<JupiterTradesResponse["data"]> {
    const url = `${JUPITER_BASE_URL}/trades`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) return [];
        const payload = (await res.json()) as JupiterTradesResponse;
        return payload.data ?? [];
    } catch (error) {
        console.warn("[JupiterChart] /trades failed:", error);
        return [];
    }
}

async function fetchHistoryPage(
    start = 1,
    end = 500,
    marketId?: string
): Promise<{ data: JupiterHistoryResponse["data"]; pagination: JupiterHistoryResponse["pagination"] | null }> {
    const url = new URL(`${JUPITER_BASE_URL}/history`);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    if (marketId) url.searchParams.set("marketId", marketId);

    try {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) return { data: [], pagination: null };
        const payload = (await res.json()) as JupiterHistoryResponse;
        return { data: payload.data ?? [], pagination: payload.pagination ?? null };
    } catch (error) {
        console.warn("[JupiterChart] /history failed:", error);
        return { data: [], pagination: null };
    }
}

async function fetchOrdersPage(
    start = 1,
    end = 500,
    marketId?: string
): Promise<{ data: JupiterOrdersResponse["data"]; pagination: JupiterOrdersResponse["pagination"] | null }> {
    const url = new URL(`${JUPITER_BASE_URL}/orders`);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    if (marketId) url.searchParams.set("marketId", marketId);

    try {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) return { data: [], pagination: null };
        const payload = (await res.json()) as JupiterOrdersResponse;
        return { data: payload.data ?? [], pagination: payload.pagination ?? null };
    } catch (error) {
        console.warn("[JupiterChart] /orders failed:", error);
        return { data: [], pagination: null };
    }
}

function isFilledHistoryEvent(item: JupiterHistoryResponse["data"][number]): boolean {
    const eventType = String(item.eventType ?? "").toLowerCase();
    if (eventType.includes("order_filled") || eventType.includes("filled")) return true;
    const hasAvg = parseNumberish(item.avgFillPriceUsd) != null;
    const hasContracts =
        parseNumberish(item.filledContracts) != null || parseNumberish(item.contracts) != null;
    return hasAvg && hasContracts;
}

function isFilledOrder(item: JupiterOrdersResponse["data"][number]): boolean {
    const status = String(item.status ?? "").toLowerCase();
    if (status === "filled" || status === "partially_filled") return true;

    const hasAvgFillPrice =
        parseNumberish(item.avgFillPriceUsd) != null ||
        parseNumberish(item.maxFillPriceUsd) != null ||
        parseNumberish(item.maxBuyPriceUsd) != null ||
        parseNumberish(item.minSellPriceUsd) != null;
    const hasSize =
        parseNumberish(item.filledContracts) != null ||
        parseNumberish(item.contracts) != null ||
        parseNumberish(item.sizeUsd) != null;
    return hasAvgFillPrice && hasSize;
}

function pickHistoryPrice(item: JupiterHistoryResponse["data"][number]): unknown {
    return (
        item.avgFillPriceUsd ??
        item.maxFillPriceUsd ??
        item.maxBuyPriceUsd ??
        item.minSellPriceUsd
    );
}

function pickOrderPrice(item: JupiterOrdersResponse["data"][number]): unknown {
    return (
        item.avgFillPriceUsd ??
        item.maxFillPriceUsd ??
        item.maxBuyPriceUsd ??
        item.minSellPriceUsd
    );
}

function isOrderUsefulForChart(item: JupiterOrdersResponse["data"][number]): boolean {
    const status = String(item.status ?? "").toLowerCase();
    if (
        status.includes("failed") ||
        status.includes("cancelled") ||
        status.includes("expired") ||
        status.includes("rejected")
    ) {
        return false;
    }
    return parseNumberish(pickOrderPrice(item)) != null;
}

function dedupeAdjacentPoints(points: ChartPoint[]): ChartPoint[] {
    if (points.length <= 1) return points;
    const deduped: ChartPoint[] = [];
    for (const point of points) {
        const last = deduped[deduped.length - 1];
        if (!last) {
            deduped.push(point);
            continue;
        }
        if (last.timestamp === point.timestamp && Math.abs(last.value - point.value) < 1e-9) {
            continue;
        }
        deduped.push(point);
    }
    return deduped;
}

function buildFlatLineFromMid(
    midValue: number,
    range: ChartRange,
    steps = 40
): ChartPoint[] {
    if (!Number.isFinite(midValue)) return [];
    const now = Date.now();
    let windowMs = getRangeWindowMs(range);
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        windowMs = 30 * 24 * 60 * 60 * 1000; // fallback 30 gün
    }
    const start = now - windowMs;
    const safeSteps = Math.max(2, Math.min(steps, 120));
    const points: ChartPoint[] = [];
    for (let i = 0; i < safeSteps; i++) {
        const t =
            i === safeSteps - 1
                ? now
                : start + (windowMs * i) / (safeSteps - 1);
        points.push({
            timestamp: Math.floor(t),
            value: Math.max(0, Math.min(1, midValue)),
        });
    }
    return points;
}

function pickKalshiCandlePrice(
    candle: any // Using 'any' to bypass strict indexing errors from nested optional types
): unknown {
    return (
        candle.price?.close_dollars ??
        candle.price?.mean_dollars ??
        candle.yes_bid?.close_dollars ??
        candle.yes_ask?.close_dollars ??
        candle.price?.close ??
        candle.price?.mean ??
        candle.yes_bid?.close ??
        candle.yes_ask?.close ??
        candle.price?.previous_dollars ??
        candle.price?.previous
    );
}

async function fetchKalshiBatchCandlesticks(
    marketTickers: string[],
    range: ChartRange
): Promise<Map<string, ChartPoint[]>> {
    const result = new Map<string, ChartPoint[]>();
    const tickers = Array.from(new Set(marketTickers.filter(Boolean)));
    if (tickers.length === 0) return result;

    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.max(1, nowSec - getRangeWindowSec(range));
    const periodInterval = getKalshiPeriodIntervalMinutes(range);

    // API supports up to 100 tickers per request.
    for (let i = 0; i < tickers.length; i += 100) {
        const chunk = tickers.slice(i, i + 100);
        const url = new URL(`${KALSHI_BASE_URL}/markets/candlesticks`);
        url.searchParams.set("market_tickers", chunk.join(","));
        url.searchParams.set("start_ts", String(startSec));
        url.searchParams.set("end_ts", String(nowSec));
        url.searchParams.set("period_interval", String(periodInterval));
        url.searchParams.set("include_latest_before_start", "true");

        try {
            const res = await fetch(url.toString(), {
                headers: { Accept: "application/json" },
            });
            if (!res.ok) continue;
            const payload = (await res.json()) as KalshiBatchCandlesticksResponse;
            const markets = payload.markets ?? [];
            for (const market of markets) {
                const ticker = String(market.market_ticker ?? "").trim();
                if (!ticker) continue;
                const points = (market.candlesticks ?? [])
                    .map((candle) => {
                        const timestampSec = toUnixSeconds(candle.end_period_ts);
                        const rawValue = pickKalshiCandlePrice(candle);
                        const value = normalizeProbability(rawValue);
                        if (timestampSec == null || value == null) return null;
                        return {
                            timestamp: timestampSec * 1000,
                            value: Math.max(0, Math.min(1, value)),
                        } satisfies ChartPoint;
                    })
                    .filter((item): item is ChartPoint => !!item)
                    .sort((a, b) => a.timestamp - b.timestamp);

                if (points.length === 0) continue;
                const existing = result.get(ticker) ?? [];
                result.set(ticker, dedupeAdjacentPoints([...existing, ...points].sort((a, b) => a.timestamp - b.timestamp)));
            }
        } catch (error) {
            console.warn("[JupiterChart] Kalshi /markets/candlesticks failed:", error);
        }
    }

    return result;
}

async function fetchPolymarketPricesHistoryChartPoints(
    assetId: string,
    range: ChartRange
): Promise<ChartPoint[]> {
    if (!assetId) return [];

    const tryFetchByAssetId = async (id: string): Promise<ChartPoint[]> => {
        const url = new URL(`${POLYMARKET_CLOB_BASE_URL}/prices-history`);
        url.searchParams.set("market", id);

        const interval = getPolymarketIntervalForRange(range);
        if (interval) {
            url.searchParams.set("interval", interval);
        }

        if (range !== "ALL") {
            const nowSec = Math.floor(Date.now() / 1000);
            const startSec = Math.max(1, nowSec - getRangeWindowSec(range));
            url.searchParams.set("startTs", String(startSec));
            url.searchParams.set("endTs", String(nowSec));
        }

        try {
            const finalUrl = url.toString();
            const res = await fetch(finalUrl, { headers: { Accept: "application/json" } });
            if (!res.ok) {
                if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.warn(
                        "[JupiterChart] Polymarket /prices-history non-200",
                        res.status,
                        finalUrl
                    );
                }
                return [];
            }
            const payload = (await res.json()) as PolymarketPricesHistoryResponse;
            const history = payload.history ?? [];

            const points = history
                .map((item) => {
                    const timestampSec = typeof item.t === "number" ? item.t : Number(item.t);
                    const value = normalizeProbability(item.p);
                    if (!Number.isFinite(timestampSec) || value == null) return null;
                    return {
                        timestamp: Math.floor(timestampSec) * 1000,
                        value: Math.max(0, Math.min(1, value)),
                    } satisfies ChartPoint;
                })
                .filter((item): item is ChartPoint => !!item)
                .sort((a, b) => a.timestamp - b.timestamp);

            return dedupeAdjacentPoints(points);
        } catch (error) {
            console.warn("[JupiterChart] Polymarket /prices-history failed:", error);
            return [];
        }
    };

    // First, treat the incoming value as a direct asset id.
    const directPoints = await tryFetchByAssetId(assetId);
    if (directPoints.length > 0) {
        return directPoints;
    }

    // If it didn't look like a real CLOB asset id, or returned no data,
    // and the value isn't strongly numeric, try resolving it as a Polymarket slug.
    if (!isLikelyPolymarketAssetId(assetId)) {
        const resolvedAssetId = await resolvePolymarketAssetIdFromSlug(assetId);
        if (resolvedAssetId) {
            const slugResolvedPoints = await tryFetchByAssetId(resolvedAssetId);
            if (slugResolvedPoints.length > 0) {
                if (typeof __DEV__ !== "undefined" && __DEV__) {
                    console.log(
                        "[JupiterChart] Polymarket prices-history resolved via slug",
                        assetId,
                        "->",
                        resolvedAssetId,
                        "points=",
                        slugResolvedPoints.length
                    );
                }
                return slugResolvedPoints;
            }
        }
    }

    return [];
}

function buildHistoryRowKey(item: JupiterHistoryResponse["data"][number]): string {
    if (item.id != null) return `id:${item.id}`;
    if (item.signature) return `sig:${item.signature}`;
    if (item.orderId) return `ord:${item.orderId}`;
    return `mk:${item.marketId ?? "na"}:${item.timestamp ?? "na"}:${item.eventType ?? "na"}`;
}

function buildOrderRowKey(item: JupiterOrdersResponse["data"][number]): string {
    if (item.pubkey) return `pub:${item.pubkey}`;
    if (item.orderId) return `ord:${item.orderId}`;
    return `mk:${item.marketId ?? "na"}:${item.filledAt ?? item.updatedAt ?? item.createdAt ?? "na"}:${item.status ?? "na"}`;
}

function hasEnoughHistoryByMarket(
    rows: JupiterHistoryResponse["data"],
    marketIds: Set<string>,
    minPointsPerMarket: number
): boolean {
    if (marketIds.size === 0) return true;
    const counts = new Map<string, number>();
    for (const marketId of marketIds) counts.set(marketId, 0);

    for (const row of rows) {
        if (!row.marketId || !marketIds.has(row.marketId)) continue;
        if (!isFilledHistoryEvent(row)) continue;
        counts.set(row.marketId, (counts.get(row.marketId) ?? 0) + 1);
    }

    for (const marketId of marketIds) {
        if ((counts.get(marketId) ?? 0) < minPointsPerMarket) return false;
    }
    return true;
}

function hasEnoughOrdersByMarket(
    rows: JupiterOrdersResponse["data"],
    marketIds: Set<string>,
    minPointsPerMarket: number
): boolean {
    if (marketIds.size === 0) return true;
    const counts = new Map<string, number>();
    for (const marketId of marketIds) counts.set(marketId, 0);

    for (const row of rows) {
        if (!row.marketId || !marketIds.has(row.marketId)) continue;
        if (!isFilledOrder(row)) continue;
        counts.set(row.marketId, (counts.get(row.marketId) ?? 0) + 1);
    }

    for (const marketId of marketIds) {
        if ((counts.get(marketId) ?? 0) < minPointsPerMarket) return false;
    }
    return true;
}

async function fetchHistoryForMarkets(
    marketIds: string[],
    options?: { minPointsPerMarket?: number; pageSize?: number; maxForwardPages?: number; tailPages?: number }
): Promise<JupiterHistoryResponse["data"]> {
    const filteredIds = Array.from(new Set(marketIds.filter(Boolean)));
    if (filteredIds.length === 0) return [];

    const minPointsPerMarket = Math.max(1, options?.minPointsPerMarket ?? 8);
    const pageSize = Math.max(50, options?.pageSize ?? 400);
    const maxForwardPages = Math.max(1, options?.maxForwardPages ?? 6);
    const tailPages = Math.max(0, options?.tailPages ?? 3);
    const idsSet = new Set(filteredIds);

    const visitedRanges = new Set<string>();
    const dedupedRows = new Map<string, JupiterHistoryResponse["data"][number]>();
    let totalRecords = 0;
    let hasTotal = false;

    const ingestRows = (rows: JupiterHistoryResponse["data"]) => {
        for (const row of rows) {
            const key = buildHistoryRowKey(row);
            if (!dedupedRows.has(key)) {
                dedupedRows.set(key, row);
            }
        }
    };

    // Try direct market queries first (if endpoint supports marketId filtering).
    for (const marketId of filteredIds) {
        for (let i = 0; i < 2; i++) {
            const start = 1 + i * pageSize;
            const end = start + pageSize - 1;
            const { data } = await fetchHistoryPage(start, end, marketId);
            ingestRows(data);
        }
    }
    if (hasEnoughHistoryByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
        return Array.from(dedupedRows.values());
    }

    let nextStart = 1;
    for (let i = 0; i < maxForwardPages; i++) {
        const start = nextStart;
        const end = start + pageSize - 1;
        const rangeKey = `${start}:${end}`;
        if (visitedRanges.has(rangeKey)) break;
        visitedRanges.add(rangeKey);

        const { data, pagination } = await fetchHistoryPage(start, end);
        ingestRows(data);
        if (pagination?.total != null) {
            totalRecords = pagination.total;
            hasTotal = true;
        }

        if (hasEnoughHistoryByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
            return Array.from(dedupedRows.values());
        }

        if (!pagination?.hasNext) break;
        const next = (pagination.end ?? end) + 1;
        if (!Number.isFinite(next) || next <= nextStart) break;
        nextStart = next;
    }

    if (hasTotal && totalRecords > 0) {
        for (let i = 0; i < tailPages; i++) {
            const tailEnd = Math.max(1, totalRecords - i * pageSize);
            const tailStart = Math.max(1, tailEnd - pageSize + 1);
            const rangeKey = `${tailStart}:${tailEnd}`;
            if (visitedRanges.has(rangeKey)) continue;
            visitedRanges.add(rangeKey);

            const { data } = await fetchHistoryPage(tailStart, tailEnd);
            ingestRows(data);

            if (hasEnoughHistoryByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
                break;
            }
        }
    }

    return Array.from(dedupedRows.values());
}

async function fetchOrdersForMarkets(
    marketIds: string[],
    options?: { minPointsPerMarket?: number; pageSize?: number; maxForwardPages?: number; tailPages?: number }
): Promise<JupiterOrdersResponse["data"]> {
    const filteredIds = Array.from(new Set(marketIds.filter(Boolean)));
    if (filteredIds.length === 0) return [];

    const minPointsPerMarket = Math.max(1, options?.minPointsPerMarket ?? 8);
    const pageSize = Math.max(50, options?.pageSize ?? 400);
    const maxForwardPages = Math.max(1, options?.maxForwardPages ?? 6);
    const tailPages = Math.max(0, options?.tailPages ?? 3);
    const idsSet = new Set(filteredIds);

    const visitedRanges = new Set<string>();
    const dedupedRows = new Map<string, JupiterOrdersResponse["data"][number]>();
    let totalRecords = 0;
    let hasTotal = false;

    const ingestRows = (rows: JupiterOrdersResponse["data"]) => {
        for (const row of rows) {
            const key = buildOrderRowKey(row);
            if (!dedupedRows.has(key)) {
                dedupedRows.set(key, row);
            }
        }
    };

    // Try direct market queries first (if endpoint supports marketId filtering).
    for (const marketId of filteredIds) {
        for (let i = 0; i < 2; i++) {
            const start = 1 + i * pageSize;
            const end = start + pageSize - 1;
            const { data } = await fetchOrdersPage(start, end, marketId);
            ingestRows(data);
        }
    }
    if (hasEnoughOrdersByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
        return Array.from(dedupedRows.values());
    }

    let nextStart = 1;
    for (let i = 0; i < maxForwardPages; i++) {
        const start = nextStart;
        const end = start + pageSize - 1;
        const rangeKey = `${start}:${end}`;
        if (visitedRanges.has(rangeKey)) break;
        visitedRanges.add(rangeKey);

        const { data, pagination } = await fetchOrdersPage(start, end);
        ingestRows(data);
        if (pagination?.total != null) {
            totalRecords = pagination.total;
            hasTotal = true;
        }

        if (hasEnoughOrdersByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
            return Array.from(dedupedRows.values());
        }

        if (!pagination?.hasNext) break;
        const next = (pagination.end ?? end) + 1;
        if (!Number.isFinite(next) || next <= nextStart) break;
        nextStart = next;
    }

    if (hasTotal && totalRecords > 0) {
        for (let i = 0; i < tailPages; i++) {
            const tailEnd = Math.max(1, totalRecords - i * pageSize);
            const tailStart = Math.max(1, tailEnd - pageSize + 1);
            const rangeKey = `${tailStart}:${tailEnd}`;
            if (visitedRanges.has(rangeKey)) continue;
            visitedRanges.add(rangeKey);

            const { data } = await fetchOrdersPage(tailStart, tailEnd);
            ingestRows(data);

            if (hasEnoughOrdersByMarket(Array.from(dedupedRows.values()), idsSet, minPointsPerMarket)) {
                break;
            }
        }
    }

    return Array.from(dedupedRows.values());
}

async function fetchOrderbookMidYesProbability(marketId: string): Promise<number | null> {
    const url = `${JUPITER_BASE_URL}/orderbook/${encodeURIComponent(marketId)}`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) return null;
        const payload = (await res.json()) as JupiterOrderbookResponse | null;
        if (!payload) return null;

        const bestYesPriceCents = Array.isArray(payload.yes?.[0]) ? parseNumberish(payload.yes?.[0]?.[0]) : null;
        const bestNoPriceCents = Array.isArray(payload.no?.[0]) ? parseNumberish(payload.no?.[0]?.[0]) : null;

        if (bestYesPriceCents != null) {
            return Math.max(0, Math.min(1, bestYesPriceCents / 100));
        }
        if (bestNoPriceCents != null) {
            return Math.max(0, Math.min(1, 1 - bestNoPriceCents / 100));
        }
        return null;
    } catch (error) {
        console.warn("[JupiterChart] /orderbook failed:", error);
        return null;
    }
}

function buildChartFromTrades(
    marketId: string,
    trades: JupiterTradesResponse["data"],
    range: ChartRange
): ChartPoint[] {
    const now = Date.now();
    const windowMs = getRangeWindowMs(range);
    const cutoff = Number.isFinite(windowMs) ? now - windowMs : Number.NEGATIVE_INFINITY;

    const points = trades
        .filter((item) => item.marketId === marketId)
        .map((item) => {
            const side = item.side === "no" ? "no" : "yes";
            const value = toYesProbability(item.priceUsd, side);
            const timestamp = toUnixMs(item.timestamp);
            if (value == null || timestamp == null) return null;
            return { timestamp, value } satisfies ChartPoint;
        })
        .filter((item): item is ChartPoint => !!item)
        .filter((item) => item.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (points.length === 0) return [];
    return dedupeAdjacentPoints(points);
}

function buildChartFromHistory(
    marketId: string,
    history: JupiterHistoryResponse["data"],
    range: ChartRange
): ChartPoint[] {
    const now = Date.now();
    const windowMs = getRangeWindowMs(range);
    const cutoff = Number.isFinite(windowMs) ? now - windowMs : Number.NEGATIVE_INFINITY;

    const points = history
        .filter((item) => item.marketId === marketId)
        .map((item) => {
            const side: "yes" | "no" = item.isYes ? "yes" : "no";
            const value = toYesProbability(pickHistoryPrice(item), side);
            const timestamp = toUnixMs(item.timestamp);
            if (value == null || timestamp == null) return null;
            return { timestamp, value } satisfies ChartPoint;
        })
        .filter((item): item is ChartPoint => !!item)
        .filter((item) => item.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (points.length === 0) return [];
    return dedupeAdjacentPoints(points);
}

function buildChartFromOrders(
    marketId: string,
    orders: JupiterOrdersResponse["data"],
    range: ChartRange
): ChartPoint[] {
    const now = Date.now();
    const windowMs = getRangeWindowMs(range);
    const cutoff = Number.isFinite(windowMs) ? now - windowMs : Number.NEGATIVE_INFINITY;

    const points = orders
        .filter((item) => item.marketId === marketId)
        .filter((item) => isOrderUsefulForChart(item))
        .map((item) => {
            const side: "yes" | "no" = item.isYes ? "yes" : "no";
            const priceCandidate = pickOrderPrice(item);
            const value = toYesProbability(priceCandidate, side);
            const timestamp = toUnixMs(item.filledAt ?? item.updatedAt ?? item.createdAt);
            if (value == null || timestamp == null) return null;
            return { timestamp, value } satisfies ChartPoint;
        })
        .filter((item): item is ChartPoint => !!item)
        .filter((item) => item.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (points.length === 0) return [];
    return dedupeAdjacentPoints(points);
}

function mapTradesToActivity(
    marketId: string,
    trades: JupiterTradesResponse["data"]
): MarketActivityTrade[] {
    return trades
        .filter((item) => item.marketId === marketId)
        .map((item) => {
            const side = item.action === "sell" ? "sell" : "buy";
            const outcome = item.side === "no" ? "no" : "yes";
            const price = normalizeProbability(item.priceUsd) ?? 0;
            const timestamp = toUnixSeconds(item.timestamp) ?? Math.floor(Date.now() / 1000);
            const txHash = String(item.id ?? item.message ?? `${item.timestamp ?? Date.now()}`);
            const sizeUsd = parseNumberish(item.amountUsd) ?? 0;

            return {
                side,
                outcome,
                price: Math.max(0, Math.min(1, price)),
                size: sizeUsd,
                sizeUnit: "usd",
                timestamp,
                txHash,
            } satisfies MarketActivityTrade;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 120);
}

function mapHistoryToActivity(
    marketId: string,
    history: JupiterHistoryResponse["data"]
): MarketActivityTrade[] {
    return history
        .filter((item) => item.marketId === marketId)
        .filter((item) => isFilledHistoryEvent(item))
        .map((item) => {
            const side: "buy" | "sell" = item.isBuy ? "buy" : "sell";
            const outcome: "yes" | "no" = item.isYes ? "yes" : "no";
            const price = normalizeProbability(item.avgFillPriceUsd) ?? 0;
            const size =
                parseNumberish(item.filledContracts) ??
                parseNumberish(item.contracts) ??
                0;
            const timestamp = toUnixSeconds(item.timestamp) ?? Math.floor(Date.now() / 1000);
            const txHash = String(item.signature ?? item.orderId ?? item.id ?? timestamp);

            return {
                side,
                outcome,
                price: Math.max(0, Math.min(1, price)),
                size,
                sizeUnit: "shares",
                timestamp,
                txHash,
            } satisfies MarketActivityTrade;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 120);
}

function mapOrdersToActivity(
    marketId: string,
    orders: JupiterOrdersResponse["data"]
): MarketActivityTrade[] {
    return orders
        .filter((item) => item.marketId === marketId)
        .filter((item) => isFilledOrder(item))
        .map((item) => {
            const side: "buy" | "sell" = item.isBuy ? "buy" : "sell";
            const outcome: "yes" | "no" = item.isYes ? "yes" : "no";
            const price =
                normalizeProbability(
                    item.avgFillPriceUsd ??
                    item.maxFillPriceUsd ??
                    item.maxBuyPriceUsd ??
                    item.minSellPriceUsd
                ) ?? 0;

            const shares =
                parseNumberish(item.filledContracts) ??
                parseNumberish(item.contracts);
            const usdSize = parseNumberish(item.sizeUsd);
            const size = shares ?? usdSize ?? 0;
            const sizeUnit: "shares" | "usd" = shares != null ? "shares" : "usd";

            const timestamp =
                toUnixSeconds(item.filledAt ?? item.updatedAt ?? item.createdAt) ??
                Math.floor(Date.now() / 1000);
            const txHash = String(item.orderId ?? item.pubkey ?? `${item.marketId ?? "mk"}:${timestamp}`);

            return {
                side,
                outcome,
                price: Math.max(0, Math.min(1, price)),
                size,
                sizeUnit,
                timestamp,
                txHash,
            } satisfies MarketActivityTrade;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 120);
}

export async function fetchMarketChartPointsFromJupiter(
    marketId: string,
    range: ChartRange,
    options?: { provider?: string; polymarketAssetId?: string; label?: string }
): Promise<ChartPoint[]> {
    if (!marketId) return [];

    if (!options?.provider || options.provider === "polymarket") {
        let assetId = options?.polymarketAssetId || marketId;

        if (assetId && !isLikelyPolymarketAssetId(assetId)) {
            const mappings = await resolveAllPolymarketAssetIdsFromSlug(assetId);
            const label = options?.label?.trim() || "";
            if (mappings[label]) {
                assetId = mappings[label];
            }
        }

        const fromPolymarket = await fetchPolymarketPricesHistoryChartPoints(assetId, range);
        if (fromPolymarket.length > 0) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.log(
                    `[JupiterChart] ${marketId} range=${range} source=polymarket-prices-history points=${fromPolymarket.length}`
                );
            }
            return fromPolymarket;
        }
    }

    const tradesRaw = await fetchTradesRaw();
    const fromTrades = buildChartFromTrades(marketId, tradesRaw, range);
    if (fromTrades.length > 0) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log(`[JupiterChart] ${marketId} range=${range} source=trades points=${fromTrades.length}`);
        }
        return fromTrades;
    }

    const historyRaw = await fetchHistoryForMarkets([marketId], {
        minPointsPerMarket: 12,
        pageSize: 400,
        maxForwardPages: 6,
        tailPages: 4,
    });
    const fromHistory = buildChartFromHistory(marketId, historyRaw, range);
    if (fromHistory.length > 0) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log(`[JupiterChart] ${marketId} range=${range} source=history points=${fromHistory.length}`);
        }
        return fromHistory;
    }

    const ordersRaw = await fetchOrdersForMarkets([marketId], {
        minPointsPerMarket: 12,
        pageSize: 400,
        maxForwardPages: 6,
        tailPages: 4,
    });
    const fromOrders = buildChartFromOrders(marketId, ordersRaw, range);
    if (fromOrders.length > 0) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log(`[JupiterChart] ${marketId} range=${range} source=orders points=${fromOrders.length}`);
        }
        return fromOrders;
    }

    if (options?.provider === "kalshi") {
        const kalshiCandles = await fetchKalshiBatchCandlesticks([marketId], range);
        const fromKalshi = kalshiCandles.get(marketId) ?? [];
        if (fromKalshi.length > 0) {
            if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.log(`[JupiterChart] ${marketId} range=${range} source=kalshi points=${fromKalshi.length}`);
            }
            return fromKalshi;
        }
    }

    const midYesProbability = await fetchOrderbookMidYesProbability(marketId);
    if (midYesProbability == null) return [];

    if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(
            `[JupiterChart] ${marketId} range=${range} source=orderbook-flat points-from-mid`
        );
    }

    return buildFlatLineFromMid(midYesProbability, range);
}

export async function fetchClusteredMarketChartFromJupiter(
    markets: ClusteredMarketInput[],
    range: ChartRange,
    fallbackPrices?: Record<string, number>
): Promise<ClusteredMarketSeries[]> {
    const dedupedInputs = Array.from(
        new Map(
            markets
                .filter((item) => !!item.marketId)
                .map((item) => [item.marketId, item] as const)
        ).values()
    );

    if (dedupedInputs.length === 0) return [];

    const tradesRaw = await fetchTradesRaw();
    const ordersRaw = await fetchOrdersForMarkets(
        dedupedInputs.map((item) => item.marketId),
        {
            minPointsPerMarket: 8,
            pageSize: 400,
            maxForwardPages: 6,
            tailPages: 4,
        }
    );
    const historyRaw = await fetchHistoryForMarkets(
        dedupedInputs.map((item) => item.marketId),
        {
            minPointsPerMarket: 8,
            pageSize: 400,
            maxForwardPages: 6,
            tailPages: 4,
        }
    );
    const kalshiTickers = dedupedInputs
        .filter((item) => item.provider === "kalshi")
        .map((item) => item.marketId);
    const kalshiCandles = await fetchKalshiBatchCandlesticks(kalshiTickers, range);

    const polymarketInputs = dedupedInputs.filter(
        (item) => !item.provider || item.provider === "polymarket"
    );

    const slugMap = new Map<string, Record<string, string>>();
    for (const item of polymarketInputs) {
        const assetId = item.polymarketAssetId || item.marketId;
        if (assetId && !isLikelyPolymarketAssetId(assetId) && !slugMap.has(assetId)) {
            const map = await resolveAllPolymarketAssetIdsFromSlug(assetId);
            slugMap.set(assetId, map);
        }
    }

    const polymarketCharts = new Map<string, ChartPoint[]>();
    await Promise.all(
        polymarketInputs.map(async (item) => {
            let assetId = item.polymarketAssetId || item.marketId;
            if (!assetId) return;

            if (slugMap.has(assetId)) {
                const mappings = slugMap.get(assetId)!;
                const label = item.label?.trim() || "";
                if (mappings[label]) {
                    assetId = mappings[label];
                }
            }

            const points = await fetchPolymarketPricesHistoryChartPoints(assetId, range);
            if (points.length > 0) {
                polymarketCharts.set(item.marketId, points);
            }
        })
    );

    const pendingOrderbook: string[] = [];
    const series = dedupedInputs.map((item, index) => {
        let source = "trades";
        let points = buildChartFromTrades(item.marketId, tradesRaw, range);
        if (points.length === 0) {
            source = "history";
            points = buildChartFromHistory(item.marketId, historyRaw, range);
        }
        if (points.length === 0) {
            source = "orders";
            points = buildChartFromOrders(item.marketId, ordersRaw, range);
        }
        if (points.length === 0 && item.provider === "kalshi") {
            source = "kalshi";
            points = kalshiCandles.get(item.marketId) ?? [];
        }
        if (points.length === 0 && (!item.provider || item.provider === "polymarket")) {
            source = "polymarket-prices-history";
            points = polymarketCharts.get(item.marketId) ?? [];
        }
        if (points.length === 0) {
            source = "orderbook";
            pendingOrderbook.push(item.marketId);
        }

        if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log(`[JupiterChart] cluster ${item.marketId} range=${range} source=${source} points=${points.length}`);
        }

        return {
            key: item.marketId,
            label: item.label?.trim() || item.marketId,
            color: item.color || CLUSTER_COLORS[index % CLUSTER_COLORS.length],
            data: points,
        } satisfies ClusteredMarketSeries;
    });

    if (pendingOrderbook.length > 0) {
        const orderbookPoints = await Promise.all(
            pendingOrderbook.map(async (marketId) => {
                let value = await fetchOrderbookMidYesProbability(marketId);
                if (value == null || value === 0) {
                    if (fallbackPrices?.[marketId] != null) {
                        value = fallbackPrices[marketId];
                    } else {
                        return null;
                    }
                }
                return {
                    marketId,
                    mid: value,
                };
            })
        );

        for (const item of orderbookPoints) {
            if (!item) continue;
            const target = series.find((s) => s.key === item.marketId);
            if (!target) continue;
            target.data = buildFlatLineFromMid(item.mid, range);
        }
    }

    if (typeof __DEV__ !== "undefined" && __DEV__) {
        for (const item of series) {
            console.log(`[JupiterChart] cluster-final ${item.key} range=${range} points=${item.data.length}`);
        }
    }

    return series.filter((item) => item.data.length > 0);
}

export async function fetchMarketActivityTradesFromJupiter(
    marketId: string
): Promise<MarketActivityTrade[]> {
    if (!marketId) return [];

    const tradesRaw = await fetchTradesRaw();
    const fromTrades = mapTradesToActivity(marketId, tradesRaw);
    if (fromTrades.length > 0) return fromTrades;

    const ordersRaw = await fetchOrdersForMarkets([marketId], {
        minPointsPerMarket: 6,
        pageSize: 400,
        maxForwardPages: 6,
        tailPages: 4,
    });
    const fromOrders = mapOrdersToActivity(marketId, ordersRaw);
    if (fromOrders.length > 0) return fromOrders;

    const historyRaw = await fetchHistoryForMarkets([marketId], {
        minPointsPerMarket: 6,
        pageSize: 400,
        maxForwardPages: 6,
        tailPages: 4,
    });
    return mapHistoryToActivity(marketId, historyRaw);
}
