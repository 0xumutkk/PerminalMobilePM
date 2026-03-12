import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Dimensions, Text, Pressable } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle } from "react-native-svg";
import { Image } from "expo-image";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type ChartPoint } from "../lib/mock-data";

export type ChartValueType = "probability" | "price";

export interface MarketChartLineSeries {
    key: string;
    label?: string;
    color: string;
    data: ChartPoint[];
}

export interface MarketChartNativeProps {
    data: ChartPoint[];
    color?: string;
    series?: MarketChartLineSeries[];
    activeRange?: string;
    onRangeChange?: (range: string) => void;
    valueType?: ChartValueType;
    assetLabel?: string;
    headlineValue?: number;
}

const MAX_POINTS = 60;
const AXIS_LABEL_WIDTH = 74;
const SCRUB_TOOLTIP_WIDTH = 156;
const SCRUB_TOOLTIP_HEIGHT = 76;
const SCRUB_DOT_SIZE = 12;
const TIME_RANGES = ["1H", "6H", "1D", "1W", "1M", "ALL"] as const;

interface ScreenPoint {
    x: number;
    y: number;
}

interface SeriesGeometry {
    key: string;
    label?: string;
    color: string;
    sampled: ChartPoint[];
    screenPoints: ScreenPoint[];
}

interface InterpolatedPoint {
    x: number;
    y: number;
    timestamp: number;
    value: number;
}

