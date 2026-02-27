import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";

interface TradeBarProps {
    avgEntry: number;
    currentPrice: number;
    sharesCount: string;
    totalValue: string;
    onTradePress?: () => void;
}

export function TradeBar({ avgEntry, currentPrice, sharesCount, totalValue, onTradePress }: TradeBarProps) {
    return (
        <View style={styles.container}>
            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Text style={styles.label}>Avg. Entry</Text>
                    <Text style={styles.value}>{(avgEntry * 100).toFixed(0)}¢</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.label}>Current Price</Text>
                    <Text style={styles.value}>{(currentPrice * 100).toFixed(0)}¢</Text>
                </View>

                <View style={[styles.statItem, { marginLeft: 'auto' }]}>
                    <Text style={[styles.value, styles.sharesValue]}>{sharesCount} Shares</Text>
                    <Text style={[styles.value, styles.dollarValue]}>${totalValue}</Text>
                </View>
            </View>

            <View style={styles.footerRow}>
                <View style={styles.avatarStack}>
                    <Image source="https://api.dicebear.com/7.x/avataaars/svg?seed=1" style={styles.miniAvatar} />
                    <Image source="https://api.dicebear.com/7.x/avataaars/svg?seed=2" style={[styles.miniAvatar, { marginLeft: -12 }]} />
                    <View style={styles.avatarMore}>
                        <Text style={styles.avatarMoreText}>+14</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.tradeButton} onPress={onTradePress}>
                    <Text style={styles.tradeButtonText}>Trade</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#0088ff", // Bright blue as in the mockup
        borderRadius: 16,
        padding: 16,
        overflow: "hidden",
        marginTop: -16, // To overlap with the market card slightly or sit flush
        zIndex: 1,
    },
    statsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
        gap: 20,
    },
    statItem: {
        gap: 2,
    },
    label: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        fontWeight: "700",
    },
    value: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
    },
    sharesValue: {
        fontSize: 16,
        textAlign: 'right',
    },
    dollarValue: {
        fontSize: 20,
        textAlign: 'right',
    },
    footerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    avatarStack: {
        flexDirection: "row",
        alignItems: "center",
    },
    miniAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: "#0088ff",
    },
    avatarMore: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.2)",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: -12,
        borderWidth: 2,
        borderColor: "#0088ff",
    },
    avatarMoreText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "800",
    },
    tradeButton: {
        backgroundColor: "#111",
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 12,
    },
    tradeButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "900",
    },
});
