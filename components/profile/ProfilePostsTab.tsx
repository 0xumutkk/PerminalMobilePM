import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { ArrowDown, ArrowUp, Ellipsis, Repeat2, Share2, Trash2 } from "lucide-react-native";
import type { Market } from "../../lib/mock-data";
import { FeedPost, useFeed } from "../../hooks/useFeed";
import { useAuth } from "../../hooks/useAuth";
import { useInteractions } from "../../hooks/useInteractions";
import { deriveCurrentUserId } from "../../lib/currentUserId";
import { getMarketResolution, getTradeMetadataSide } from "../../lib/marketResolution";
import { resolvePostMarket, resolvePostMarketId } from "../../lib/postMarkets";
import { formatTimeAgo } from "../../lib/utils";
import { PremiumSpinner } from "../ui/PremiumSpinner";
import { PostCard } from "../social/PostCard";

interface ProfilePostsTabProps {
    userId?: string;
}

const FALLBACK_PROFILE_AVATAR = "https://www.figma.com/api/mcp/asset/2cb19e2a-fa00-4ee9-a7cc-1b1b2febad1e";
const FALLBACK_MARKET_IMAGE = "https://www.figma.com/api/mcp/asset/dbb98472-c89b-421a-aae2-8850881646a0";
const STACK_AVATAR_A = "https://www.figma.com/api/mcp/asset/766ccd01-bace-44b5-97b7-d6208890b91c";
const STACK_AVATAR_B = "https://www.figma.com/api/mcp/asset/480e6f4a-3782-427e-b14e-93806ad94f80";

function formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toString();
}

function formatPercent(value: number): string {
    return `${value >= 0 ? "+" : "-"}${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })}%`;
}

function readNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function readString(value: unknown, fallback: string): string {
    if (typeof value === "string" && value.trim().length > 0) return value;
    return fallback;
}

function normalizePercent(value: number, fallback = 51): number {
    if (!Number.isFinite(value)) return fallback;
    const normalized = value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, normalized));
}

function formatCents(value: number): string {
    if (!Number.isFinite(value)) return "--";
    if (value <= 1) return `${Math.round(value * 100)}¢`;
    return `${Math.round(value)}¢`;
}

function MiniGauge({ percent }: { percent: number }) {
    const size = 38;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (percent / 100) * circumference;

    return (
        <View style={styles.gaugeWrap}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#262626"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    opacity={0.25}
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#34c759"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            <Text style={styles.gaugeText}>{Math.round(percent)}%</Text>
        </View>
    );
}

