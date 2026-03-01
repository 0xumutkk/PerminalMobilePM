import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { Image } from "expo-image";
import { useProfile } from "../../hooks/useProfile";
import { useInteractions } from "../../hooks/useInteractions";
import { fetchMarketForApp } from "../../lib/jupiter";
import { Market } from "../../lib/mock-data";
import { TradePanel } from "../market/TradePanel";
import { TradeSide, TradeMode } from "../../hooks/useTrade";

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

        if (postType === 'trade' || postType === 'thesis') {
            if (!currentMarket) return;
            // Open Trade Panel to finalize the actual blockchain transaction
            setShowTradePanel(true);
            return;
        }

        // Standard post
        executeSupabasePost({}, false);
    };

    const handleTradeSuccess = async (details: {
        signature: string;
        outcome: string;
        amount: number;
        price: number;
    }) => {
        setShowTradePanel(false);

        // Execute the real post to Supabase with rich metadata
        const tradeMetadata = {
            signature: details.signature,
            marketId: currentMarket?.id,
            marketTitle: currentMarket?.title,
            outcome: details.outcome,
            shares_count: details.amount, // depending on mode this might be shares or usdc
            avg_entry: details.price,
            current_price: details.price,
        };
        await executeSupabasePost(tradeMetadata, true);
    };

    const executeSupabasePost = async (tradeMetadata: any = {}, isVerified: boolean = false) => {
        const result = await createPost(
            content,
            currentMarket?.id,
            undefined,
            currentMarket?.title,
            postType,
            tradeMetadata,
            isVerified // true if it went through the TradePanel
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
                        <ActivityIndicator style={{ marginLeft: 8 }} size="small" color="#34d399" />
                    )}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.button, (!content.trim() || isSubmitting) && styles.disabledButton]}
                        onPress={handlePostBtn}
                        disabled={!content.trim() || isSubmitting}
                    >
                        {isSubmitting ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.buttonText}>Post</Text>}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Trade Panel Overlay for Position / Thesis */}
            <Modal
                visible={showTradePanel && !!currentMarket}
                animationType="slide"
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
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#1f2937",
        backgroundColor: "#000",
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#1f2937",
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
        color: "#fff",
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
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: "#111",
        borderWidth: 1,
        borderColor: "#1f2937",
    },
    typeButtonActive: {
        backgroundColor: "rgba(52, 211, 153, 0.1)",
        borderColor: "#34d399",
    },
    typeButtonText: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "700",
    },
    typeButtonTextActive: {
        color: "#34d399",
    },
    footer: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    button: {
        backgroundColor: "#34d399",
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
        color: "#000",
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
