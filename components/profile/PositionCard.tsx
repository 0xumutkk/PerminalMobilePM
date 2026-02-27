import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Position } from "../../hooks/usePositions";

interface PositionCardProps {
    position: Position;
    onPress?: () => void;
}

function formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatShares(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function PositionCard({ position, onPress }: PositionCardProps) {
    const isPositive = position.pnl >= 0;
    const sideLabel = position.side === "YES" ? "Yes" : "No";
    const sideBadgeStyle = position.side === "YES" ? styles.yesBg : styles.noBg;
    const cents = Math.round(position.currentPrice * 100);

    return (
        <Pressable style={styles.container} onPress={onPress}>
            <Image
                source={position.imageUrl ? { uri: position.imageUrl } : null}
                style={styles.image}
            />
            <View style={styles.contentWrapper}>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                    <View style={styles.details}>
                        <Text style={styles.title} numberOfLines={1}>{position.marketTitle}</Text>
                        <View style={styles.subDetail}>
                            <Text style={styles.subText}>{formatShares(position.amount)}</Text>
                            <View style={[styles.sideBadge, sideBadgeStyle]}>
                                <Text style={styles.sideText}>{sideLabel}</Text>
                            </View>
                            <Text style={styles.subText}>Shares at {cents}¢</Text>
                        </View>
                    </View>

                    <View style={styles.rightSide}>
                        <Text style={styles.valueText}>
                            ${formatCompactNumber(position.currentValue)}
                        </Text>
                        <Text style={[styles.pnlText, isPositive ? styles.pnlPositive : styles.pnlNegative]}>
                            {isPositive ? "+" : "-"}${Math.abs(position.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                    </View>
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 12,
    },
    image: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    contentWrapper: {
        flex: 1,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
    },
    details: {
        flex: 1,
        gap: 8,
    },
    title: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
        flexShrink: 1,
    },
    subDetail: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    subText: {
        color: "#000",
        fontSize: 12,
        fontWeight: "600",
        opacity: 0.5,
    },
    sideBadge: {
        borderRadius: 12.632,
        paddingHorizontal: 4.737,
        paddingVertical: 1.579,
        alignItems: "center",
        justifyContent: "center",
    },
    yesBg: {
        backgroundColor: "#3bbf5c",
    },
    noBg: {
        backgroundColor: "#ff3b30",
    },
    sideText: {
        color: "#fff",
        fontSize: 9.5,
        fontWeight: "700",
    },
    rightSide: {
        alignItems: "flex-end",
        gap: 8,
    },
    valueText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
    },
    pnlText: {
        fontSize: 12,
        fontWeight: "600",
        opacity: 0.5,
    },
    pnlPositive: {
        color: "#34c759",
    },
    pnlNegative: {
        color: "#ff3b30",
    },
});
