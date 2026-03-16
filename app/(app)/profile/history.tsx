import React from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useAuth } from "../../../hooks/useAuth";
import {
    useJupiterAccountHistory,
    type JupiterHistoryRange,
    type NormalizedJupiterHistoryItem,
} from "../../../hooks/useJupiterAccountHistory";

const HISTORY_RANGES: JupiterHistoryRange[] = ["30D", "90D", "ALL"];

function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatSignedUsd(item: NormalizedJupiterHistoryItem): string {
    if (item.type === "claim" && typeof item.claimUsd === "number") {
        return `+$${item.claimUsd.toFixed(2)}`;
    }

    if (typeof item.grossUsd === "number") {
        const sign = item.side === "buy" ? "-" : item.side === "sell" ? "+" : "";
        return `${sign}$${item.grossUsd.toFixed(2)}`;
    }

    if (typeof item.feesUsd === "number" && item.feesUsd > 0) {
        return `-$${item.feesUsd.toFixed(2)}`;
    }

    return "—";
}

function buildSubtitle(item: NormalizedJupiterHistoryItem): string {
    if (item.type === "claim") return "Claim";

    if (item.side && item.outcome) {
        return `${item.side === "buy" ? "Buy" : "Sell"} ${item.outcome}`;
    }

    if (item.message) return item.message;
    return item.type === "trade" ? "Trade" : "Activity";
}

function HistoryRow({
    item,
    onPress,
}: {
    item: NormalizedJupiterHistoryItem;
    onPress?: () => void;
}) {
    const valueText = formatSignedUsd(item);
    const isNegative = valueText.startsWith("-");

    return (
        <Pressable style={styles.row} onPress={onPress}>
            <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {buildSubtitle(item)}
                </Text>
            </View>
            <View style={styles.rowMeta}>
                <Text style={[styles.rowValue, isNegative ? styles.rowValueNegative : styles.rowValuePositive]}>
                    {valueText}
                </Text>
                <Text style={styles.rowTimestamp}>{formatTimestamp(item.timestamp)}</Text>
            </View>
        </Pressable>
    );
}

export default function ProfileHistoryScreen() {
    const router = useRouter();
    const { activeWallet } = useAuth();
    const {
        error,
        isLoading,
        items,
        range,
        refresh,
        setRange,
    } = useJupiterAccountHistory(activeWallet?.address ?? null);

    const emptyText = activeWallet?.address
        ? "No account history in this range."
        : "Connect a Solana wallet to view Jupiter account history.";

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={20} color="#000" strokeWidth={2} />
                </Pressable>
                <Text style={styles.headerTitle}>History</Text>
                <View style={styles.headerSpacer} />
            </View>

            <View style={styles.rangeRow}>
                {HISTORY_RANGES.map((option) => {
                    const isActive = option === range;
                    return (
                        <Pressable
                            key={option}
                            onPress={() => setRange(option)}
                            style={[styles.rangePill, isActive && styles.rangePillActive]}
                        >
                            <Text style={[styles.rangePillText, isActive && styles.rangePillTextActive]}>
                                {option}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {isLoading && items.length === 0 ? (
                <View style={styles.centerState}>
                    <ActivityIndicator color="#34c759" />
                </View>
            ) : error ? (
                <View style={styles.centerState}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : (
                // @ts-ignore
                <FlashList
                    data={items}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <HistoryRow
                            item={item}
                            onPress={item.marketId ? () => router.push({
                                pathname: "/market/[id]",
                                params: { id: item.marketId!, single: "true" },
                            }) : undefined}
                        />
                    )}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    // @ts-expect-error FlashList types missing estimatedItemSize in this RN version
                    estimatedItemSize={76}
                    contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.centerState}>
                            <Text style={styles.emptyText}>{emptyText}</Text>
                        </View>
                    }
                    refreshing={isLoading}
                    onRefresh={refresh}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f9f9f9",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    headerTitle: {
        color: "#000",
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: -0.4,
    },
    headerSpacer: {
        width: 36,
    },
    rangeRow: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    rangePill: {
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.12)",
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
    },
    rangePillActive: {
        backgroundColor: "#34c759",
        borderColor: "#34c759",
    },
    rangePillText: {
        color: "#111",
        fontSize: 13,
        fontWeight: "700",
    },
    rangePillTextActive: {
        color: "#fff",
    },
    listContent: {
        paddingHorizontal: 12,
        paddingBottom: 40,
    },
    emptyContainer: {
        flexGrow: 1,
        paddingHorizontal: 24,
    },
    row: {
        minHeight: 76,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    rowBody: {
        flex: 1,
        gap: 4,
    },
    rowTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    rowSubtitle: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 13,
        fontWeight: "600",
    },
    rowMeta: {
        alignItems: "flex-end",
        gap: 4,
    },
    rowValue: {
        fontSize: 14,
        fontWeight: "700",
    },
    rowValuePositive: {
        color: "#34c759",
    },
    rowValueNegative: {
        color: "#ef4444",
    },
    rowTimestamp: {
        color: "rgba(0,0,0,0.45)",
        fontSize: 12,
        fontWeight: "600",
    },
    separator: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.08)",
    },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyText: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 20,
    },
    errorText: {
        color: "#ef4444",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 20,
    },
});
