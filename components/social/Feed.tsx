import React, { useState } from "react";
import { View, StyleSheet, RefreshControl, Text, ActivityIndicator, TouchableOpacity, Modal } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFeed, type FeedMode } from "../../hooks/useFeed";
import { useAuth } from "../../hooks/useAuth";
import { PostCard } from "./PostCard";
import { CreatePost } from "./CreatePost";
import { PostTradeShareSheet } from "./PostTradeShareSheet";
import { TradePanel } from "../market/TradePanel";
import { Market } from "../../lib/mock-data";
import { fetchMarketForApp } from "../../lib/jupiter";
import { deriveCurrentUserId } from "../../lib/currentUserId";
import type { ExecutedTradeResult } from "../../lib/tradePost";
import { PremiumSpinner } from "../ui/PremiumSpinner";

interface FeedProps {
    mode: FeedMode;
    userId?: string;
    marketId?: string;
    ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
    onTradePress?: (marketId: string) => void;
}

export function Feed({ mode, userId, marketId, ListHeaderComponent: CustomListHeaderComponent, onTradePress }: FeedProps) {
    const { user, activeWallet } = useAuth();
    const viewerId = deriveCurrentUserId(user, activeWallet);
    const { posts, isLoading, isFetchingMore, hasMore, error, fetchFeed, fetchNextPage } = useFeed({
        mode,
        viewerId,
        userId,
        marketId,
    });
    const [refreshing, setRefreshing] = useState(false);

    // Trade Panel State
    const [tradingMarketId, setTradingMarketId] = useState<string | null>(null);
    const [tradingMarket, setTradingMarket] = useState<Market | null>(null);
    const [isFetchingMarket, setIsFetchingMarket] = useState(false);
    const [shareTradeState, setShareTradeState] = useState<{ market: Market; trade: ExecutedTradeResult } | null>(null);

    const handleTradePress = async (id: string) => {
        if (onTradePress) {
            onTradePress(id);
            return;
        }

        setTradingMarketId(id);
        setIsFetchingMarket(true);
        try {
            const market = await fetchMarketForApp(id);
            if (market) {
                setTradingMarket(market);
            } else {
                setTradingMarketId(null);
            }
        } catch (e) {
            console.error("Failed to fetch market details for trade", e);
            setTradingMarketId(null);
        } finally {
            setIsFetchingMarket(false);
        }
    };

    const handleCloseTrade = () => {
        setTradingMarketId(null);
        setTradingMarket(null);
    };

    const handleTradeSuccess = async (details: {
        signature: string;
        outcome: "YES" | "NO";
        amount: number;
        sharesCount?: number;
        totalValue?: number;
        price: number;
        mode: "BUY" | "SELL";
        marketId: string;
        resolutionStatus: "filled" | "partially_filled";
    }) => {
        if (!tradingMarket) {
            handleCloseTrade();
            return;
        }

        setShareTradeState({
            market: tradingMarket,
            trade: details,
        });
        handleCloseTrade();
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchFeed();
        setRefreshing(false);
    };

    const renderItem = React.useCallback(({ item }: { item: typeof posts[0] }) => (
        <PostCard post={item} onTradePress={onTradePress || handleTradePress} onPostDeleted={fetchFeed} />
    ), [fetchFeed, handleTradePress, onTradePress]);

    const ListEmptyComponent = React.useCallback(() => {
        if (isLoading) {
            return (
                <View style={styles.centerContainer}>
                    <PremiumSpinner size={32} />
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity onPress={fetchFeed}>
                        <Text style={styles.retryText}>Tap to retry</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <View style={styles.centerContainer}>
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to share something!</Text>
            </View>
        );
    }, [isLoading, error, fetchFeed]);

    const ListHeaderComponent = React.useCallback(() => (
        <CreatePost onPostCreated={fetchFeed} />
    ), [fetchFeed]);

    return (
        <View style={styles.container}>
            {/* @ts-ignore */}
            <FlashList
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                // @ts-expect-error FlashList types missing estimatedItemSize in this RN version
                estimatedItemSize={250}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />
                }
                onEndReached={() => {
                    if (hasMore) {
                        void fetchNextPage();
                    }
                }}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={CustomListHeaderComponent || (!userId ? ListHeaderComponent : undefined)}
                ListEmptyComponent={ListEmptyComponent}
                ListFooterComponent={
                    isFetchingMore ? (
                        <View style={styles.footerLoader}>
                            <PremiumSpinner size={18} />
                        </View>
                    ) : null
                }
            />

            {/* Loading Modal Overaly for fetching Market data */}
            {isFetchingMarket && (
                <View style={styles.fetchingOverlay}>
                    <PremiumSpinner size={34} />
                </View>
            )}

            {/* Trade Panel Modal */}
            <Modal
                visible={!!tradingMarket}
                animationType="none"
                transparent={true}
                onRequestClose={handleCloseTrade}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFillObject}
                        onPress={handleCloseTrade}
                    />
                    <View style={styles.modalContent}>
                        {tradingMarket && (
                            <TradePanel
                                market={tradingMarket}
                                onSuccess={handleTradeSuccess}
                                initialSide="YES"
                                initialTradeMode="BUY"
                                onClose={handleCloseTrade}
                            />
                        )}
                    </View>
                </View>
            </Modal>

            <PostTradeShareSheet
                visible={!!shareTradeState}
                market={shareTradeState?.market ?? null}
                trade={shareTradeState?.trade ?? null}
                onClose={() => setShareTradeState(null)}
                onShared={() => {
                    void fetchFeed();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 120,
        backgroundColor: "#f0f0f0",
        minHeight: "100%",
    },
    centerContainer: {
        padding: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    errorText: {
        color: "#f43f5e",
        marginBottom: 8,
    },
    retryText: {
        color: "#9ca3af",
        textDecorationLine: "underline",
    },
    emptyTitle: {
        color: "#9ca3af",
        fontSize: 18,
        fontWeight: "bold",
        marginTop: 16,
    },
    emptySubtitle: {
        color: "#6b7280",
        fontSize: 14,
        marginTop: 4,
    },
    container: {
        flex: 1,
    },
    footerLoader: {
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    fetchingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
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
