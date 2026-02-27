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
    if (/\b(bitcoin|btc|eth|ethereum|solana|sol|token|crypto|blockchain|nft|ripple|xrp|cardano|ada|polkadot|dot|bnb|binance|uniswap|pepe|doge|shiba|memecoin|ledger|metamask|durov|telegram|ton|base|arbitrum|avax|avalanche)\b/i.test(t)) return "Crypto";
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

    const eventTitle = event.metadata?.title || event.title || "Unknown Market";
    const eventDescription = event.metadata?.description || event.description || jupMarket.metadata?.rulesPrimary || "";
    const eventImageUrl = event.metadata?.imageUrl || event.imageUrl;

    const category = normalizeCategoryFromJupiter(event.category) !== "Other"
        ? normalizeCategoryFromJupiter(event.category)
        : inferCategoryFromTitle(eventTitle);

    const isTradeable = jupMarket.status === "open";
    const resolveDate = event.expiryDate
        ? new Date(event.expiryDate).toISOString()
        : (typeof jupMarket.metadata?.closeTime === 'string' ? jupMarket.metadata.closeTime : "");

    const volume = event.volume ?? jupMarket.pricing?.volume ?? 0;

    return {
        id: jupMarket.marketId,
        title: jupMarket.metadata?.title || eventTitle,
        description: eventDescription,
        category,
        imageUrl: eventImageUrl,
        yesPrice: Math.max(0, Math.min(1, yesPrice)),
        volume: volume,
        volume24h: 0,
        openInterest: 0,
        liquidity: event.liquidity ?? 0,
        liquidityScore: typeof event.liquidity === "number" ? Math.min(100, event.liquidity) : 0,
        openDate: "",
        resolveDate,

        // Jupiter identifiers
        marketId: jupMarket.marketId,
        eventId: event.eventId,
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
        eventTicker: event.eventId,
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
    status?: string;
    provider?: string;
    limit?: number;
    cursor?: string;
}): Promise<{ events: JupiterEvent[]; nextCursor: string | null }> {
    const url = new URL(`${JUPITER_BASE_URL}/events`);
    if (params?.category) url.searchParams.set("category", params.category);
    if (params?.status) url.searchParams.set("status", params.status);
    if (params?.provider) url.searchParams.set("provider", params.provider);
    if (params?.limit) url.searchParams.set("limit", String(params.limit));
    if (params?.cursor) url.searchParams.set("cursor", params.cursor);

    try {
        const res = await fetch(url.toString(), { headers: getHeaders() });
        if (!res.ok) {
            if (res.status === 403 || res.status === 401) {
                console.error("[Jupiter] API auth error:", res.status, "- check EXPO_PUBLIC_JUPITER_API_KEY");
                return { events: [], nextCursor: null };
            }
            if (res.status >= 500) {
                console.warn(`[Jupiter] Events API returned ${res.status}, skipping`);
                return { events: [], nextCursor: null };
            }
            throw new Error(`Jupiter events: ${res.status}`);
        }
        const data = (await res.json()) as JupiterEventsResponse;
        return {
            events: data.data ?? [],
            nextCursor: data.nextCursor ?? null,
        };
    } catch (error) {
        console.error("[Jupiter] fetchJupiterEvents error:", error);
        return { events: [], nextCursor: null };
    }
}

/**
 * Fetch single event by ID.
 */
export async function fetchJupiterEventById(eventId: string): Promise<JupiterEvent | null> {
    const url = `${JUPITER_BASE_URL}/events/${encodeURIComponent(eventId)}`;
    try {
        const res = await fetch(url, { headers: getHeaders() });
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
        const events = data.data ?? [];

        const results: Market[] = [];
        for (const event of events) {
            if (event.status !== "open") continue;
            const markets = jupiterEventToMarkets(event);
            for (const m of markets) {
                if (m.isTradeable) {
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
 * Fetch markets for Home/Markets screens.
 * Returns up to TARGET_MARKET_COUNT markets and available categories.
 */
export async function fetchMarketsForApp(params?: {
    limit?: number;
    sort?: "volume" | "volume24h" | "liquidity";
}): Promise<{ markets: Market[]; categories: string[] }> {
    const targetEventCount = 100;
    const allMarkets: Market[] = [];
    const seenEventIds = new Set<string>();
    const seenMarketIds = new Set<string>();
    let cursor: string | null = null;
    let eventCount = 0;

    do {
        const { events, nextCursor } = await fetchJupiterEvents({
            status: "open",
            limit: 50,
            cursor: cursor ?? undefined,
        });

        for (const event of events) {
            if (eventCount >= targetEventCount) break;
            if (seenEventIds.has(event.eventId)) continue;

            const markets = jupiterEventToMarkets(event);
            if (markets.length > 0) {
                for (const m of markets) {
                    if (seenMarketIds.has(m.id)) continue;
                    allMarkets.push(m);
                    seenMarketIds.add(m.id);
                }
                seenEventIds.add(event.eventId);
                eventCount++;
            }
        }

        cursor = nextCursor;
        if (!cursor || events.length === 0) break;
    } while (eventCount < targetEventCount);

    // Sort by volume descending
    allMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

    // Extract unique categories present in the fetched markets
    const categories = [...new Set(allMarkets.map((m) => m.category))]
        .filter((c) => c !== "Other")
        .sort((a, b) => a.localeCompare(b));

    return { markets: allMarkets, categories };
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
    // 1. Try direct market fetch
    const jupMarket = await fetchJupiterMarket(id);
    if (jupMarket) {
        // We need the event for title/description/image
        // Try to find the event by searching with the market
        const { events } = await fetchJupiterEvents({ limit: 50 });
        for (const event of events) {
            const hasMarket = event.markets?.some((m) => m.marketId === id);
            if (hasMarket) {
                const markets = jupiterEventToMarkets(event);
                if (markets.length > 0) return markets[0];
            }
        }
        // If we can't find the parent event, create a minimal Market
        return jupiterEventMarketToAppMarket(
            {
                eventId: id,
                title: "Market",
                status: jupMarket.status,
                markets: [jupMarket],
            },
            jupMarket
        );
    }

    // 2. Try as event ID
    const event = await fetchJupiterEventById(id);
    if (event && event.markets?.length) {
        const markets = jupiterEventToMarkets(event);
        if (markets.length > 0) return markets[0];
    }

    // 3. Search fallback
    const searchResults = await fetchJupiterSearch(id);
    if (searchResults.length > 0) return searchResults[0];

    return null;
}
