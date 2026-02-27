import type { ChartPoint, Market } from "./mock-data";

export interface CryptoCoin {
    id: string;
    symbol: string;
    name: string;
    aliases: string[];
}

const SUPPORTED_COINS: CryptoCoin[] = [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", aliases: ["bitcoin", "btc", "xbt"] },
    { id: "ethereum", symbol: "ETH", name: "Ethereum", aliases: ["ethereum", "eth"] },
    { id: "solana", symbol: "SOL", name: "Solana", aliases: ["solana", "sol"] },
    { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", aliases: ["dogecoin", "doge"] },
    { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu", aliases: ["shiba inu", "shiba", "shib"] },
    { id: "xrp", symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
    { id: "cardano", symbol: "ADA", name: "Cardano", aliases: ["cardano", "ada"] },
    { id: "binancecoin", symbol: "BNB", name: "BNB", aliases: ["bnb", "binance coin", "binancecoin"] },
];

const PRICE_CONTEXT_REGEX =
    /\b(price|priced|usd|usdt|up|down|above|below|over|under|reach|beat|target|at least|at most)\b/i;

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWord(text: string, token: string): boolean {
    const normalized = token.trim().toLowerCase();
    if (!normalized) return false;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalized)}([^a-z0-9]|$)`, "i");
    return pattern.test(text);
}

function getMarketTextBundle(market: Pick<Market, "title" | "description" | "category" | "ticker" | "eventTicker" | "seriesTicker" | "strikePeriod">): string {
    return [
        market.title,
        market.description,
        market.category,
        market.ticker,
        market.eventTicker,
        market.seriesTicker,
        market.strikePeriod,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

export function detectCryptoCoinFromMarket(market: Pick<Market, "title" | "description" | "category" | "ticker" | "eventTicker" | "seriesTicker" | "strikePeriod">): CryptoCoin | null {
    const text = getMarketTextBundle(market);
    for (const coin of SUPPORTED_COINS) {
        if (coin.aliases.some((alias) => includesWord(text, alias))) {
            return coin;
        }
    }
    return null;
}

export function detectCryptoPriceCoinFromMarket(market: Pick<Market, "title" | "description" | "category" | "ticker" | "eventTicker" | "seriesTicker" | "strikePeriod">): CryptoCoin | null {
    const coin = detectCryptoCoinFromMarket(market);
    if (!coin) return null;

    const text = getMarketTextBundle(market);
    const category = (market.category ?? "").toLowerCase();
    const isCryptoCategory = category.includes("crypto") || category.includes("live");
    const hasPriceContext = PRICE_CONTEXT_REGEX.test(text) || text.includes("$");

    if (hasPriceContext) return coin;
    if (isCryptoCategory && includesWord(text, coin.symbol.toLowerCase())) return coin;
    return null;
}

export async function fetchCryptoPriceHistory(
    coinId: string,
    params?: { rangeHours?: number }
): Promise<ChartPoint[]> {
    const rangeHours = Math.min(Math.max(params?.rangeHours ?? 6, 1), 72);
    const endTsSec = Math.floor(Date.now() / 1000);
    const startTsSec = endTsSec - rangeHours * 3600;

    const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("from", String(startTsSec));
    url.searchParams.set("to", String(endTsSec));

    try {
        const res = await fetch(url.toString(), {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return [];

        const payload = (await res.json()) as { prices?: Array<[number, number]> };
        return (payload.prices ?? [])
            .map(([timestamp, price]) => ({
                timestamp: Number(timestamp),
                value: Number(price),
            }))
            .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value) && point.value > 0)
            .sort((a, b) => a.timestamp - b.timestamp);
    } catch {
        return [];
    }
}

export async function fetchCryptoSpotPrice(coinId: string): Promise<number | null> {
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", coinId);
    url.searchParams.set("vs_currencies", "usd");

    try {
        const res = await fetch(url.toString(), {
            headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;

        const payload = (await res.json()) as Record<string, { usd?: number } | undefined>;
        const usd = payload[coinId]?.usd;
        return typeof usd === "number" && Number.isFinite(usd) ? usd : null;
    } catch {
        return null;
    }
}
