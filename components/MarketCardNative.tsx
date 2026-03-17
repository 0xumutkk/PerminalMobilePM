import React, { memo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { type Market, type MarketGroup } from "../lib/mock-data";
import { useRouter } from "expo-router";
import { TrendingUp, TrendingDown, Activity, ArrowUpCircle } from "lucide-react-native";
import { Svg, Line, Path, Defs, LinearGradient, Stop } from "react-native-svg";

export interface MarketCardNativeProps {
    group: MarketGroup;
    isFirst?: boolean;
    isLast?: boolean;
    nowMs?: number;
    onBuyYes?: (market: Market) => void;
    onBuyNo?: (market: Market) => void;
}

function formatVolume(volumeUSD: number) {
    if (volumeUSD <= 0) return "$0 Vol.";
    if (volumeUSD < 1) return "<$1 Vol.";
    if (volumeUSD >= 1_000_000_000) return `$${(volumeUSD / 1_000_000_000).toFixed(1)}B Vol.`;
    if (volumeUSD >= 1_000_000) return `$${(volumeUSD / 1_000_000).toFixed(1)}M Vol.`;
    if (volumeUSD >= 1_000) return `$${(volumeUSD / 1_000).toFixed(1)}k Vol.`;
    return `$${Math.round(volumeUSD).toLocaleString("en-US")} Vol.`;
}

const DashedLine = () => (
    <View style={styles.dashedWrapper}>
        <Svg height="1" width="100%">
            <Line
                x1="0"
                y1="0.5"
                x2="1000"
                y2="0.5"
                stroke="rgba(0, 0, 0, 0.15)"
                strokeWidth="1"
                strokeDasharray="6, 6"
            />
        </Svg>
    </View>
);

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

function calculatePriceChange(priceHistory: { timestamp: number; value: number }[]): number {
    if (!priceHistory || priceHistory.length < 2) return 0;
    const oldest = priceHistory[0].value;
    const newest = priceHistory[priceHistory.length - 1].value;
    if (oldest === 0) return 0; // Avoid division by zero
    return ((newest - oldest) / oldest) * 100;
}

function generateSparklinePath(data: { timestamp: number; value: number }[], width: number, height: number): { path: string, isPositive: boolean } {
    if (!data || data.length < 2) return { path: "", isPositive: true };

    const newest = data[data.length - 1].value;
    const oldest = data[0].value;
    const isPositive = newest >= oldest;

    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // Fallback to 1 if max == min to avoid div by zero

    // Scale values to the component dimensions
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        // SVG y=0 is top, so we invert the y coordinate.
        // Also add a small padding (e.g. 10%) so the line doesn't hit the border.
        const padding = height * 0.1;
        const boundedHeight = height - padding * 2;
        const y = padding + boundedHeight - ((d.value - min) / range) * boundedHeight;
        return `${x},${y}`;
    });

    // Create a smooth cubic bezier path for a softer curve
    let d = `M ${points[0].split(',')[0]} ${points[0].split(',')[1]}`;
    for (let i = 0; i < data.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)].split(',').map(Number);
        const p1 = points[i].split(',').map(Number);
        const p2 = points[i + 1].split(',').map(Number);
        const p3 = points[Math.min(data.length - 1, i + 2)].split(',').map(Number);

        const tension = 0.3;
        const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
        const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
        const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
        const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }

    return { path: d, isPositive };
}

function sortMarketsForDisplay(markets: Market[]): Market[] {
    return [...markets].sort((a, b) => {
        const priceDiff = (Number.isFinite(b.yesPrice) ? b.yesPrice : 0) - (Number.isFinite(a.yesPrice) ? a.yesPrice : 0);
        if (priceDiff !== 0) return priceDiff;

        return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
    });
}

