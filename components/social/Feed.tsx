import React, { useState } from "react";
import { View, StyleSheet, RefreshControl, Text, ActivityIndicator, TouchableOpacity, Modal } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFeed } from "../../hooks/useFeed";
import { PostCard } from "./PostCard";
import { CreatePost } from "./CreatePost";
import { TradePanel } from "../market/TradePanel";
import { Market } from "../../lib/mock-data";
import { fetchMarketForApp } from "../../lib/jupiter";

interface FeedProps {
    userId?: string;
    marketId?: string;
    ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
    onTradePress?: (marketId: string) => void;
}

export function Feed({ userId, marketId, ListHeaderComponent: CustomListHeaderComponent, onTradePress }: FeedProps) {
    const { posts, isLoading, error, fetchFeed } = useFeed(userId, marketId);
    const [refreshing, setRefreshing] = useState(false);

    // Trade Panel State
    const [tradingMarketId, setTradingMarketId] = useState<string | null>(null);
    const [tradingMarket, setTradingMarket] = useState<Market | null>(null);
    const [isFetchingMarket, setIsFetchingMarket] = useState(false);

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

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchFeed();
        setRefreshing(false);
    };

    const renderItem = React.useCallback(({ item }: { item: typeof posts[0] }) => (
        <PostCard post={item} onTradePress={handleTradePress} />
    ), []);

    const ListEmptyComponent = React.useCallback(() => {
        if (isLoading) {
            return (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#34d399" />
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
                ListHeaderComponent={CustomListHeaderComponent || (!userId ? ListHeaderComponent : undefined)}
                ListEmptyComponent={ListEmptyComponent}
            />

            {/* Loading Modal Overaly for fetching Market data */}
            {isFetchingMarket && (
                <View style={styles.fetchingOverlay}>
                    <ActivityIndicator size="large" color="#34d399" />
                </View>
            )}

            {/* Trade Panel Modal */}
            <Modal
                visible={!!tradingMarket}
                animationType="slide"
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
                                onSuccess={handleCloseTrade}
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
    listContent: {
        paddingBottom: 20,
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
