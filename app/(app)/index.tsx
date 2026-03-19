import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Pressable,
    Modal,
    Alert,
    RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { useRouter, useNavigation } from "expo-router";
import { useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { DepositModal } from "../../components/DepositModal";
import type { Market, MarketGroup } from "../../lib/mock-data";
import { fetchMarketsForApp, fetchJupiterTagsByCategories } from "../../lib/jupiter";
import { MarketCardNative } from "../../components/MarketCardNative";
import { getSolBalance, getSolPriceUsd, getUsdcBalance } from "../../lib/solana";
import { TradePanel } from "../../components/market/TradePanel";
import { TradeSide } from "../../hooks/useTrade";
import { usePositions } from "../../hooks/usePositions";
import {
    Bell,
    Flame,
    Landmark,
    Trophy,
    Bitcoin,
    Clock3,
    Plus,
    Circle,
    ArrowUpCircle,
    ArrowDownCircle,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { PremiumSpinner } from "../../components/ui/PremiumSpinner";

import Animated, {
    runOnJS,
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import { BottomProgressiveBlur } from "../../components/ui/BottomProgressiveBlur";
import {
    listFavoriteMarkets,
    type FavoriteMarketRecord,
} from "../../lib/favoriteMarkets";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const CATEGORY_PRIORITY = [
    "Politics",
    "Sports",
    "Crypto",
    "Economics",
    "Entertainment",
    "Climate",
    "Science and Technology",
];
const MIN_VISIBLE_VOLUME = 0;
const POPULAR_GROUP_BATCH_SIZE = 15;
const CATEGORY_GROUP_BATCH_SIZE = 100;
const ODDS_SORT_OPTIONS = [
    { key: "ticker", label: "Ticker" },
    { key: "price", label: "Price" },
    { key: "volume", label: "Volume" },
    { key: "change", label: "% Change" },
] as const;
const STICKY_HEADER_TRIGGER_OFFSET = 200;

type OddsSortKey = (typeof ODDS_SORT_OPTIONS)[number]["key"];
type OddsSortDirection = "up" | "down";

function categoryToIcon(category: string) {
    const normalized = category.toLowerCase();
    if (normalized === "popular") return Flame;
    if (normalized.includes("15 min")) return Clock3;
    if (normalized.includes("politic")) return Landmark;
    if (normalized.includes("sport")) return Trophy;
    if (normalized.includes("crypto")) return Bitcoin;
    return null;
}

function categoryPillLabel(category: string) {
    if (category === "Popular") return "Popular";
    return category;
}

function isSettledStatus(statusValue?: string): boolean {
    const status = (statusValue ?? "").toLowerCase();
    return (
        status.includes("closed") ||
        status.includes("finalized") ||
        status.includes("settled") ||
        status.includes("determined") ||
        status.includes("expired") ||
        status.includes("resolved")
    );
}

function isEndedMarket(market: Market, nowMs: number): boolean {
    if (isSettledStatus(market.status)) {
        return true;
    }

    if (!market.resolveDate) return false;
    const resolveMs = new Date(market.resolveDate).getTime();
    if (!Number.isFinite(resolveMs)) return false;
    return resolveMs <= nowMs;
}

function hasVolume(market: Market): boolean {
    const score = getMarketVolumeScore(market);
    return Number.isFinite(score) && score >= MIN_VISIBLE_VOLUME;
}

function getMarketVolumeScore(market: Market): number {
    const v24h = market.volume24h ?? 0;
    const v = market.volume ?? 0;
    const score = Math.max(v24h, v);
    return Number.isFinite(score) ? score : 0;
}

function getPopularityScore(market: Market): number {
    const v24h = market.volume24h ?? 0;
    const v = market.volume ?? 0;
    // Heavily weight recent 24h volume (e.g. 10x) vs historical volume to surface truly trending markets
    const score = (v24h * 10) + v;
    return Number.isFinite(score) ? score : 0;
}

function buildPopularEventOrder(markets: Market[]): string[] {
    const sortedByScore = [...markets].sort((a, b) => getPopularityScore(b) - getPopularityScore(a));
    const seenEventIds = new Set<string>();
    const orderedEventIds: string[] = [];

    for (const market of sortedByScore) {
        const eventId = market.eventId || market.id;
        if (seenEventIds.has(eventId)) continue;
        seenEventIds.add(eventId);
        orderedEventIds.push(eventId);
    }

    return orderedEventIds;
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

function hasExplicit15MinuteSignal(market: Market): boolean {
    const strikePeriod = (market.strikePeriod ?? "").toLowerCase();
    if (
        strikePeriod === "15m" ||
        strikePeriod.includes("15m") ||
        strikePeriod.includes("15 min") ||
        strikePeriod.includes("15-min") ||
        strikePeriod.includes("quarter-hour") ||
        strikePeriod.includes("quarter hour")
    ) {
        return true;
    }

    const text = getMarketTextBundle(market);
    return (
        text.includes("15 min") ||
        text.includes("15-min") ||
        text.includes("15min") ||
        text.includes("15 minute")
    );
}

function hasZeroX01Signal(market: Market): boolean {
    const text = getMarketTextBundle(market);
    return /\b0x0?1\b/.test(text);
}

function getMarketResolveMs(market: Market): number {
    if (!market.resolveDate) return Number.POSITIVE_INFINITY;
    const resolveMs = new Date(market.resolveDate).getTime();
    return Number.isFinite(resolveMs) ? resolveMs : Number.POSITIVE_INFINITY;
}

function is15MinuteMarket(market: Market): boolean {
    if ((market.category ?? "").toLowerCase() === "live") return true;
    const hasExplicitSignal = hasExplicit15MinuteSignal(market);
    return hasExplicitSignal;
}

function isTradeableMarket(market: Market): boolean {
    // If it's explicitly marked as not tradeable, skip it.
    if (market.isTradeable === false) return false;
    // For Jupiter markets, the status check in the adapter is enough.
    // Legacy markets required yesMint and noMint to be set.
    return true;
}



function normalizeCategoryName(raw: string): string {
    const text = raw.trim().toLowerCase();
    if (!text) return "";
    if (text.includes("politic")) return "Politics";
    if (text.includes("sport")) return "Sports";
    if (text.includes("crypto")) return "Crypto";
    if (text.includes("econom")) return "Economics";
    if (text.includes("entertain")) return "Entertainment";
    if (text.includes("climate")) return "Climate";
    if (text.includes("science") || text.includes("technology")) return "Science and Technology";
    return raw.trim();
}

function inferCategoryFromMarketText(market: Market): string {
    const text = [
        market.title,
        market.description,
        market.category,
        market.ticker,
        market.seriesTicker,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (/\b(bitcoin|btc|eth|solana|crypto|token|blockchain|nft|pepe|wif|bonk|doge|shib|ripple|xrp|ada|bnb|uniswap|ledger|metamask|durov|telegram|ton|base|arbitrum|avax|avalanche)\b/i.test(text)) return "Crypto";
    if (/\b(fed|rate|inflation|economy|gdp|recession|yield|bank|finance|financial)\b/i.test(text)) return "Economics";
    return normalizeCategoryName(market.category ?? "");
}

function getMarketCategory(market: Market): string {
    if (is15MinuteMarket(market)) return "15 Min";
    const normalized = normalizeCategoryName(market.category ?? "");
    if (normalized && normalized !== "Other") return normalized;
    return inferCategoryFromMarketText(market);
}

function formatCompactMoney(value: number): { whole: string; decimal: string } {
    const fixed = value.toFixed(2);
    const [whole, decimal] = fixed.split(".");
    return {
        whole: `$${Number(whole).toLocaleString("en-US")}`,
        decimal: `.${decimal}`,
    };
}

function formatVolumeLabel(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "$0 Vol";
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B Vol`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M Vol`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K Vol`;
    return `$${Math.round(value).toLocaleString("en-US")} Vol`;
}

function formatResolveLabel(resolveDate?: string): string | null {
    if (!resolveDate) return null;

    const parsed = new Date(resolveDate);
    if (Number.isNaN(parsed.getTime())) return null;

    return `Ends ${parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })}`;
}

function buildFavoriteFallbackMarket(item: FavoriteMarketRecord): Market {
    const probability = Number.isFinite(item.yesPrice) ? Math.max(0, Math.min(1, item.yesPrice)) : 0;

    return {
        id: item.marketId || item.routeId,
        marketId: item.marketId,
        eventId: item.eventId,
        title: item.title,
        eventTitle: item.subtitle,
        description: item.subtitle,
        category: item.category || "Favorites",
        imageUrl: item.imageUrl,
        yesPrice: probability,
        volume: Number.isFinite(item.volume) ? item.volume : 0,
        volume24h: Number.isFinite(item.volume) ? item.volume : 0,
        liquidityScore: 0,
        resolveDate: item.resolveDate,
        provider: item.provider,
        isTradeable: true,
        priceHistory: [],
    };
}

function getGroupHighestYesPrice(group: MarketGroup): number {
    return group.markets.reduce((highest, market) => {
        return Math.max(highest, Number.isFinite(market.yesPrice) ? market.yesPrice : 0);
    }, 0);
}

function getGroupLowestYesPrice(group: MarketGroup): number {
    return group.markets.reduce((lowest, market) => {
        const nextPrice = Number.isFinite(market.yesPrice) ? market.yesPrice : 0;
        return Math.min(lowest, nextPrice);
    }, 1);
}

function sortMarketsWithinGroup(markets: Market[]): Market[] {
    return [...markets].sort((a, b) => {
        const priceDiff = (Number.isFinite(b.yesPrice) ? b.yesPrice : 0) - (Number.isFinite(a.yesPrice) ? a.yesPrice : 0);
        if (priceDiff !== 0) return priceDiff;

        return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
    });
}

function sortMarketGroupsForOdds(
    groups: MarketGroup[],
    key: OddsSortKey,
    direction: OddsSortDirection,
    fallbackOrder: Map<string, number>
): MarketGroup[] {
    const list = [...groups];

    return list.sort((a, b) => {
        if (key === "ticker") {
            const titleDiff = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
            if (titleDiff !== 0) return titleDiff;
        } else if (key === "price") {
            const priceDiff = getGroupHighestYesPrice(b) - getGroupHighestYesPrice(a);
            if (priceDiff !== 0) return priceDiff;
        } else if (key === "volume") {
            const volumeDiff = b.volume - a.volume;
            if (volumeDiff !== 0) return volumeDiff;
        } else {
            const aOddsValue = direction === "up" ? getGroupHighestYesPrice(a) : getGroupLowestYesPrice(a);
            const bOddsValue = direction === "up" ? getGroupHighestYesPrice(b) : getGroupLowestYesPrice(b);
            const changeDiff = direction === "up" ? bOddsValue - aOddsValue : aOddsValue - bOddsValue;
            if (changeDiff !== 0) return changeDiff;
        }

        return (fallbackOrder.get(a.eventId) ?? 0) - (fallbackOrder.get(b.eventId) ?? 0);
    });
}

export default function HomeFeed() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const solanaWallet = useEmbeddedSolanaWallet();
    const { fundWallet } = useFundSolanaWallet();
    const primaryAddress =
        isConnected(solanaWallet) && solanaWallet.wallets?.[0]
            ? solanaWallet.wallets[0].address
            : null;

    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
    const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [balanceError, setBalanceError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("Popular");
    const [oddsSortKey, setOddsSortKey] = useState<OddsSortKey>("change");
    const [oddsSortDirection, setOddsSortDirection] = useState<OddsSortDirection>("up");
    const [showOddsSortSheet, setShowOddsSortSheet] = useState(false);
    const [categories, setCategories] = useState<string[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [listNowMs, setListNowMs] = useState(() => Date.now());

    const [showTradePanel, setShowTradePanel] = useState(false);
    const [tradingMarket, setTradingMarket] = useState<Market | null>(null);
    const [selectedSide, setSelectedSide] = useState<TradeSide>("YES");
    const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
    const [favoriteMarkets, setFavoriteMarkets] = useState<FavoriteMarketRecord[]>([]);
    const [favoritesLoading, setFavoritesLoading] = useState(false);
    const { activePositions } = usePositions();

    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [visibleGroupLimit, setVisibleGroupLimit] = useState(POPULAR_GROUP_BATCH_SIZE);
    const [popularEventOrder, setPopularEventOrder] = useState<string[]>([]);

    const homeCatScrollRef = useRef<ScrollView>(null);
    const stickyCatScrollRef = useRef<ScrollView>(null);
    const catLayouts = useRef(new Map<string, number>());
    const isScrollingHome = useRef(false);
    const isScrollingSticky = useRef(false);
    const currentScrollOffsetRef = useRef(0);

    const scrollToActiveCategory = useCallback((category: string, animated = true) => {
        if (isScrollingHome.current || isScrollingSticky.current) return;
        const x = catLayouts.current.get(category);
        if (x !== undefined) {
            const scrollX = Math.max(0, x - 12);
            homeCatScrollRef.current?.scrollTo({ x: scrollX, animated });
            stickyCatScrollRef.current?.scrollTo({ x: scrollX, animated });
        }
    }, []);

    const handleOpenTrade = (market: Market, side: TradeSide) => {
        setTradingMarket(market);
        setSelectedSide(side);
        setShowTradePanel(true);
    };

    const handleTradeSuccess = (details: { signature: string; outcome: string }) => {
        Alert.alert("Success", `Trade successful! Outcome: ${details.outcome}`);
        setShowTradePanel(false);
        if (primaryAddress) {
            getUsdcBalance(primaryAddress).then(setUsdcBalance);
        }
    };

    const handleDeposit = () => {
        setIsDepositModalVisible(true);
    };

    const loadFavorites = useCallback(async () => {
        setFavoritesLoading(true);
        try {
            const items = await listFavoriteMarkets();
            setFavoriteMarkets(items);
        } finally {
            setFavoritesLoading(false);
        }
    }, []);

    const handleCopyPrimaryAddress = useCallback(async () => {
        if (!primaryAddress) return;

        try {
            await Clipboard.setStringAsync(primaryAddress);
            Alert.alert("Copied", "Address copied to clipboard!");
        } catch (error) {
            console.error("[HomeFeed] Failed to copy wallet address:", error);
            Alert.alert("Copy failed", "Couldn't copy the address. Please try again.");
        }
    }, [primaryAddress]);

    const handleSelectMethod = async (method: "apple_pay" | "google_pay" | "card" | "crypto") => {
        if (!primaryAddress) {
            Alert.alert("Wallet required", "Connect your Solana wallet first to deposit.");
            return;
        }

        setIsDepositModalVisible(false);

        if (method === "crypto") {
            Alert.alert(
                "Crypto Deposit",
                `Your Solana address is:\n\n${primaryAddress}\n\nSend USDC on Solana to this address to fund your wallet. Sending SOL alone will not increase your trading balance.`,
                [{
                    text: "Copy Address", onPress: () => {
                        void handleCopyPrimaryAddress();
                    }
                }, { text: "Dismiss" }]
            );
            return;
        }

        try {
            const options: any = {
                address: primaryAddress,
            };

            if (method === "apple_pay") {
                options.defaultPaymentMethod = "apple_pay";
            } else if (method === "google_pay") {
                options.defaultPaymentMethod = "google_pay";
            } else {
                options.defaultPaymentMethod = "card";
            }

            await fundWallet(options);

            getSolBalance(primaryAddress).then(setSolBalance);
            getUsdcBalance(primaryAddress).then(setUsdcBalance);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("funding_flow_cancelled")) Alert.alert("Deposit", msg);
        }
    };

    const [markets, setMarkets] = useState<Market[]>([]);
    const [marketsLoading, setMarketsLoading] = useState(true);
    const [marketsError, setMarketsError] = useState<string | null>(null);
    const marketLoadSeq = useRef(0);
    const listRef = useRef<any>(null);
    const previousCategoryRef = useRef(selectedCategory);

    const loadMarkets = useCallback(async () => {
        const seq = ++marketLoadSeq.current;
        console.log(`[HomeFeed] loadMarkets started (seq=${seq})`);
        setMarketsLoading(true);
        setMarketsError(null);
        try {
            console.log(`[HomeFeed] Fetching markets and tags...`);
            const [marketsRes, tagsByCategories] = await Promise.all([
                fetchMarketsForApp({ limit: 250, sort: "volume" }).catch(err => {
                    console.error("[HomeFeed] fetchMarketsForApp failed:", err);
                    return { markets: [], categories: [], nextCursor: null };
                }),
                fetchJupiterTagsByCategories().catch(err => {
                    console.error("[HomeFeed] fetchJupiterTagsByCategories failed:", err);
                    return {};
                }),
            ]);

            const { markets: list, categories: feedCategories, nextCursor: initialCursor } = marketsRes;
            console.log(`[HomeFeed] Fetch completed: ${list.length} markets, ${Object.keys(tagsByCategories).length} tags categories`);
            setNextCursor(initialCursor);

            const docCategoryOrder = Object.keys(tagsByCategories ?? {})
                .map((c) => String(c || "").trim())
                .filter(Boolean);
            const docOrderMap = new Map<string, number>();
            docCategoryOrder.forEach((cat, index) => {
                const key = cat.toLowerCase();
                if (!docOrderMap.has(key)) docOrderMap.set(key, index);
            });

            const now = Date.now();
            const notEndedMarkets = list
                .filter((market) => !isEndedMarket(market, now));
            const notEndedTradeableMarkets = list
                .filter((market) => !isEndedMarket(market, now))
                .filter((market) => isTradeableMarket(market));
            const volumeEligibleMarkets = notEndedTradeableMarkets.filter((market) => hasVolume(market));

            console.log(
                `[HomeFeed] Processed stats: fetched=${list.length}, remainingNotEnded=${notEndedMarkets.length}, volumeEligible=${volumeEligibleMarkets.length}`
            );

            const uniqueMarketCategories = new Map<string, string>();
            for (const market of notEndedMarkets) {
                const c = getMarketCategory(market);
                if (!c || c === "Other") continue;
                const key = c.toLowerCase();
                if (!uniqueMarketCategories.has(key)) uniqueMarketCategories.set(key, c);
            }

            for (const category of feedCategories ?? []) {
                const c = String(category ?? "").trim();
                if (!c || c === "Other") continue;
                const key = c.toLowerCase();
                if (!uniqueMarketCategories.has(key)) uniqueMarketCategories.set(key, c);
            }

            const orderedCategories = Array.from(uniqueMarketCategories.entries())
                .sort(([a], [b]) => {
                    const aOrder = docOrderMap.get(a);
                    const bOrder = docOrderMap.get(b);
                    if (aOrder != null && bOrder != null) return aOrder - bOrder;
                    if (aOrder != null) return -1;
                    if (bOrder != null) return 1;
                    return uniqueMarketCategories.get(a)!.localeCompare(uniqueMarketCategories.get(b)!);
                })
                .map(([, value]) => value);

            if (seq === marketLoadSeq.current) {
                console.log(`[HomeFeed] Setting markets state (seq=${seq})`);
                setMarkets(list);
                setPopularEventOrder(buildPopularEventOrder(list));
                setCategories(orderedCategories);
            }
        } catch (e) {
            console.error("[HomeFeed] loadMarkets top-level error:", e);
            if (seq === marketLoadSeq.current) {
                setMarketsError(e instanceof Error ? e.message : "Failed to load markets");
                setMarkets([]);
                setPopularEventOrder([]);
                setCategories([]);
            }
        } finally {
            if (seq === marketLoadSeq.current) {
                console.log(`[HomeFeed] loadMarkets finally (seq=${seq})`);
                setMarketsLoading(false);
            }
        }
    }, []);

    const loadMoreMarkets = useCallback(async () => {
        if (isFetchingMore || !nextCursor || selectedCategory === "Favorites") return;
        setIsFetchingMore(true);
        try {
            const { markets: moreMarkets, nextCursor: newCursor } = await fetchMarketsForApp({
                limit: 200, // Increase batch size for load more
                sort: "volume",
                cursor: nextCursor
            });
            setMarkets((prev) => {
                const merged = new Map<string, Market>();
                for (const market of prev) {
                    merged.set(market.id, market);
                }
                for (const market of moreMarkets) {
                    merged.set(market.id, market);
                }
                return Array.from(merged.values());
            });
            setNextCursor(newCursor);
            if (moreMarkets.length > 0) {
                setPopularEventOrder((prev) => {
                    const next = [...prev];
                    const seen = new Set(prev);

                    for (const eventId of buildPopularEventOrder(moreMarkets)) {
                        if (seen.has(eventId)) continue;
                        seen.add(eventId);
                        next.push(eventId);
                    }

                    return next;
                });
                setVisibleGroupLimit((prev) => prev + (
                    selectedCategory === "Popular" ? POPULAR_GROUP_BATCH_SIZE : CATEGORY_GROUP_BATCH_SIZE
                ));
            }
        } catch (e) {
            console.error("[HomeFeed] loadMoreMarkets error:", e);
        } finally {
            setIsFetchingMore(false);
        }
    }, [isFetchingMore, nextCursor, selectedCategory]);

    const loadBalances = useCallback(async () => {
        if (!primaryAddress) return;
        setBalanceLoading(true);
        setBalanceError(null);
        try {
            const [sol, usdc, price] = await Promise.all([
                getSolBalance(primaryAddress),
                getUsdcBalance(primaryAddress),
                getSolPriceUsd(),
            ]);
            setSolBalance(sol);
            setUsdcBalance(usdc);
            setSolPriceUsd(price);
        } catch (e) {
            setBalanceError(e instanceof Error ? e.message : "Failed to load balance");
        } finally {
            setBalanceLoading(false);
        }
    }, [primaryAddress]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setVisibleGroupLimit(
            selectedCategory === "Popular" ? POPULAR_GROUP_BATCH_SIZE : CATEGORY_GROUP_BATCH_SIZE
        );
        await Promise.all([loadMarkets(), loadBalances(), loadFavorites()]);
        setRefreshing(false);
    }, [loadBalances, loadFavorites, loadMarkets, selectedCategory]);

    const scrollY = useSharedValue(0);
    const updateCurrentScrollOffset = useCallback((offset: number) => {
        currentScrollOffsetRef.current = offset;
    }, []);
    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
            runOnJS(updateCurrentScrollOffset)(event.contentOffset.y);
        },
    });

    useEffect(() => {
        loadMarkets();
    }, [loadMarkets]);

    useEffect(() => {
        loadBalances();
    }, [loadBalances]);

    useEffect(() => {
        loadFavorites();
    }, [loadFavorites]);

    const navigation = useNavigation();
    useEffect(() => {
        // Handle initial load and tab switches
        const unsubscribeFocus = navigation.addListener('focus', () => {
            loadMarkets();
            loadBalances();
            loadFavorites();
        });

        // Handle explicit tab taps (refresh when already on page)
        const unsubscribeTabPress = navigation.addListener('tabPress' as any, (e: any) => {
            if (navigation.isFocused()) {
                onRefresh();
            }
        });

        return () => {
            unsubscribeFocus();
            unsubscribeTabPress();
        };
    }, [navigation, loadBalances, loadFavorites, loadMarkets, onRefresh]);

    useEffect(() => {
        const id = setInterval(() => setListNowMs(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    const totalPositionValue = activePositions.reduce((sum, position) => sum + position.currentValue, 0);
    const positionsAndCashValue = totalPositionValue + (usdcBalance ?? 0);
    const cashValue = usdcBalance ?? 0;

    const positionText = formatCompactMoney(totalPositionValue);
    const positionsAndCashText = formatCompactMoney(positionsAndCashValue);
    const cashText = formatCompactMoney(cashValue);

    const filterItems = useMemo(() => {
        const now = listNowMs;
        const notEndedMarkets = markets
            .filter((market) => !isEndedMarket(market, now));
        const volumeNotEndedMarkets = notEndedMarkets
            .filter((market) => hasVolume(market));
        const notEndedTradeableMarkets = notEndedMarkets
            .filter((market) => isTradeableMarket(market));

        const strict15mCount = notEndedTradeableMarkets
            .filter((market) => is15MinuteMarket(market))
            .filter((market) => hasVolume(market))
            .length;

        const categoryCounts = new Map<string, number>();
        for (const market of volumeNotEndedMarkets) {
            const category = getMarketCategory(market);
            if (!category || category === "Other" || category === "15 Min") continue;
            categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        }

        const non15mCategoriesFromFeed = categories
            .filter((category) => category !== "15 Min")
            .filter((category) => (categoryCounts.get(category) ?? 0) > 0);

        const extraCategories = Array.from(categoryCounts.keys())
            .filter((category) => !non15mCategoriesFromFeed.includes(category))
            .sort((a, b) => a.localeCompare(b));

        const prioritized = CATEGORY_PRIORITY.filter((category) =>
            non15mCategoriesFromFeed.includes(category)
        );
        const remaining = non15mCategoriesFromFeed.filter(
            (category) => !CATEGORY_PRIORITY.includes(category)
        );

        const items = ["Popular", ...(strict15mCount > 0 ? ["15 Min"] : []), ...prioritized, ...remaining, ...extraCategories];
        return Array.from(new Set(items));
    }, [categories, markets, listNowMs]);

    useEffect(() => {
        if (selectedCategory === "Favorites") return;
        if (filterItems.length === 0) return;
        if (!filterItems.includes(selectedCategory)) {
            setSelectedCategory(filterItems[0]);
        }
    }, [filterItems, selectedCategory]);

    useEffect(() => {
        setVisibleGroupLimit(
            selectedCategory === "Popular" ? POPULAR_GROUP_BATCH_SIZE : CATEGORY_GROUP_BATCH_SIZE
        );
        // Delay slightly to ensure layouts are captured
        const timer = setTimeout(() => scrollToActiveCategory(selectedCategory), 100);
        return () => clearTimeout(timer);
    }, [selectedCategory, scrollToActiveCategory]);

    useEffect(() => {
        if (previousCategoryRef.current === selectedCategory) return;

        previousCategoryRef.current = selectedCategory;
        const nextOffset = currentScrollOffsetRef.current >= STICKY_HEADER_TRIGGER_OFFSET
            ? STICKY_HEADER_TRIGGER_OFFSET
            : 0;
        scrollY.value = nextOffset;

        requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({
                offset: nextOffset,
                animated: false,
            });
        });
    }, [scrollY, selectedCategory]);

    const filteredMarkets = useMemo(() => {
        const now = listNowMs;
        const notEndedMarkets = markets.filter((market) => !isEndedMarket(market, now));
        const tradeableNotEndedMarkets = notEndedMarkets
            .filter((market) => isTradeableMarket(market));
        const volumeMarkets = notEndedMarkets
            .filter((market) => hasVolume(market));

        if (selectedCategory === "15 Min") {
            // Live/15m kategorisinde 0 vol market göstermeyelim.
            const strict15m = tradeableNotEndedMarkets
                .filter((m) => is15MinuteMarket(m))
                .filter((m) => hasVolume(m));
            const fallback0x01 = tradeableNotEndedMarkets
                .filter((m) => hasZeroX01Signal(m))
                .filter((m) => hasVolume(m));
            if (__DEV__) {
                console.log(
                    `[Home/15Min] strict=${strict15m.length}, fallback0x01=${fallback0x01.length}, tradeableNotEnded=${tradeableNotEndedMarkets.length}, notEnded=${notEndedMarkets.length}, total=${markets.length}`
                );
            }
            if (strict15m.length === 0 && fallback0x01.length > 0) {
                return fallback0x01;
            }
            return strict15m;
        }

        if (selectedCategory === "Popular") {
            return volumeMarkets;
        }

        const selectedLower = selectedCategory.toLowerCase();
        return volumeMarkets.filter(
            (m) => getMarketCategory(m).toLowerCase() === selectedLower
        );
    }, [markets, selectedCategory, listNowMs]);

    const handleSelectOddsSort = useCallback((key: OddsSortKey) => {
        if (key === "change" && oddsSortKey === "change") {
            setOddsSortDirection((prev) => (prev === "up" ? "down" : "up"));
            setShowOddsSortSheet(false);
            return;
        }

        setOddsSortKey(key);
        if (key !== "change") {
            setOddsSortDirection("up");
        }
        setShowOddsSortSheet(false);
    }, [oddsSortKey]);

    const groupedFilteredMarkets = useMemo(() => {
        const rawList = filteredMarkets;
        const groupMap = new Map<string, MarketGroup>();

        for (const m of rawList) {
            const eid = m.eventId || m.id;
            if (!groupMap.has(eid)) {
                groupMap.set(eid, {
                    eventId: eid,
                    title: m.eventTitle || m.title,
                    description: m.description,
                    category: m.category,
                    imageUrl: m.imageUrl,
                    markets: [m],
                    volume: m.eventVolume && m.eventVolume > 0 ? m.eventVolume : m.volume,
                    resolveDate: m.resolveDate,
                    status: m.status,
                    provider: m.provider,
                });
            } else {
                const g = groupMap.get(eid)!;
                g.markets.push(m);
                // If the market doesn't have an eventVolume specifically assigned,
                // we sum its individual volume into the total. If it did have eventVolume,
                // the group's volume was already set to that total once and we don't sum further.
                if (!m.eventVolume || m.eventVolume <= 0) {
                    g.volume += m.volume;
                }
                // Keep the earliest resolve date
                if (m.resolveDate && (!g.resolveDate || m.resolveDate < g.resolveDate)) {
                    g.resolveDate = m.resolveDate;
                }
            }
        }

        const grouped = Array.from(groupMap.values()).map((group) => ({
            ...group,
            markets: sortMarketsWithinGroup(group.markets),
        }));
        const defaultOrder = new Map<string, number>();

        grouped.forEach((group, index) => {
            defaultOrder.set(group.eventId, index);
        });

        const popularOrder = new Map<string, number>();
        popularEventOrder.forEach((eventId, index) => {
            popularOrder.set(eventId, index);
        });

        const fallbackOrder = selectedCategory === "Popular" ? popularOrder : defaultOrder;

        return sortMarketGroupsForOdds(grouped, oddsSortKey, oddsSortDirection, fallbackOrder)
            .slice(0, visibleGroupLimit);
    }, [filteredMarkets, oddsSortDirection, oddsSortKey, popularEventOrder, selectedCategory, visibleGroupLimit]);

    const liveMarketsById = useMemo(() => {
        const next = new Map<string, Market>();

        for (const item of markets) {
            next.set(String(item.marketId || item.id), item);
        }

        return next;
    }, [markets]);

    const liveMarketsByEventId = useMemo(() => {
        const next = new Map<string, Market[]>();

        for (const item of markets) {
            const eventId = String(item.eventId || item.id);
            const existing = next.get(eventId);
            if (existing) {
                existing.push(item);
            } else {
                next.set(eventId, [item]);
            }
        }

        return next;
    }, [markets]);

    const favoriteMarketItems = useMemo(() => {
        return favoriteMarkets.map((item) => {
            const liveMarket = liveMarketsById.get(item.marketId);

            if (!liveMarket) {
                return item;
            }

            return {
                ...item,
                category: liveMarket.category || item.category,
                imageUrl: liveMarket.imageUrl ?? item.imageUrl,
                yesPrice: Number.isFinite(liveMarket.yesPrice) ? liveMarket.yesPrice : item.yesPrice,
                volume: Number.isFinite(liveMarket.volume) ? liveMarket.volume : item.volume,
                resolveDate: liveMarket.resolveDate || item.resolveDate,
            };
        });
    }, [favoriteMarkets, liveMarketsById]);

    const favoriteMarketGroups = useMemo(() => {
        return favoriteMarketItems.map((item) => {
            const isEventFavorite = !!item.eventId && item.routeId === item.eventId;

            if (isEventFavorite) {
                const liveEventMarkets = liveMarketsByEventId.get(item.eventId!);

                if (liveEventMarkets && liveEventMarkets.length > 0) {
                    const sortedMarkets = sortMarketsWithinGroup(liveEventMarkets);
                    const primaryMarket = sortedMarkets[0];
                    const totalVolume = primaryMarket.eventVolume && primaryMarket.eventVolume > 0
                        ? primaryMarket.eventVolume
                        : sortedMarkets.reduce((sum, market) => sum + (Number.isFinite(market.volume) ? market.volume : 0), 0);
                    const earliestResolveDate = sortedMarkets.reduce((earliest, market) => {
                        if (!earliest) return market.resolveDate;
                        return market.resolveDate < earliest ? market.resolveDate : earliest;
                    }, primaryMarket.resolveDate);

                    return {
                        eventId: item.routeId,
                        title: item.title,
                        description: primaryMarket.description,
                        category: primaryMarket.category,
                        imageUrl: primaryMarket.imageUrl ?? item.imageUrl,
                        markets: sortedMarkets,
                        volume: totalVolume,
                        resolveDate: earliestResolveDate,
                        status: primaryMarket.status,
                        provider: primaryMarket.provider,
                    } satisfies MarketGroup;
                }
            }

            const liveMarket = liveMarketsById.get(item.marketId);
            const favoriteMarket = liveMarket ?? buildFavoriteFallbackMarket(item);

            return {
                eventId: item.routeId,
                title: item.title,
                description: liveMarket?.description ?? item.subtitle,
                category: liveMarket?.category ?? item.category,
                imageUrl: liveMarket?.imageUrl ?? item.imageUrl,
                markets: [favoriteMarket],
                volume: Number.isFinite(liveMarket?.volume) ? liveMarket!.volume : item.volume,
                resolveDate: liveMarket?.resolveDate ?? item.resolveDate,
                status: liveMarket?.status,
                provider: liveMarket?.provider ?? item.provider,
            } satisfies MarketGroup;
        });
    }, [favoriteMarketItems, liveMarketsByEventId, liveMarketsById]);
    const renderFilterChips = (prefix: "home" | "sticky", sticky = false) => (
        <View style={[styles.filterChipsContainer, sticky && styles.stickyCategoryScroll]}>
            <View style={styles.fixedFilters}>
                <Pressable style={styles.oddsPill} onPress={() => setShowOddsSortSheet(true)}>
                    <Svg
                        width={8}
                        height={6}
                        viewBox="0 0 8 6"
                        fill="none"
                        style={[
                            styles.oddsPillIcon,
                            oddsSortDirection === "down" ? styles.oddsPillIconDown : undefined,
                        ]}
                    >
                        <Path
                            d="M1.51016 6C0.255811 6 -0.449787 4.60746 0.320316 3.65172L2.8102 0.561716C3.41365 -0.187234 4.58638 -0.187243 5.18983 0.561716L7.6797 3.65172C8.44976 4.60746 7.74421 6 6.48988 6H1.51016Z"
                            fill="#3B82F7"
                        />
                    </Svg>
                    <Text style={styles.oddsPillText}>Odds</Text>
                </Pressable>

                <View style={styles.filtersDivider} />
            </View>

            <ScrollView
                ref={sticky ? stickyCatScrollRef : homeCatScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScrollView}
                contentContainerStyle={styles.categoryScrollContent}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => {
                    if (sticky) isScrollingSticky.current = true;
                    else isScrollingHome.current = true;
                }}
                onScrollEndDrag={() => {
                    if (sticky) isScrollingSticky.current = false;
                    else isScrollingHome.current = false;
                }}
                onMomentumScrollBegin={() => {
                    if (sticky) isScrollingSticky.current = true;
                    else isScrollingHome.current = true;
                }}
                onMomentumScrollEnd={() => {
                    if (sticky) isScrollingSticky.current = false;
                    else isScrollingHome.current = false;
                }}
                onScroll={(e) => {
                    const x = e.nativeEvent.contentOffset.x;
                    if (sticky && isScrollingSticky.current) {
                        homeCatScrollRef.current?.scrollTo({ x, animated: false });
                    } else if (!sticky && isScrollingHome.current) {
                        stickyCatScrollRef.current?.scrollTo({ x, animated: false });
                    }
                }}
            >
                <Pressable
                    style={[styles.oddsPill, selectedCategory === "Favorites" && styles.fixedCategoryPillActive]}
                    onPress={() => setSelectedCategory("Favorites")}
                    onLayout={(e) => {
                        catLayouts.current.set("Favorites", e.nativeEvent.layout.x);
                    }}
                >
                    <Text style={[styles.oddsPillText, selectedCategory === "Favorites" && styles.fixedCategoryPillTextActive]}>
                        Favorites
                    </Text>
                    {favoriteMarketItems.length > 0 ? (
                        <View style={styles.favoritesPillCount}>
                            <Text style={styles.favoritesPillCountText}>
                                {favoriteMarketItems.length > 9 ? "9+" : favoriteMarketItems.length}
                            </Text>
                        </View>
                    ) : null}
                </Pressable>
                {filterItems.map((category) => {
                    const isSelected = selectedCategory === category;
                    const Icon = categoryToIcon(category);

                    return (
                        <Pressable
                            key={`${prefix}-${category}`}
                            style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                            onPress={() => setSelectedCategory(category)}
                            onLayout={(e) => {
                                catLayouts.current.set(category, e.nativeEvent.layout.x);
                            }}
                        >
                            {Icon ? (
                                <Icon
                                    size={16}
                                    strokeWidth={2}
                                    color={isSelected ? "#3b82f7" : "rgba(0,0,0,0.4)"}
                                />
                            ) : null}
                            <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                                {categoryPillLabel(category)}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );


    const renderHeader = () => (
        <View style={styles.headerSection}>
            <View style={[styles.topCard, { paddingTop: insets.top + 8 }]}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Home</Text>
                    <View style={styles.headerActions}>
                        <Pressable style={styles.iconButton}>
                            <Bell size={24} color="#171717" strokeWidth={1.8} />
                        </Pressable>
                    </View>
                </View>

                <View style={styles.balanceRow}>
                    <View style={styles.balanceColumns}>
                        <View>
                            <Text style={styles.balanceLabel}>Positions</Text>
                            {balanceLoading ? (
                                <View style={styles.balanceLoader}>
                                    <PremiumSpinner size={16} />
                                </View>
                            ) : (
                                <Text style={styles.balanceValue}>
                                    {positionText.whole}
                                    <Text style={styles.balanceValueDecimal}>{positionText.decimal}</Text>
                                </Text>
                            )}
                        </View>
                        <View>
                            <Text style={styles.balanceLabel}>Cash</Text>
                            {balanceLoading ? (
                                <View style={styles.balanceLoader}>
                                    <PremiumSpinner size={16} />
                                </View>
                            ) : (
                                <Text style={styles.balanceValue}>
                                    {cashText.whole}
                                    <Text style={styles.balanceValueDecimal}>{cashText.decimal}</Text>
                                </Text>
                            )}
                        </View>
                    </View>

                    <Pressable
                        onPress={handleDeposit}
                        style={({ pressed }) => [
                            styles.depositActionContainer,
                            pressed && styles.pressed
                        ]}
                    >
                        <LinearGradient
                            colors={["rgba(255, 255, 255, 0.4)", "rgba(195, 195, 195, 0.4)", "rgba(255, 255, 255, 0.4)"]}
                            start={{ x: 0.1, y: 0.1 }}
                            end={{ x: 0.9, y: 0.9 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.depositActionInner}>
                            <Text style={styles.depositActionText}>Deposit</Text>
                        </View>
                    </Pressable>
                </View>
            </View>

            {renderFilterChips("home")}

            {balanceError ? <Text style={styles.balanceError}>{balanceError}</Text> : null}
        </View>
    );

    const renderStickyHeader = () => {
        const animatedStyle = useAnimatedStyle(() => {
            return {
                transform: [
                    { translateY: interpolate(scrollY.value, [160, 200], [-200, 0], Extrapolation.CLAMP) }
                ],
            };
        });

        return (
            <Animated.View style={[styles.stickyHeaderContainer, animatedStyle]}>
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <View style={styles.stickyTopRow}>
                        <Text style={styles.stickyBalance}>
                            {positionsAndCashText.whole}
                            <Text style={styles.stickyBalanceDecimal}>{positionsAndCashText.decimal}</Text>
                        </Text>
                        <View style={styles.stickyActionGroup}>
                            <Pressable
                                onPress={handleDeposit}
                                style={({ pressed }) => [
                                    styles.stickyDepositButton,
                                    pressed && styles.pressed
                                ]}
                            >
                                <LinearGradient
                                    colors={["rgba(255, 255, 255, 0.4)", "rgba(195, 195, 195, 0.4)", "rgba(255, 255, 255, 0.4)"]}
                                    start={{ x: 0.1, y: 0.1 }}
                                    end={{ x: 0.9, y: 0.9 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                <Plus size={18} color="#000" strokeWidth={2.5} />
                            </Pressable>
                            <Pressable style={styles.stickyBellButton}>
                                <Bell size={20} color="#000" strokeWidth={1.8} />
                            </Pressable>
                        </View>
                    </View>

                    {renderFilterChips("sticky", true)}
                </View>
                <View style={styles.stickyHeaderBorder} />
            </Animated.View>
        );
    };

    const visibleMarketGroups = selectedCategory === "Favorites"
        ? sortMarketGroupsForOdds(
            favoriteMarketGroups,
            oddsSortKey,
            oddsSortDirection,
            new Map(favoriteMarketItems.map((item, index) => [item.routeId, index] as const))
        ).slice(0, visibleGroupLimit)
        : groupedFilteredMarkets;

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {renderStickyHeader()}
            <AnimatedFlashList
                ref={listRef as any}
                onScroll={onScroll}
                scrollEventThrottle={16}
                data={visibleMarketGroups}
                renderItem={({ item, index }: any) => (
                    <MarketCardNative
                        group={item}
                        isFirst={index === 0}
                        isLast={index === visibleMarketGroups.length - 1}
                        nowMs={listNowMs}
                        onBuyYes={(m) => handleOpenTrade(m, "YES")}
                        onBuyNo={(m) => handleOpenTrade(m, "NO")}
                    />
                )}
                keyExtractor={(item: any) => item.eventId}
                // @ts-expect-error FlashList types missing estimatedItemSize in this RN version
                estimatedItemSize={250}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={renderHeader}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#8d8d8d"
                        colors={["#8d8d8d"]}
                        progressBackgroundColor="#ffffff"
                    />
                }
                onEndReached={selectedCategory === "Favorites" ? null : loadMoreMarkets}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    isFetchingMore && selectedCategory !== "Favorites" ? (
                        <View style={styles.listFooter}>
                            <PremiumSpinner size={18} />
                        </View>
                    ) : <View style={{ height: 40 }} />
                )}
                ListEmptyComponent={
                    (selectedCategory === "Favorites" ? favoritesLoading : marketsLoading) ? (
                        <View style={styles.loadingContainer}>
                            <PremiumSpinner size={34} />
                            <Text style={styles.loadingText}>
                                {selectedCategory === "Favorites" ? "Loading favorites..." : "Loading markets..."}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.emptyMarkets}>
                            <Text style={styles.emptyMarketsText}>
                                {selectedCategory === "Favorites"
                                    ? "No favorites yet."
                                    : (marketsError ?? "No markets available.")}
                            </Text>
                        </View>
                    )
                }
            />
            <BottomProgressiveBlur style={styles.feedBottomBlur} />

            <Modal
                visible={showOddsSortSheet}
                animationType="fade"
                transparent
                onRequestClose={() => setShowOddsSortSheet(false)}
            >
                <Pressable style={styles.sortSheetOverlay} onPress={() => setShowOddsSortSheet(false)}>
                    <Pressable style={styles.sortSheetContainer} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sortSheetHandle} />
                        <Text style={styles.sortSheetTitle}>Sort by</Text>

                        <View style={styles.sortOptionsList}>
                            {ODDS_SORT_OPTIONS.map((option) => {
                                const isSelected = oddsSortKey === option.key;
                                const isChange = option.key === "change";

                                return (
                                    <Pressable
                                        key={option.key}
                                        style={[styles.sortOptionRow, isSelected && styles.sortOptionRowSelected]}
                                        onPress={() => handleSelectOddsSort(option.key)}
                                    >
                                        <Text style={styles.sortOptionText}>{option.label}</Text>
                                        {isSelected ? (
                                            isChange ? (
                                                oddsSortDirection === "up" ? (
                                                    <ArrowUpCircle size={20} color="#3b82f7" strokeWidth={2} />
                                                ) : (
                                                    <ArrowDownCircle size={20} color="#ff453a" strokeWidth={2} />
                                                )
                                            ) : (
                                                <Circle size={20} color="#3b82f7" fill="#3b82f7" strokeWidth={2} />
                                            )
                                        ) : (
                                            <Circle size={20} color="rgba(0,0,0,0.12)" strokeWidth={2} />
                                        )}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={showTradePanel}
                animationType="none"
                transparent
                onRequestClose={() => setShowTradePanel(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowTradePanel(false)}>
                    <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                        {tradingMarket && (
                            <TradePanel
                                market={tradingMarket}
                                onSuccess={handleTradeSuccess}
                                initialSide={selectedSide}
                                onClose={() => setShowTradePanel(false)}
                            />
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            <DepositModal
                visible={isDepositModalVisible}
                onClose={() => setIsDepositModalVisible(false)}
                onSelectMethod={handleSelectMethod}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#ffffff",
    },
    listContent: {
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 108,
        backgroundColor: "#ffffff",
    },
    headerSection: {
        marginBottom: 10,
    },
    topCard: {
        backgroundColor: "#fff",
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderCurve: "continuous",
        paddingHorizontal: 16, // Returned to original or adjusted for full width look
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderLeftWidth: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderColor: "rgba(0,0,0,0.08)",
    },
    titleRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    title: {
        fontSize: 24,
        lineHeight: 32,
        fontWeight: "700",
        color: "#171717",
        letterSpacing: -0.6,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    iconButton: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    balanceRow: {
        marginTop: 14,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
    },
    balanceColumns: {
        flexDirection: "row",
        gap: 16,
    },
    balanceLabel: {
        color: "#00000066",
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "600",
        marginBottom: 8,
    },
    balanceValue: {
        color: "#000000",
        fontSize: 20,
        lineHeight: 22,
        fontWeight: "500",
    },
    balanceValueDecimal: {
        color: "#00000066",
    },
    balanceLoader: {
        marginTop: 8,
    },
    depositActionContainer: {
        width: 141,
        height: 50,
        borderRadius: 16,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#fff",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.32,
        shadowRadius: 1.5,
        elevation: 3,
    },
    depositActionInner: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    depositActionText: {
        color: "#000000",
        fontSize: 20,
        fontWeight: "600",
        letterSpacing: -0.6,
    },
    pressed: {
        opacity: 0.9,
        transform: [{ scale: 0.97 }],
    },
    filterChipsContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        paddingLeft: 14,
    },
    fixedFilters: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginRight: 0,
    },
    categoryScrollView: {
        flex: 1,
    },
    categoryScrollContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 2,
        paddingRight: 14,
    },
    categoryPill: {
        height: 34,
        borderRadius: 12,
        borderCurve: "continuous",
        paddingHorizontal: 12,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
    },
    categoryPillActive: {
        backgroundColor: "rgba(59,130,247,0.15)",
    },
    categoryPillText: {
        color: "rgba(0,0,0,0.4)",
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "500",
    },
    categoryPillTextActive: {
        color: "#3b82f7",
    },
    oddsPill: {
        height: 26,
        borderRadius: 13,
        borderCurve: "continuous",
        paddingLeft: 8,
        paddingRight: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.05)",
        backgroundColor: "transparent",
    },
    oddsPillIcon: {
        width: 8,
        height: 6,
    },
    oddsPillIconDown: {
        transform: [{ rotate: "180deg" }],
    },
    oddsPillText: {
        color: "#3b82f7",
        fontSize: 15,
        lineHeight: 18,
        fontWeight: "500",
    },
    fixedCategoryPillActive: {
        backgroundColor: "rgba(59,130,247,0.15)",
    },
    fixedCategoryPillTextActive: {
        color: "#3b82f7",
    },
    favoritesPillCount: {
        minWidth: 18,
        height: 18,
        borderRadius: 999,
        backgroundColor: "#171717",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
    },
    favoritesPillCountText: {
        color: "#fff",
        fontSize: 11,
        lineHeight: 12,
        fontWeight: "700",
    },
    filtersDivider: {
        width: 1,
        height: 15,
        borderRadius: 1,
        backgroundColor: "rgba(0,0,0,0.05)",
        marginHorizontal: 1,
    },
    addFilterPill: {
        height: 30,
        minWidth: 30,
        borderRadius: 32,
        borderCurve: "continuous",
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.08)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    listSeparator: {
        height: 12,
    },
    listFooter: {
        paddingVertical: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingContainer: {
        paddingVertical: 60,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    loadingText: {
        color: "#8d8d8d",
        fontSize: 15,
        fontWeight: "500",
    },
    emptyMarkets: {
        paddingVertical: 40,
        alignItems: "center",
    },
    emptyMarketsText: {
        color: "#6f6f6f",
        fontSize: 15,
        textAlign: "center",
    },
    balanceError: {
        marginTop: 8,
        color: "#b42318",
        fontSize: 12,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "flex-end",
    },
    modalContent: {
        maxHeight: "92%",
        backgroundColor: "transparent",
        padding: 0,
        overflow: "visible",
    },
    modalHeader: {
        display: "none",
    },
    sortSheetOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    sortSheetContainer: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
    },
    sortSheetHandle: {
        width: 33,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.08)",
        alignSelf: "center",
        marginBottom: 16,
    },
    sortSheetTitle: {
        fontSize: 26,
        lineHeight: 26,
        fontWeight: "600",
        color: "#000",
        textAlign: "center",
        marginBottom: 16,
    },
    sortOptionsList: {
        gap: 8,
    },
    sortOptionRow: {
        height: 52,
        borderRadius: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    sortOptionRowSelected: {
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    sortOptionText: {
        color: "rgba(0,0,0,0.7)",
        fontSize: 20,
        lineHeight: 20,
        fontWeight: "400",
    },
    stickyHeaderContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: "#ffffff",
        overflow: "hidden",
    },
    stickyHeaderContent: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    stickyTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: 44,
        marginTop: 4,
    },
    stickyBalance: {
        fontSize: 20,
        fontWeight: "600",
        color: "#000",
    },
    stickyBalanceDecimal: {
        color: "rgba(0,0,0,0.4)",
    },
    stickyActionGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    stickyDepositButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.2,
        borderColor: "rgba(255,255,255,0.6)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
    },
    stickyBellButton: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    stickyCategoryScroll: {
        marginTop: 8,
    },
    stickyHeaderBorder: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    favoritesSheetContainer: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
        maxHeight: "82%",
    },
    favoritesSheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    favoritesSheetCount: {
        minWidth: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(0,0,0,0.06)",
        textAlign: "center",
        textAlignVertical: "center",
        color: "#171717",
        fontSize: 16,
        lineHeight: 36,
        fontWeight: "700",
        overflow: "hidden",
    },
    favoritesList: {
        maxHeight: 460,
    },
    favoritesListContent: {
        gap: 12,
        paddingBottom: 12,
    },
    favoriteEmptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 36,
        paddingHorizontal: 20,
        gap: 8,
    },
    favoriteEmptyTitle: {
        color: "#171717",
        fontSize: 18,
        lineHeight: 22,
        fontWeight: "700",
    },
    favoriteEmptyText: {
        color: "rgba(0,0,0,0.55)",
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
    },
    favoriteRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: "#f7f7f7",
    },
    favoriteRowMain: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    favoriteRowImage: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.08)",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
    },
    favoriteRowImageAsset: {
        width: "100%",
        height: "100%",
    },
    favoriteRowImageFallback: {
        color: "#171717",
        fontSize: 20,
        fontWeight: "700",
    },
    favoriteRowContent: {
        flex: 1,
        gap: 6,
    },
    favoriteRowTitle: {
        color: "#171717",
        fontSize: 16,
        lineHeight: 20,
        fontWeight: "700",
    },
    favoriteRowSubtitle: {
        color: "rgba(0,0,0,0.55)",
        fontSize: 13,
        lineHeight: 16,
        fontWeight: "500",
    },
    favoriteCategoryPill: {
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(59,130,247,0.12)",
    },
    favoriteCategoryText: {
        color: "#3b82f7",
        fontSize: 12,
        lineHeight: 14,
        fontWeight: "700",
    },
    favoriteMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
    },
    favoriteMetaText: {
        color: "rgba(0,0,0,0.56)",
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "600",
    },
    favoriteMetaDot: {
        width: 4,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.18)",
    },
    favoriteRemoveButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    feedBottomBlur: {
        zIndex: 40,
    },
});
