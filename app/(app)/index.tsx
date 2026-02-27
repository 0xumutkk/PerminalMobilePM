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
    Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { DepositModal } from "../../components/DepositModal";
import type { Market, MarketGroup } from "../../lib/mock-data";
import { fetchMarketsForApp, fetchJupiterTagsByCategories } from "../../lib/jupiter";
import { MarketCardNative } from "../../components/MarketCardNative";
import { getSolBalance, getSolPriceUsd, getUsdcBalance } from "../../lib/solana";
import { TradePanel } from "../../components/market/TradePanel";
import { TradeSide } from "../../hooks/useTrade";
import {
    Bell,
    Search as SearchIcon,
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

import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();
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
const ODDS_SORT_OPTIONS = [
    { key: "ticker", label: "Ticker" },
    { key: "price", label: "Price" },
    { key: "volume", label: "Volume" },
    { key: "change", label: "% Change" },
] as const;

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
    const v24h = market.volume ?? 0;
    const v = market.volume ?? 0;
    const score = Math.max(v24h, v);
    return Number.isFinite(score) ? score : 0;
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

function sortMarketsForOdds(markets: Market[], key: OddsSortKey, direction: OddsSortDirection): Market[] {
    const list = [...markets];

    if (key === "ticker") {
        return list.sort((a, b) => {
            const aLabel = (a.ticker || a.title || "").toLowerCase();
            const bLabel = (b.ticker || b.title || "").toLowerCase();
            return aLabel.localeCompare(bLabel);
        });
    }

    if (key === "price") {
        return list.sort((a, b) => b.yesPrice - a.yesPrice);
    }

    if (key === "volume") {
        return list.sort((a, b) => getMarketVolumeScore(b) - getMarketVolumeScore(a));
    }

    return list.sort((a, b) => {
        const aChange = (a.yesPrice - 0.5) * 100;
        const bChange = (b.yesPrice - 0.5) * 100;
        return direction === "up" ? bChange - aChange : aChange - bChange;
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

    const handleOpenTrade = (market: Market, side: TradeSide) => {
        setTradingMarket(market);
        setSelectedSide(side);
        setShowTradePanel(true);
    };

    const handleTradeSuccess = (signature: string) => {
        Alert.alert("Success", `Trade successful! Signature: ${signature.slice(0, 8)}...`);
        setShowTradePanel(false);
        if (primaryAddress) {
            getUsdcBalance(primaryAddress).then(setUsdcBalance);
        }
    };

    const handleDeposit = () => {
        setIsDepositModalVisible(true);
    };

    const handleSelectMethod = async (method: "apple_pay" | "google_pay" | "card") => {
        if (!primaryAddress) {
            Alert.alert("Wallet required", "Connect your Solana wallet first to deposit.");
            return;
        }

        setIsDepositModalVisible(false);

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

    const loadMarkets = useCallback(async () => {
        const seq = ++marketLoadSeq.current;
        setMarketsLoading(true);
        setMarketsError(null);
        try {
            const [{ markets: list, categories: feedCategories }, tagsByCategories] = await Promise.all([
                fetchMarketsForApp({ limit: 250, sort: "liquidity" }),
                fetchJupiterTagsByCategories().catch(() => ({})),
            ]);

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

            if (__DEV__) {
                console.log(
                    `[Home] Markets fetched=${list.length}, notEnded=${notEndedMarkets.length}, tradeableNotEnded=${notEndedTradeableMarkets.length}, volumeEligible=${volumeEligibleMarkets.length}`
                );
                const categoryCounts = new Map<string, number>();
                for (const market of notEndedMarkets) {
                    const category = getMarketCategory(market);
                    if (!category || category === "Other") continue;
                    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
                }
                const categorySummary = Array.from(categoryCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => `${category}:${count}`)
                    .join(", ");
                console.log(
                    `[Home] Active categories=${categoryCounts.size}${categorySummary ? ` -> ${categorySummary}` : ""}`
                );
                const strict15mCount = list.filter((market) => is15MinuteMarket(market)).length;
                const strict15mTradeableCount = list
                    .filter((market) => is15MinuteMarket(market))
                    .filter((market) => isTradeableMarket(market)).length;
                const zeroX01Count = list.filter((market) => hasZeroX01Signal(market)).length;
                const zeroX01TradeableCount = list
                    .filter((market) => hasZeroX01Signal(market))
                    .filter((market) => isTradeableMarket(market)).length;
                console.log(
                    `[Home] 15Min candidates strict=${strict15mCount}, strictTradeable=${strict15mTradeableCount}, zeroX01=${zeroX01Count}, zeroX01Tradeable=${zeroX01TradeableCount}`
                );
            }

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
                setMarkets(list);
                setCategories(orderedCategories);
            }
        } catch (e) {
            if (seq === marketLoadSeq.current) {
                setMarketsError(e instanceof Error ? e.message : "Failed to load markets");
                setMarkets([]);
                setCategories([]);
            }
        } finally {
            if (seq === marketLoadSeq.current) {
                setMarketsLoading(false);
            }
        }
    }, []);

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
        await Promise.all([loadMarkets(), loadBalances()]);
        setRefreshing(false);
    }, [loadMarkets, loadBalances]);

    const scrollY = useSharedValue(0);

    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    useEffect(() => {
        loadMarkets();
    }, [loadMarkets]);

    useEffect(() => {
        loadBalances();
    }, [loadBalances]);

    useEffect(() => {
        const id = setInterval(() => setListNowMs(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    const solUsdValue =
        solBalance != null && solPriceUsd != null ? solBalance * solPriceUsd : null;
    const portfolioValue = (solUsdValue ?? 0) + (usdcBalance ?? 0);
    const cashValue = usdcBalance ?? 0;

    const portfolioText = formatCompactMoney(portfolioValue);
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
        if (filterItems.length === 0) return;
        if (!filterItems.includes(selectedCategory)) {
            setSelectedCategory(filterItems[0]);
        }
    }, [filterItems, selectedCategory]);

    const filteredMarkets = useMemo(() => {
        const now = listNowMs;
        const notEndedMarkets = markets.filter((market) => !isEndedMarket(market, now));
        const tradeableNotEndedMarkets = notEndedMarkets
            .filter((market) => isTradeableMarket(market));
        const volumeMarkets = notEndedMarkets
            .filter((market) => hasVolume(market));

        const sortByResolveThenVolume = (list: Market[]) =>
            [...list].sort((a, b) => {
                const resolveDelta = getMarketResolveMs(a) - getMarketResolveMs(b);
                if (resolveDelta !== 0) return resolveDelta;
                return getMarketVolumeScore(b) - getMarketVolumeScore(a);
            });

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
                return sortMarketsForOdds(sortByResolveThenVolume(fallback0x01), oddsSortKey, oddsSortDirection);
            }
            return sortMarketsForOdds(sortByResolveThenVolume(strict15m), oddsSortKey, oddsSortDirection);
        }

        if (selectedCategory === "Popular") {
            return sortMarketsForOdds(volumeMarkets, oddsSortKey, oddsSortDirection).slice(0, 1500);
        }


        const selectedLower = selectedCategory.toLowerCase();
        const categoryMarkets = volumeMarkets.filter(
            (m) => getMarketCategory(m).toLowerCase() === selectedLower
        );
        return sortMarketsForOdds(categoryMarkets, oddsSortKey, oddsSortDirection);
    }, [markets, selectedCategory, listNowMs, oddsSortKey, oddsSortDirection]);

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
                    title: m.title,
                    description: m.description,
                    category: m.category,
                    imageUrl: m.imageUrl,
                    markets: [m],
                    volume: m.volume,
                    resolveDate: m.resolveDate,
                    status: m.status,
                    provider: m.provider,
                });
            } else {
                const g = groupMap.get(eid)!;
                g.markets.push(m);
                g.volume += m.volume;
                // Keep the earliest resolve date
                if (m.resolveDate && (!g.resolveDate || m.resolveDate < g.resolveDate)) {
                    g.resolveDate = m.resolveDate;
                }
            }
        }

        return Array.from(groupMap.values()).slice(0, 100);
    }, [filteredMarkets]);

    const renderFilterChips = (prefix: "home" | "sticky", sticky = false) => (

        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={sticky ? styles.stickyCategoryScroll : styles.categoryScrollView}
            contentContainerStyle={styles.categoryScrollContent}
        >
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

            {filterItems.map((category) => {
                const isSelected = selectedCategory === category;
                const Icon = categoryToIcon(category);

                return (
                    <Pressable
                        key={`${prefix}-${category}`}
                        style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                        onPress={() => setSelectedCategory(category)}
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
    );

    const renderHeader = () => (
        <View style={[styles.headerSection, { paddingTop: insets.top }]}>
            <View style={styles.topCard}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Home</Text>
                    <View style={styles.headerActions}>
                        <Pressable onPress={() => router.push("/search")} style={styles.iconButton}>
                            <SearchIcon size={20} color="#8d8d8d" strokeWidth={1.8} />
                        </Pressable>
                        <Pressable style={styles.iconButton}>
                            <Bell size={20} color="#8d8d8d" strokeWidth={1.8} />
                        </Pressable>
                    </View>
                </View>

                <View style={styles.balanceRow}>
                    <View style={styles.balanceColumns}>
                        <View>
                            <Text style={styles.balanceLabel}>Portfolio</Text>
                            {balanceLoading ? (
                                <ActivityIndicator size="small" color="#777" style={styles.balanceLoader} />
                            ) : (
                                <Text style={styles.balanceValue}>
                                    {portfolioText.whole}
                                    <Text style={styles.balanceValueDecimal}>{portfolioText.decimal}</Text>
                                </Text>
                            )}
                        </View>
                        <View>
                            <Text style={styles.balanceLabel}>Cash</Text>
                            {balanceLoading ? (
                                <ActivityIndicator size="small" color="#777" style={styles.balanceLoader} />
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
                        disabled={!primaryAddress}
                        style={({ pressed }) => [
                            styles.depositActionContainer,
                            pressed && styles.pressed
                        ]}
                    >
                        {SUPPORTS_GLASS ? (
                            <GlassView
                                style={StyleSheet.absoluteFill}
                                glassEffectStyle="clear"
                                /* @ts-ignore */
                                refraction={60}
                                depth={30}
                                frost={6}
                            />
                        ) : (
                            <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                        )}
                        <LinearGradient
                            colors={["rgba(255, 255, 255, 0.4)", "rgba(195, 195, 195, 0.4)", "rgba(255, 255, 255, 0.4)"]}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0, y: 1 }}
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
                opacity: interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP),
                transform: [
                    { translateY: interpolate(scrollY.value, [40, 80], [-20, 0], Extrapolation.CLAMP) }
                ],
            };
        });

        return (
            <Animated.View style={[styles.stickyHeaderContainer, animatedStyle]} pointerEvents="box-none">
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <View style={styles.stickyTopRow}>
                        <Text style={styles.stickyBalance}>
                            {portfolioText.whole}
                            <Text style={styles.stickyBalanceDecimal}>{portfolioText.decimal}</Text>
                        </Text>
                        <View style={styles.stickyActionGroup}>
                            <Pressable
                                onPress={handleDeposit}
                                style={({ pressed }) => [
                                    styles.stickyDepositButton,
                                    pressed && styles.pressed
                                ]}
                            >
                                {SUPPORTS_GLASS ? (
                                    <GlassView
                                        style={StyleSheet.absoluteFill}
                                        glassEffectStyle="clear"
                                        /* @ts-ignore */
                                        refraction={60}
                                        depth={30}
                                        frost={6}
                                    />
                                ) : (
                                    <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
                                )}
                                <LinearGradient
                                    colors={["rgba(255, 255, 255, 0.6)", "rgba(195, 195, 195, 0.3)", "rgba(255, 255, 255, 0.6)"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
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

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {renderStickyHeader()}
            <Animated.FlatList
                onScroll={onScroll}
                scrollEventThrottle={16}
                data={groupedFilteredMarkets}
                renderItem={({ item }) => (
                    <MarketCardNative
                        group={item}
                        nowMs={listNowMs}
                        onBuyYes={(m) => handleOpenTrade(m, "YES")}
                        onBuyNo={(m) => handleOpenTrade(m, "NO")}
                    />
                )}
                keyExtractor={(item) => item.eventId}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={renderHeader}
                ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#8d8d8d"
                        colors={["#8d8d8d"]}
                        progressBackgroundColor="#f0f0f0"
                    />
                }
                ListEmptyComponent={
                    !marketsLoading ? (
                        <View style={styles.emptyMarkets}>
                            <Text style={styles.emptyMarketsText}>
                                {marketsError ?? "No markets available."}
                            </Text>
                        </View>
                    ) : null
                }
            />

            <Modal
                visible={showOddsSortSheet}
                animationType="slide"
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
                animationType="slide"
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
        backgroundColor: "#f0f0f0",
    },
    listContent: {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 108,
    },
    headerSection: {
        marginBottom: 10,
    },
    topCard: {
        backgroundColor: "#fff",
        borderRadius: 24,
        borderCurve: "continuous",
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
    },
    titleRow: {
        height: 42,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    title: {
        color: "#171717",
        fontSize: 24,
        lineHeight: 32,
        fontWeight: "700",
        letterSpacing: -0.6,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
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
        gap: 24,
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
        borderRadius: 16,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.8)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    depositActionInner: {
        height: 44,
        minWidth: 120,
        paddingHorizontal: 20,
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
    categoryScrollView: {
        marginTop: 8,
    },
    categoryScrollContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 2,
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
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.12)",
        borderStyle: "dashed",
        marginVertical: 0,
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
        backgroundColor: "#fff",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderCurve: "continuous",
        padding: 0,
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
});
