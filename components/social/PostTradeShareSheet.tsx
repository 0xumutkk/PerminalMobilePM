import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useAuth } from "../../hooks/useAuth";
import { useInteractions } from "../../hooks/useInteractions";
import type { Market } from "../../lib/mock-data";
import { buildTradePostMetadata, requestTradeVerification, type ExecutedTradeResult } from "../../lib/tradePost";
import { PremiumSpinner } from "../ui/PremiumSpinner";

interface PostTradeShareSheetProps {
    visible: boolean;
    market: Market | null;
    trade: ExecutedTradeResult | null;
    onClose: () => void;
    onShared?: () => void;
}

function formatMoney(value: number): string {
    return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

const DISMISS_DRAG_DISTANCE = 120;
const DISMISS_DRAG_VELOCITY = 900;
const SHEET_EXIT_TRANSLATE_Y = 420;

export function PostTradeShareSheet({
    visible,
    market,
    trade,
    onClose,
    onShared,
}: PostTradeShareSheetProps) {
    const { activeWallet } = useAuth();
    const { createPost, isSubmitting } = useInteractions();
    const [content, setContent] = useState("");
    const translateY = useSharedValue(0);

    useEffect(() => {
        if (!visible) {
            setContent("");
        }
    }, [visible]);

    const summary = useMemo(() => {
        if (!market || !trade) return null;
        const metadata = buildTradePostMetadata(market, trade);

        return {
            label: `${trade.mode === "SELL" ? "Sold" : "Bought"} ${metadata.side}`,
            marketTitle: market.eventTitle || market.title,
            sharesText: `${Math.round(metadata.shares_count).toLocaleString("en-US")} shares`,
            valueText: formatMoney(metadata.total_value),
            priceText: `${Math.round(metadata.avg_entry * 100)}c avg`,
            metadata,
        };
    }, [market, trade]);

    const handleShare = async () => {
        if (!market || !trade || !summary) return;

        const createdPost = await createPost(
            content.trim(),
            summary.metadata.marketId,
            undefined,
            summary.metadata.marketQuestion,
            "trade",
            summary.metadata,
            false
        ) as { id: string } | null;

        if (!createdPost) {
            Alert.alert("Share failed", "Trade post could not be created right now.");
            return;
        }

        const walletAddress = activeWallet?.address?.trim();
        if (walletAddress) {
            void requestTradeVerification(createdPost.id, trade.signature, walletAddress).catch((error) => {
                console.error("[PostTradeShareSheet] Trade verification request failed:", error);
            });
        }

        setContent("");
        onShared?.();
        onClose();
    };

    const dismissSheet = () => {
        translateY.value = withTiming(SHEET_EXIT_TRANSLATE_Y, { duration: 180 }, () => {
            runOnJS(onClose)();
        });
    };

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
            if (event.translationY > DISMISS_DRAG_DISTANCE || event.velocityY > DISMISS_DRAG_VELOCITY) {
                runOnJS(dismissSheet)();
                return;
            }
            translateY.value = withSpring(0, {
                damping: 18,
                stiffness: 180,
            });
        });

    const animatedSheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Modal
            visible={visible && !!market && !!trade}
            animationType="fade"
            transparent
            onRequestClose={onClose}
            onDismiss={() => {
                translateY.value = 0;
            }}
        >
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.sheet, animatedSheetStyle]}>
                        <View style={styles.handle} />
                        <Text style={styles.title}>Share this trade</Text>
                        <Text style={styles.subtitle}>Add context, or post the trade card as-is.</Text>

                        {summary ? (
                            <View style={styles.previewCard}>
                                <View style={styles.previewTopRow}>
                                    <Image
                                        source={market?.imageUrl || "https://avatar.vercel.sh/market"}
                                        style={styles.previewImage}
                                        contentFit="cover"
                                    />
                                    <View style={styles.previewMeta}>
                                        <Text style={styles.previewLabel}>{summary.label}</Text>
                                        <Text style={styles.previewTitle} numberOfLines={2}>
                                            {summary.marketTitle}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.previewStats}>
                                    <Text style={styles.previewStat}>{summary.sharesText}</Text>
                                    <Text style={styles.previewStat}>{summary.valueText}</Text>
                                    <Text style={styles.previewStat}>{summary.priceText}</Text>
                                </View>
                            </View>
                        ) : null}

                        <TextInput
                            value={content}
                            onChangeText={setContent}
                            placeholder="What is your take?"
                            placeholderTextColor="#9ca3af"
                            multiline
                            style={styles.input}
                        />

                        <View style={styles.actions}>
                            <Pressable style={styles.skipButton} onPress={onClose} disabled={isSubmitting}>
                                <Text style={styles.skipButtonText}>Skip</Text>
                            </Pressable>
                            <Pressable style={[styles.shareButton, isSubmitting && styles.shareButtonDisabled]} onPress={handleShare} disabled={isSubmitting}>
                                {isSubmitting ? <PremiumSpinner color="#ffffff" size={16} /> : <Text style={styles.shareButtonText}>Share trade</Text>}
                            </Pressable>
                        </View>
                    </Animated.View>
                </GestureDetector>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.32)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 28,
        gap: 14,
    },
    handle: {
        alignSelf: "center",
        width: 42,
        height: 5,
        borderRadius: 999,
        backgroundColor: "#d1d5db",
        marginBottom: 4,
    },
    title: {
        color: "#111827",
        fontSize: 20,
        fontWeight: "800",
    },
    subtitle: {
        color: "#6b7280",
        fontSize: 14,
        lineHeight: 20,
    },
    previewCard: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        backgroundColor: "#f9fafb",
        padding: 14,
        gap: 12,
    },
    previewTopRow: {
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    previewImage: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: "#e5e7eb",
    },
    previewMeta: {
        flex: 1,
        gap: 4,
    },
    previewLabel: {
        color: "#059669",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
    },
    previewTitle: {
        color: "#111827",
        fontSize: 15,
        fontWeight: "700",
        lineHeight: 20,
    },
    previewStats: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    previewStat: {
        color: "#374151",
        fontSize: 12,
        fontWeight: "700",
        backgroundColor: "#fff",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    input: {
        minHeight: 112,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        backgroundColor: "#fff",
        color: "#111827",
        fontSize: 15,
        lineHeight: 22,
        paddingHorizontal: 14,
        paddingVertical: 12,
        textAlignVertical: "top",
    },
    actions: {
        flexDirection: "row",
        gap: 12,
    },
    skipButton: {
        flex: 1,
        minHeight: 48,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#d1d5db",
        alignItems: "center",
        justifyContent: "center",
    },
    skipButtonText: {
        color: "#374151",
        fontSize: 15,
        fontWeight: "700",
    },
    shareButton: {
        flex: 1.4,
        minHeight: 48,
        borderRadius: 14,
        backgroundColor: "#111827",
        alignItems: "center",
        justifyContent: "center",
    },
    shareButtonDisabled: {
        opacity: 0.6,
    },
    shareButtonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "800",
    },
});
