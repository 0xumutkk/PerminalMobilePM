import React from "react";
import { View, StyleSheet, Dimensions, Text, Pressable } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle } from "react-native-svg";
import { type ChartPoint } from "../lib/mock-data";
import { Image } from "expo-image";

export type ChartValueType = "probability" | "price";

export interface MarketChartNativeProps {
    data: ChartPoint[];
    color?: string;
    activeRange?: string;
    onRangeChange?: (range: string) => void;
    valueType?: ChartValueType;
    assetLabel?: string;
}

const MAX_POINTS = 60;
const TIME_RANGES = ["1H", "6H", "1D", "1W", "1M", "ALL"];

function formatUsd(value: number): string {
    if (!Number.isFinite(value)) return "$0.00";
    if (Math.abs(value) >= 1000) {
        return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatXAxisLabel(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Downsample data to at most maxPoints using LTTB-like bucket averaging */
function downsample(data: ChartPoint[], maxPoints: number): ChartPoint[] {
    if (data.length <= maxPoints) return data;
    const step = data.length / maxPoints;
    const result: ChartPoint[] = [data[0]];
    for (let i = 1; i < maxPoints - 1; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        let sumT = 0, sumV = 0, count = 0;
        for (let j = start; j < end && j < data.length; j++) {
            sumT += data[j].timestamp;
            sumV += data[j].value;
            count++;
        }
        if (count > 0) result.push({ timestamp: sumT / count, value: sumV / count });
    }
    result.push(data[data.length - 1]);
    return result;
}

/** Generate smooth cubic bezier SVG path through points */
function smoothPath(points: { x: number; y: number }[]): string {
    if (points.length < 2) return "";
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const tension = 0.3;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

function buildAreaPath(points: { x: number; y: number }[], linePath: string, baselineY: number): string {
    if (!linePath || points.length < 2) return "";
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return "";
    return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Redesigned Market Chart matching Figma node 1:7274 (Light Theme) */
export function MarketChartNative({
    data,
    color = "#34c759",
    activeRange = "ALL",
    onRangeChange,
    valueType = "probability",
    assetLabel,
}: MarketChartNativeProps) {
    const chartWidth = Dimensions.get("window").width - 16;
    const chartHeight = 200;
    const padding = { top: 20, right: 40, bottom: 20, left: 10 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const validData = (data ?? []).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value));
    if (validData.length === 0) {
        return (
            <View style={[styles.container, styles.emptyContainer]}>
                <Text style={styles.emptyText}>No chart data available</Text>
            </View>
        );
    }

    const sampled = downsample(validData, MAX_POINTS);
    const endVal = sampled[sampled.length - 1]?.value ?? 0;
    const values = sampled.map((point) => point.value);

    let yMin = 0;
    let yMax = 1;
    if (valueType === "price") {
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        if (Number.isFinite(rawMin) && Number.isFinite(rawMax)) {
            if (rawMin === rawMax) {
                const fallbackPadding = Math.max(rawMin * 0.005, 0.5);
                yMin = rawMin - fallbackPadding;
                yMax = rawMax + fallbackPadding;
            } else {
                const rawRange = rawMax - rawMin;
                const paddingValue = Math.max(rawRange * 0.1, rawMax * 0.001);
                yMin = rawMin - paddingValue;
                yMax = rawMax + paddingValue;
            }
        }
    }
    const yRange = Math.max(yMax - yMin, 1e-9);
    const n = sampled.length;

    const points = sampled.map((d, i) => {
        const x = padding.left + (i / Math.max(n - 1, 1)) * innerWidth;
        const y = padding.top + innerHeight - ((d.value - yMin) / yRange) * innerHeight;
        return { x, y };
    }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

    if (points.length === 0) {
        return (
            <View style={[styles.container, styles.emptyContainer]}>
                <Text style={styles.emptyText}>No chart data available</Text>
            </View>
        );
    }

    const pathD = smoothPath(points);
    const fallbackLinePath =
        points.length >= 1
            ? `M ${points[0].x} ${points[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y}`
            : "";
    const linePath = pathD || fallbackLinePath;
    const areaPath = buildAreaPath(points, linePath, padding.top + innerHeight);
    const lastPoint = points[points.length - 1];

    const gridFractions = [0, 0.25, 0.5, 0.75, 1];
    const startTs = sampled[0]?.timestamp ?? 0;
    const endTs = sampled[sampled.length - 1]?.timestamp ?? 0;
    const currentPrimaryText = valueType === "price" ? formatUsd(endVal) : `${Math.round(endVal * 100)}%`;
    const currentSecondaryText = valueType === "price" ? (assetLabel ?? "USD") : "chance";

    return (
        <View style={styles.container}>
            {/* Top Row: Price & Brand */}
            <View style={styles.headerRow}>
                <View style={styles.priceContainer}>
                    <Text style={styles.priceText}>{currentPrimaryText}</Text>
                    <Text style={styles.priceLabel}>{currentSecondaryText}</Text>
                </View>
                <View style={styles.brandContainer}>
                    <Image
                        source={require("../assets/logo.png")}
                        style={styles.brandLogo}
                        contentFit="contain"
                    />
                    <Text style={styles.brandText}>Perminal</Text>
                </View>
            </View>

            {/* SVG Chart Area */}
            <View style={styles.chartArea}>
                <Svg width={chartWidth} height={chartHeight}>
                    <Defs>
                        <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={color} stopOpacity={0.15} />
                            <Stop offset="1" stopColor={color} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>

                    {/* Grid Lines */}
                    {gridFractions.map((fraction) => {
                        const y = padding.top + innerHeight - fraction * innerHeight;
                        return (
                            <Line
                                key={fraction}
                                x1={padding.left}
                                y1={y}
                                x2={padding.left + innerWidth}
                                y2={y}
                                stroke="rgba(0,0,0,0.1)"
                                strokeWidth={1}
                                strokeDasharray="4, 4"
                            />
                        );
                    })}

                    {/* Area fill */}
                    {areaPath ? (
                        <Path
                            d={areaPath}
                            fill="url(#chartGradient)"
                        />
                    ) : null}

                    {/* Main line */}
                    {linePath ? (
                        <Path
                            d={linePath}
                            stroke={color}
                            strokeWidth={2.5}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ) : null}

                    {/* Current point dot */}
                    <Circle
                        cx={lastPoint.x}
                        cy={lastPoint.y}
                        r={4}
                        fill={color}
                    />
                </Svg>

                {/* Grid Labels Overlay */}
                <View style={styles.gridLabelsOverlay} pointerEvents="none">
                    {gridFractions.map((fraction) => {
                        const y = padding.top + innerHeight - fraction * innerHeight;
                        const rawValue = yMin + fraction * yRange;
                        const label = valueType === "price"
                            ? formatUsd(rawValue)
                            : `${Math.round(rawValue * 100)}%`;
                        return (
                            <Text key={`label-${fraction}`} style={[styles.gridLabel, { top: y - 8 }]}>
                                {label}
                            </Text>
                        );
                    })}
                </View>
            </View>

            {/* X-Axis labels */}
            <View style={styles.xAxisContainer}>
                <View style={styles.xAxisLine} />
                <View style={styles.xAxisLabels}>
                    <Text style={styles.xAxisText}>{formatXAxisLabel(startTs)}</Text>
                    <Text style={styles.xAxisText}>{formatXAxisLabel(endTs)}</Text>
                </View>
            </View>

            {/* Time Range Pills */}
            <View style={styles.rangeContainer}>
                {TIME_RANGES.map((range) => {
                    const isActive = range === activeRange;
                    return (
                        <Pressable
                            key={range}
                            onPress={() => onRangeChange?.(range)}
                            style={[styles.rangePill, isActive && styles.rangePillActive]}
                        >
                            <Text style={[styles.rangePillText, isActive && styles.rangePillTextActive]}>
                                {range}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        backgroundColor: "transparent",
        paddingVertical: 16,
    },
    emptyContainer: {
        height: 200,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f5f5f5",
        borderRadius: 12,
    },
    emptyText: {
        color: "#999",
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    priceContainer: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 4,
    },
    priceText: {
        fontSize: 28,
        fontWeight: "700",
        color: "#000",
    },
    priceLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#000",
    },
    brandContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        opacity: 0.25,
    },
    brandLogo: {
        width: 14,
        height: 14,
        tintColor: "#000",
    },
    brandText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#000",
    },
    chartArea: {
        position: 'relative',
    },
    gridLabelsOverlay: {
        ...StyleSheet.absoluteFillObject,
        left: undefined,
        right: 8,
        width: 72,
    },
    gridLabel: {
        position: 'absolute',
        right: 0,
        fontSize: 11,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    xAxisContainer: {
        marginTop: 4,
        paddingHorizontal: 16,
    },
    xAxisLine: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.1)",
        width: "100%",
    },
    xAxisLabels: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 4,
    },
    xAxisText: {
        fontSize: 12,
        fontWeight: "600",
        color: "rgba(0,0,0,0.3)",
        textAlign: "center",
        width: "50%",
    },
    rangeContainer: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 4,
        marginTop: 16,
        paddingHorizontal: 8,
    },
    rangePill: {
        minWidth: 54,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    rangePillActive: {
        backgroundColor: "#34c759",
        borderColor: "#34c759",
    },
    rangePillText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#000",
    },
    rangePillTextActive: {
        color: "#fff",
    },
});