function ProfilePostCard({
    post,
    onTradePress,
    onPostDeleted,
}: {
    post: FeedPost;
    onTradePress: (post: FeedPost) => void;
    onPostDeleted: () => void | Promise<void>;
}) {
    const { user, activeWallet } = useAuth();
    const currentUserId = deriveCurrentUserId(user, activeWallet);
    const { toggleLike, toggleRepost, deletePost, isSubmitting } = useInteractions();

    const [liked, setLiked] = useState(post.user_has_liked);
    const [upvotes, setUpvotes] = useState(post.likes_count || 0);
    const [reposted, setReposted] = useState(post.user_has_reposted);
    const [repostCount, setRepostCount] = useState(post.reposts_count || 0);
    const [marketState, setMarketState] = useState<Market | null>(null);
    const [showOwnerActions, setShowOwnerActions] = useState(false);
    const isOwnPost = currentUserId != null && post.user_id === currentUserId;

    const tradeMetadata = useMemo(() => {
        if (post.trade_metadata && typeof post.trade_metadata === "object" && !Array.isArray(post.trade_metadata)) {
            return post.trade_metadata as Record<string, unknown>;
        }
        return {} as Record<string, unknown>;
    }, [post.trade_metadata]);

    const postTypeRaw = ((post.post_type || "").toLowerCase());
    const isPosition = postTypeRaw === "trade" || postTypeRaw === "position";
    const isThesis = postTypeRaw === "thesis";

    const badgeLabel = isPosition ? "Position" : isThesis ? "Thesis" : "Post";
    const marketPercent = normalizePercent(readNumber(tradeMetadata.market_percent, readNumber(tradeMetadata.yes_probability, 51)), 51);
    const pnlPercent = readNumber(
        tradeMetadata.pnl_percent,
        readNumber(tradeMetadata.unrealized_pnl_percent, 1234.2)
    );

    const sideRaw = readString(tradeMetadata.side, "YES").toUpperCase();
    const sideLabel = sideRaw === "NO" ? "No" : "Yes";
    const isSideYes = sideLabel === "Yes";

    const shares = readNumber(tradeMetadata.shares_count, 12300);
    const totalValue = readNumber(tradeMetadata.total_value, readNumber(tradeMetadata.current_value, 12234.56));
    const avgEntry = readNumber(tradeMetadata.avg_entry, 0.47);
    const currentPrice = readNumber(tradeMetadata.current_price, 0.97);
    const downVotes = Math.max(0, readNumber(tradeMetadata.down_votes, 2300));

    const contentText = readString(
        post.content,
        "Since the Q3 2025 earnings came out on October 22 showing record revenue but a profit miss no new updates this week have shifted the outlook."
    );

    const questionText = readString(
        post.market_question,
        "No change in Fed interest rates after December 2025 meeting?"
    );

    const tradeShellStyle = isPosition ? styles.positionTradeShell : styles.thesisTradeShell;
    const badgeStyle = isPosition ? styles.positionBadge : styles.thesisBadge;
    const badgeTextStyle = isPosition ? styles.positionBadgeText : styles.thesisBadgeText;
    const heldSide = isPosition ? getTradeMetadataSide(tradeMetadata) : null;
    const resolution = getMarketResolution(marketState, heldSide);
    const isResolved = resolution.isResolved;
    const displayMarketPercent = isResolved
        ? (resolution.winningSide === "NO" ? 0 : 100)
        : marketPercent;
    const resolutionButtonStyle = resolution.winningSide === "NO" ? styles.tradeButtonResolvedNo : styles.tradeButtonResolvedYes;
    const resolutionOutcomeStyle = resolution.positionOutcome === "lost" ? styles.resolutionOutcomeLost : styles.resolutionOutcomeWon;

    useEffect(() => {
        let cancelled = false;
        resolvePostMarket(post)
            .then((market) => {
                if (!cancelled) {
                    setMarketState(market);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    console.warn("[ProfilePostsTab] Failed to resolve post market:", error);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [post]);

    const handleToggleLike = async () => {
        const optimistic = !liked;
        setLiked(optimistic);
        setUpvotes((prev) => (optimistic ? prev + 1 : Math.max(0, prev - 1)));

        const next = await toggleLike(post.id);
        if (next == null) {
            setLiked(!optimistic);
            setUpvotes((prev) => (!optimistic ? prev + 1 : Math.max(0, prev - 1)));
        }
    };

    const handleToggleRepost = async () => {
        const optimistic = !reposted;
        setReposted(optimistic);
        setRepostCount((prev) => (optimistic ? prev + 1 : Math.max(0, prev - 1)));

        const next = await toggleRepost(post.id);
        if (next == null) {
            setReposted(!optimistic);
            setRepostCount((prev) => (!optimistic ? prev + 1 : Math.max(0, prev - 1)));
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
                    await onPostDeleted();
                },
            },
        ]);
    };

    return (
        <View style={styles.postContainer}>
            <View style={styles.postTopRow}>
                <Image
                    source={{ uri: post.author?.avatar_url || FALLBACK_PROFILE_AVATAR }}
                    style={styles.avatar}
                    contentFit="cover"
                />

                <View style={styles.postMainColumn}>
                    <View style={styles.postHeaderRow}>
                        <View style={styles.postIdentityRow}>
                            <Text style={styles.displayName}>{post.author?.display_name || post.author?.username || "adil"}</Text>
                            <Text style={styles.metaText}>@{post.author?.username || "adilcreates"}</Text>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.metaText}>{formatTimeAgo(post.created_at)}</Text>
                            <View style={[styles.typeBadge, badgeStyle]}>
                                <Text style={[styles.typeBadgeText, badgeTextStyle]}>{badgeLabel}</Text>
                            </View>
                        </View>

                        {resolution.positionOutcomeLabel ? (
                            <Text style={[styles.resolutionOutcomeText, resolutionOutcomeStyle]}>{resolution.positionOutcomeLabel}</Text>
                        ) : isPosition ? (
                            <Text style={styles.pnlPercent}>{formatPercent(pnlPercent)}</Text>
                        ) : null}
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

                    <View style={styles.contentRow}>
                        <View style={styles.contentRail} />
                        <Text style={styles.contentText} numberOfLines={isPosition ? 7 : 2}>
                            {contentText}
                        </Text>
                    </View>

                    <View style={[styles.tradeShell, tradeShellStyle]}>
                        <View style={styles.tradeCardInner}>
                            <View style={styles.marketHeaderRow}>
                                <Image source={{ uri: FALLBACK_MARKET_IMAGE }} style={styles.marketImage} contentFit="cover" />
                                <Text style={styles.marketQuestion} numberOfLines={2}>{questionText}</Text>
                                <MiniGauge percent={displayMarketPercent} />
                            </View>

                            {isResolved ? (
                                <View style={[styles.resolutionBanner, resolution.winningSide === "NO" ? styles.resolutionBannerNo : styles.resolutionBannerYes]}>
                                    <Text style={styles.resolutionBannerText}>{resolution.resultLabel}</Text>
                                    <Text style={styles.resolutionBannerSubText}>
                                        {resolution.positionOutcomeLabel ? `Position ${resolution.positionOutcomeLabel.toLowerCase()}` : resolution.detailLabel}
                                    </Text>
                                </View>
                            ) : null}

                            {isPosition ? (
                                <View style={styles.positionStatsRow}>
                                    <View style={[styles.sidePill, isSideYes ? styles.sidePillYes : styles.sidePillNo]}>
                                        <Text style={[styles.sidePillText, isSideYes ? styles.sidePillTextYes : styles.sidePillTextNo]}>
                                            {sideLabel}
                                        </Text>
                                    </View>
                                    <Text style={styles.positionShares}>{formatCompact(shares)} Shares</Text>
                                    <Text style={styles.positionValue}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                                </View>
                            ) : null}
                        </View>

                        <View style={styles.tradeFooterRow}>
                            <View style={styles.tradeMetaGroup}>
                                {isPosition ? (
                                    <View>
                                        <Text style={[styles.tradeMetaLabel, styles.tradeMetaLabelOnBlue]}>Avg. Entry</Text>
                                        <Text style={[styles.tradeMetaValue, styles.tradeMetaValueOnBlue]}>{formatCents(avgEntry)}</Text>
                                    </View>
                                ) : null}
                                <View>
                                    <Text style={[styles.tradeMetaLabel, isPosition ? styles.tradeMetaLabelOnBlue : styles.tradeMetaLabelOnGray]}>Current Price</Text>
                                    <Text style={[styles.tradeMetaValue, isPosition ? styles.tradeMetaValueOnBlue : styles.tradeMetaValueOnGray]}>{formatCents(currentPrice)}</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.tradeButton, isResolved && styles.tradeButtonResolved, isResolved && resolutionButtonStyle]}
                                onPress={isResolved ? undefined : () => onTradePress(post)}
                                disabled={isResolved}
                            >
                                <Text style={styles.tradeButtonText}>{isResolved ? resolution.actionLabel : "Trade"}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.stackRow}>
                            <View style={styles.stackWrap}>
                                <Image source={{ uri: STACK_AVATAR_A }} style={[styles.stackAvatar, styles.stackAvatarFront]} contentFit="cover" />
                                <Image source={{ uri: STACK_AVATAR_B }} style={[styles.stackAvatar, styles.stackAvatarBack]} contentFit="cover" />
                                <View style={styles.stackCountPill}>
                                    <Text style={styles.stackCountText}>+14</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.actionItem} onPress={handleToggleLike}>
                            <ArrowUp size={16} color={liked ? "#16a34a" : "#171717"} strokeWidth={2.25} />
                            <Text style={[styles.actionText, liked && styles.actionActiveText]}>{formatCompact(upvotes)}</Text>
                        </TouchableOpacity>

                        <View style={styles.actionItem}>
                            <ArrowDown size={16} color="#171717" strokeWidth={2.25} />
                            <Text style={styles.actionText}>{formatCompact(downVotes)}</Text>
                        </View>

                        <TouchableOpacity style={styles.actionItem} onPress={handleToggleRepost}>
                            <Repeat2 size={16} color={reposted ? "#16a34a" : "#171717"} strokeWidth={2.25} />
                            <Text style={[styles.actionText, reposted && styles.actionActiveText]}>{formatCompact(repostCount)}</Text>
                        </TouchableOpacity>

                        <View style={styles.actionItem}>
                            <Share2 size={16} color="#171717" strokeWidth={2.25} />
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

