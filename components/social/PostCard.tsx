import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { FeedPost } from "../../hooks/useFeed";
import { formatTimeAgo } from "../../lib/utils";
import { ArrowUp, ArrowDown, Repeat2, Share2 } from "lucide-react-native";
import { useInteractions } from "../../hooks/useInteractions";
import { CircularGauge } from "./CircularGauge";

interface PostCardProps {
    post: FeedPost;
}

export function PostCard({ post }: PostCardProps) {
    const { toggleLike, toggleRepost } = useInteractions();

    const [liked, setLiked] = useState(post.user_has_liked);
    const [likesCount, setLikesCount] = useState(post.likes_count || 0);
    const [reposted, setReposted] = useState(post.user_has_reposted || false);
    const [repostsCount, setRepostsCount] = useState(post.reposts_count || 0);

    const handleLike = async () => {
        const newLiked = !liked;
        setLiked(newLiked);
        setLikesCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
        const success = await toggleLike(post.id);
        if (success === null) {
            setLiked(!newLiked);
            setLikesCount(prev => !newLiked ? prev + 1 : Math.max(0, prev - 1));
        }
    };

    const handleRepost = async () => {
        const newReposted = !reposted;
        setReposted(newReposted);
        setRepostsCount(prev => newReposted ? prev + 1 : Math.max(0, prev - 1));
        const success = await toggleRepost(post.id);
        if (success === null) {
            setReposted(!newReposted);
            setRepostsCount(prev => !newReposted ? prev + 1 : Math.max(0, prev - 1));
        }
    };

    const formatCount = (count: number) => {
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    const timeAgo = formatTimeAgo(post.created_at);
    const postType = (post as any).post_type || 'standard';
    const tradeData = (post as any).trade_metadata || {};
    const pnlPercent = tradeData?.pnl_percent || 0;
    const isPosition = postType === 'trade';
    const isThesis = postType === 'thesis';

    return (
        <View style={styles.container}>
            {/* Header Row */}
            <View style={styles.header}>
                <TouchableOpacity>
                    {post.author?.avatar_url ? (
                        <Image source={{ uri: post.author.avatar_url }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarFallback}>
                            <Text style={styles.avatarFallbackText}>
                                {(post.author?.username || "U").charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={styles.headerMeta}>
                    <View style={styles.nameRow}>
                        <Text style={styles.displayName}>{post.author?.display_name || post.author?.username}</Text>
                        <Text style={styles.usernameTime}>@{post.author?.username} • {timeAgo}</Text>
                    </View>
                </View>

                {/* Badge + PnL */}
                {isPosition && (
                    <View style={styles.badgeRow}>
                        <View style={styles.positionBadge}>
                            <Text style={styles.positionBadgeText}>Position</Text>
                        </View>
                        <Text style={styles.pnlText}>+{pnlPercent.toLocaleString()}%</Text>
                    </View>
                )}
                {isThesis && (
                    <View style={styles.thesisBadge}>
                        <Text style={styles.thesisBadgeText}>Thesis</Text>
                    </View>
                )}
            </View>

            {/* Post Content */}
            <Text style={styles.postContent}>{post.content}</Text>

            {/* Market Card */}
            {post.market_slug && (
                <View style={styles.marketCard}>
                    {/* Market Header */}
                    <View style={styles.marketHeader}>
                        <View style={styles.marketImageFallback}>
                            <Text style={styles.marketImageText}>📊</Text>
                        </View>
                        <Text style={styles.marketQuestion} numberOfLines={2}>
                            {post.market_question || "Market question loading..."}
                        </Text>
                        <CircularGauge percentage={51} size={48} />
                    </View>

                    {/* Position Details (only for Position posts) */}
                    {isPosition && (
                        <View style={styles.positionDetails}>
                            <View style={styles.yesPill}>
                                <Text style={styles.yesPillText}>Yes</Text>
                            </View>
                            <Text style={styles.sharesText}>{tradeData.shares_count || '12.3K'} Shares</Text>
                            <Text style={styles.valueText}>${tradeData.total_value || '12,234.56'}</Text>
                        </View>
                    )}

                    {/* Trade Bar */}
                    <View style={styles.tradeBar}>
                        <View style={styles.tradeBarLeft}>
                            <View style={styles.tradeBarItem}>
                                <Text style={styles.tradeBarLabel}>Avg. Entry</Text>
                                <Text style={styles.tradeBarValue}>{tradeData.avg_entry ? `${(tradeData.avg_entry * 100).toFixed(0)}¢` : '47¢'}</Text>
                            </View>
                            <View style={styles.tradeBarItem}>
                                <Text style={styles.tradeBarLabel}>Current Price</Text>
                                <Text style={styles.tradeBarValue}>{tradeData.current_price ? `${(tradeData.current_price * 100).toFixed(0)}¢` : '97¢'}</Text>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.tradeButton}>
                            <Text style={styles.tradeButtonText}>Trade</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Avatar Stack */}
            <View style={styles.avatarStack}>
                <View style={[styles.miniAvatar, { backgroundColor: '#3b82f6' }]} />
                <View style={[styles.miniAvatar, { marginLeft: -8, backgroundColor: '#8b5cf6' }]} />
                <Text style={styles.avatarStackText}>+14</Text>
            </View>

            {/* Action Bar */}
            <View style={styles.actionBar}>
                <TouchableOpacity style={styles.actionItem} onPress={handleLike}>
                    <ArrowUp size={18} color={liked ? "#34d399" : "#6b7280"} />
                    <Text style={[styles.actionText, liked && styles.actionTextGreen]}>{formatCount(likesCount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem}>
                    <ArrowDown size={18} color="#6b7280" />
                    <Text style={styles.actionText}>2.3K</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem} onPress={handleRepost}>
                    <Repeat2 size={18} color={reposted ? "#34d399" : "#6b7280"} />
                    <Text style={[styles.actionText, reposted && styles.actionTextGreen]}>{formatCount(repostsCount)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionItem}>
                    <Share2 size={18} color="#6b7280" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#000",
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#1f2937",
    },
    header: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 10,
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
    avatarFallbackText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    headerMeta: {
        flex: 1,
        marginLeft: 10,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
    },
    displayName: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
    },
    usernameTime: {
        color: "#6b7280",
        fontSize: 13,
    },
    badgeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    positionBadge: {
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#3b82f6",
    },
    positionBadgeText: {
        color: "#60a5fa",
        fontSize: 12,
        fontWeight: "700",
    },
    pnlText: {
        color: "#34d399",
        fontSize: 16,
        fontWeight: "900",
    },
    thesisBadge: {
        backgroundColor: "rgba(107, 114, 128, 0.2)",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#6b7280",
    },
    thesisBadgeText: {
        color: "#9ca3af",
        fontSize: 12,
        fontWeight: "700",
    },
    postContent: {
        color: "#e5e7eb",
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    marketCard: {
        backgroundColor: "#111",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#1f2937",
        padding: 12,
        marginBottom: 12,
    },
    marketHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    marketImageFallback: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: "#1f2937",
        alignItems: "center",
        justifyContent: "center",
    },
    marketImageText: {
        fontSize: 20,
    },
    marketQuestion: {
        flex: 1,
        color: "#e5e7eb",
        fontSize: 14,
        fontWeight: "600",
        lineHeight: 18,
    },
    positionDetails: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
    },
    yesPill: {
        backgroundColor: "rgba(52, 211, 153, 0.2)",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#34d399",
    },
    yesPillText: {
        color: "#34d399",
        fontSize: 18,
        fontWeight: "800",
    },
    sharesText: {
        color: "#e5e7eb",
        fontSize: 16,
        fontWeight: "700",
        flex: 1,
    },
    valueText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
    },
    tradeBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#0ea5e9",
        borderRadius: 12,
        padding: 12,
    },
    tradeBarLeft: {
        flexDirection: "row",
        gap: 24,
    },
    tradeBarItem: {
        gap: 2,
    },
    tradeBarLabel: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 11,
        fontWeight: "600",
    },
    tradeBarValue: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "800",
    },
    tradeButton: {
        backgroundColor: "#000",
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 12,
    },
    tradeButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "800",
    },
    avatarStack: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    miniAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: "#000",
    },
    avatarStackText: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "600",
        marginLeft: 6,
    },
    actionBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 32,
    },
    actionItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    actionText: {
        color: "#6b7280",
        fontSize: 13,
        fontWeight: "600",
    },
    actionTextGreen: {
        color: "#34d399",
    },
});