export const MarketCardNative = memo(function MarketCardNative({ group, onBuyYes, onBuyNo, isFirst, isLast }: MarketCardNativeProps) {
    const router = useRouter();
    const orderedMarkets = group.markets.length > 1
        ? sortMarketsForDisplay(group.markets)
        : group.markets;
    const isMultiChoice = orderedMarkets.length > 1;

    // Derived properties for binary market (if applicable)
    const binaryMarket = !isMultiChoice ? orderedMarkets[0] : null;
    let priceChange = 0;
    let sparkline = { path: "", isPositive: true };

    if (binaryMarket && binaryMarket.priceHistory) {
        priceChange = calculatePriceChange(binaryMarket.priceHistory);
        // We use explicit width/height for the sparkline path generation, these match the container styling
        sparkline = generateSparklinePath(binaryMarket.priceHistory, 80, 40);
    }

    return (
        <View style={[
            styles.container,
            isFirst && styles.firstItem,
            isLast && styles.lastItem,
        ]}>
            {/* Header info for Binary or Root Title for Multi */}
            <Pressable
                style={styles.header}
                onPress={() => router.push(`/market/${group.eventId}`)}
            >
                <View style={styles.imageWrapper}>
                    {group.imageUrl ? (
                        <Image
                            source={group.imageUrl}
                            contentFit="cover"
                            style={styles.image as any}
                        />
                    ) : (
                        <View style={styles.placeholderIcon}>
                            <Text style={styles.placeholderText}>{group.category.charAt(0)}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.titleContainer}>
                    <Text style={styles.title} numberOfLines={2}>
                        {group.title}
                    </Text>
                    {!isMultiChoice && binaryMarket ? (
                        <View style={styles.binaryProbRow}>
                            {priceChange >= 0 ? (
                                <TrendingUp size={12} color="#34c759" />
                            ) : (
                                <TrendingDown size={12} color="#ff3b30" />
                            )}
                            <Text style={priceChange >= 0 ? styles.probTextGreen : styles.probTextRed}>
                                {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
                            </Text>
                        </View>
                    ) : null}
                </View>
                {!isMultiChoice && binaryMarket ? (
                    <View style={styles.rightStatsWrapper}>
                        {sparkline.path ? (
                            <View style={styles.sparklineContainer}>
                                <Svg width="80" height="40">
                                    <Defs>
                                        <LinearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                                            <Stop offset="0" stopColor={sparkline.isPositive ? "#34c759" : "#ff3b30"} stopOpacity={0.2} />
                                            <Stop offset="1" stopColor={sparkline.isPositive ? "#34c759" : "#ff3b30"} stopOpacity={0} />
                                        </LinearGradient>
                                    </Defs>
                                    <Path
                                        d={`${sparkline.path} L 80 40 L 0 40 Z`}
                                        fill="url(#sparklineGrad)"
                                    />
                                    <Path
                                        d={sparkline.path}
                                        stroke={sparkline.isPositive ? "#34c759" : "#ff3b30"}
                                        strokeWidth={1.5}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </Svg>
                            </View>
                        ) : null}
                        <Text style={styles.largeProb}>{Math.round(binaryMarket.yesPrice * 100)}%</Text>
                    </View>
                ) : null}
            </Pressable>

            {/* Market Specific Content */}
            {isMultiChoice ? (
                <View style={styles.multiList}>
                    {orderedMarkets.slice(0, 3).map((m) => {
                        const cleanLabel = getCleanMarketTitle(m.title, group.title);
                        return (
                            <View key={m.id} style={styles.choiceRow}>
                                <View style={styles.choiceLeft}>
                                    <Text style={styles.choiceLabel} numberOfLines={1}>{cleanLabel}</Text>
                                    <ArrowUpCircle size={14} color="rgba(0,0,0,0.2)" />
                                </View>
                                <View style={styles.choiceRight}>
                                    <Text style={styles.choicePrice}>{Math.round(m.yesPrice * 100)}%</Text>
                                    <Pressable style={styles.btnMiniYes} onPress={() => onBuyYes?.(m)}>
                                        <Text style={styles.btnTextMiniYes}>Yes</Text>
                                    </Pressable>
                                    <Pressable style={styles.btnMiniNo} onPress={() => onBuyNo?.(m)}>
                                        <Text style={styles.btnTextMiniNo}>No</Text>
                                    </Pressable>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={styles.binaryButtons}>
                    <Pressable style={styles.btnLargeYes} onPress={() => onBuyYes?.(orderedMarkets[0])}>
                        <Text style={styles.btnTextLargeYes}>Yes</Text>
                    </Pressable>
                    <Pressable style={styles.btnLargeNo} onPress={() => onBuyNo?.(orderedMarkets[0])}>
                        <Text style={styles.btnTextLargeNo}>No</Text>
                    </Pressable>
                </View>
            )}

            {/* Common Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerVol}>{formatVolume(group.volume)}</Text>
                <View style={styles.tradersRow}>
                    <View style={styles.avatarDots}>
                        <View style={[styles.dot, { backgroundColor: '#34c759' }]} />
                        <View style={[styles.dot, { backgroundColor: '#ff3b30', marginLeft: -6 }]} />
                    </View>
                    <Text style={styles.tradersCount}>+{Math.floor(group.volume / 8) + 12}</Text>
                </View>
            </View>

            {!isLast && <DashedLine />}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 20,
        width: '100%',
        backgroundColor: '#fff',
    },
    dashedWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
    },
    firstItem: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    lastItem: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        marginBottom: 20,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    imageWrapper: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: "#f5f5f5",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(0,0,0,0.08)",
    },
    image: {
        width: "100%",
        height: "100%",
    },
    placeholderIcon: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eee',
    },
    placeholderText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ccc',
    },
    titleContainer: {
        flex: 1,
        marginLeft: 10,
    },
    title: {
        fontSize: 13,
        fontWeight: "700",
        color: "#000",
        lineHeight: 16,
    },
    binaryProbRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 2,
    },
    probTextGreen: {
        fontSize: 11,
        fontWeight: "600",
        color: "#34c759",
    },
    probTextRed: {
        fontSize: 11,
        fontWeight: "600",
        color: "#ff3b30",
    },
    rightStatsWrapper: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    sparklineContainer: {
        width: 80,
        height: 40,
        justifyContent: "center",
    },
    largeProb: {
        fontSize: 24,
        fontWeight: "800",
        color: "#000",
        letterSpacing: -0.5,
    },
    binaryButtons: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
    },
    btnLargeYes: {
        flex: 1,
        height: 48,
        backgroundColor: "rgba(180, 151, 90, 0.15)",
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    btnLargeNo: {
        flex: 1,
        height: 48,
        backgroundColor: "rgba(255, 0, 0, 0.15)",
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    btnTextLargeYes: {
        color: "#b4975a",
        fontSize: 14,
        fontWeight: "700",
    },
    btnTextLargeNo: {
        color: "#ff0000",
        fontSize: 14,
        fontWeight: "700",
    },
    multiList: {
        gap: 8,
        marginBottom: 12,
    },
    choiceRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: 32,
    },
    choiceLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    choiceLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "rgba(0,0,0,0.5)",
        maxWidth: '70%',
    },
    choiceRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    choicePrice: {
        fontSize: 12,
        fontWeight: "700",
        color: "#000",
        marginRight: 4,
    },
    btnMiniYes: {
        width: 44,
        height: 24,
        backgroundColor: "rgba(52, 199, 89, 0.1)",
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    btnMiniNo: {
        width: 44,
        height: 24,
        backgroundColor: "rgba(255, 59, 48, 0.08)",
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    btnTextMiniYes: {
        color: "#34c759",
        fontSize: 11,
        fontWeight: "700",
    },
    btnTextMiniNo: {
        color: "#ff453a",
        fontSize: 11,
        fontWeight: "700",
    },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    footerVol: {
        fontSize: 11,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    tradersRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    avatarDots: {
        flexDirection: "row",
    },
    dot: {
        width: 14,
        height: 14,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#fff",
    },
    tradersCount: {
        fontSize: 11,
        fontWeight: "600",
        color: "#8d8d8d",
    },
});
