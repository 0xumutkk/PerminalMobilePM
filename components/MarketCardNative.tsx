import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { type Market, type MarketGroup } from "../lib/mock-data";
import { useRouter } from "expo-router";
import { ArrowUpCircle, Clock } from "lucide-react-native";

export interface MarketCardNativeProps {
    group: MarketGroup;
    nowMs?: number;
    onBuyYes?: (market: Market) => void;
    onBuyNo?: (market: Market) => void;
}

function formatVolume(volume: number) {
    if (volume <= 0) return "$0 Vol.";
    if (volume < 1) return "<$1 Vol.";
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M Vol.`;
    if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}k Vol.`;
    return `$${Math.round(volume).toLocaleString("en-US")} Vol.`;
}

export function MarketCardNative({ group, nowMs, onBuyYes, onBuyNo }: MarketCardNativeProps) {
    const router = useRouter();
    const isMultiChoice = group.markets.length > 1;

    // For display in header, we usually pick the first market's price or a representative one
    const primaryMarket = group.markets[0];
    const yesPercent = Math.round(primaryMarket.yesPrice * 100);
    const priceDelta = (primaryMarket.yesPrice - 0.5) * 100;
    const deltaSign = priceDelta >= 0 ? "+" : "";

    return (
        <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(`/market/${group.eventId}`)}
        >
            {/* Header Area */}
            <View style={styles.headerRow}>
                <View style={styles.imageContainer}>
                    {group.imageUrl ? (
                        <Image
                            source={group.imageUrl}
                            contentFit="cover"
                            style={styles.image as any}
                            transition={120}
                        />
                    ) : (
                        <View style={styles.placeholderImage}>
                            <Text style={styles.placeholderText}>
                                {group.category.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.titleArea}>
                    <Text style={styles.title} numberOfLines={2}>
                        {group.title}
                    </Text>
                </View>

                {!isMultiChoice && (
                    <View style={styles.statArea}>
                        <Text style={[styles.deltaText, priceDelta < 0 && styles.deltaTextNegative]}>
                            {deltaSign}{Math.abs(priceDelta).toFixed(1)}%
                        </Text>
                        <Text style={styles.mainPercent}>{yesPercent}%</Text>
                    </View>
                )}
            </View>

            <View style={styles.dottedSeparator} />

            {/* Content Area */}
            {isMultiChoice ? (
                <View style={styles.multiContent}>
                    {group.markets.slice(0, 3).map((m, idx) => (
                        <View key={m.id} style={styles.multiRow}>
                            <View style={styles.multiLabelArea}>
                                <Text style={styles.multiLabel} numberOfLines={1}>{m.title}</Text>
                                {idx < 2 && <ArrowUpCircle size={14} color="rgba(0,0,0,0.15)" strokeWidth={2.5} />}
                            </View>
                            <View style={styles.multiActionArea}>
                                <Text style={styles.multiPercent}>{Math.round(m.yesPrice * 100)}%</Text>
                                <Pressable
                                    style={styles.smallYesBtn}
                                    onPress={() => onBuyYes?.(m)}
                                >
                                    <Text style={styles.smallYesText}>Yes</Text>
                                </Pressable>
                                <Pressable
                                    style={styles.smallNoBtn}
                                    onPress={() => onBuyNo?.(m)}
                                >
                                    <Text style={styles.smallNoText}>No</Text>
                                </Pressable>
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.binaryContent}>
                    <Pressable
                        style={[styles.bigBtn, styles.bigYesBtn]}
                        onPress={() => onBuyYes?.(primaryMarket)}
                    >
                        <Text style={styles.bigYesText}>Yes</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.bigBtn, styles.bigNoBtn]}
                        onPress={() => onBuyNo?.(primaryMarket)}
                    >
                        <Text style={styles.bigNoText}>No</Text>
                    </Pressable>
                </View>
            )}

            {/* Footer Area */}
            <View style={styles.footerRow}>
                <Text style={styles.volumeText}>{formatVolume(group.volume)}</Text>

                <View style={styles.indicatorArea}>
                    <View style={styles.indicatorStack}>
                        <View style={[styles.indicatorDot, { backgroundColor: '#FF3B30' }]} />
                        <View style={[styles.indicatorDot, { backgroundColor: '#34C759', marginLeft: -6 }]} />
                    </View>
                    <Text style={styles.indicatorText}>+{group.markets.length + 10}</Text>
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#fff",
        borderRadius: 24,
        padding: 16,
        paddingBottom: 12,
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.04)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    cardPressed: {
        opacity: 0.9,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
    },
    imageContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#f8f8f8",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.06)",
    },
    image: {
        width: "100%",
        height: "100%",
    },
    placeholderImage: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    placeholderText: {
        fontSize: 18,
        fontWeight: "700",
        color: "#ccc",
    },
    titleArea: {
        flex: 1,
    },
    title: {
        fontSize: 15,
        fontWeight: "700",
        color: "#1a1a1a",
        lineHeight: 20,
    },
    statArea: {
        alignItems: "flex-end",
        gap: 2,
    },
    deltaText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#34C759",
    },
    deltaTextNegative: {
        color: "#FF3B30",
    },
    mainPercent: {
        fontSize: 26,
        fontWeight: "700",
        color: "#000",
        letterSpacing: -0.5,
    },
    dottedSeparator: {
        height: 1,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.06)",
        borderStyle: "dashed",
        marginBottom: 16,
    },
    binaryContent: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 12,
    },
    bigBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    bigYesBtn: {
        backgroundColor: "rgba(180,151,90,0.12)",
    },
    bigNoBtn: {
        backgroundColor: "rgba(255,59,48,0.12)",
    },
    bigYesText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#b4975a",
    },
    bigNoText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FF3B30",
    },
    multiContent: {
        gap: 12,
        marginBottom: 12,
    },
    multiRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    multiLabelArea: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    multiLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    multiActionArea: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    multiPercent: {
        fontSize: 14,
        fontWeight: "700",
        color: "#000",
        minWidth: 36,
        textAlign: "right",
    },
    smallYesBtn: {
        width: 52,
        height: 28,
        borderRadius: 10,
        backgroundColor: "rgba(52,199,89,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    smallNoBtn: {
        width: 52,
        height: 28,
        borderRadius: 10,
        backgroundColor: "rgba(255,59,48,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    smallYesText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#34C759",
    },
    smallNoText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#FF3B30",
    },
    footerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 4,
    },
    volumeText: {
        fontSize: 11,
        fontWeight: "600",
        color: "rgba(0,0,0,0.4)",
    },
    indicatorArea: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    indicatorStack: {
        flexDirection: "row",
    },
    indicatorDot: {
        width: 14,
        height: 14,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: "#fff",
    },
    indicatorText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#7d7d7d",
    },
});
