import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Market } from "./mock-data";

const FAVORITE_MARKETS_STORAGE_KEY = "favorite-markets:v1";

export interface FavoriteMarketRecord {
    routeId: string;
    marketId: string;
    eventId?: string;
    title: string;
    subtitle?: string;
    category: string;
    imageUrl?: string;
    yesPrice: number;
    volume: number;
    resolveDate: string;
    provider?: string;
    favoritedAt: number;
}

function normalizeRouteId(routeId: string): string {
    return String(routeId ?? "").trim();
}

function normalizeFavoriteRecords(value: unknown): FavoriteMarketRecord[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is FavoriteMarketRecord => {
            return !!item &&
                typeof item === "object" &&
                typeof item.routeId === "string" &&
                typeof item.marketId === "string" &&
                typeof item.title === "string";
        })
        .map((item) => ({
            routeId: normalizeRouteId(item.routeId),
            marketId: String(item.marketId ?? "").trim(),
            eventId: item.eventId ? String(item.eventId).trim() : undefined,
            title: String(item.title ?? "").trim(),
            subtitle: item.subtitle ? String(item.subtitle).trim() : undefined,
            category: String(item.category ?? "").trim(),
            imageUrl: item.imageUrl ? String(item.imageUrl).trim() : undefined,
            yesPrice: Number.isFinite(item.yesPrice) ? item.yesPrice : 0,
            volume: Number.isFinite(item.volume) ? item.volume : 0,
            resolveDate: String(item.resolveDate ?? ""),
            provider: item.provider ? String(item.provider).trim() : undefined,
            favoritedAt: Number.isFinite(item.favoritedAt) ? item.favoritedAt : Date.now(),
        }))
        .filter((item) => item.routeId.length > 0 && item.marketId.length > 0 && item.title.length > 0)
        .sort((a, b) => b.favoritedAt - a.favoritedAt);
}

async function readFavoriteRecords(): Promise<FavoriteMarketRecord[]> {
    try {
        const raw = await AsyncStorage.getItem(FAVORITE_MARKETS_STORAGE_KEY);
        if (!raw) return [];
        return normalizeFavoriteRecords(JSON.parse(raw));
    } catch (error) {
        console.warn("[favoriteMarkets] Failed to read favorites:", error);
        return [];
    }
}

async function writeFavoriteRecords(records: FavoriteMarketRecord[]): Promise<FavoriteMarketRecord[]> {
    const normalized = normalizeFavoriteRecords(records);
    await AsyncStorage.setItem(FAVORITE_MARKETS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
}

export function buildFavoriteMarketRecord(
    market: Market,
    options: {
        routeId: string;
        title?: string;
        subtitle?: string;
    }
): FavoriteMarketRecord {
    const routeId = normalizeRouteId(options.routeId);
    const marketId = String(market.marketId || market.id || "").trim();

    if (!routeId) {
        throw new Error("routeId is required to favorite a market");
    }

    if (!marketId) {
        throw new Error("marketId is required to favorite a market");
    }

    return {
        routeId,
        marketId,
        eventId: market.eventId ? String(market.eventId).trim() : undefined,
        title: String(options.title || market.eventTitle || market.title || "").trim(),
        subtitle: options.subtitle ? String(options.subtitle).trim() : undefined,
        category: String(market.category || "").trim(),
        imageUrl: market.imageUrl,
        yesPrice: Number.isFinite(market.yesPrice) ? market.yesPrice : 0,
        volume: Number.isFinite(market.volume) ? market.volume : 0,
        resolveDate: String(market.resolveDate ?? ""),
        provider: market.provider,
        favoritedAt: Date.now(),
    };
}

export async function listFavoriteMarkets(): Promise<FavoriteMarketRecord[]> {
    return readFavoriteRecords();
}

export async function isFavoriteRoute(routeId: string): Promise<boolean> {
    const normalizedRouteId = normalizeRouteId(routeId);
    if (!normalizedRouteId) return false;

    const favorites = await readFavoriteRecords();
    return favorites.some((item) => item.routeId === normalizedRouteId);
}

export async function addFavoriteMarket(record: FavoriteMarketRecord): Promise<FavoriteMarketRecord[]> {
    const favorites = await readFavoriteRecords();
    const next = [
        record,
        ...favorites.filter((item) => item.routeId !== record.routeId),
    ];
    return writeFavoriteRecords(next);
}

export async function removeFavoriteMarket(routeId: string): Promise<FavoriteMarketRecord[]> {
    const normalizedRouteId = normalizeRouteId(routeId);
    const favorites = await readFavoriteRecords();
    return writeFavoriteRecords(favorites.filter((item) => item.routeId !== normalizedRouteId));
}

export async function toggleFavoriteMarket(
    market: Market,
    options: {
        routeId: string;
        title?: string;
        subtitle?: string;
    }
): Promise<{ favorited: boolean; favorites: FavoriteMarketRecord[] }> {
    const routeId = normalizeRouteId(options.routeId);
    const favorites = await readFavoriteRecords();
    const isFavorite = favorites.some((item) => item.routeId === routeId);

    if (isFavorite) {
        const next = await writeFavoriteRecords(favorites.filter((item) => item.routeId !== routeId));
        return { favorited: false, favorites: next };
    }

    const next = await addFavoriteMarket(buildFavoriteMarketRecord(market, options));
    return { favorited: true, favorites: next };
}
