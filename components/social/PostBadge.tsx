import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface PostBadgeProps {
    type: string;
    pnl?: number;
}

export function PostBadge({ type, pnl }: PostBadgeProps) {
    const isPosition = type.toLowerCase() === 'trade' || type.toLowerCase() === 'position';
    const isThesis = type.toLowerCase() === 'thesis';

    let label = type.charAt(0).toUpperCase() + type.slice(1);
    if (isPosition) label = "Position";
    if (isThesis) label = "Thesis";

    return (
        <View style={styles.container}>
            <View style={[
                styles.badge,
                isPosition && styles.positionBadge,
                isThesis && styles.thesisBadge
            ]}>
                <Text style={[
                    styles.badgeText,
                    isPosition && styles.positionBadgeText,
                    isThesis && styles.thesisBadgeText
                ]}>
                    {label}
                </Text>
            </View>
            {isPosition && pnl !== undefined && (
                <Text style={[styles.pnlText, { color: pnl >= 0 ? '#22c55e' : '#ef4444' }]}>
                    {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}%
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: "#2b2b2b",
    },
    badgeText: {
        fontSize: 12,
        fontWeight: "800",
        color: "#fff",
    },
    positionBadge: {
        backgroundColor: "rgba(59, 130, 246, 0.2)",
    },
    positionBadgeText: {
        color: "#3b82f6",
    },
    thesisBadge: {
        backgroundColor: "rgba(107, 114, 128, 0.2)",
    },
    thesisBadgeText: {
        color: "#9ca3af",
    },
    pnlText: {
        fontSize: 14,
        fontWeight: "900",
    },
});
