import type { Market } from "./mock-data";
import { fetchMarketForApp } from "./jupiter";

type PostMarketLike = {
    market_id?: string | null;
    market_slug?: string | null;
    market_question?: string | null;
    trade_metadata?: unknown;
};

const resolvedMarketCache = new Map<string, Market | null>();

function readMetadataValue(source: unknown, key: string): string | null {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return null;
    }

    const value = (source as Record<string, unknown>)[key];
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getPostMarketLookupCandidates(post: PostMarketLike): string[] {
    const candidates = [
        post.market_id,
        post.market_slug,
        post.market_question,
        readMetadataValue(post.trade_metadata, "marketId"),
        readMetadataValue(post.trade_metadata, "market_id"),
        readMetadataValue(post.trade_metadata, "marketSlug"),
        readMetadataValue(post.trade_metadata, "market_slug"),
        readMetadataValue(post.trade_metadata, "marketTitle"),
        readMetadataValue(post.trade_metadata, "market_title"),
    ];

    return Array.from(
        new Set(
            candidates
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter((value) => value.length > 0)
        )
    );
}

export function hasResolvablePostMarket(post: PostMarketLike): boolean {
    return getPostMarketLookupCandidates(post).length > 0;
}

export async function resolvePostMarketId(post: PostMarketLike): Promise<string | null> {
    const market = await resolvePostMarket(post);
    return market?.marketId || market?.id || null;
}

export async function resolvePostMarket(post: PostMarketLike): Promise<Market | null> {
    const candidates = getPostMarketLookupCandidates(post);
    if (candidates.length === 0) {
        return null;
    }

    const cacheKey = candidates.join("::");
    if (resolvedMarketCache.has(cacheKey)) {
        return resolvedMarketCache.get(cacheKey) ?? null;
    }

    for (const candidate of candidates) {
        const market = await fetchMarketForApp(candidate);
        if (market) {
            resolvedMarketCache.set(cacheKey, market);
            return market;
        }
    }

    resolvedMarketCache.set(cacheKey, null);
    return null;
}
