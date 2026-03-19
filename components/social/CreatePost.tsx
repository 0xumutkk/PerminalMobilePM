import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { Image } from "expo-image";
import { useProfile } from "../../hooks/useProfile";
import { useInteractions } from "../../hooks/useInteractions";
import { fetchMarketForApp } from "../../lib/jupiter";
import { Market } from "../../lib/mock-data";
import { PostTradeShareSheet } from "./PostTradeShareSheet";
import { TradePanel } from "../market/TradePanel";
import { TradeSide, TradeMode } from "../../hooks/useTrade";
import type { ExecutedTradeResult } from "../../lib/tradePost";
import { PremiumSpinner } from "../ui/PremiumSpinner";

interface CreatePostProps {
    onPostCreated: () => void;
    marketId?: string;
}

export function CreatePost({ onPostCreated, marketId }: CreatePostProps) {
    const { profile } = useProfile();
    const { createPost, isSubmitting } = useInteractions();
    const [content, setContent] = useState("");
    const [postType, setPostType] = useState<'standard' | 'trade' | 'thesis'>('standard');

    // Market resolving state
    const [currentMarket, setCurrentMarket] = useState<Market | null>(null);
    const [isFetchingMarket, setIsFetchingMarket] = useState(false);

    // Trade modal state
    const [showTradePanel, setShowTradePanel] = useState(false);
    const [pendingTradeShare, setPendingTradeShare] = useState<ExecutedTradeResult | null>(null);

    useEffect(() => {
        if (!marketId) {
            setCurrentMarket(null);
            if (postType !== 'standard') setPostType('standard');
            return;
        }
        let cancelled = false;
        setIsFetchingMarket(true);
        fetchMarketForApp(marketId)
            .then((m) => {
                if (!cancelled && m) setCurrentMarket(m);
            })
            .catch((e) => console.error("CreatePost failed to fetch market:", e))
            .finally(() => {
                if (!cancelled) setIsFetchingMarket(false);
            });
        return () => { cancelled = true; };
    }, [marketId]);

    const handlePostBtn = () => {
        if (!content.trim()) return;

        if (postType === 'trade') {
            if (!currentMarket) return;
            setShowTradePanel(true);
            return;
        }

        executeSupabasePost({});
    };

    const handleTradeSuccess = async (details: {
        signature: string;
        outcome: TradeSide;
        amount: number;
        price: number;
        sharesCount?: number;
        totalValue?: number;
        mode: TradeMode;
        marketId: string;
        resolutionStatus: "filled" | "partially_filled";
    }) => {
        setShowTradePanel(false);
        setPendingTradeShare(details);
    };

    const executeSupabasePost = async (tradeMetadata: any = {}, isVerified: boolean = false) => {
        const result = await createPost(
            content,
            currentMarket?.id,
            undefined,
            currentMarket?.title,
            postType,
            tradeMetadata,
            isVerified
        );

        if (result) {
            setContent("");
            setPostType('standard');
            onPostCreated();
        }
    };

    if (!profile) return null;

    return (
        <View style={styles.container}>
            <View style={styles.avatarContainer}>
                {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarFallback}>
                        <Text style={styles.fallbackText}>{(profile?.username || "U").charAt(0).toUpperCase()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    placeholder="What's happening?"
                    placeholderTextColor="#6b7280"
                    style={styles.input}
                    multiline
                    value={content}
                    onChangeText={setContent}
                />

                <View style={styles.typeSelector}>
                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'standard' && styles.typeButtonActive]}
                        onPress={() => setPostType('standard')}
                    >
                        <Text style={[styles.typeButtonText, postType === 'standard' && styles.typeButtonTextActive]}>Standard</Text>
                    </TouchableOpacity>
                    {currentMarket && !isFetchingMarket && (
                        <>
                            <TouchableOpacity
                                style={[styles.typeButton, postType === 'trade' && styles.typeButtonActive]}
                                onPress={() => setPostType('trade')}
                            >
                                <Text style={[styles.typeButtonText, postType === 'trade' && styles.typeButtonTextActive]}>Position</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.typeButton, postType === 'thesis' && styles.typeButtonActive]}
                                onPress={() => setPostType('thesis')}
                            >
                                <Text style={[styles.typeButtonText, postType === 'thesis' && styles.typeButtonTextActive]}>Thesis</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    {isFetchingMarket && (
                        <View style={styles.marketLoader}>
                            <PremiumSpinner size={16} />
                        </View>
                    )}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.button, (!content.trim() || isSubmitting) && styles.disabledButton]}
                        onPress={handlePostBtn}
                        disabled={!content.trim() || isSubmitting}
                    >
                        {isSubmitting ? <PremiumSpinner color="#ffffff" size={16} /> : <Text style={styles.buttonText}>Post</Text>}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Trade Panel Overlay for Position / Thesis */}
            <Modal
                visible={showTradePanel && !!currentMarket}
                animationType="none"
                transparent={true}
                onRequestClose={() => setShowTradePanel(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={() => setShowTradePanel(false)}
                    />
                    <View style={styles.modalContent}>
                        {currentMarket && (
                            <TradePanel
                                market={currentMarket}
                                onSuccess={handleTradeSuccess}
                                initialSide="YES"
                                initialTradeMode="BUY"
                                onClose={() => setShowTradePanel(false)}
                            />
                        )}
                    </View>
                </View>
            </Modal>

            <PostTradeShareSheet
                visible={!!pendingTradeShare && !!currentMarket}
                market={currentMarket}
                trade={pendingTradeShare}
                onClose={() => setPendingTradeShare(null)}
                onShared={onPostCreated}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.05)",
        backgroundColor: "#fff",
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#eee",
    },
    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#3b82f6",
        alignItems: "center",
        justifyContent: "center",
    },
    fallbackText: {
        color: "#fff",
        fontWeight: "bold",
    },
    inputContainer: {
        flex: 1,
    },
    input: {
        color: "#171717",
        fontSize: 16,
        minHeight: 40,
        textAlignVertical: "top",
        marginBottom: 8,
    },
    typeSelector: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
    },
    marketLoader: {
        marginLeft: 8,
        justifyContent: "center",
    },
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
    },
    typeButtonActive: {
        backgroundColor: "rgba(5, 150, 105, 0.05)",
        borderColor: "#059669",
    },
    typeButtonText: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "700",
    },
    typeButtonTextActive: {
        color: "#059669",
    },
    footer: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    button: {
        backgroundColor: "#059669",
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    disabledButton: {
        opacity: 0.5,
    },
    buttonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalContent: {
        width: "100%",
    },
});
