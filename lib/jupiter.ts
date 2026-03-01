/**
 * Jupiter Prediction Markets API client.
 * Docs: https://dev.jup.ag/docs/prediction
 *
 * Base URL: https://api.jup.ag/prediction/v1
 * Auth: x-api-key header
 */

import Constants from "expo-constants";
import type { Market, ChartPoint } from "./mock-data";
import { applyHomeMarketFilter, type HomeMarketFilter } from "./homeMarketFilters";
import {
    microUsdToProbability,
    type JupiterEvent,
    type JupiterMarket,
    type JupiterEventsResponse,
    type JupiterSearchResponse,
    type JupiterPosition,
    type JupiterPositionsResponse,
} from "./types/jupiter.types";

const extra = Constants.expoConfig?.extra ?? {};
const JUPITER_API_KEY = (extra.jupiterApiKey ?? process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "").trim();
const JUPITER_BASE_URL = "https://api.jup.ag/prediction/v1";

if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[Jupiter] Prediction API endpoint: ${JUPITER_BASE_URL}`);
    console.log(`[Jupiter] API key present: ${!!JUPITER_API_KEY}`);
}

function getHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: "application/json" };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
    return headers;
}

type JupiterProvider = "polymarket" | "kalshi";

const JUPITER_PROVIDERS: JupiterProvider[] = ["polymarket"];
const EVENTS_PAGE_SIZE = 50;
const MAX_PROVIDER_PAGES = 20; // Increase depth to find more markets
const KALSHI_MARKET_PREFIX = /^KX/i;

function isPolymarketEvent(event: JupiterEvent): boolean {
    const provider = String(event.provider ?? "").toLowerCase();
    return provider === "" || provider === "polymarket";
}

function isLikelyKalshiMarketId(marketId: string): boolean {
    return KALSHI_MARKET_PREFIX.test(marketId);
}

function coerceNumber(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const normalized = value.replace(/,/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDateString(value: unknown): string {
    if (value == null) return "";

    const maybeNumeric = coerceNumber(value);
    if (maybeNumeric != null) {
        const ms = maybeNumeric > 1_000_000_000_000 ? maybeNumeric : maybeNumeric * 1000;
        const parsed = new Date(ms);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    if (typeof value === "string") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    return "";
}

function resolveEventId(event: JupiterEvent, fallback = ""): string {
    const rootId = String(event.eventId ?? "").trim();
    if (rootId) return rootId;

    const metadataId = String(event.metadata?.eventId ?? "").trim();
    if (metadataId) return metadataId;

    const slug = String(event.metadata?.slug ?? "").trim();
    if (slug) return slug;

    return fallback;
}

function buildEventDedupeKey(event: JupiterEvent, provider?: string): string {
    const resolvedId = resolveEventId(event);
    if (resolvedId) return `${provider ?? "unknown"}:${resolvedId}`;

    const title = String(event.metadata?.title ?? event.title ?? "").trim().toLowerCase();
    const expiry = String(event.expiryDate ?? "").trim();
    return `${provider ?? "unknown"}:${title}:${expiry}`;
}

function getMarketSortScore(
    market: Market,
    sort: "volume" | "volume24h" | "liquidity" = "volume"
): number {
    const volume = coerceNumber(market.volume) ?? 0;
    const volume24h = coerceNumber(market.volume24h) ?? 0;
    const liquidity = coerceNumber(market.liquidity) ?? 0;

    if (sort === "volume24h") return Math.max(volume24h, volume);
    if (sort === "liquidity") return Math.max(liquidity, volume24h, volume);
    return Math.max(volume, volume24h);
}

// ─── Category Management ────────────────────────────────────────

const JUPITER_CATEGORIES = [
    "crypto",
    "sports",
    "politics",
    "entertainment",
    "economics",
    "science",
    "climate",
];

function normalizeCategoryFromJupiter(raw?: string): string {
    if (!raw) return "Other";
    const lower = raw.toLowerCase().trim();
    if (lower.includes("crypto")) return "Crypto";
    if (lower.includes("politic")) return "Politics";
    if (lower.includes("sport")) return "Sports";
    if (lower.includes("entertain")) return "Entertainment";
    if (lower.includes("econom") || lower.includes("financ")) return "Economics";
    if (lower.includes("science") || lower.includes("tech")) return "Science and Technology";
    if (lower.includes("climate") || lower.includes("weather")) return "Climate";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function inferCategoryFromTitle(title: string): string {
    const t = title.toLowerCase();
    if (/\b(fed|rate|inflation|economy|gdp|recession|finance|financial|bank|yield)\b/.test(t)) return "Economics";
    if (/\b(trump|biden|harris|election|vote|congress|senate|house|politic|president|nominee|democratic|republican)\b/.test(t)) return "Politics";
    if (/\b(sport|football|basketball|nba|nfl|soccer|game|match|ufc|f1|lebron|olympic)\b/.test(t)) return "Sports";
    if (/\b(bitcoin|btc|eth|ethereum|solana|sol|token|crypto|blockchain|nft|ripple|xrp|cardano|ada|polkadot|dot|bnb|binance|uniswap|pepe|doge|shiba|memecoin|ledger|metamask|durov|telegram|ton|base|arbitrum|avax|avalanche|link|chainlink|polymarket|jupiter|jup|aave|maker|mkr|lido|ldo|polygon|matic|sui|aptos|kraken|coinbase|swap|stak|stablecoin|usdt|usdc|pyth|bonk|wif|popcat|mog|goat|pnut|scihub|tether)\b/i.test(t)) return "Crypto";
    if (/\b(movie|music|album|grammy|entertainment|hollywood|oscar|celebrity|tv|netflix|disney|marvel|actor|actress|pop|rap|song|artist)\b/i.test(t)) return "Entertainment";
    if (/\b(climate|weather|temperature|storm|rain|heat|earthquake|hurricane|flood|wildfire|carbon|emission)\b/i.test(t)) return "Climate";
    if (/\b(tech|science|ai|robot|space|innovation|discovery|biology|nasa|spacex|openai|chatgpt|physics|chemistry|medical)\b/i.test(t)) return "Science and Technology";
    return "Other";
}

// ─── Event / Market Adapters ────────────────────────────────────

/**
 * Convert a Jupiter event + market pair to the app's internal Market type.
 */
export function jupiterEventMarketToAppMarket(
    event: JupiterEvent,
    jupMarket: JupiterMarket
): Market {
    const buyYes = jupMarket.pricing?.buyYesPriceUsd ?? null;
    const sellYes = jupMarket.pricing?.sellYesPriceUsd ?? null;
    const buyNo = jupMarket.pricing?.buyNoPriceUsd ?? null;

    // Compute yesPrice as probability 0-1
    let yesPrice = 0.5;
    if (buyYes != null && sellYes != null) {
        yesPrice = (microUsdToProbability(buyYes) + microUsdToProbability(sellYes)) / 2;
    } else if (buyYes != null) {
        yesPrice = microUsdToProbability(buyYes);
    } else if (sellYes != null) {
        yesPrice = microUsdToProbability(sellYes);
    } else if (buyNo != null) {
        yesPrice = 1 - microUsdToProbability(buyNo);
    }

    const eventId = resolveEventId(event, jupMarket.marketId);
    const eventTitle = event.metadata?.title || event.title || "Unknown Market";
    const eventDescription = event.metadata?.description || event.description || jupMarket.metadata?.rulesPrimary || "";
    const eventImageUrl = event.metadata?.imageUrl || event.imageUrl;

    const category = normalizeCategoryFromJupiter(event.category) !== "Other"
        ? normalizeCategoryFromJupiter(event.category)
        : inferCategoryFromTitle(eventTitle);

    const isTradeable = jupMarket.status === "open";
    const resolveDate = toIsoDateString(event.expiryDate) || toIsoDateString(jupMarket.metadata?.closeTime);
    const eventVolumeUsd = coerceNumber((event as JupiterEvent & { volumeUsd?: unknown }).volumeUsd);
    const eventLiquidityUsd = coerceNumber((event as JupiterEvent & { tvlDollars?: unknown }).tvlDollars);

    const rawEventVolume = eventVolumeUsd ?? coerceNumber(event.volume) ?? 0;
    const rawMarketVolume = coerceNumber(jupMarket.pricing?.volume) ?? 0;

    // Always convert to regular USD from micro USD (div 1M).
    // Use market volume if available, fallback to event total only when necessary.
    const volume = (rawMarketVolume > 0 ? rawMarketVolume : rawEventVolume) / 1_000_000;
    const volume24h = (coerceNumber(jupMarket.pricing?.volume24h) ?? 0) / 1_000_000;
    const openInterest = (coerceNumber(jupMarket.pricing?.openInterest) ?? 0) / 1_000_000;

    const rawEventLiquidity = eventLiquidityUsd ?? coerceNumber(event.liquidity) ?? 0;
    const rawMarketLiquidity = coerceNumber(jupMarket.pricing?.liquidityDollars) ?? 0;
    const liquidity = (rawMarketLiquidity > 0 ? rawMarketLiquidity : rawEventLiquidity) / 1_000_000;



    const rawMeta = (jupMarket.metadata ?? {}) as any;
    let polymarketClobTokenId: string | undefined;
    if (typeof rawMeta?.clobTokenId === "string") {
        polymarketClobTokenId = rawMeta.clobTokenId;
    } else if (Array.isArray(rawMeta?.clobTokenIds) && typeof rawMeta.clobTokenIds[0] === "string") {
        polymarketClobTokenId = rawMeta.clobTokenIds[0];
    } else if (typeof rawMeta?.clobTokenIds === "string") {
        try {
            const parsed = JSON.parse(rawMeta.clobTokenIds);
            if (Array.isArray(parsed) && typeof parsed[0] === "string") {
                polymarketClobTokenId = parsed[0];
            }
        } catch {
            const first = String(rawMeta.clobTokenIds).split(/[,\\s]+/).filter(Boolean)[0];
            if (first) polymarketClobTokenId = first;
        }
    } else if (typeof rawMeta?.assetId === "string") {
        polymarketClobTokenId = rawMeta.assetId;
    } else if (typeof rawMeta?.yesClobTokenId === "string") {
        polymarketClobTokenId = rawMeta.yesClobTokenId;
    }

    // As a final fallback, stash a Polymarket slug (event- or market-level)
    // into the same field so downstream chart code can try resolving it via Gamma API.
    if (!polymarketClobTokenId) {
        const slugCandidate =
            (typeof event.metadata?.slug === "string" && event.metadata.slug.trim()) ||
            (typeof rawMeta?.slug === "string" && rawMeta.slug.trim()) ||
            "";
        if (slugCandidate) {
            polymarketClobTokenId = slugCandidate;
        }
    }

    return {
        id: jupMarket.marketId,
        title: jupMarket.metadata?.title || eventTitle,
        description: eventDescription,
        category,
        imageUrl: eventImageUrl,
        yesPrice: Math.max(0, Math.min(1, yesPrice)),
        volume,
        volume24h,
        openInterest,
        liquidity,
        liquidityScore: Math.min(100, Math.max(0, liquidity)),
        openDate: "",
        resolveDate,

        // Jupiter identifiers
        marketId: jupMarket.marketId,
        polymarketClobTokenId,
        eventId,
        eventTitle,
        eventVolume: rawEventVolume / 1_000_000,
        provider: event.provider,

        // Legacy fields – not used by Jupiter trading but needed by Market interface
        yesMint: "",
        noMint: "",
        isInitialized: true,
        collateralMint: undefined,

        hasLiveQuotes: buyYes != null || sellYes != null,
        isTradeable,
        yesLabel: "Yes",
        noLabel: "No",

        // Jupiter pricing fields
        buyYesPriceUsd: buyYes,
        buyNoPriceUsd: buyNo,
        sellYesPriceUsd: sellYes,
        sellNoPriceUsd: jupMarket.pricing?.sellNoPriceUsd ?? null,

        result: jupMarket.result || undefined,

        ticker: jupMarket.marketId,
        eventTicker: eventId,
        seriesTicker: undefined,
        strikePeriod: undefined,
        status: jupMarket.status,

        priceHistory: [],
    };
}

/**
 * Convert a full Jupiter event (with its markets array) to app Market[].
 * Each event may have multiple markets (YES/NO sides).
 * We pick the YES market as the primary display market.
 */
export function jupiterEventToMarkets(event: JupiterEvent): Market[] {
    if (!isPolymarketEvent(event)) return [];
    if (!event.markets || event.markets.length === 0) return [];

    const results: Market[] = [];

    // Jupiter's events usually have one or more markets.
    // In multi-choice events, there are multiple markets, each with isYes: true/false.
    // Each YES market represents a specific outcome we want to display.
    const yesMarkets = event.markets.filter(m => m.isYes !== false); // fallback to true/undefined

    for (const jupMarket of yesMarkets) {
        // Attempt to find the matching NO market if this is a binary-looking setup
        // Often matched by some metadata or just being the only non-yes market.
        // For multi-choice, people usually trade YES on the candidate.
        const appMarket = jupiterEventMarketToAppMarket(event, jupMarket);
        results.push(appMarket);
    }

    // If no YES markets found, just return the first one as fallback
    if (results.length === 0 && event.markets.length > 0) {
        results.push(jupiterEventMarketToAppMarket(event, event.markets[0]));
    }

    return results;
}


// ─── API Functions ──────────────────────────────────────────────

/**
 * Fetch events from Jupiter Prediction API.
 */
export async function fetchJupiterEvents(params?: {
    category?: string;
    provider?: JupiterProvider;
    start?: number;
    end?: number;
    includeMarkets?: boolean;
    sortBy?: "beginAt" | "volume";
    sortDirection?: "asc" | "desc";
    filter?: "new" | "live" | "trending";

    // Legacy compatibility inputs
    status?: string;
    limit?: number;
    cursor?: string;
}): Promise<{
    events: JupiterEvent[];
    nextCursor: string | null;
    pagination: { start: number; end: number; total: number; hasNext: boolean } | null;
}> {
    const url = new URL(`${JUPITER_BASE_URL}/events`);

    const parsedCursorWindow = (() => {
        if (!params?.cursor) return null;
        const [startRaw, endRaw] = params.cursor.split(":");
        const start = Number(startRaw);
        const end = Number(endRaw);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        if (start < 1 || end < start) return null;
        return { start, end };
    })();

    const start = params?.start ?? parsedCursorWindow?.start ?? 1;
    const end = params?.end ?? parsedCursorWindow?.end ?? (start + Math.max(1, params?.limit ?? EVENTS_PAGE_SIZE) - 1);

    if (params?.category) url.searchParams.set("category", params.category);
    if (params?.provider) url.searchParams.set("provider", params.provider);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("includeMarkets", String(params?.includeMarkets ?? true));
    if (params?.sortBy) url.searchParams.set("sortBy", params.sortBy);
    if (params?.sortDirection) url.searchParams.set("sortDirection", params.sortDirection);
    if (params?.filter) {
        // "live" filter on Jupiter Prediction API means strictly "in-play" sports or events that are happening right now,
        // which drastically reduces the available markets from thousands to single digits. We just omit it to get all active markets.
        if (params.filter !== "live") {
            url.searchParams.set("filter", params.filter);
        }
    }
    try {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) {
            if (res.status === 403 || res.status === 401) {
                console.warn("[Jupiter] API auth error:", res.status, "- check EXPO_PUBLIC_JUPITER_API_KEY");
                return { events: [], nextCursor: null, pagination: null };
            }
            if (res.status === 400) {
                const text = await res.text().catch(() => "");
                console.warn(`[Jupiter] Events API returned 400: ${url.toString()} -> ${text}`);
                return { events: [], nextCursor: null, pagination: null };
            }
            if (res.status >= 500) {
                console.warn(`[Jupiter] Events API returned ${res.status}, skipping`);
                return { events: [], nextCursor: null, pagination: null };
            }
            throw new Error(`Jupiter events: ${res.status}`);
        }
        const data = (await res.json()) as JupiterEventsResponse;
        const rawPagination = data.pagination;

        const pagination = rawPagination
            ? {
                start: coerceNumber(rawPagination.start) ?? start,
                end: coerceNumber(rawPagination.end) ?? end,
                total: coerceNumber(rawPagination.total) ?? 0,
                hasNext: Boolean(rawPagination.hasNext),
            }
            : null;

        let nextCursor = data.nextCursor ?? null;
        if (!nextCursor && pagination?.hasNext) {
            const nextStart = pagination.end + 1;
            const pageSize = Math.max(1, pagination.end - pagination.start + 1);

            if (pagination.total === 0 || nextStart < pagination.total) {
                const upperBound = pagination.total > 0 ? pagination.total - 1 : nextStart + pageSize - 1;
                const nextEnd = Math.min(upperBound, nextStart + pageSize - 1);
                if (nextStart <= nextEnd) {
                    nextCursor = `${nextStart}:${nextEnd}`;
                }
            }
        }

        return {
            events: data.data ?? [],
            nextCursor,
            pagination,
        };
    } catch (error) {
        console.warn("[Jupiter] fetchJupiterEvents error:", error instanceof Error ? error.message : error);
        return { events: [], nextCursor: null, pagination: null };
    }
}

/**
 * Fetch single event by ID.
 */
export async function fetchJupiterEventById(
    eventId: string,
    provider?: JupiterProvider
): Promise<JupiterEvent | null> {
    const url = new URL(`${JUPITER_BASE_URL}/events/${encodeURIComponent(eventId)}`);
    if (provider) url.searchParams.set("provider", provider);
    try {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) return null;
        return (await res.json()) as JupiterEvent;
    } catch (error) {
        console.error("[Jupiter] fetchJupiterEventById error:", error);
        return null;
    }
}

/**
 * Fetch single market by marketId.
 */
export async function fetchJupiterMarket(marketId: string): Promise<JupiterMarket | null> {
    const url = `${JUPITER_BASE_URL}/markets/${encodeURIComponent(marketId)}`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) return null;
        return (await res.json()) as JupiterMarket;
    } catch (error) {
        console.error("[Jupiter] fetchJupiterMarket error:", error);
        return null;
    }
}

/**
 * Search events by query string.
 */
export async function fetchJupiterSearch(query: string): Promise<Market[]> {
    const url = `${JUPITER_BASE_URL}/events/search?query=${encodeURIComponent(query)}`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) return [];
        const data = (await res.json()) as JupiterSearchResponse;
        const events = (data.data ?? []).filter((event) => isPolymarketEvent(event));

        const results: Market[] = [];
        for (const event of events) {
            if (event.status !== "open") continue;
            const markets = jupiterEventToMarkets(event);
            for (const m of markets) {
                if (m.isTradeable && !isLikelyKalshiMarketId(m.marketId || m.id)) {
                    results.push(m);
                }
            }
        }
        return results;
    } catch (error) {
        console.error("[Jupiter] fetchJupiterSearch error:", error);
        return [];
    }
}

// ─── Tags / Categories ──────────────────────────────────────────

/**
 * Fetch positions for a user.
 */
export async function fetchJupiterPositions(ownerPubkey: string): Promise<JupiterPosition[]> {
    const url = `${JUPITER_BASE_URL}/positions?ownerPubkey=${encodeURIComponent(ownerPubkey)}`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) {
            console.warn(`[Jupiter] Positions API returned ${res.status}`);
            return [];
        }
        const data = (await res.json()) as JupiterPositionsResponse;
        return data.data ?? [];
    } catch (error) {
        console.error("[Jupiter] fetchJupiterPositions error:", error);
        return [];
    }
}

export type JupiterTagsByCategories = { [category: string]: string[] };

/**
 * Fetch available categories (replaces fetchDflowTagsByCategories).
 * Jupiter doesn't have an explicit tags endpoint, so we derive from events.
 */
export async function fetchJupiterTagsByCategories(): Promise<JupiterTagsByCategories> {
    const result: JupiterTagsByCategories = {};
    for (const cat of JUPITER_CATEGORIES) {
        result[normalizeCategoryFromJupiter(cat)] = [cat];
    }
    return result;
}

// ─── App-Level Functions (same signatures as dflow.ts exports) ──

const TARGET_MARKET_COUNT = 1500;
const HOME_BASE_MARKETS_TTL = 15 * 1000;
let cachedHomeBaseMarkets: Market[] | null = null;
let cachedHomeBaseMarketsAt = 0;

/**
 * Fetch markets for Home/Markets screens with pagination support.
 */
export async function fetchMarketsForApp(params?: {
    limit?: number;
    sort?: "volume" | "volume24h" | "liquidity";
    filter?: "live" | "trending" | "new";
    cursor?: string; // Format: "provider1_start:provider2_start"
}): Promise<{ markets: Market[]; categories: string[]; nextCursor: string | null }> {
    const targetPageSize = params?.limit ?? EVENTS_PAGE_SIZE;
    const allMarkets: Market[] = [];
    const seenEventIds = new Set<string>();
    const seenMarketIds = new Set<string>();

    const sortPreference = params?.sort ?? "volume";

    // Parse cursors for each provider
    const cursors = (params?.cursor || "1:1").split(":");
    const nextCursors: number[] = [];

    for (let i = 0; i < JUPITER_PROVIDERS.length; i++) {
        const provider = JUPITER_PROVIDERS[i];
        let currentStart = parseInt(cursors[i] || "1", 10);
        let itemsFetchedSoFar = 0;
        let isDone = false;
        let lastCursorNext = currentStart;

        // Calculate how many pages we need to fetch in parallel to reach targetPageSize
        const pagesToFetch = Math.min(
            MAX_PROVIDER_PAGES,
            Math.ceil(targetPageSize / EVENTS_PAGE_SIZE)
        );

        // Fetch multiple pages in parallel for the first batch
        const pageRequests = [];
        for (let p = 0; p < pagesToFetch; p++) {
            const pageStart = currentStart + p * EVENTS_PAGE_SIZE;
            const pageEnd = pageStart + EVENTS_PAGE_SIZE - 1;
            pageRequests.push(
                fetchJupiterEvents({
                    provider,
                    start: pageStart,
                    end: pageEnd,
                    includeMarkets: true,
                    sortBy: "volume",
                    sortDirection: "desc",
                    filter: params?.filter,
                })
            );
        }

        const results = await Promise.all(pageRequests);

        for (const { events, pagination } of results) {
            if (!events || events.length === 0) continue;

            itemsFetchedSoFar += events.length;

            for (const event of events) {
                if (!isPolymarketEvent(event)) continue;
                const eventKey = buildEventDedupeKey(event, provider);
                if (seenEventIds.has(eventKey)) continue;

                const markets = jupiterEventToMarkets(event);
                if (markets.length === 0) continue;

                seenEventIds.add(eventKey);
                for (const m of markets) {
                    if (isLikelyKalshiMarketId(m.marketId || m.id)) continue;
                    const marketKey = `${provider}:${m.id}`;
                    if (seenMarketIds.has(marketKey)) continue;
                    seenMarketIds.add(marketKey);
                    allMarkets.push(m);
                }
            }

            // Update lastCursorNext based on the last successful pagination
            if (pagination && pagination.end) {
                lastCursorNext = Math.max(lastCursorNext, pagination.end + 1);
            }
            if (pagination && !pagination.hasNext) {
                isDone = true;
            }
        }

        if (isDone) lastCursorNext = -1;
        nextCursors.push(lastCursorNext);
    }

    // If all providers are exhausted, nextCursor is null
    const hasMore = nextCursors.some(c => c !== -1);
    const nextCursor = hasMore ? nextCursors.map(c => (c === -1 ? "DONE" : c)).join(":") : null;

    allMarkets.sort((a, b) => getMarketSortScore(b, sortPreference) - getMarketSortScore(a, sortPreference));

    const categories = [...new Set(allMarkets.map((m) => m.category))]
        .filter((c) => c !== "Other")
        .sort((a, b) => a.localeCompare(b));

    return { markets: allMarkets, categories, nextCursor };
}

/**
 * Fetch Home markets by selected filter.
 * Reuses a short-lived base market cache to avoid refetching on every chip tap.
 */
export async function fetchHomeMarketsByFilter(
    filter: HomeMarketFilter,
    params?: {
        limit?: number;
        sort?: "volume" | "volume24h" | "liquidity";
        forceRefresh?: boolean;
    }
): Promise<Market[]> {
    const now = Date.now();
    const shouldRefresh =
        !!params?.forceRefresh ||
        !cachedHomeBaseMarkets ||
        now - cachedHomeBaseMarketsAt > HOME_BASE_MARKETS_TTL;

    if (shouldRefresh) {
        const { markets } = await fetchMarketsForApp({
            limit: params?.limit ?? 1000,
            sort: params?.sort ?? "liquidity",
        });
        cachedHomeBaseMarkets = markets;
        cachedHomeBaseMarketsAt = now;
    }

    return applyHomeMarketFilter(cachedHomeBaseMarkets ?? [], filter);
}

/**
 * Fetch single market for detail screen (by marketId or eventId).
 */
export async function fetchMarketForApp(id: string): Promise<Market | null> {
    if (isLikelyKalshiMarketId(id)) {
        return null;
    }

    // 1. Try direct market fetch
    const jupMarket = await fetchJupiterMarket(id);
    if (jupMarket) {
        // We need the event for title/description/image
        // Try to find the event by searching with the market across providers/pages
        for (const provider of JUPITER_PROVIDERS) {
            let start = 1;
            for (let page = 0; page < 3; page++) {
                const end = start + EVENTS_PAGE_SIZE - 1;
                const { events, pagination } = await fetchJupiterEvents({
                    provider,
                    start,
                    end,
                    includeMarkets: true,
                    sortBy: "volume",
                    sortDirection: "desc",
                });
                for (const event of events) {
                    const hasMarket = event.markets?.some((m) => m.marketId === id);
                    if (hasMarket) {
                        const markets = jupiterEventToMarkets(event);
                        if (markets.length > 0) {
                            const market = markets[0];
                            if (isLikelyKalshiMarketId(market.marketId || market.id)) {
                                return null;
                            }
                            return market;
                        }
                    }
                }
                if (!pagination?.hasNext) break;
                const nextStart = (pagination.end ?? end) + 1;
                if (!Number.isFinite(nextStart) || nextStart <= start) break;
                start = nextStart;
            }
        }
        // Strict polymarket mode: no parent polymarket event => no market.
        return null;
    }

    // 2. Try as event ID
    for (const provider of JUPITER_PROVIDERS) {
        const event = await fetchJupiterEventById(id, provider);
        if (event && event.markets?.length) {
            const markets = jupiterEventToMarkets(event);
            if (markets.length > 0) {
                const market = markets[0];
                if (isLikelyKalshiMarketId(market.marketId || market.id)) {
                    return null;
                }
                return market;
            }
        }
    }

    // 3. Search fallback
    const searchResults = await fetchJupiterSearch(id);
    if (searchResults.length > 0) {
        const first = searchResults[0];
        if (!isLikelyKalshiMarketId(first.marketId || first.id)) return first;
    }

    return null;
}
