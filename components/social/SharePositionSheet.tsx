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
import { useInteractions } from "../../hooks/useInteractions";
import type { Position } from "../../hooks/usePositions";
import type { Market } from "../../lib/mock-data";
import { buildPositionPostMetadata } from "../../lib/tradePost";
import { PremiumSpinner } from "../ui/PremiumSpinner";

interface SharePositionSheetProps {
    visible: boolean;
    position: Position | null;
    market?: Market | null;
    onClose: () => void;
    onShared?: () => void;
}

function formatMoney(value: number): string {
    return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatPercent(value: number): string {
    return `${value >= 0 ? "+" : "-"}${Math.abs(value).toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })}%`;
}

const DISMISS_DRAG_DISTANCE = 120;
const DISMISS_DRAG_VELOCITY = 900;
const SHEET_EXIT_TRANSLATE_Y = 420;

export function SharePositionSheet({
    visible,
    position,
    market,
    onClose,
    onShared,
}: SharePositionSheetProps) {
    const { createPost, isSubmitting } = useInteractions();
    const [content, setContent] = useState("");
    const translateY = useSharedValue(0);

    useEffect(() => {
        if (!visible) {
            setContent("");
        }
    }, [visible]);

    const summary = useMemo(() => {
        if (!position) return null;
        const metadata = buildPositionPostMetadata(position, market);

        return {
            label: `${metadata.side} position`,
            marketTitle: market?.eventTitle || market?.title || position.marketTitle,
            sharesText: `${Math.round(metadata.shares_count).toLocaleString("en-US")} shares`,
            valueText: formatMoney(metadata.total_value),
            pnlText: `${formatMoney(metadata.unrealized_pnl)} (${formatPercent(metadata.unrealized_pnl_percent)})`,
            metadata,
            imageUrl: market?.imageUrl || position.imageUrl || "https://avatar.vercel.sh/market",
        };
    }, [market, position]);

    const handleShare = async () => {
        if (!position || !summary) return;

        const createdPost = await createPost(
            content.trim(),
            summary.metadata.marketId,
            undefined,
            summary.metadata.marketQuestion,
            "trade",
            summary.metadata,
            false
        );

        if (!createdPost) {
            Alert.alert("Share failed", "Position post could not be created right now.");
            return;
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
            visible={visible && !!position}
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
                        <Text style={styles.title}>Share this position</Text>
                        <Text style={styles.subtitle}>Post your open position as a live snapshot.</Text>

                        {summary ? (
                            <View style={styles.previewCard}>
                                <View style={styles.previewTopRow}>
                                    <Image source={summary.imageUrl} style={styles.previewImage} contentFit="cover" />
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
                                    <Text style={styles.previewStat}>{summary.pnlText}</Text>
                                </View>
                            </View>
                        ) : null}

                        <TextInput
                            value={content}
                            onChangeText={setContent}
                            placeholder="What is your thesis on this position?"
                            placeholderTextColor="#9ca3af"
                            multiline
                            style={styles.input}
                        />

                        <View style={styles.actions}>
                            <Pressable style={styles.skipButton} onPress={onClose} disabled={isSubmitting}>
                                <Text style={styles.skipButtonText}>Skip</Text>
                            </Pressable>
                            <Pressable style={[styles.shareButton, isSubmitting && styles.shareButtonDisabled]} onPress={handleShare} disabled={isSubmitting}>
                                {isSubmitting ? <PremiumSpinner color="#ffffff" size={16} /> : <Text style={styles.shareButtonText}>Share position</Text>}
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
        color: "#2563eb",
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
        paddingVertical: 14,
        textAlignVertical: "top",
    },
    actions: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    skipButton: {
        flex: 1,
        minHeight: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#d1d5db",
        alignItems: "center",
        justifyContent: "center",
    },
    skipButtonText: {
        color: "#111827",
        fontSize: 15,
        fontWeight: "700",
    },
    shareButton: {
        flex: 1.4,
        minHeight: 52,
        borderRadius: 16,
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