export function ProfilePostsTab({ userId }: ProfilePostsTabProps) {
    const router = useRouter();
    const { user, activeWallet } = useAuth();
    const viewerId = deriveCurrentUserId(user, activeWallet);
    const { posts, isLoading, error, fetchFeed } = useFeed({ viewerId, userId });
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchFeed();
        setRefreshing(false);
    };

    const handleTradePress = async (id: string) => {
        router.push({
            pathname: "/market/[id]",
            params: { id, single: "true" },
        });
    };

    return (
        <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
                <PostCard post={item} onTradePress={handleTradePress} onPostDeleted={fetchFeed} />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34c759" />}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.listDivider} />}
            ListEmptyComponent={
                isLoading ? (
                    <View style={styles.centerState}>
                        <PremiumSpinner size={30} />
                    </View>
                ) : (
                    <View style={styles.centerState}>
                        <Text style={styles.emptyTitle}>{error ? "Failed to load posts" : "No posts yet"}</Text>
                        <Text style={styles.emptySubtitle}>{error || "Share your first thesis or position."}</Text>
                    </View>
                )
            }
        />
    );
}

const styles = StyleSheet.create({
    listContent: {
        backgroundColor: "#f9f9f9",
        paddingBottom: 120,
    },
    listDivider: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.15)",
    },
    centerState: {
        paddingTop: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    emptyTitle: {
        color: "#171717",
        fontSize: 16,
        fontWeight: "700",
    },
    emptySubtitle: {
        marginTop: 8,
        color: "rgba(0,0,0,0.6)",
        fontSize: 13,
        textAlign: "center",
    },
    postContainer: {
        paddingHorizontal: 8,
        paddingTop: 16,
        paddingBottom: 8,
        backgroundColor: "#f9f9f9",
    },
    postTopRow: {
        flexDirection: "row",
        gap: 8,
        alignItems: "flex-start",
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 27.636,
        backgroundColor: "rgba(0,0,0,0.08)",
    },
    postMainColumn: {
        flex: 1,
        gap: 4,
    },
    postHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    postIdentityRow: {
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 1,
        gap: 2,
    },
    displayName: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
    },
    metaText: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 12,
        fontWeight: "500",
    },
    metaDot: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 12,
    },
    typeBadge: {
        height: 15,
        borderRadius: 4,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 4,
    },
    positionBadge: {
        backgroundColor: "rgba(63,142,247,0.25)",
    },
    thesisBadge: {
        backgroundColor: "#d9d9d9",
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: "600",
        lineHeight: 12,
    },
    positionBadgeText: {
        color: "#08f",
    },
    thesisBadgeText: {
        color: "#171717",
    },
    pnlPercent: {
        color: "#34c759",
        fontSize: 28,
        fontWeight: "700",
        letterSpacing: -0.6,
    },
    ownerActionWrap: {
        position: "relative",
        alignItems: "flex-end",
        marginLeft: 6,
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
    resolutionOutcomeText: {
        fontSize: 24,
        fontWeight: "700",
        letterSpacing: -0.5,
    },
    resolutionOutcomeWon: {
        color: "#10b981",
    },
    resolutionOutcomeLost: {
        color: "#ef4444",
    },
    contentRow: {
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
    },
    contentRail: {
        width: 1,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.15)",
        alignSelf: "stretch",
        minHeight: 30,
    },
    contentText: {
        flex: 1,
        color: "#000",
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "500",
    },
    tradeShell: {
        borderRadius: 16,
        padding: 4,
        width: "100%",
    },
    positionTradeShell: {
        backgroundColor: "#08f",
    },
    thesisTradeShell: {
        backgroundColor: "#d9d9d9",
    },
    tradeCardInner: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 8,
        gap: 12,
    },
    resolutionBanner: {
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: -2,
    },
    resolutionBannerYes: {
        backgroundColor: "rgba(16, 185, 129, 0.12)",
    },
    resolutionBannerNo: {
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
    marketHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    marketImage: {
        width: 40,
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.15)",
        backgroundColor: "#111",
    },
    marketQuestion: {
        flex: 1,
        color: "#171717",
        fontSize: 12,
        lineHeight: 18,
        fontWeight: "600",
    },
    gaugeWrap: {
        width: 38,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
    },
    gaugeText: {
        position: "absolute",
        color: "#262626",
        fontSize: 12,
        fontWeight: "700",
    },
    positionStatsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    sidePill: {
        minWidth: 44,
        borderRadius: 4.8,
        paddingHorizontal: 7.2,
        paddingVertical: 4.8,
        alignItems: "center",
        justifyContent: "center",
    },
    sidePillYes: {
        backgroundColor: "rgba(52,199,89,0.25)",
    },
    sidePillNo: {
        backgroundColor: "rgba(255,56,60,0.2)",
    },
    sidePillText: {
        fontSize: 16,
        fontWeight: "600",
        lineHeight: 21.6,
    },
    sidePillTextYes: {
        color: "#34c759",
    },
    sidePillTextNo: {
        color: "#ff383c",
    },
    positionShares: {
        flex: 1,
        color: "#171717",
        fontSize: 32,
        fontWeight: "600",
        letterSpacing: -0.8,
    },
    positionValue: {
        color: "#171717",
        fontSize: 32,
        fontWeight: "700",
        letterSpacing: -0.8,
    },
    tradeFooterRow: {
        marginTop: 2,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 8,
    },
    tradeMetaGroup: {
        flexDirection: "row",
        gap: 16,
        alignItems: "center",
    },
    tradeMetaLabel: {
        fontSize: 12,
        fontWeight: "700",
        opacity: 0.5,
    },
    tradeMetaLabelOnBlue: {
        color: "#fff",
    },
    tradeMetaLabelOnGray: {
        color: "#171717",
    },
    tradeMetaValue: {
        fontSize: 33,
        fontWeight: "700",
        letterSpacing: -0.8,
    },
    tradeMetaValueOnBlue: {
        color: "#fff",
    },
    tradeMetaValueOnGray: {
        color: "#171717",
    },
    tradeButton: {
        width: 98,
        height: 37,
        borderRadius: 12,
        backgroundColor: "#171717",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.25)",
        alignItems: "center",
        justifyContent: "center",
    },
    tradeButtonResolved: {
        borderColor: "transparent",
    },
    tradeButtonResolvedYes: {
        backgroundColor: "#10b981",
    },
    tradeButtonResolvedNo: {
        backgroundColor: "#ef4444",
    },
    tradeButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    stackRow: {
        marginTop: 6,
        paddingHorizontal: 8,
    },
    stackWrap: {
        flexDirection: "row",
        alignItems: "center",
        height: 28,
    },
    stackAvatar: {
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 0.75,
        borderColor: "#fff",
    },
    stackAvatarFront: {
        transform: [{ rotate: "11deg" }],
        zIndex: 3,
    },
    stackAvatarBack: {
        marginLeft: -8,
        transform: [{ rotate: "-8deg" }],
        zIndex: 2,
    },
    stackCountPill: {
        marginLeft: -6,
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.15)",
        backgroundColor: "#d9d9d9",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    },
    stackCountText: {
        color: "#7d7d7d",
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: -1.32,
    },
    actionRow: {
        marginTop: 6,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    actionItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minWidth: 52,
    },
    actionText: {
        color: "#171717",
        fontSize: 12,
        fontWeight: "600",
    },
    actionActiveText: {
        color: "#16a34a",
    },
});