interface ScrubSelection {
    seriesKey: string;
    label?: string;
    color: string;
    x: number;
    y: number;
    timestamp: number;
    value: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function formatUsd(value: number): string {
    if (!Number.isFinite(value)) return "$0.00";
    if (Math.abs(value) >= 1000) {
        return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatXAxisLabel(timestamp: number, activeRange: string, totalSpanMs: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "--";

    if (activeRange === "1H" || activeRange === "6H") {
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    if (activeRange === "1D") {
        return date.toLocaleString("en-US", { weekday: "short", hour: "numeric" });
    }

    if (activeRange === "1W" || activeRange === "1M") {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString("en-US", totalSpanMs > 120 * 24 * 60 * 60 * 1000
        ? { month: "short", year: "2-digit" }
        : { month: "short", day: "numeric" });
}

function formatTooltipValue(value: number, valueType: ChartValueType): string {
    if (valueType === "price") return formatUsd(value);
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function formatTooltipTimestamp(timestamp: number, activeRange: string): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "--";

    if (activeRange === "1H" || activeRange === "6H" || activeRange === "1D") {
        return date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    if (activeRange === "ALL") {
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function buildTickTimestamps(startTs: number, endTs: number, count: number): number[] {
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs <= 0 || endTs <= 0) return [];
    if (count <= 1 || startTs === endTs) return [startTs];

    return Array.from({ length: count }, (_, index) => {
        const progress = index / Math.max(count - 1, 1);
        return startTs + (endTs - startTs) * progress;
    });
}

function getXPosition(
    timestamp: number,
    index: number,
    totalPoints: number,
    paddingLeft: number,
    innerWidth: number,
    startTs: number,
    endTs: number
): number {
    const timeRange = endTs - startTs;

    if (Number.isFinite(timestamp) && Number.isFinite(startTs) && Number.isFinite(endTs) && timeRange > 0) {
        const ratio = Math.max(0, Math.min(1, (timestamp - startTs) / timeRange));
        return paddingLeft + ratio * innerWidth;
    }

    if (totalPoints <= 1) {
        return paddingLeft + innerWidth;
    }

    return paddingLeft + (index / Math.max(totalPoints - 1, 1)) * innerWidth;
}

function downsample(data: ChartPoint[], maxPoints: number): ChartPoint[] {
    if (data.length <= maxPoints) return data;
    const step = data.length / maxPoints;
    const result: ChartPoint[] = [data[0]];
    for (let i = 1; i < maxPoints - 1; i++) {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        let sumT = 0;
        let sumV = 0;
        let count = 0;
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

function interpolateSeriesAtX(series: SeriesGeometry, targetX: number): InterpolatedPoint | null {
    const { screenPoints, sampled } = series;
    if (screenPoints.length === 0 || sampled.length === 0) return null;

    if (screenPoints.length === 1 || sampled.length === 1) {
        return {
            x: screenPoints[0].x,
            y: screenPoints[0].y,
            timestamp: sampled[0].timestamp,
            value: sampled[0].value,
        };
    }

    const firstX = screenPoints[0].x;
    const lastX = screenPoints[screenPoints.length - 1].x;
    const clampedX = clamp(targetX, Math.min(firstX, lastX), Math.max(firstX, lastX));

    for (let index = 0; index < screenPoints.length - 1; index++) {
        const currentPoint = screenPoints[index];
        const nextPoint = screenPoints[index + 1];
        const currentSample = sampled[index];
        const nextSample = sampled[index + 1];
        const minX = Math.min(currentPoint.x, nextPoint.x);
        const maxX = Math.max(currentPoint.x, nextPoint.x);

        if (clampedX < minX || clampedX > maxX) continue;

        const xRange = nextPoint.x - currentPoint.x;
        if (Math.abs(xRange) < 1e-6) {
            return Math.abs(clampedX - currentPoint.x) <= Math.abs(clampedX - nextPoint.x)
                ? {
                    x: currentPoint.x,
                    y: currentPoint.y,
                    timestamp: currentSample.timestamp,
                    value: currentSample.value,
                }
                : {
                    x: nextPoint.x,
                    y: nextPoint.y,
                    timestamp: nextSample.timestamp,
                    value: nextSample.value,
                };
        }

        const ratio = (clampedX - currentPoint.x) / xRange;
        return {
            x: clampedX,
            y: currentPoint.y + (nextPoint.y - currentPoint.y) * ratio,
            timestamp: currentSample.timestamp + (nextSample.timestamp - currentSample.timestamp) * ratio,
            value: currentSample.value + (nextSample.value - currentSample.value) * ratio,
        };
    }

    const fallbackIndex = Math.abs(clampedX - firstX) <= Math.abs(clampedX - lastX) ? 0 : screenPoints.length - 1;
    return {
        x: screenPoints[fallbackIndex].x,
        y: screenPoints[fallbackIndex].y,
        timestamp: sampled[fallbackIndex].timestamp,
        value: sampled[fallbackIndex].value,
    };
}

function toScreenPoints(
    sampled: ChartPoint[],
    padding: { top: number; right: number; bottom: number; left: number },
    innerWidth: number,
    innerHeight: number,
    yMin: number,
    yRange: number,
    startTs: number,
    endTs: number
): { x: number; y: number }[] {
    const n = sampled.length;
    return sampled
        .map((d, i) => {
            const x = getXPosition(d.timestamp, i, n, padding.left, innerWidth, startTs, endTs);
            const y = padding.top + innerHeight - ((d.value - yMin) / yRange) * innerHeight;
            return { x, y };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function MarketChartNative({
    data,
    color = "#34c759",
    series = [],
    activeRange = "ALL",
    onRangeChange,
    valueType = "probability",
    assetLabel,
    headlineValue,
}: MarketChartNativeProps) {
    const chartWidth = Dimensions.get("window").width - 16;
    const chartHeight = 200;
    const padding = { top: 20, right: 40, bottom: 20, left: 10 };
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const validData = (data ?? []).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value));
    const validSeries = (series ?? [])
        .map((item) => ({
            ...item,
            data: (item.data ?? []).filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value)),
        }))
        .filter((item) => item.data.length > 0);

    const clusteredMode = validSeries.length > 1;
    const singleSource =
        validSeries.length === 1 && validData.length === 0
            ? validSeries[0].data
            : validData;
    const showEmptyState = !clusteredMode && singleSource.length === 0;

    const sampledSingle = downsample(singleSource, MAX_POINTS);
    const sampledSeries = validSeries.map((item) => ({
        ...item,
        sampled: downsample(item.data, MAX_POINTS),
    }));

    const clusterAllPoints = sampledSeries.flatMap((item) => item.sampled);
    const values = clusteredMode
        ? clusterAllPoints.map((point) => point.value)
        : sampledSingle.map((point) => point.value);

    const startTs = clusteredMode
        ? Math.min(...clusterAllPoints.map((point) => point.timestamp))
        : (sampledSingle[0]?.timestamp ?? 0);
    const endTs = clusteredMode
        ? Math.max(...clusterAllPoints.map((point) => point.timestamp))
        : (sampledSingle[sampledSingle.length - 1]?.timestamp ?? 0);

    let yMin = 0;
    let yMax = 1;

    // For clusteredMode, valueType is almost always probability. The only time we do dynamic yMin/yMax is if valueType === "price".
    // Wait, let's just make it always dynamic if it's "price", else probability 0..1.
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
    const gridFractions = [0, 0.25, 0.5, 0.75, 1];
    const timeSpanMs = Math.max(endTs - startTs, 0);
    const xAxisTicks = buildTickTimestamps(startTs, endTs, clusteredMode ? 3 : 2).map((timestamp, index, all) => ({
        key: `${timestamp}-${index}`,
        timestamp,
        x: getXPosition(timestamp, index, all.length, padding.left, innerWidth, startTs, endTs),
        label: formatXAxisLabel(timestamp, activeRange, timeSpanMs),
    }));

    const singlePoints = toScreenPoints(sampledSingle, padding, innerWidth, innerHeight, yMin, yRange, startTs, endTs);
    const singlePath = smoothPath(singlePoints);
    const singleFallback = (() => {
        if (singlePoints.length === 0) return "";
        if (singlePoints.length === 1) {
            return `M ${padding.left} ${singlePoints[0].y} L ${padding.left + innerWidth} ${singlePoints[0].y}`;
        }
        return `M ${singlePoints[0].x} ${singlePoints[0].y} L ${singlePoints[singlePoints.length - 1].x} ${singlePoints[singlePoints.length - 1].y}`;
    })();
    const linePath = singlePath || singleFallback;
    const areaPath = buildAreaPath(singlePoints, linePath, padding.top + innerHeight);
    const lastPoint = singlePoints[singlePoints.length - 1];
    const singleGeometry: SeriesGeometry | null = showEmptyState
        ? null
        : {
            key: validSeries.length === 1 && validData.length === 0 ? validSeries[0].key : "primary",
            label: validSeries.length === 1 && validData.length === 0 ? validSeries[0].label : undefined,
            color,
            sampled: sampledSingle,
            screenPoints: singlePoints,
        };

    const clusteredGeometries: SeriesGeometry[] = sampledSeries.map((item) => ({
        key: item.key,
        label: item.label,
        color: item.color,
        sampled: item.sampled,
        screenPoints: toScreenPoints(item.sampled, padding, innerWidth, innerHeight, yMin, yRange, startTs, endTs),
    }));

    const clusteredPaths = clusteredGeometries.map((item) => {
        const points = item.screenPoints;
        const pathD = smoothPath(points);
        const fallback = (() => {
            if (points.length === 0) return "";
            if (points.length === 1) {
                return `M ${padding.left} ${points[0].y} L ${padding.left + innerWidth} ${points[0].y}`;
            }
            return `M ${points[0].x} ${points[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
        })();
        return {
            key: item.key,
            color: item.color,
            path: pathD || fallback,
            last: points[points.length - 1],
        };
    });

    const endVal = (clusteredMode ? clusterAllPoints : sampledSingle)[(clusteredMode ? clusterAllPoints : sampledSingle).length - 1]?.value ?? 0;
    const displayValue = typeof headlineValue === "number" && Number.isFinite(headlineValue)
        ? headlineValue
        : endVal;
    const currentPrimaryText = valueType === "price" ? formatUsd(displayValue) : `${Math.round(displayValue * 100)}%`;
    const currentSecondaryText = valueType === "price" ? (assetLabel ?? "USD") : "chance";
    const scrubDataSignature = clusteredMode
        ? sampledSeries.map((item) => `${item.key}:${item.sampled.length}:${item.sampled[item.sampled.length - 1]?.timestamp ?? 0}`).join("|")
        : `${sampledSingle.length}:${sampledSingle[sampledSingle.length - 1]?.timestamp ?? 0}`;
    const [scrubSelection, setScrubSelection] = useState<ScrubSelection | null>(null);
    const scrubX = useSharedValue(0);
    const scrubY = useSharedValue(0);
    const scrubTooltipX = useSharedValue(0);
    const scrubTooltipY = useSharedValue(0);
    const scrubOpacity = useSharedValue(0);
    const lastSelectionKeyRef = useRef<string | null>(null);
    const lockedScrubSeriesKeyRef = useRef<string | null>(null);

    const clearScrub = () => {
        scrubOpacity.value = withTiming(0, { duration: 100 });
        lastSelectionKeyRef.current = null;
        lockedScrubSeriesKeyRef.current = null;
        setScrubSelection(null);
    };

    useEffect(() => {
        scrubOpacity.value = 0;
        lastSelectionKeyRef.current = null;
        lockedScrubSeriesKeyRef.current = null;
        setScrubSelection(null);
    }, [activeRange, clusteredMode, endTs, scrubDataSignature, scrubOpacity, showEmptyState, startTs]);

    const updateScrubSelection = (touchX: number, touchY: number) => {
        if (showEmptyState) return;

        const clampedX = clamp(touchX, padding.left, padding.left + innerWidth);
        const clampedY = clamp(touchY, padding.top, padding.top + innerHeight);

        let nextSelection: ScrubSelection | null = null;

        if (clusteredMode) {
            const lockedGeometry = lockedScrubSeriesKeyRef.current
                ? clusteredGeometries.find((geometry) => geometry.key === lockedScrubSeriesKeyRef.current) ?? null
                : null;

            if (lockedGeometry) {
                const interpolated = interpolateSeriesAtX(lockedGeometry, clampedX);
                if (interpolated) {
                    nextSelection = {
                        seriesKey: lockedGeometry.key,
                        label: lockedGeometry.label,
                        color: lockedGeometry.color,
                        x: interpolated.x,
                        y: interpolated.y,
                        timestamp: interpolated.timestamp,
                        value: interpolated.value,
                    };
                }
            }

            if (!nextSelection) {
            let nearestMatch: { geometry: SeriesGeometry; interpolated: InterpolatedPoint; distance: number } | null = null;

                for (const geometry of clusteredGeometries) {
                    const interpolated = interpolateSeriesAtX(geometry, clampedX);
                    if (!interpolated) continue;
                    const distance = Math.abs(interpolated.y - clampedY);
                    if (!nearestMatch || distance < nearestMatch.distance) {
                        nearestMatch = { geometry, interpolated, distance };
                    }
                }

                if (nearestMatch) {
                    lockedScrubSeriesKeyRef.current = nearestMatch.geometry.key;
                    nextSelection = {
                        seriesKey: nearestMatch.geometry.key,
                        label: nearestMatch.geometry.label,
                        color: nearestMatch.geometry.color,
                        x: nearestMatch.interpolated.x,
                        y: nearestMatch.interpolated.y,
                        timestamp: nearestMatch.interpolated.timestamp,
                        value: nearestMatch.interpolated.value,
                    };
                }
            }
        } else if (singleGeometry) {
            const interpolated = interpolateSeriesAtX(singleGeometry, clampedX);
            if (interpolated) {
                nextSelection = {
                    seriesKey: singleGeometry.key,
                    label: singleGeometry.label,
                    color: singleGeometry.color,
                    x: interpolated.x,
                    y: interpolated.y,
                    timestamp: interpolated.timestamp,
                    value: interpolated.value,
                };
            }
        }

        if (!nextSelection) {
            clearScrub();
            return;
        }

        scrubX.value = nextSelection.x;
        scrubY.value = nextSelection.y;
        scrubTooltipX.value = clamp(
            nextSelection.x > chartWidth - SCRUB_TOOLTIP_WIDTH - 16
                ? nextSelection.x - SCRUB_TOOLTIP_WIDTH - 12
                : nextSelection.x + 12,
            8,
            Math.max(chartWidth - SCRUB_TOOLTIP_WIDTH - 8, 8)
        );
        scrubTooltipY.value = clamp(
            nextSelection.y < 64
                ? nextSelection.y + 14
                : nextSelection.y - SCRUB_TOOLTIP_HEIGHT - 12,
            8,
            Math.max(chartHeight - SCRUB_TOOLTIP_HEIGHT - 8, 8)
        );
        scrubOpacity.value = withTiming(1, { duration: 100 });

        const selectionKey = `${nextSelection.seriesKey}:${Math.round(nextSelection.timestamp / 1000)}:${Math.round(nextSelection.value * 1000)}`;
        if (lastSelectionKeyRef.current !== selectionKey) {
            lastSelectionKeyRef.current = selectionKey;
            setScrubSelection(nextSelection);
        }
    };

    const scrubGesture = Gesture.Pan()
        .enabled(!showEmptyState)
        .maxPointers(1)
        .activateAfterLongPress(180)
        .shouldCancelWhenOutside(false)
        .onStart((event) => {
            runOnJS(updateScrubSelection)(event.x, event.y);
        })
        .onUpdate((event) => {
            runOnJS(updateScrubSelection)(event.x, event.y);
        })
        .onFinalize(() => {
            runOnJS(clearScrub)();
        });

    const scrubGuideStyle = useAnimatedStyle(() => ({
        opacity: scrubOpacity.value,
        left: scrubX.value,
    }));

    const scrubDotStyle = useAnimatedStyle(() => ({
        opacity: scrubOpacity.value,
        left: scrubX.value - SCRUB_DOT_SIZE / 2,
        top: scrubY.value - SCRUB_DOT_SIZE / 2,
    }));

    const scrubTooltipStyle = useAnimatedStyle(() => ({
        opacity: scrubOpacity.value,
        left: scrubTooltipX.value,
        top: scrubTooltipY.value,
    }));

    if (showEmptyState) {
        return (
            <View style={[styles.container, styles.emptyContainer]}>
                <Text style={styles.emptyText}>No chart data available</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {!clusteredMode ? (
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
            ) : null}

            <GestureDetector gesture={scrubGesture}>
                <View style={[styles.chartArea, clusteredMode && styles.clusterChartArea]}>
                    <Svg width={chartWidth} height={chartHeight}>
                        <Defs>
                            <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor={color} stopOpacity={0.15} />
                                <Stop offset="1" stopColor={color} stopOpacity={0} />
                            </LinearGradient>
                        </Defs>

                        {clusteredMode
                            ? xAxisTicks
                                .slice(1, -1)
                                .map((tick) => (
                                    <Line
                                        key={`vertical-${tick.key}`}
                                        x1={tick.x}
                                        y1={padding.top}
                                        x2={tick.x}
                                        y2={padding.top + innerHeight}
                                        stroke="rgba(0,0,0,0.08)"
                                        strokeWidth={1}
                                        strokeDasharray="3, 8"
                                    />
                                ))
                            : null}

                        {gridFractions.map((fraction) => {
                            const y = padding.top + innerHeight - fraction * innerHeight;
                            const isMidline = fraction === 0.5;
                            return (
                                <Line
                                    key={fraction}
                                    x1={padding.left}
                                    y1={y}
                                    x2={padding.left + innerWidth}
                                    y2={y}
                                    stroke={
                                        clusteredMode
                                            ? (isMidline ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.08)")
                                            : "rgba(0,0,0,0.1)"
                                    }
                                    strokeWidth={1}
                                    strokeDasharray={clusteredMode ? (isMidline ? "3, 6" : "2, 8") : "4, 4"}
                                />
                            );
                        })}

                        {!clusteredMode && areaPath ? (
                            <Path d={areaPath} fill="url(#chartGradient)" />
                        ) : null}

                        {clusteredMode
                            ? clusteredPaths.map((item) => (
                                <React.Fragment key={item.key}>
                                    {item.path ? (
                                        <>
                                            <Path
                                                d={item.path}
                                                stroke={item.color}
                                                strokeOpacity={0.14}
                                                strokeWidth={6.5}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            <Path
                                                d={item.path}
                                                stroke={item.color}
                                                strokeWidth={2.8}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </>
                                    ) : null}
                                    {item.last ? (
                                        <>
                                            <Circle cx={item.last.x} cy={item.last.y} r={4.2} fill="#FFFFFF" opacity={0.92} />
                                            <Circle cx={item.last.x} cy={item.last.y} r={3.2} fill={item.color} />
                                        </>
                                    ) : null}
                                </React.Fragment>
                            ))
                            : (
                                <>
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
                                    {lastPoint ? <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={color} /> : null}
                                </>
                            )}
                    </Svg>

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

                    {scrubSelection ? (
                        <View style={styles.scrubOverlay} pointerEvents="none">
                            <Animated.View style={[styles.scrubGuide, scrubGuideStyle, { top: padding.top, height: innerHeight }]} />
                            <Animated.View style={[styles.scrubDot, scrubDotStyle]}>
                                <View style={[styles.scrubDotInner, { backgroundColor: scrubSelection.color }]} />
                            </Animated.View>
                            <Animated.View style={[styles.scrubTooltip, scrubTooltipStyle]}>
                                {clusteredMode && scrubSelection.label ? (
                                    <View style={styles.scrubTooltipSeriesRow}>
                                        <View style={[styles.scrubTooltipSwatch, { backgroundColor: scrubSelection.color }]} />
                                        <Text style={styles.scrubTooltipSeriesText} numberOfLines={1}>
                                            {scrubSelection.label}
                                        </Text>
                                    </View>
                                ) : null}
                                <Text style={styles.scrubTooltipValue}>
                                    {formatTooltipValue(scrubSelection.value, valueType)}
                                </Text>
                                <Text style={styles.scrubTooltipTimestamp}>
                                    {formatTooltipTimestamp(scrubSelection.timestamp, activeRange)}
                                </Text>
                            </Animated.View>
                        </View>
                    ) : null}
                </View>
            </GestureDetector>

            <View style={[styles.xAxisContainer, { width: chartWidth }]}>
                <View style={[styles.xAxisLine, clusteredMode && styles.clusterAxisLine]} />
                <View style={styles.xAxisLabels}>
                    {xAxisTicks.map((tick) => (
                        <React.Fragment key={`axis-${tick.key}`}>
                            <View style={[styles.xAxisTickMarker, clusteredMode && styles.clusterAxisTickMarker, { left: tick.x }]} />
                            <Text
                                style={[
                                    styles.xAxisText,
                                    styles.xAxisTickText,
                                    clusteredMode && styles.clusterAxisText,
                                    {
                                        left: Math.min(
                                            Math.max(tick.x - AXIS_LABEL_WIDTH / 2, 0),
                                            Math.max(chartWidth - AXIS_LABEL_WIDTH, 0)
                                        ),
                                    },
                                ]}
                            >
                                {tick.label}
                            </Text>
                        </React.Fragment>
                    ))}
                </View>
            </View>

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
        position: "relative",
        alignSelf: "center",
    },
    clusterChartArea: {
        backgroundColor: "#ffffff",
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(17,24,39,0.06)",
        shadowColor: "#0f172a",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
    },
    gridLabelsOverlay: {
        ...StyleSheet.absoluteFillObject,
        left: undefined,
        right: 8,
        width: 72,
    },
    gridLabel: {
        position: "absolute",
        right: 0,
        fontSize: 11,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    scrubOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    scrubGuide: {
        position: "absolute",
        width: 1,
        marginLeft: -0.5,
        backgroundColor: "rgba(15,23,42,0.18)",
    },
    scrubDot: {
        position: "absolute",
        width: SCRUB_DOT_SIZE,
        height: SCRUB_DOT_SIZE,
        borderRadius: SCRUB_DOT_SIZE / 2,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#0f172a",
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    scrubDotInner: {
        width: SCRUB_DOT_SIZE - 4,
        height: SCRUB_DOT_SIZE - 4,
        borderRadius: (SCRUB_DOT_SIZE - 4) / 2,
    },
    scrubTooltip: {
        position: "absolute",
        width: SCRUB_TOOLTIP_WIDTH,
        minHeight: SCRUB_TOOLTIP_HEIGHT,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "rgba(15,23,42,0.94)",
        justifyContent: "center",
    },
    scrubTooltipSeriesRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
    },
    scrubTooltipSwatch: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    scrubTooltipSeriesText: {
        flex: 1,
        fontSize: 11,
        fontWeight: "600",
        color: "rgba(255,255,255,0.78)",
    },
    scrubTooltipValue: {
        fontSize: 16,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    scrubTooltipTimestamp: {
        marginTop: 2,
        fontSize: 11,
        fontWeight: "500",
        color: "rgba(255,255,255,0.72)",
    },
    xAxisContainer: {
        marginTop: 4,
        alignSelf: "center",
    },
    xAxisLine: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.1)",
        width: "100%",
    },
    clusterAxisLine: {
        backgroundColor: "rgba(0,0,0,0.08)",
    },
    xAxisLabels: {
        position: "relative",
        height: 32,
        marginTop: 6,
    },
    xAxisText: {
        fontSize: 12,
        fontWeight: "600",
        color: "rgba(0,0,0,0.3)",
        textAlign: "center",
    },
    xAxisTickText: {
        position: "absolute",
        top: 10,
        width: AXIS_LABEL_WIDTH,
    },
    xAxisTickMarker: {
        position: "absolute",
        top: 0,
        width: 1,
        height: 8,
        marginLeft: -0.5,
        backgroundColor: "rgba(0,0,0,0.14)",
    },
    clusterAxisText: {
        color: "rgba(15,23,42,0.48)",
    },
    clusterAxisTickMarker: {
        backgroundColor: "rgba(0,0,0,0.14)",
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
