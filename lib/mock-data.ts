export interface ChartPoint {
    timestamp: number;
    value: number;
}

export interface Market {
    id: string;
    title: string;
    description?: string;
    category: string;
    imageUrl?: string;
    yesPrice: number; // 0-1
    volume: number; // in USD (total)
    volume24h?: number; // in USD (24h)
    openInterest?: number; // total open interest
    liquidity?: number; // raw liquidity value
    liquidityScore: number;
    openDate?: string;
    resolveDate: string;

    // Jupiter extension fields
    marketId?: string;
    polymarketClobTokenId?: string;
    eventId?: string;
    eventTitle?: string;
    eventVolume?: number;
    provider?: "polymarket" | "kalshi" | string;
    buyYesPriceUsd?: number | null;
    buyNoPriceUsd?: number | null;
    sellYesPriceUsd?: number | null;
    sellNoPriceUsd?: number | null;
    result?: "" | "pending" | "yes" | "no";

    // Legacy fields (kept for backward compatibility during migration)
    yesMint?: string;
    noMint?: string;
    isInitialized?: boolean;
    collateralMint?: string;
    hasLiveQuotes?: boolean;
    isTradeable?: boolean;
    yesLabel?: string;
    noLabel?: string;

    ticker?: string;
    eventTicker?: string;
    seriesTicker?: string;
    strikePeriod?: string;
    status?: string;

    // Chart data
    priceHistory: ChartPoint[];
}
export interface MarketGroup {
    eventId: string;
    title: string;
    description?: string;
    category: string;
    imageUrl?: string;
    markets: Market[];
    volume: number;
    resolveDate: string;
    status?: string;
    provider?: string;
}
