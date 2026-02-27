import type { Market } from "./mock-data";

export type HomeMarketFilter =
    | "all"
    | "btc"
    | "hourly"
    | "15min"
    | "eth"
    | "pre-market"
    | "dogecoin"
    | "sol"
    | "shiba";

type MarketType = "directional" | "range";
type MarketCoin = "BTC" | "ETH" | "SOL" | "DOGE" | "SHIB";

export const HOME_MARKET_FILTERS: HomeMarketFilter[] = [
    "all",
    "btc",
    "hourly",
    "15min",
    "eth",
    "pre-market",
    "dogecoin",
    "sol",
    "shiba",
];

const COIN_PATTERNS: Record<MarketCoin, string[]> = {
    BTC: ["bitcoin", "btc", "satoshi"],
    ETH: ["ethereum", "eth"],
    SOL: ["solana", "sol"],
    DOGE: ["doge", "dogecoin"],
    SHIB: ["shib", "shiba"],
};

const PREMARKET_KEYWORDS = [
    "fdv",
    "pre-market",
    "launch",
    "mainnet",
    "megaeth",
    "opensea",
    "monad",
    "rainbow",
    "hyperswap",
    "fogo",
    "berachain",
    "initia",
    "movement",
    "abstract",
    "linera",
    "eclipse",
    "fuel",
    "taiko",
    "scroll",
    "zksync",
    "starknet",
    "aztec",
    "hyperliquid",
];
const MIN_VISIBLE_VOLUME = 0;

export function marketFilterToLabel(filter: HomeMarketFilter): string {
    if (filter === "all") return "All";
    if (filter === "btc") return "BTC";
    if (filter === "hourly") return "Hourly";
    if (filter === "15min") return "15 Min";
    if (filter === "eth") return "ETH";
    if (filter === "pre-market") return "Pre-Market";
    if (filter === "dogecoin") return "Dogecoin";
    if (filter === "sol") return "SOL";
    return "SHIBA";
}

function getMarketTextBundle(market: Market): string {
    return [
        market.title,
        market.description,
        market.ticker,
        market.eventTicker,
        market.seriesTicker,
        market.strikePeriod,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

export function getMarketResolveMs(market: Market): number {
    if (!market.resolveDate) return Number.POSITIVE_INFINITY;
    const ms = new Date(market.resolveDate).getTime();
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function detectMarketCoin(market: Market): MarketCoin | null {
    const text = getMarketTextBundle(market);
    for (const [coin, patterns] of Object.entries(COIN_PATTERNS) as Array<[MarketCoin, string[]]>) {
        if (patterns.some((pattern) => text.includes(pattern))) return coin;
    }
    return null;
}

function detectMarketType(market: Market): MarketType {
    const seriesTicker = (market.seriesTicker ?? "").toUpperCase();
    const ticker = (market.ticker ?? "").toUpperCase();
    if (seriesTicker.endsWith("D") || /-T\d+(\.\d+)?$/.test(ticker)) return "directional";
    return "range";
}

function is15MinuteMarket(market: Market): boolean {
    const strikePeriod = (market.strikePeriod ?? "").toLowerCase();
    if (market.category === "Live") return true;
    if (strikePeriod.includes("15m") || strikePeriod.includes("15 min") || strikePeriod.includes("15-min")) return true;
    const text = getMarketTextBundle(market);
    return text.includes("15 min") || text.includes("15-min") || text.includes("15min") || text.includes("15 minute");
}

function isHourlyMarket(market: Market): boolean {
    if (is15MinuteMarket(market)) return false;
    const strikePeriod = (market.strikePeriod ?? "").toLowerCase();
    if (strikePeriod.includes("hour")) return true;
    const nowMs = Date.now();
    const resolveMs = getMarketResolveMs(market);
    const hoursLeft = (resolveMs - nowMs) / (60 * 60 * 1000);
    return Number.isFinite(hoursLeft) && hoursLeft > 0 && hoursLeft <= 2;
}

function isPreMarketMarket(market: Market): boolean {
    const text = getMarketTextBundle(market);
    return PREMARKET_KEYWORDS.some((k) => text.includes(k));
}

function isEndedMarket(market: Market, nowMs: number): boolean {
    const status = (market.status ?? "").toLowerCase();
    if (
        status.includes("closed") ||
        status.includes("finalized") ||
        status.includes("settled") ||
        status.includes("determined") ||
        status.includes("expired") ||
        status.includes("resolved")
    ) {
        return true;
    }

    if (!market.resolveDate) return false;
    const resolveMs = new Date(market.resolveDate).getTime();
    if (!Number.isFinite(resolveMs)) return false;
    return resolveMs <= nowMs;
}

function hasVolume(market: Market): boolean {
    return getVolumeScore(market) >= MIN_VISIBLE_VOLUME;
}

function getVolumeScore(market: Market): number {
    const score = Math.max(market.volume24h ?? 0, market.volume ?? 0);
    return Number.isFinite(score) ? score : 0;
}

function isTradeable(market: Market): boolean {
    if (market.isTradeable === false) return false;
    // Jupiter markets use marketId, legacy uses mints
    if (market.marketId) return true;
    if (!market.yesMint || !market.noMint) return false;
    return true;
}

function sortByVolumeDesc(markets: Market[]): Market[] {
    return [...markets].sort((a, b) => getVolumeScore(b) - getVolumeScore(a));
}

function applyHourlyStrategy(markets: Market[]): Market[] {
    const hourlySorted = [...markets]
        .filter((m) => isHourlyMarket(m))
        .sort((a, b) => {
            const resolveDelta = getMarketResolveMs(a) - getMarketResolveMs(b);
            if (resolveDelta !== 0) return resolveDelta;
            return getVolumeScore(b) - getVolumeScore(a);
        });

    // 0x01 strategy: keep nearest market per coin + market type.
    const byCoinType = new Map<string, Market>();
    for (const market of hourlySorted) {
        const coin = detectMarketCoin(market);
        const type = detectMarketType(market);
        const key = coin ? `${coin}-${type}` : `${market.id}-${type}`;
        if (!byCoinType.has(key)) byCoinType.set(key, market);
    }
    return Array.from(byCoinType.values());
}

export function applyHomeMarketFilter(markets: Market[], filter: HomeMarketFilter): Market[] {
    const now = Date.now();
    const activeMarkets = markets
        .filter((market) => !isEndedMarket(market, now))
        .filter((market) => hasVolume(market))
        .filter((market) => isTradeable(market));

    if (filter === "all") {
        return sortByVolumeDesc(activeMarkets).slice(0, 1000);
    }

    if (filter === "15min") {
        return [...activeMarkets]
            .filter((m) => is15MinuteMarket(m))
            .sort((a, b) => getMarketResolveMs(a) - getMarketResolveMs(b));
    }

    if (filter === "hourly") {
        return applyHourlyStrategy(activeMarkets);
    }

    if (filter === "pre-market") {
        return sortByVolumeDesc(activeMarkets.filter((m) => isPreMarketMarket(m)));
    }

    const filterCoin: Partial<Record<HomeMarketFilter, MarketCoin>> = {
        btc: "BTC",
        eth: "ETH",
        sol: "SOL",
        dogecoin: "DOGE",
        shiba: "SHIB",
    };
    const coin = filterCoin[filter];
    if (!coin) return sortByVolumeDesc(activeMarkets);
    return sortByVolumeDesc(activeMarkets.filter((m) => detectMarketCoin(m) === coin));
}
