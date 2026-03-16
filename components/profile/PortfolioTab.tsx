import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, Wallet, CircleDollarSign, ArrowUpDown } from "lucide-react-native";
import { MarketChartNative } from "../MarketChartNative";
import { usePositions } from "../../hooks/usePositions";
import type { PortfolioPerformanceRange } from "../../hooks/useJupiterPortfolioPerformance";
import type { ChartPoint } from "../../lib/mock-data";
import PositionCard from "./PositionCard";

interface PortfolioTabProps {
    balanceSeries: ChartPoint[];
    isPerformanceLoading?: boolean;
    performanceRange: PortfolioPerformanceRange;
    realizedPnlUsd?: number | null;
    onPerformanceRangeChange: (range: PortfolioPerformanceRange) => void;
    usdcBalance: number | null;
    onRefresh?: () => void;
}

export default function PortfolioTab({
    balanceSeries,
    isPerformanceLoading = false,
    performanceRange,
    realizedPnlUsd,
    onPerformanceRangeChange,
    usdcBalance,
    onRefresh,
}: PortfolioTabProps) {
    const router = useRouter();
    const { activePositions, closedPositions, isLoading, refresh: refreshPositions } = usePositions();
    const [activeExpanded, setActiveExpanded] = useState(true);
    const [closedExpanded, setClosedExpanded] = useState(false);

    const onPullToRefresh = async () => {
        await Promise.all([
            refreshPositions(),
            onRefresh && onRefresh(),
        ]);
    };

    const handleOpenMarket = (marketId: string) => {
        router.push({
            pathname: "/market/[id]",
            params: { id: marketId, single: "true" },
        });
    };

    const totalPositionValue = useMemo(
        () => activePositions.reduce((sum, p) => sum + p.currentValue, 0),
        [activePositions]
    );
    const totalPortfolioValue = (usdcBalance || 0) + totalPositionValue;

    const sortedActivePositions = useMemo(
        () => [...activePositions].sort((a, b) => b.currentValue - a.currentValue),
        [activePositions]
    );

    const sortedClosedPositions = useMemo(
        () => [...closedPositions].sort((a, b) => b.currentValue - a.currentValue),
        [closedPositions]
    );

    const chartColor = useMemo(() => {
        if (balanceSeries.length >= 2) {
            return balanceSeries[balanceSeries.length - 1].value >= balanceSeries[0].value ? "#34c759" : "#ef4444";
        }
        return typeof realizedPnlUsd === "number" && realizedPnlUsd < 0 ? "#ef4444" : "#34c759";
    }, [balanceSeries, realizedPnlUsd]);

    const formatValue = (val: number) => {
        if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
        if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
        return `$${val.toFixed(2)}`;
    };

    const formatSignedPnl = (val: number | null | undefined) => {
        if (typeof val !== "number" || !Number.isFinite(val)) return "--";
        return `${val >= 0 ? "+" : "-"}$${Math.abs(val).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    };
    const performanceLabel = performanceRange === "ALL" ? "ALL-TIME" : performanceRange;

    return (
        <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl refreshing={isLoading || isPerformanceLoading} onRefresh={onPullToRefresh} tintColor="#34c759" />
            }
        >
            <View style={styles.valueSection}>
                <View style={styles.valueHeader}>
                    <View style={styles.primaryMetric}>
                        <Text style={styles.metricCaption}>Portfolio Value</Text>
                        <Text style={styles.totalValue}>
                            ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                    </View>
                    <View style={styles.pnlRow}>
                        <Text style={styles.metricCaption}>Realized PnL</Text>
                        <View style={styles.pnlValueRow}>
                            <Text
                                style={[
                                    styles.pnlText,
                                    typeof realizedPnlUsd === "number" && realizedPnlUsd < 0 ? styles.pnlTextNegative : null,
                                ]}
                            >
                                {formatSignedPnl(realizedPnlUsd)}
                            </Text>
                            <Text style={styles.pnlLabel}>{performanceLabel}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.chartContainer}>
                    <MarketChartNative
                        data={balanceSeries}
                        color={chartColor}
                        activeRange={performanceRange}
                        onRangeChange={(range) => onPerformanceRangeChange(range as PortfolioPerformanceRange)}
                        valueType="price"
                        curveType="step"
                        hideHeader
                    />
                    {isPerformanceLoading ? (
                        <View style={styles.chartLoadingOverlay} pointerEvents="none">
                            <ActivityIndicator color={chartColor} />
                        </View>
                    ) : null}
                </View>
            </View>

            <View style={styles.summaryContainer}>
                <View style={styles.summaryCard}>
                    <View style={styles.cardHeader}>
                        <Wallet size={20} color="#007aff" fill="#007aff" strokeWidth={1} />
                        <Text style={styles.cardTitle}>Positions</Text>
                    </View>
                    <View style={styles.cardValueBox}>
                        <Text style={styles.cardValue}>{formatValue(totalPositionValue)}</Text>
                    </View>
                </View>
                <View style={styles.summaryCard}>
                    <View style={styles.cardHeader}>
                        <CircleDollarSign size={20} color="#34c759" fill="#34c759" strokeWidth={1} />
                        <Text style={styles.cardTitle}>USD</Text>
                    </View>
                    <View style={styles.cardValueBox}>
                        <Text style={styles.cardValue}>{formatValue(usdcBalance || 0)}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.positionsBlock}>
                <TouchableOpacity style={styles.sectionHeader} onPress={() => setActiveExpanded((v) => !v)}>
                    <Text style={styles.sectionTitle}>Active Positions</Text>
                    <ChevronDown
                        size={20}
                        color="#000"
                        style={[styles.caretIcon, activeExpanded && styles.caretIconExpanded]}
                    />
                </TouchableOpacity>

                {activeExpanded ? (
                    <>
                        <View style={styles.sortRow}>
                            <Text style={styles.sortText}>Sort by</Text>
                            <View style={styles.sortRight}>
                                <Text style={styles.sortText}>Top</Text>
                                <ArrowUpDown size={18} color="rgba(0,0,0,0.5)" />
                            </View>
                        </View>

                        <View style={styles.positionsList}>
                            {isLoading ? (
                                <ActivityIndicator color="#34c759" style={{ margin: 20 }} />
                            ) : sortedActivePositions.length > 0 ? (
                                sortedActivePositions.map((position, index) => (
                                    <View key={`${position.mint}-${index}`}>
                                        <PositionCard
                                            position={position}
                                            onPress={() => handleOpenMarket(position.marketId)}
                                        />
                                        {index < sortedActivePositions.length - 1 ? <View style={styles.rowDivider} /> : null}
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>No active positions</Text>
                            )}
                        </View>
                    </>
                ) : null}

                <TouchableOpacity style={styles.closedHeader} onPress={() => setClosedExpanded((v) => !v)}>
                    <Text style={styles.sectionTitle}>Closed Positions</Text>
                    <View style={styles.closedRight}>
                        <Text style={styles.sectionCount}>{closedPositions.length}</Text>
                        <ChevronDown
                            size={20}
                            color="#000"
                            style={[styles.caretIcon, closedExpanded && styles.caretIconExpanded]}
                        />
                    </View>
                </TouchableOpacity>

                {closedExpanded ? (
                    <View style={styles.positionsList}>
                        {isLoading ? (
                            <ActivityIndicator color="#34c759" style={{ margin: 20 }} />
                        ) : sortedClosedPositions.length > 0 ? (
                            sortedClosedPositions.map((position, index) => (
                                <View key={`${position.mint}-closed-${index}`}>
                                    <PositionCard
                                        position={position}
                                        onPress={() => handleOpenMarket(position.marketId)}
                                    />
                                    {index < sortedClosedPositions.length - 1 ? <View style={styles.rowDivider} /> : null}
                                </View>
                            ))
                        ) : (
                            <Text style={styles.emptyText}>No closed positions</Text>
                        )}
                    </View>
                ) : null}
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f9f9f9",
    },
    valueSection: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d9d9d9",
        borderLeftWidth: 0,
        borderRightWidth: 0,
        paddingTop: 8,
        paddingBottom: 8,
    },
    valueHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    primaryMetric: {
        gap: 4,
    },
    metricCaption: {
        color: "rgba(0,0,0,0.45)",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    totalValue: {
        color: "#000",
        fontSize: 24,
        fontWeight: "700",
        letterSpacing: -0.6,
    },
    pnlRow: {
        alignItems: "flex-end",
        gap: 4,
    },
    pnlValueRow: {
        flexDirection: "row",
        alignItems: "flex-end",
    },
    pnlText: {
        color: "#34c759",
        fontSize: 16,
        fontWeight: "700",
    },
    pnlTextNegative: {
        color: "#ef4444",
    },
    pnlLabel: {
        color: "#bbb",
        fontSize: 16,
        fontWeight: "700",
    },
    chartContainer: {
        minHeight: 248,
        marginTop: 12,
        marginHorizontal: 8,
        position: "relative",
    },
    chartLoadingOverlay: {
        position: "absolute",
        top: 20,
        right: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    summaryContainer: {
        flexDirection: "row",
        paddingHorizontal: 8,
        gap: 8,
        paddingTop: 8,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: "#eee",
        borderRadius: 16,
        paddingTop: 6,
        paddingBottom: 4,
        paddingHorizontal: 4,
        gap: 6,
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingTop: 2,
    },
    cardTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
    },
    cardValueBox: {
        backgroundColor: "#fff",
        borderRadius: 12,
        height: 48,
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    cardValue: {
        color: "#000",
        fontSize: 24,
        fontWeight: "800",
        letterSpacing: -0.8,
    },
    positionsBlock: {
        backgroundColor: "#eee",
        paddingHorizontal: 8,
        paddingTop: 8,
        paddingBottom: 12,
        marginTop: 8,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
    },
    caretIcon: {
        opacity: 0.5,
    },
    caretIconExpanded: {
        transform: [{ rotate: "180deg" }],
    },
    sectionTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "500",
        letterSpacing: -0.4,
    },
    sortRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 5,
    },
    sortRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
    },
    sortText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "500",
        opacity: 0.5,
        letterSpacing: -0.4,
    },
    positionsList: {
        marginTop: 8,
    },
    rowDivider: {
        height: 1,
        backgroundColor: "#bbb",
        opacity: 0.5,
    },
    closedHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        marginTop: 8,
    },
    closedRight: {
        flexDirection: "row",
        alignItems: "center",
    },
    sectionCount: {
        color: "#000",
        fontSize: 16,
        fontWeight: "500",
        opacity: 0.5,
        letterSpacing: -0.4,
    },
    emptyText: {
        color: "rgba(0,0,0,0.4)",
        textAlign: "center",
        marginVertical: 20,
        fontSize: 14,
    },
});
