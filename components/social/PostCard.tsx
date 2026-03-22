import React, { useState, memo } from "react";
import { Alert, Pressable, Share, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { FeedPost } from "../../hooks/useFeed";
import type { Market } from "../../lib/mock-data";
import { getMarketResolution, getTradeMetadataSide } from "../../lib/marketResolution";
import { formatTimeAgo } from "../../lib/utils";
import { ArrowUp, ArrowDown, Ellipsis, Repeat2, Share2, ShieldCheck, Trash2 } from "lucide-react-native";
import { useInteractions } from "../../hooks/useInteractions";
import { CircularGauge } from "./CircularGauge";
import { hasResolvablePostMarket, resolvePostMarket, resolvePostMarketId } from "../../lib/postMarkets";
import { useAuth } from "../../hooks/useAuth";
import { deriveCurrentUserId } from "../../lib/currentUserId";

interface PostCardProps {
    post: FeedPost;
    onTradePress?: (marketId: string) => void;
    onPostDeleted?: () => void | Promise<void>;
}

export const PostCard = memo(function PostCard({ post, onTradePress, onPostDeleted }: PostCardProps) {
    const router = useRouter();
    const { user, activeWallet } = useAuth();
    const currentUserId = deriveCurrentUserId(user, activeWallet);
    const { toggleLike, toggleDownvote, toggleRepost, deletePost, isSubmitting } = useInteractions();

    const [liked, setLiked] = useState(post.user_has_liked);
    const [likesCount, setLikesCount] = useState(post.likes_count || 0);
    const [downvoted, setDownvoted] = useState(post.user_has_downvoted || false);
    const [downvotesCount, setDownvotesCount] = useState(post.downvotes_count || 0);
    const [reposted, setReposted] = useState(post.user_has_reposted || false);
    const [repostsCount, setRepostsCount] = useState(post.reposts_count || 0);
    const [tradeLoading, setTradeLoading] = useState(false);
    const [marketState, setMarketState] = useState<Market | null>(null);
    const [showOwnerActions, setShowOwnerActions] = useState(false);
    const isOwnPost = currentUserId != null && post.user_id === currentUserId;

    const handleOpenAuthorProfile = () => {
        const authorId = post.author?.id || post.user_id;
        if (!authorId) return;

        if (currentUserId && authorId === currentUserId) {
            router.push("/profile");
            return;
        }

        router.push({
            pathname: "/profile/[id]",
            params: { id: authorId, from: "explore" },
        });
    };

    const handleLike = async () => {
        const newLiked = !liked;
        // Optimistic update: if downvoted previously, remove downvote visually (optional, keeping independent for now)
        setLiked(newLiked);
        setLikesCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
        const success = await toggleLike(post.id);
        if (success === null) {
            setLiked(!newLiked);
            setLikesCount(prev => !newLiked ? prev + 1 : Math.max(0, prev - 1));
        }
    };

    const handleDownvote = async () => {
        const newDownvoted = !downvoted;
        setDownvoted(newDownvoted);
        setDownvotesCount(prev => newDownvoted ? prev + 1 : Math.max(0, prev - 1));
        const success = await toggleDownvote(post.id);
        if (success === null) {
            setDownvoted(!newDownvoted);
            setDownvotesCount(prev => !newDownvoted ? prev + 1 : Math.max(0, prev - 1));
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

    const handleTradePress = async () => {
        if (!onTradePress || tradeLoading) return;

        setTradeLoading(true);
        try {
            const resolvedMarketId = await resolvePostMarketId(post);
            if (!resolvedMarketId) {
                Alert.alert("Market unavailable", "Bu posttaki market artik acilamiyor.");
                return;
            }

            onTradePress(resolvedMarketId);
        } finally {
            setTradeLoading(false);
        }
    };

    const handleOpenMarket = async () => {
        if (tradeLoading) return;

        setTradeLoading(true);
        try {
            const resolvedMarketId = await resolvePostMarketId(post);
            if (!resolvedMarketId) {
                Alert.alert("Market unavailable", "Bu posttaki market artik acilamiyor.");
                return;
            }

            router.push({
                pathname: "/market/[id]",
                params: { id: resolvedMarketId, single: "true" },
            });
        } finally {
            setTradeLoading(false);
        }
    };

    const [liveProbability, setLiveProbability] = useState<number>(50);
    React.useEffect(() => {
        if (!hasResolvablePostMarket(post)) return;
        let cancelled = false;
        resolvePostMarket(post)
            .then((market) => {
                if (cancelled || !market) return;
                setMarketState(market);
                setLiveProbability(Math.round(market.yesPrice * 100));
            })
            .catch((error) => {
                if (!cancelled) {
                    console.warn("[PostCard] Failed to resolve post market:", error);
                }
            });
        return () => { cancelled = true; };
    }, [post]);

    const formatCount = (count: number) => {
        if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
        return count.toString();
    };

    const timeAgo = formatTimeAgo(post.created_at);
    const postType = (post as any).post_type || 'standard';
    const tradeData = (post as any).trade_metadata || {};
    const pnlPercent = Number(
        tradeData?.pnl_percent
        ?? tradeData?.unrealized_pnl_percent
        ?? 0
    );
    const isPosition = postType === 'trade' || postType === 'position';
    const isThesis = postType === 'thesis';

    let cardBgColor = "#D9D9D9";
    let headerBadgeBg = "rgba(0, 0, 0, 0.05)";
    let headerBadgeText = "#171717";
    let badgeLabel = "Thesis";

    if (isPosition) {
        cardBgColor = "#0088FF";
        headerBadgeBg = "rgba(0, 136, 255, 0.15)";
        headerBadgeText = "#0088FF";
        badgeLabel = tradeData?.source === "position_snapshot" ? "Position" : "Trade";
    }

    const isDarkCard = isPosition;
    const footerTextColor = isDarkCard ? "#FFFFFF" : "#000000";
    const footerSubTextColor = isDarkCard ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";
    const canTrade = hasResolvablePostMarket(post);
    const heldSide = isPosition ? getTradeMetadataSide(tradeData) : null;
    const resolution = getMarketResolution(marketState, heldSide);
    const isResolved = resolution.isResolved;
    const resolutionAccentStyle = resolution.winningSide === "NO" ? styles.resolutionAccentNo : styles.resolutionAccentYes;
    const resolutionButtonStyle = resolution.winningSide === "NO" ? styles.tradeActionButtonResolvedNo : styles.tradeActionButtonResolvedYes;
    const marketQuestion = marketState?.eventTitle || post.market_question || marketState?.title || "Market question unavailable";
    const marketImage = marketState?.imageUrl || (post.market_slug ? `https://avatar.vercel.sh/${post.market_slug}` : "https://avatar.vercel.sh/market");
    const sharesCount = typeof tradeData?.shares_count === "number" ? tradeData.shares_count : Number(tradeData?.shares_count ?? 0);
    const totalValue = typeof tradeData?.total_value === "number"
        ? tradeData.total_value
        : Number(tradeData?.total_value ?? tradeData?.current_value ?? 0);
    const currentPrice = typeof tradeData?.current_price === "number"
        ? tradeData.current_price
        : marketState
            ? heldSide === "NO"
                ? 1 - marketState.yesPrice
                : marketState.yesPrice
            : 0.5;

    const handleShare = async () => {
        try {
            await Share.share({
                message: [post.content, marketQuestion].filter(Boolean).join("\n\n"),
            });
        } catch (error) {
            console.error("[PostCard] Failed to open native share sheet:", error);
        }
    };

    const handleDeletePress = () => {
        setShowOwnerActions(false);
        Alert.alert("Delete post", "This post will be removed from your profile and the feed.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    const success = await deletePost(post.id);
                    if (!success) {
                        Alert.alert("Delete failed", "Post could not be deleted right now.");
                        return;
                    }
                    await onPostDeleted?.();
                },
            },
        ]);
    };

    return (
        <View style={styles.container}>
            {/* Header Row */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleOpenAuthorProfile}>
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

                <TouchableOpacity style={styles.headerMeta} onPress={handleOpenAuthorProfile}>
                    <View style={styles.nameRow}>
                        <Text style={styles.displayName}>{post.author?.display_name || post.author?.username}</Text>
                        <Text style={styles.usernameTime}>@{post.author?.username} • {timeAgo}</Text>

                        {/* Type Badge */}
                        {postType !== 'standard' && (
                            <View style={[styles.typeBadge, { backgroundColor: headerBadgeBg }]}>
                                <Text style={[styles.typeBadgeText, { color: headerBadgeText }]}>
                                    {badgeLabel}
                                </Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>

                {/* PnL and Verification */}
                <View style={styles.rightHeader}>
                    {resolution.positionOutcomeLabel ? (
                        <Text style={[styles.resolutionOutcomeText, resolution.positionOutcome === "lost" ? styles.resolutionOutcomeLost : styles.resolutionOutcomeWon]}>
                            {resolution.positionOutcomeLabel}
                        </Text>
                    ) : isPosition && pnlPercent > 0 ? (
                        <Text style={styles.pnlText}>+{pnlPercent.toLocaleString()}%</Text>
                    ) : null}
                    {post.is_verified && (
                        <View style={styles.proofBadge}>
                            <ShieldCheck size={12} color="#34d399" />
                            <Text style={styles.proofBadgeText}>Proof</Text>
                        </View>
                    )}
                    {isOwnPost ? (
                        <View style={styles.ownerActionWrap}>
                            <TouchableOpacity
                                style={styles.ownerActionButton}
                                onPress={() => setShowOwnerActions((prev) => !prev)}
                                disabled={isSubmitting}
                            >
                                <Ellipsis size={16} color="#6b7280" />
                            </TouchableOpacity>
                            {showOwnerActions ? (
                                <View style={styles.ownerMenu}>
                                    <TouchableOpacity style={styles.ownerMenuItem} onPress={handleDeletePress}>
                                        <Trash2 size={14} color="#dc2626" />
                                        <Text style={styles.ownerMenuText}>Delete post</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </View>

            {/* Post Content with vertical line connector */}
            <View style={styles.contentWrapper}>
                <View style={styles.contentLine} />
                <Text style={styles.postContent}>{post.content}</Text>
            </View>

            {/* Market Card Container */}
            {(canTrade || !!marketState || !!post.market_id || !!post.market_question) && (
                <Pressable style={[styles.marketCard, { backgroundColor: cardBgColor }]} onPress={handleOpenMarket}>
                    {/* Inner Content (White Rounded Box) */}
                    <View style={styles.marketInnerCard}>
                        {/* Market Header */}
                        <View style={styles.marketHeader}>
                            <View style={styles.marketImageWrapper}>
                                <Image
                                    source={{ uri: marketImage }}
                                    style={styles.marketImage}
                                />
                            </View>
                            <Text style={styles.marketQuestion} numberOfLines={2}>
                                {marketQuestion}
                            </Text>
                            <CircularGauge percentage={liveProbability} size={32} />
                        </View>

                        {isResolved && (
                            <View style={[styles.resolutionBanner, resolutionAccentStyle]}>
                                <Text style={styles.resolutionBannerText}>{resolution.resultLabel}</Text>
                                <Text style={styles.resolutionBannerSubText}>
                                    {resolution.positionOutcomeLabel ? `Position ${resolution.positionOutcomeLabel.toLowerCase()}` : resolution.detailLabel}
                                </Text>
                            </View>
                        )}

                        {/* Middle Row (Metric Pill + Details) - Only for Position/Sold/Bought/Won */}
                        {isPosition && (
                            <View style={styles.positionDataRow}>
                                <View style={styles.outcomePill}>
                                    <Text style={styles.outcomePillText}>
                                        {tradeData.outcome || 'Yes'}
                                    </Text>
                                </View>
                                <View style={styles.metricsGroup}>
                                    <Text style={styles.metricItemText}>{sharesCount > 0 ? sharesCount.toLocaleString("en-US") : "0"} Shares</Text>
                                    <Text style={styles.metricItemText}>${totalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Market Card Footer (Metrics + Trade Button) */}
                    <View style={styles.marketFooter}>
                        <View style={styles.footerMetrics}>
                            {isPosition && (
                                <View style={styles.footerMetricColumn}>
                                    <Text style={[styles.footerMetricLabel, { color: footerSubTextColor }]}>Avg. Entry</Text>
                                    <Text style={[styles.footerMetricValue, { color: footerTextColor }]}>
                                        {Math.round((tradeData.avg_entry || 0.47) * 100)}<Text style={{ fontWeight: '400' }}>¢</Text>
                                    </Text>
                                </View>
                            )}
                            <View style={styles.footerMetricColumn}>
                                <Text style={[styles.footerMetricLabel, { color: footerSubTextColor }]}>Current Price</Text>
                                <Text style={[styles.footerMetricValue, { color: footerTextColor }]}>
                                    {Math.round(currentPrice * 100)}<Text style={{ fontWeight: '400' }}>¢</Text>
                                </Text>
                            </View>
                        </View>

                        <Pressable
                            style={[
                                styles.tradeActionButton,
                                isResolved && styles.tradeActionButtonResolved,
                                isResolved && resolutionButtonStyle,
                                (!isResolved && (!canTrade || tradeLoading)) && styles.tradeActionButtonDisabled,
                            ]}
                            onPress={(event) => {
                                event.stopPropagation?.();
                                if (!isResolved) {
                                    void handleTradePress();
                                }
                            }}
                            disabled={isResolved || !canTrade || tradeLoading}
                        >
                            <Text style={styles.tradeActionButtonText}>
                                {isResolved ? resolution.actionLabel : tradeLoading ? "Loading..." : "Trade"}
                            </Text>
                        </Pressable>
                    </View>
                </Pressable>
            )}

            {/* Action Bar */}
            <View style={styles.actionBar}>
                <View style={styles.actionBarLeft}>
                    <TouchableOpacity style={styles.actionItem} onPress={handleLike}>
                        <ArrowUp size={16} color={liked ? "#34c759" : "#171717"} strokeWidth={liked ? 2.5 : 2} />
                        <Text style={[styles.actionItemText, liked && { color: "#34c759" }]}>{formatCount(likesCount)}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionItem} onPress={handleDownvote}>
                        <ArrowDown size={16} color={downvoted ? "#ef4444" : "#171717"} strokeWidth={downvoted ? 2.5 : 2} />
                        <Text style={[styles.actionItemText, downvoted && { color: "#ef4444" }]}>{formatCount(downvotesCount)}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionItem} onPress={handleRepost}>
                        <Repeat2 size={16} color={reposted ? "#34c759" : "#171717"} strokeWidth={reposted ? 2.5 : 2} />
                        <Text style={[styles.actionItemText, reposted && { color: "#34c759" }]}>{formatCount(repostsCount)}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.actionItem} onPress={handleShare}>
                    <Share2 size={16} color="#171717" strokeWidth={2} />
                </TouchableOpacity>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.05)",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 27.6, // Matching Figma exactly
    },
    avatarFallback: {
        width: 32,
        height: 32,
        borderRadius: 27.6,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarFallbackText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "bold",
    },
    headerMeta: {
        flex: 1,
        marginLeft: 8,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
    },
    displayName: {
        fontSize: 16,
        fontWeight: "700",
        color: "#000",
    },
    usernameTime: {
        fontSize: 12,
        color: "rgba(0,0,0,0.5)",
        fontWeight: "600",
    },
    typeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: "700",
    },
    rightHeader: {
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 6,
    },
    ownerActionWrap: {
        position: "relative",
        alignItems: "flex-end",
    },
    ownerActionButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.04)",
    },
    ownerMenu: {
        position: "absolute",
        top: 32,
        right: 0,
        minWidth: 132,
        borderRadius: 14,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.08)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 8,
        zIndex: 20,
    },
    ownerMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    ownerMenuText: {
        color: "#dc2626",
        fontSize: 13,
        fontWeight: "700",
    },
    pnlText: {
        fontSize: 20,
        fontWeight: "800",
        color: "#34c759",
        letterSpacing: -0.5,
    },
    resolutionOutcomeText: {
        fontSize: 18,
        fontWeight: "800",
        letterSpacing: -0.4,
    },
    resolutionOutcomeWon: {
        color: "#10b981",
    },
    resolutionOutcomeLost: {
        color: "#ef4444",
    },
    proofBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        marginTop: 2,
    },
    proofBadgeText: {
        fontSize: 10,
        color: "#34c759",
        fontWeight: "700",
    },
    contentWrapper: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 8,
        minHeight: 40,
    },
    contentLine: {
        width: 1,
        backgroundColor: "rgba(0,0,0,0.08)",
        marginVertical: 4,
        borderRadius: 1,
    },
    postContent: {
        flex: 1,
        fontSize: 12,
        color: "#000",
        lineHeight: 18,
        fontWeight: "600",
    },
    marketCard: {
        borderRadius: 16,
        padding: 4,
        marginBottom: 12,
        marginLeft: 6, // Offset to align under contentLine better
    },
    marketInnerCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 8,
        paddingVertical: 10,
    },
    marketHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    resolutionBanner: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 10,
    },
    resolutionAccentYes: {
        backgroundColor: "rgba(16, 185, 129, 0.12)",
    },
    resolutionAccentNo: {
        backgroundColor: "rgba(239, 68, 68, 0.12)",
    },
    resolutionBannerText: {
        color: "#171717",
        fontSize: 13,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.2,
    },
    resolutionBannerSubText: {
        color: "rgba(23,23,23,0.72)",
        fontSize: 12,
        fontWeight: "600",
        marginTop: 2,
    },
    marketImageWrapper: {
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.06)",
    },
    marketImage: {
        width: '100%',
        height: '100%',
    },
    marketQuestion: {
        flex: 1,
        fontSize: 13,
        fontWeight: "700",
        color: "#171717",
        lineHeight: 18,
    },
    positionDataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
        marginBottom: 4,
    },
    outcomePill: {
        backgroundColor: "rgba(52, 199, 89, 0.15)",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        minWidth: 50,
        alignItems: 'center',
    },
    outcomePillSold: {
        backgroundColor: "rgba(237, 66, 40, 0.15)",
    },
    outcomePillText: {
        color: "#34c759",
        fontSize: 16,
        fontWeight: "700",
    },
    outcomePillTextSold: {
        color: "#FF383C",
    },
    metricsGroup: {
        flexDirection: 'row',
        gap: 16,
    },
    metricItemText: {
        fontSize: 18,
        fontWeight: "700",
        color: "#171717",
        letterSpacing: -0.4,
    },
    marketFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    footerMetrics: {
        flexDirection: 'row',
        gap: 12,
    },
    footerMetricColumn: {
        justifyContent: 'center',
    },
    footerMetricLabel: {
        fontSize: 12,
        fontWeight: "800",
        opacity: 0.6,
    },
    footerMetricValue: {
        fontSize: 20,
        fontWeight: "800",
        letterSpacing: -0.5,
    },
    tradeActionButton: {
        backgroundColor: "#171717",
        paddingHorizontal: 22,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.25)",
    },
    tradeActionButtonResolved: {
        borderColor: "transparent",
    },
    tradeActionButtonResolvedYes: {
        backgroundColor: "#10b981",
    },
    tradeActionButtonResolvedNo: {
        backgroundColor: "#ef4444",
    },
    tradeActionButtonDisabled: {
        opacity: 0.5,
    },
    tradeActionButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "800",
    },
    actionBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        marginTop: 4,
    },
    actionBarLeft: {
        flexDirection: "row",
        gap: 32,
    },
    actionItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    actionItemText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#171717",
    },
    textGreen: {
        color: "#34d399",
    }
});
