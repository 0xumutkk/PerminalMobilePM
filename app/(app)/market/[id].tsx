import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Pressable, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Info, TrendingUp, Users, Calendar, Plus, Minus, X, ChevronDown, ChevronUp, Database, ArrowUpCircle, BarChart3, ReceiptCent, Star, Share2 } from "lucide-react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import type { Market, ChartPoint } from "../../../lib/mock-data";
import { useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { fetchMarketForApp, fetchJupiterEventById, jupiterEventToMarkets } from "../../../lib/jupiter";
import { MarketChartNative } from "../../../components/MarketChartNative";
import { TradePanel } from "../../../components/market/TradePanel";
import { TradeSide, TradeMode } from "../../../hooks/useTrade";
import { CircularProgress } from "../../../components/ui/CircularProgress";
import { Image } from "expo-image";
import { Modal } from "react-native";
import { getTokenBalance } from "../../../lib/solana";
import { GlassHeader } from "../../../components/ui/GlassHeader";
import { usePositions } from "../../../hooks/usePositions";
import {
    fetchClusteredMarketChartFromJupiter,
    fetchMarketActivityTradesFromJupiter,
    fetchMarketChartPointsFromJupiter,
    type ChartRange,
    type ClusteredMarketInput,
    type ClusteredMarketSeries,
    type MarketActivityTrade,
} from "../../../lib/jupiterChart";

type Trade = MarketActivityTrade;

type TabKey = "markets" | "positions" | "about" | "holders" | "activity";

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

function normalizeOutcomeLabel(label?: string): string {
    return String(label ?? "").replace(/\s+/g, " ").trim();
}

function getMarketIddiaText(market: Pick<Market, "yesLabel" | "noLabel">): string | null {
    const yes = normalizeOutcomeLabel(market.yesLabel);
    const no = normalizeOutcomeLabel(market.noLabel);
    const candidates = [yes, no].filter((label) => /^(price to beat|iddia|idda)\s*:/i.test(label));
    if (candidates.length === 0) return null;
    const concrete = candidates.find((value) => !/tbd/i.test(value));
    return concrete ?? candidates[0];
}

function getCleanMarketTitle(title: string, groupTitle: string): string {
    const gt = groupTitle.toLowerCase().trim();
    const mt = title.trim();
    if (mt.toLowerCase().startsWith(gt)) {
        let clean = mt.slice(gt.length).trim();
        clean = clean.replace(/^[:\-\s]+/, "");
        if (clean) return clean;
    }
    return mt;
}

function MarketDetailScreen() {
    const { id, side: sideParam, tradeMode: tradeModeParam, single: singleParam, parentId } = useLocalSearchParams<{
        id: string;
        side?: string;
        tradeMode?: string;
        single?: string;
        parentId?: string;
    }>();
    const router = useRouter();
    const [market, setMarket] = useState<Market | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("positions");
    const [activeRange, setActiveRange] = useState<ChartRange>("ALL");
    const [showTradePanel, setShowTradePanel] = useState(false);
    const [initialSide, setInitialSide] = useState<TradeSide>("YES");
    const [initialTradeMode, setInitialTradeMode] = useState<TradeMode>("BUY");
    const [showMoreRules, setShowMoreRules] = useState(false);
    const [yesBalance, setYesBalance] = useState<number>(0);
    const [noBalance, setNoBalance] = useState<number>(0);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [clusterMarkets, setClusterMarkets] = useState<ClusteredMarketInput[]>([]);
    const [clusterChartSeries, setClusterChartSeries] = useState<ClusteredMarketSeries[]>([]);
    const [chartValueType, setChartValueType] = useState<"probability" | "price">("probability");
    const [chartAssetLabel, setChartAssetLabel] = useState<string | undefined>(undefined);
    const [multiChoiceMarkets, setMultiChoiceMarkets] = useState<Market[]>([]);
    const [tradingMarket, setTradingMarket] = useState<Market | null>(null);

    const solanaWallet = useEmbeddedSolanaWallet();
    const isWalletConnected = isConnected(solanaWallet);
    const walletAddress = isWalletConnected && solanaWallet.wallets?.[0] ? solanaWallet.wallets[0].address : null;

    const { activePositions } = usePositions();

    useEffect(() => {
        if (sideParam === "YES" || sideParam === "NO") {
            setInitialSide(sideParam);
            return;
        }
        setInitialSide("YES");
    }, [sideParam]);

    useEffect(() => {
        if (tradeModeParam === "BUY" || tradeModeParam === "SELL") {
            setInitialTradeMode(tradeModeParam);
            setShowTradePanel(true);
            return;
        }
        setInitialTradeMode("BUY");
    }, [tradeModeParam]);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            setError("Invalid market");
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchMarketForApp(id)
            .then((m) => {
                if (cancelled) return;
                if (!m) {
                    setError("Market not found");
                    return;
                }

                // Fetch balances if wallet is connected
                if (walletAddress) {
                    if (m.yesMint) {
                        getTokenBalance(walletAddress, m.yesMint).then(b => !cancelled && setYesBalance(b));
                    }
                    if (m.noMint) {
                        getTokenBalance(walletAddress, m.noMint).then(b => !cancelled && setNoBalance(b));
                    }
                }

                const finalYesPrice = m.yesPrice;
                const probabilityHistory = m.priceHistory ?? [];
                const primaryMarketId = m.marketId || m.id;

                setChartData(probabilityHistory);
                setClusterChartSeries([]);
                setClusterMarkets(
                    primaryMarketId
                        ? [{
                            marketId: primaryMarketId,
                            label: m.title,
                            provider: m.provider,
                            polymarketAssetId: m.polymarketClobTokenId,
                        }]
                        : []
                );
                setChartValueType("probability");
                setChartAssetLabel(undefined);
                setMarket({
                    ...m,
                    yesPrice: finalYesPrice,
                    priceHistory: probabilityHistory,
                });
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [id, walletAddress]);

    useEffect(() => {
        if (!market) return;
        if (!market.eventId) return;
        if (singleParam === "true") return;

        let cancelled = false;
        const loadClusterMarkets = async () => {
            try {
                const provider =
                    market.provider === "polymarket"
                        ? market.provider
                        : undefined;
                const event = await fetchJupiterEventById(market.eventId!, provider);
                if (!event || cancelled) return;

                const options = jupiterEventToMarkets(event);
                if (!cancelled) {
                    setMultiChoiceMarkets(options);
                    if (options.length > 1) {
                        setActiveTab("markets");
                    }
                }

                const inputs = options
                    .map((item) => ({
                        marketId: item.marketId || item.id,
                        label: item.title,
                        provider: item.provider,
                        polymarketAssetId: item.polymarketClobTokenId,
                    }))
                    .filter((item) => !!item.marketId);

                const deduped = Array.from(
                    new Map(inputs.map((item) => [item.marketId, item] as const)).values()
                );

                if (deduped.length > 1 && !cancelled) {
                    setClusterMarkets(deduped.slice(0, 6));
                }
            } catch (err) {
                if (!cancelled) {
                    console.warn("[MarketDetail] Failed to load clustered event markets:", err);
                }
            }
        };

        loadClusterMarkets();
        return () => {
            cancelled = true;
        };
    }, [market?.eventId, market?.provider]);

    useEffect(() => {
        if (!market) return;
        const marketId = market.marketId || market.id;
        const probabilityFallback = market.priceHistory ?? [];
        if (!marketId) {
            setClusterChartSeries([]);
            setChartValueType("probability");
            setChartAssetLabel(undefined);
            setChartData(probabilityFallback);
            return;
        }

        const clusteredCandidates = clusterMarkets
            .filter((item) => !!item.marketId)
            .filter((item) => item.marketId !== marketId);
        const clusteredInputs =
            clusteredCandidates.length > 0
                ? [
                    {
                        marketId,
                        label: market.title,
                        provider: market.provider,
                        polymarketAssetId: market.polymarketClobTokenId,
                    },
                    ...clusteredCandidates,
                ]
                : [{
                    marketId,
                    label: market.title,
                    provider: market.provider,
                    polymarketAssetId: market.polymarketClobTokenId,
                }];

        let cancelled = false;
        const loadChart = async () => {
            try {
                let points: ChartPoint[] = [];
                let clusteredSeries: ClusteredMarketSeries[] = [];

                if (clusteredInputs.length > 1) {
                    const fallbackPrices: Record<string, number> = {};
                    for (const mOpts of multiChoiceMarkets) {
                        if (mOpts.id) fallbackPrices[mOpts.id] = mOpts.yesPrice;
                    }
                    clusteredSeries = await fetchClusteredMarketChartFromJupiter(clusteredInputs, activeRange, fallbackPrices);
                    points = clusteredSeries.find((item) => item.key === marketId)?.data ?? clusteredSeries[0]?.data ?? [];
                } else {
                    points = await fetchMarketChartPointsFromJupiter(marketId, activeRange, {
                        provider: market.provider,
                        polymarketAssetId: market.polymarketClobTokenId,
                        label: market.title,
                    });
                }

                if (cancelled) return;
                setClusterChartSeries(clusteredSeries);
                setChartValueType("probability");
                setChartAssetLabel(undefined);
                setChartData(points.length > 0 ? points : probabilityFallback);
            } catch (err) {
                if (!cancelled) {
                    console.warn("[MarketDetail] Failed to fetch market chart points:", err);
                    setClusterChartSeries([]);
                    setChartValueType("probability");
                    setChartAssetLabel(undefined);
                    setChartData(probabilityFallback);
                }
            }
        };

        loadChart();
        const refreshMs = activeRange === "1H" ? 15_000 : 30_000;
        const timer = setInterval(loadChart, refreshMs);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [
        activeRange,
        market?.id,
        market?.marketId,
        market?.title,
        market?.priceHistory,
        clusterMarkets,
    ]);

    // Fetch trades when Activity tab is selected
    useEffect(() => {
        if (activeTab !== "activity") return;
        const marketId = market?.marketId || market?.id;
        if (!marketId) {
            setTrades([]);
            return;
        }

        let cancelled = false;
        const loadTrades = async () => {
            setTradesLoading(true);
            try {
                const recentTrades = await fetchMarketActivityTradesFromJupiter(marketId);

                if (!cancelled) {
                    setTrades(recentTrades);
                }
            } catch (err) {
                if (!cancelled) {
                    console.warn("[MarketDetail] Failed to fetch trades:", err);
                }
            } finally {
                if (!cancelled) {
                    setTradesLoading(false);
                }
            }
        };

        loadTrades();
        return () => {
            cancelled = true;
        };
    }, [activeTab, market?.id, market?.marketId]);

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <StatusBar style="light" />
                <ActivityIndicator size="large" color="#a855f7" />
                <Text style={styles.loadingText}>Loading market...</Text>
            </View>
        );
    }

    if (error || !market) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error ?? "Market not found"}</Text>
                <TouchableOpacity onPress={() => {
                    if (singleParam === "true" && parentId) {
                        router.replace(`/market/${parentId}`);
                    } else {
                        router.back();
                    }
                }} style={styles.backButton}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const yesPercent = Math.round(market.yesPrice * 100);
    const noPercent = 100 - yesPercent;
    const probabilityHistory = market.priceHistory ?? [];
    const chartSeries = chartData.length > 0 ? chartData : probabilityHistory;
    const isUp = chartSeries.length >= 2
        ? chartSeries[chartSeries.length - 1].value >= chartSeries[0].value
        : true;
    const chartColor = isUp ? "#10b981" : "#ef4444";
    const marketIddiaText = getMarketIddiaText(market);
    const marketId = market.marketId || market.id;
    const currentPosition = activePositions.find(p => p.marketId === id || p.marketId === marketId);

    // Check if we have a position either via token balances (if they exist) or via Jupiter position accounts
    const hasOpenPosition =
        (currentPosition && currentPosition.amount > 0) ||
        yesBalance > 0.000001 ||
        noBalance > 0.000001;

    const preferredBuySide: TradeSide = currentPosition ? currentPosition.side : initialSide;
    const preferredSellSide: TradeSide =
        currentPosition ? currentPosition.side :
            (yesBalance >= noBalance ? "YES" : "NO");
    const primaryFooterLabel = hasOpenPosition ? "BUY" : "BUY YES";
    const secondaryFooterLabel = hasOpenPosition ? "SELL" : "BUY NO";
    const secondaryFooterMode: TradeMode = hasOpenPosition ? "SELL" : "BUY";
    const primaryFooterSide: TradeSide = hasOpenPosition ? preferredBuySide : "YES";
    const secondaryFooterSide: TradeSide = hasOpenPosition ? preferredSellSide : "NO";

    const handleOpenTrade = (side: TradeSide, mode: TradeMode = "BUY", marketToTrade?: Market) => {
        setInitialSide(side);
        setInitialTradeMode(mode);
        setTradingMarket(marketToTrade ?? null);
        setShowTradePanel(true);
    };

    const handleTradeSuccess = (details: { signature: string }) => {
        const { signature } = details;
        Alert.alert("Success", `Trade successful! Signature: ${signature.slice(0, 8)}...`);
        setShowTradePanel(false);
    };

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <StatusBar style="dark" />
            <GlassHeader
                title={market.eventTitle || market.title}
                onBack={() => {
                    console.log("[MarketDetail] Back pressed");
                    if (singleParam === "true" && parentId) {
                        router.replace(`/market/${parentId}`);
                    } else {
                        router.back();
                    }
                }}
                rightIcon1={<Star color="#000" size={20} strokeWidth={2} />}
                onRightAction1={() => {
                    Alert.alert("Favorite", "Market added to favorites!");
                }}
                rightIcon2={<Share2 color="#000" size={20} strokeWidth={2} />}
                onRightAction2={() => {
                    Alert.alert("Share", "Sharing feature coming soon!");
                }}
            />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.titleSection}>
                    <View style={styles.marketImageContainer}>
                        {market.imageUrl && (
                            <Image source={market.imageUrl} style={styles.marketImage} contentFit="cover" />
                        )}
                    </View>
                    <View style={styles.titleTextContainer}>
                        <Text style={styles.marketTitle}>{market.eventTitle || market.title}</Text>
                        {market.eventTitle && market.title !== market.eventTitle && (
                            <Text style={styles.marketSubTitle}>{market.title}</Text>
                        )}
                        {!!marketIddiaText && (
                            <Text style={styles.marketIddiaText} numberOfLines={2}>
                                {marketIddiaText}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Chart Section - always show; MarketChartNative displays "No chart data" when empty */}
                <MarketChartNative
                    data={chartSeries}
                    color={chartColor}
                    series={clusterChartSeries}
                    activeRange={activeRange}
                    onRangeChange={(range) => setActiveRange(range as ChartRange)}
                    valueType={chartValueType}
                    assetLabel={chartAssetLabel}
                />

                {/* Position / About / Holders / Activity block (chart altı, ~350px) */}
                <View style={styles.positionBlock}>
                    <View style={styles.tabRow}>
                        {(multiChoiceMarkets.length > 1 && singleParam !== "true"
                            ? (["markets", "positions", "about", "holders", "activity"] as const)
                            : (["positions", "about", "holders", "activity"] as const)
                        ).map((tab) => (
                            <TouchableOpacity
                                key={tab}
                                onPress={() => setActiveTab(tab)}
                                style={[styles.tab, activeTab === tab && styles.tabActive]}
                            >
                                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {activeTab === "markets" && multiChoiceMarkets.length > 1 && singleParam !== "true" && (
                        <View style={styles.marketsTabContent}>
                            {multiChoiceMarkets.map((m) => {
                                const cleanLabel = getCleanMarketTitle(m.title, market.title);
                                const percentage = Math.round(m.yesPrice * 100);
                                return (
                                    <Pressable
                                        key={m.id}
                                        style={styles.marketCard}
                                        onPress={() => router.push(`/market/${m.marketId || m.id}?single=true&parentId=${id}`)}
                                    >
                                        <View style={styles.marketCardHeader}>
                                            <View style={styles.marketCardImageContainer}>
                                                {m.imageUrl || market.imageUrl ? (
                                                    <Image
                                                        source={(m.imageUrl || market.imageUrl) as any}
                                                        style={styles.marketCardImage}
                                                    />
                                                ) : (
                                                    <View style={styles.marketCardImagePlaceholder} />
                                                )}
                                            </View>
                                            <Text style={styles.marketCardTitle} numberOfLines={2}>
                                                {cleanLabel}
                                            </Text>
                                            <CircularProgress percentage={percentage} size={48} strokeWidth={5} />
                                        </View>

                                        <View style={styles.marketCardButtons}>
                                            {(() => {
                                                const mId = m.marketId || m.id;
                                                const mPos = activePositions.find(p => p.marketId === mId);
                                                const hasMOpenPosition = !!mPos && mPos.amount > 0;

                                                if (hasMOpenPosition) {
                                                    const mSide = mPos.side;
                                                    const otherSide = mSide === "YES" ? "NO" : "YES";
                                                    return (
                                                        <>
                                                            <Pressable
                                                                style={[styles.btnCardBuy, { flex: 1 }]}
                                                                onPress={() => handleOpenTrade(mSide, "BUY", m)}
                                                            >
                                                                <Text style={styles.btnTextCardBuy}>Buy {mSide.toLowerCase()}</Text>
                                                            </Pressable>
                                                            <Pressable
                                                                style={[styles.btnCardSell, { flex: 1 }]}
                                                                onPress={() => handleOpenTrade(mSide, "SELL", m)}
                                                            >
                                                                <Text style={styles.btnTextCardSell}>Sell {mSide.toLowerCase()}</Text>
                                                            </Pressable>
                                                        </>
                                                    );
                                                }

                                                return (
                                                    <>
                                                        <Pressable style={styles.btnCardYes} onPress={() => handleOpenTrade("YES", "BUY", m)}>
                                                            <Text style={styles.btnTextCardYes}>Yes</Text>
                                                        </Pressable>
                                                        <Pressable style={styles.btnCardNo} onPress={() => handleOpenTrade("NO", "BUY", m)}>
                                                            <Text style={styles.btnTextCardNo}>No</Text>
                                                        </Pressable>
                                                    </>
                                                );
                                            })()}
                                        </View>

                                        <View style={styles.marketCardFooter}>
                                            <Text style={styles.marketCardVolume}>
                                                ${m.volume >= 1_000_000 ? (m.volume / 1_000_000).toFixed(1) + "M" : m.volume >= 1_000 ? (m.volume / 1_000).toFixed(1) + "K" : m.volume.toFixed(0)} Volume
                                            </Text>
                                            <View style={styles.marketCardTraders}>
                                                <View style={styles.avatarDots}>
                                                    <View style={[styles.dot, { backgroundColor: '#34c759' }]} />
                                                    <View style={[styles.dot, { backgroundColor: '#ff3b30', marginLeft: -6 }]} />
                                                </View>
                                                <Text style={styles.tradersCount}>+{Math.floor(m.volume / 8) + 12}</Text>
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    {activeTab === "positions" && (
                        <View style={styles.positionTabContent}>
                            {/* Position Summary Card */}
                            <View style={styles.positionSummaryCard}>
                                <View style={styles.positionCardHeader}>
                                    <View style={styles.positionCardTitleRow}>
                                        <View style={styles.marketIconBadge}>
                                            <ReceiptCent color="#34c759" size={14} />
                                        </View>
                                        <Text style={styles.positionCardTitle} numberOfLines={1}>
                                            {market.title}
                                        </Text>
                                    </View>
                                    <TouchableOpacity activeOpacity={0.7}>
                                        <Share2 color="#6b7280" size={18} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.positionInnerCard}>
                                    <View style={styles.positionGridRow}>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Balance</Text>
                                            <View style={styles.positionValueRow}>
                                                <Text style={styles.positionMainValue}>
                                                    {yesBalance > 0 ? (yesBalance >= 1000 ? (yesBalance / 1000).toFixed(1) + "k" : yesBalance.toFixed(1)) :
                                                        noBalance > 0 ? (noBalance >= 1000 ? (noBalance / 1000).toFixed(1) + "k" : noBalance.toFixed(1)) : "0"}
                                                </Text>
                                                {(yesBalance > 0 || noBalance > 0) && (
                                                    <View style={[styles.sidePill, { backgroundColor: yesBalance > 0 ? "#10b981" : "#ef4444" }]}>
                                                        <Text style={styles.sidePillText}>{yesBalance > 0 ? "Yes" : "No"}</Text>
                                                    </View>
                                                )}
                                                <Text style={styles.positionUnitValue}>Shares</Text>
                                            </View>
                                        </View>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Value</Text>
                                            <Text style={styles.positionMainValue}>
                                                ${(yesBalance > 0 ? (yesBalance * market.yesPrice) : noBalance > 0 ? (noBalance * (1 - market.yesPrice)) : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.positionGridRow}>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Avg. Cost</Text>
                                            <Text style={styles.positionMainValue}>--</Text>
                                        </View>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Total Invested</Text>
                                            <Text style={styles.positionMainValue}>--</Text>
                                        </View>
                                    </View>

                                    <View style={styles.positionGridRow}>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Today’s Return</Text>
                                            <View>
                                                <Text style={[styles.positionMainValue, { color: "#34c759" }]}>+$0.00</Text>
                                                <View style={styles.returnSubRow}>
                                                    <ChevronUp color="#34c759" size={12} />
                                                    <Text style={styles.returnPercentText}>+0.0%</Text>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={styles.positionGridItem}>
                                            <Text style={styles.positionGridLabel}>Total Return</Text>
                                            <View>
                                                <Text style={[styles.positionMainValue, { color: "#34c759" }]}>+$0.00</Text>
                                                <View style={styles.returnSubRow}>
                                                    <ChevronUp color="#34c759" size={12} />
                                                    <Text style={styles.returnPercentText}>+0.0%</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {/* Activity Section */}
                            <View style={styles.activitySection}>
                                <Text style={styles.yourActivityTitle}>Your Activity</Text>
                                <View style={styles.activityList}>
                                    <Text style={styles.placeholderText}>No recent trades on-chain</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {activeTab === "about" && (
                        <>
                            {/* Rules Section */}
                            <View style={styles.rulesSection}>
                                <View style={styles.rulesTitleRow}>
                                    <Info color="#a855f7" size={18} />
                                    <Text style={styles.rulesTitle}>Rules</Text>
                                </View>
                                <Text
                                    style={styles.rulesText}
                                    numberOfLines={showMoreRules ? undefined : 4}
                                >
                                    {market.description}
                                </Text>
                                <TouchableOpacity
                                    style={styles.showMoreRow}
                                    onPress={() => setShowMoreRules(!showMoreRules)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.showMoreText}>
                                        {showMoreRules ? "Show less" : "Show more"}
                                    </Text>
                                    {showMoreRules
                                        ? <ChevronUp color="#6b7280" size={16} />
                                        : <ChevronDown color="#6b7280" size={16} />
                                    }
                                </TouchableOpacity>
                            </View>

                            {/* Stats 2×2 Grid */}
                            <View style={styles.aboutStatsGrid}>
                                <View style={styles.aboutStatCard}>
                                    <View style={styles.aboutStatHeader}>
                                        <Database color="#9ca3af" size={16} />
                                        <Text style={styles.aboutStatLabel}>Volume</Text>
                                    </View>
                                    <View style={styles.aboutStatValueBox}>
                                        <Text style={styles.aboutStatValue}>
                                            ${market.volume >= 1_000_000_000 ? (market.volume / 1_000_000_000).toFixed(1) + "B" : market.volume >= 1_000_000 ? (market.volume / 1_000_000).toFixed(1) + "M" : market.volume >= 1_000 ? (market.volume / 1_000).toFixed(1) + "K" : market.volume.toFixed(0)}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.aboutStatCard}>
                                    <View style={styles.aboutStatHeader}>
                                        <ArrowUpCircle color="#9ca3af" size={16} />
                                        <Text style={styles.aboutStatLabel}>24H Change</Text>
                                    </View>
                                    <View style={styles.aboutStatValueBox}>
                                        <Text style={[styles.aboutStatValue, { color: "#34c759" }]}>
                                            {chartSeries.length >= 2 && chartSeries[0].value !== 0
                                                ? ((chartSeries[chartSeries.length - 1].value - chartSeries[0].value) / chartSeries[0].value * 100).toFixed(1) + "%"
                                                : "0.0%"
                                            }
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.aboutStatCard}>
                                    <View style={styles.aboutStatHeader}>
                                        <Users color="#9ca3af" size={16} />
                                        <Text style={styles.aboutStatLabel}>Predictors</Text>
                                    </View>
                                    <View style={styles.aboutStatValueBox}>
                                        <Text style={styles.aboutStatValue}>--</Text>
                                    </View>
                                </View>
                                <View style={styles.aboutStatCard}>
                                    <View style={styles.aboutStatHeader}>
                                        <BarChart3 color="#9ca3af" size={16} />
                                        <Text style={styles.aboutStatLabel}>OI</Text>
                                    </View>
                                    <View style={styles.aboutStatValueBox}>
                                        <Text style={styles.aboutStatValue}>
                                            ${(market.openInterest ?? 0) >= 1_000_000 ? ((market.openInterest ?? 0) / 1_000_000).toFixed(1) + "M" : (market.openInterest ?? 0) >= 1_000 ? ((market.openInterest ?? 0) / 1_000).toFixed(1) + "K" : (market.openInterest ?? 0).toFixed(0)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </>
                    )}

                    {activeTab === "holders" && (
                        <View style={styles.tabContent}>
                            <Text style={styles.placeholderText}>Holders list coming soon</Text>
                        </View>
                    )}

                    {activeTab === "activity" && (
                        <View style={styles.tabContent}>
                            {tradesLoading ? (
                                <ActivityIndicator size="small" color="#a855f7" style={{ marginTop: 12 }} />
                            ) : trades.length === 0 ? (
                                <Text style={styles.placeholderText}>No recent trades on-chain</Text>
                            ) : (
                                <View style={styles.activityListContainer}>
                                    {trades.map((trade, idx) => (
                                        <View key={`${trade.txHash}-${idx}`} style={styles.tradeItem}>
                                            <View style={styles.tradeInfoMain}>
                                                <View style={[styles.tradeSideBadge, { backgroundColor: trade.side === "buy" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)" }]}>
                                                    <Text style={[styles.tradeSideText, { color: trade.side === "buy" ? "#10b981" : "#ef4444" }]}>
                                                        {trade.side.toUpperCase()} {trade.outcome.toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text style={styles.tradePriceText}>{(trade.price * 100).toFixed(1)}%</Text>
                                            </View>
                                            <View style={styles.tradeInfoSide}>
                                                <Text style={styles.tradeSizeText}>
                                                    {trade.sizeUnit === "usd"
                                                        ? `$${trade.size.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                                                        : `${trade.size.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares`}
                                                </Text>
                                                <Text style={styles.tradeTimeText}>
                                                    {new Date(trade.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <TrendingUp color="#666" size={16} />
                        <Text style={styles.statLabel}>Volume</Text>
                        <Text style={styles.statValue}>${market.volume >= 1_000_000 ? (market.volume / 1_000_000).toFixed(1) + "M" : market.volume >= 1_000 ? (market.volume / 1_000).toFixed(0) + "K" : market.volume.toFixed(0)}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Users color="#666" size={16} />
                        <Text style={styles.statLabel}>Chance</Text>
                        <Text style={[styles.statValue, { color: chartColor }]}>{yesPercent}%</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Calendar color="#666" size={16} />
                        <Text style={styles.statLabel}>Resolves</Text>
                        <Text style={styles.statValue}>
                            {new Date(market.resolveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Text>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Trade Modal */}
            <Modal
                visible={showTradePanel}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowTradePanel(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowTradePanel(false)}>
                    <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                        <TradePanel
                            market={tradingMarket || market}
                            onSuccess={handleTradeSuccess}
                            initialSide={initialSide}
                            initialTradeMode={initialTradeMode}
                            onClose={() => setShowTradePanel(false)}
                        />
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Sticky Footer Actions */}
            <View style={styles.footer}>
                <Pressable
                    style={({ pressed }) => [
                        styles.tradeButton,
                        styles.buyYesButton,
                        pressed && styles.pressed
                    ]}
                    onPress={() => handleOpenTrade(primaryFooterSide, "BUY")}
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
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255, 255, 255, 0.8)" }]} />
                    )}
                    <LinearGradient
                        colors={["rgba(255, 255, 255, 0.4)", "rgba(195, 195, 195, 0.4)", "rgba(255, 255, 255, 0.4)"]}
                        start={{ x: 1, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <Text style={styles.tradeButtonText}>{primaryFooterLabel}</Text>
                </Pressable>

                <Pressable
                    style={({ pressed }) => [
                        styles.tradeButton,
                        styles.buyNoButton,
                        pressed && styles.pressed
                    ]}
                    onPress={() => handleOpenTrade(secondaryFooterSide, secondaryFooterMode)}
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
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255, 255, 255, 0.8)" }]} />
                    )}
                    <LinearGradient
                        colors={["rgba(255, 255, 255, 0.4)", "rgba(195, 195, 195, 0.4)", "rgba(255, 255, 255, 0.4)"]}
                        start={{ x: 1, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <Text style={styles.tradeButtonText}>{secondaryFooterLabel}</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#ffffff",
    },
    centered: {
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        color: "#6b7280",
        marginTop: 12,
        fontSize: 16,
    },
    scrollContent: {
        paddingBottom: 110,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.05)",
    },
    headerTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "bold",
        flex: 1,
        textAlign: "center",
        marginHorizontal: 16,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
    },
    titleSection: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        gap: 12,
    },
    marketImageContainer: {
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.15)",
    },
    marketImage: {
        width: "100%",
        height: "100%",
    },
    titleTextContainer: {
        flex: 1,
        justifyContent: "center",
    },
    marketTitle: {
        color: "#171717",
        fontSize: 20,
        fontWeight: "600",
        lineHeight: 24,
    },
    marketSubTitle: {
        color: "#6b7280",
        fontSize: 16,
        fontWeight: "500",
        marginTop: 2,
    },
    marketIddiaText: {
        marginTop: 4,
        color: "#b4975a",
        fontSize: 14,
        lineHeight: 18,
        fontWeight: "600",
    },
    categoryBadge: {
        display: "none",
    },
    categoryText: {
        color: "#a855f7",
        fontSize: 12,
        fontWeight: "bold",
        textTransform: "uppercase",
    },
    positionBlock: {
        width: "100%",
        padding: 8,
    },
    tabRow: {
        flexDirection: "row",
        backgroundColor: "rgba(0,0,0,0.05)",
        borderRadius: 14,
        padding: 4,
        marginHorizontal: 16,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: "center",
        borderRadius: 10,
    },
    tabActive: {
        backgroundColor: "#ffffff",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    tabLabelActive: {
        color: "#000",
    },
    positionColumns: {
        flexDirection: "row",
        gap: 24,
    },
    positionCol: {
        flex: 1,
        gap: 12,
    },
    positionRow: {
        gap: 4,
    },
    positionLabel: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 12,
        fontWeight: "700",
    },
    positionValue: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    balanceValueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    noSharesPill: {
        backgroundColor: "#ff383c",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 16,
    },
    noSharesText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
    },
    positiveText: {
        color: "#34c759",
    },
    returnRow: {
        gap: 4,
    },
    returnPctRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    tabContent: {
        paddingVertical: 8,
    },
    placeholderText: {
        color: "#6b7280",
        fontSize: 14,
    },
    positionTabContent: {
        backgroundColor: "#eee",
        borderRadius: 16,
        padding: 4,
        gap: 6,
    },
    positionSummaryCard: {
        padding: 0,
    },
    positionCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        paddingTop: 6,
        marginBottom: 4,
    },
    positionCardTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flex: 1,
        marginRight: 12,
    },
    marketIconBadge: {
        width: 20,
        height: 20,
        backgroundColor: "rgba(52, 199, 89, 0.1)",
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    positionCardTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    positionInnerCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 8,
        gap: 16,
        borderWidth: 0,
    },
    positionGridRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    positionGridItem: {
        flex: 1,
        gap: 4,
    },
    positionGridLabel: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 12,
        fontWeight: "700",
    },
    positionValueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    positionMainValue: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    positionUnitValue: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    sidePill: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
    },
    sidePillText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "bold",
    },
    returnSubRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: -2,
    },
    returnPercentText: {
        color: "#34c759",
        fontSize: 10,
        fontWeight: "700",
    },
    activitySection: {
        marginTop: 24,
    },
    yourActivityTitle: {
        color: "rgba(0,0,0,0.25)",
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 0,
        paddingHorizontal: 8,
        marginTop: 16,
    },
    activityList: {
        paddingVertical: 8,
    },
    rulesSection: {
        marginTop: 8,
    },
    rulesTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
    },
    rulesTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
    },
    rulesText: {
        color: "rgba(0,0,0,0.6)",
        fontSize: 12,
        lineHeight: 18,
    },
    showMoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 4,
    },
    showMoreText: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "600",
    },
    aboutStatsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 16,
    },
    aboutStatCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        flex: 1,
        minWidth: "45%",
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
    },
    activityListContainer: {
        marginTop: 8,
        gap: 12,
        paddingHorizontal: 8,
    },
    tradeItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.05)",
    },
    tradeInfoMain: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    tradeSideBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    tradeSideText: {
        fontSize: 10,
        fontWeight: "800",
    },
    tradePriceText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#000",
    },
    tradeInfoSide: {
        alignItems: "flex-end",
    },
    tradeSizeText: {
        fontSize: 14,
        fontWeight: "500",
        color: "#374151",
    },
    tradeTimeText: {
        fontSize: 12,
        color: "#9ca3af",
        marginTop: 2,
    },
    aboutStatHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingTop: 2,
    },
    aboutStatLabel: {
        color: "#9ca3af",
        fontSize: 12,
        fontWeight: "bold",
    },
    aboutStatValueBox: {
        backgroundColor: "#f9f9f9",
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        height: 48,
        justifyContent: "center",
    },
    aboutStatValue: {
        color: "#000",
        fontSize: 22,
        fontWeight: "bold",
    },
    statsGrid: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
        alignItems: "center",
        gap: 4,
    },
    statLabel: {
        color: "#666",
        fontSize: 10,
        fontWeight: "600",
        textTransform: "uppercase",
    },
    statValue: {
        color: "#000",
        fontSize: 14,
        fontWeight: "bold",
    },
    marketsTabContent: {
        paddingTop: 16,
        paddingHorizontal: 4,
        gap: 16,
    },
    marketCard: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
    },
    marketCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    marketCardImageContainer: {
        width: 48,
        height: 48,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "#f5f5f5",
        marginRight: 12,
    },
    marketCardImage: {
        width: "100%",
        height: "100%",
    },
    marketCardImagePlaceholder: {
        width: "100%",
        height: "100%",
        backgroundColor: "#e5e7eb",
    },
    marketCardTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: "700",
        color: "#111827",
        lineHeight: 20,
        marginRight: 12,
    },
    marketCardButtons: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 16,
    },
    btnCardYes: {
        flex: 1,
        height: 48,
        backgroundColor: "rgba(52, 199, 89, 0.15)",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    btnCardNo: {
        flex: 1,
        height: 48,
        backgroundColor: "rgba(255, 59, 48, 0.15)",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    btnTextCardYes: {
        color: "#34c759",
        fontSize: 16,
        fontWeight: "700",
    },
    btnTextCardNo: {
        color: "#ff3b30",
        fontSize: 16,
        fontWeight: "700",
    },
    btnCardBuy: {
        height: 48,
        backgroundColor: "rgba(52, 199, 89, 0.15)",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    btnCardSell: {
        height: 48,
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    btnTextCardBuy: {
        color: "#34c759",
        fontSize: 14,
        fontWeight: "700",
    },
    btnTextCardSell: {
        color: "#111827",
        fontSize: 14,
        fontWeight: "700",
    },
    marketCardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    marketCardVolume: {
        fontSize: 14,
        fontWeight: "600",
        color: "#9ca3af",
    },
    marketCardTraders: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    avatarDots: {
        flexDirection: "row",
        alignItems: "center",
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#fff",
    },
    tradersCount: {
        fontSize: 14,
        fontWeight: "700",
        color: "#111827",
    },
    section: {
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.05)",
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
    },
    sectionTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "bold",
    },
    descriptionText: {
        color: "rgba(0,0,0,0.6)",
        fontSize: 14,
        lineHeight: 22,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
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
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "transparent",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: Platform.OS === "ios" ? 34 : 16,
        flexDirection: "row",
        gap: 12,
    },
    tradeButton: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        borderCurve: "continuous",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.8)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
        elevation: 2,
    },
    buyYesButton: {
        // No longer specific color, matches deposit
    },
    buyNoButton: {
        // No longer specific color, matches deposit
    },
    tradeButtonText: {
        color: "#000000",
        fontSize: 20,
        fontWeight: "600",
        letterSpacing: -0.6,
    },
    pressed: {
        opacity: 0.9,
        transform: [{ scale: 0.97 }],
    },
    errorContainer: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    errorText: {
        color: "#000",
        fontSize: 18,
        marginBottom: 20,
    },
    backButton: {
        backgroundColor: "#a855f7",
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    backButtonText: {
        color: "#fff",
        fontWeight: "bold",
    },
});

export default MarketDetailScreen;
