import React from "react";
import { View, FlatList, StyleSheet, RefreshControl, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useFeed } from "../../hooks/useFeed";
import { PostCard } from "./PostCard";
import { CreatePost } from "./CreatePost";

interface FeedProps {
    userId?: string;
    marketId?: string;
    ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
}

export function Feed({ userId, marketId, ListHeaderComponent: CustomListHeaderComponent }: FeedProps) {
    const { posts, isLoading, error, fetchFeed } = useFeed(userId, marketId);
    const [refreshing, setRefreshing] = React.useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchFeed();
        setRefreshing(false);
    };

    const renderItem = React.useCallback(({ item }: { item: typeof posts[0] }) => (
        <PostCard post={item} />
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
        <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />
            }
            ListHeaderComponent={CustomListHeaderComponent || (!userId ? ListHeaderComponent : undefined)}
            ListEmptyComponent={ListEmptyComponent}
        />
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 20,
        backgroundColor: "#000",
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
});
