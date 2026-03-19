import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { ArrowLeft, UserMinus, UserPlus } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";
import type { Profile } from "../../../lib/database.types";
import { useAuth } from "../../../hooks/useAuth";
import { deriveCurrentUserId } from "../../../lib/currentUserId";
import { useFollowCounts } from "../../../hooks/useFollowCounts";
import { useJupiterPortfolioPerformance } from "../../../hooks/useJupiterPortfolioPerformance";
import type { PortfolioPerformanceRange } from "../../../hooks/useJupiterPortfolioPerformance";
import { MarketChartNative } from "../../../components/MarketChartNative";
import { ProfilePostsTab } from "../../../components/profile/ProfilePostsTab";
import { PremiumSpinner } from "../../../components/ui/PremiumSpinner";
import { BottomProgressiveBlur } from "../../../components/ui/BottomProgressiveBlur";
import { usePositions } from "../../../hooks/usePositions";
import PositionCard from "../../../components/profile/PositionCard";
import { EdgeSwipeBack } from "../../../components/ui/EdgeSwipeBack";

function formatCount(count: number | null | undefined, compact = false) {
    if (!count && count !== 0) return "0";
    if (count >= 1000) {
        const val = (count / 1000).toFixed(1);
        return compact ? `${val.replace(".", ",")}k` : `${val}K`;
    }
    return count.toString();
}

function formatCurrency(value: number | null | undefined) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    const sign = value >= 0 ? "+" : "-";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
    return `${sign}$${abs.toFixed(2)}`;
}

export default function ProfileDetailScreen() {
    const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
    const router = useRouter();
    const navigation = useNavigation();
    const { user, activeWallet } = useAuth();
    const currentUserId = deriveCurrentUserId(user, activeWallet);

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [activeTab, setActiveTab] = useState<"Overview" | "Posts">("Overview");

    const isOwnProfile = currentUserId != null && id != null && currentUserId === id;
    const { followersCount, followingCount, refresh: refreshFollowCounts } = useFollowCounts(id ?? null);
    const {
        balanceSeries,
        isLoading: performanceLoading,
        range,
        realizedPnlUsd,
        winRate,
        setRange,
        refresh: refreshPerformance,
    } = useJupiterPortfolioPerformance(profile?.wallet_address ?? null);
    const {
        activePositions,
        isLoading: positionsLoading,
        refresh: refreshPositions,
    } = usePositions(profile?.wallet_address ?? null);

    useEffect(() => {
        if (!id) {
            setError("Invalid profile");
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const { data, error: profileError } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", id)
                    .single();

                if (profileError) throw profileError;
                if (cancelled) return;

                setProfile(data as Profile);

                if (currentUserId && currentUserId !== id) {
                    const { data: followData, error: followError } = await supabase
                        .from("follows")
                        .select("id")
                        .eq("follower_id", currentUserId)
                        .eq("following_id", id)
                        .maybeSingle();

                    if (followError) throw followError;
                    if (!cancelled) {
                        setIsFollowing(followData != null);
                    }
                } else if (!cancelled) {
                    setIsFollowing(false);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(fetchError instanceof Error ? fetchError.message : "Failed to load profile");
                    setProfile(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentUserId, id]);

    const handleFollowToggle = async () => {
        if (!currentUserId || !id || followLoading || isOwnProfile) return;

        setFollowLoading(true);
        try {
            if (isFollowing) {
                const { error: unfollowError } = await supabase
                    .from("follows")
                    .delete()
                    .eq("follower_id", currentUserId)
                    .eq("following_id", id);

                if (unfollowError) throw unfollowError;
                setIsFollowing(false);
            } else {
                const { error: followError } = await supabase
                    .from("follows")
                    .insert({ follower_id: currentUserId, following_id: id } as never);

                if (followError) throw followError;
                setIsFollowing(true);
            }

            await refreshFollowCounts();
        } catch (followError) {
            setError(followError instanceof Error ? followError.message : "Follow action failed");
        } finally {
            setFollowLoading(false);
        }
    };

    const handleRefreshOverview = async () => {
        await Promise.all([
            refreshFollowCounts(),
            refreshPerformance(),
            refreshPositions(),
        ]);
    };

    const handleBack = useCallback(() => {
        if (from === "search") {
            router.replace("/search");
            return;
        }

        if (from === "explore") {
            router.replace("/explore");
            return;
        }

        if (from === "leaderboard") {
            router.replace("/leaderboard");
            return;
        }

        if (navigation.canGoBack()) {
            navigation.goBack();
            return;
        }

        router.replace("/leaderboard");
    }, [from, navigation, router]);

    const bioText = profile?.bio?.trim() || "No bio yet.";
    const displayedFollowers = followersCount ?? profile?.followers_count ?? 0;
    const displayedFollowing = followingCount ?? profile?.following_count ?? 0;
    const displayedTrades = profile?.trades_count ?? 0;
    const displayName = profile?.display_name || profile?.username || "User";
    const username = `@${profile?.username || "user"}`;
    const performanceLabel = range === "ALL" ? "All time" : range;
    const chartColor = useMemo(() => {
        if (balanceSeries.length >= 2) {
            return balanceSeries[balanceSeries.length - 1].value >= balanceSeries[0].value ? "#34c759" : "#ef4444";
        }
        return typeof realizedPnlUsd === "number" && realizedPnlUsd < 0 ? "#ef4444" : "#34c759";
    }, [balanceSeries, realizedPnlUsd]);
    const topOpenPositions = useMemo(
        () => activePositions.slice(0, 4),
        [activePositions],
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={["top"]}>
                <EdgeSwipeBack onBack={handleBack} />
                <View style={styles.centerState}>
                    <PremiumSpinner size={34} />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !profile) {
        return (
            <SafeAreaView style={styles.container} edges={["top"]}>
                <EdgeSwipeBack onBack={handleBack} />
                <View style={styles.centerState}>
                    <Text style={styles.errorText}>{error ?? "Profile not found"}</Text>
                    <Pressable style={styles.errorButton} onPress={handleBack}>
                        <Text style={styles.errorButtonText}>Go back</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <EdgeSwipeBack onBack={handleBack} />
            <View style={styles.headerShell}>
                <View style={styles.navbar}>
                    <View style={styles.navbarLeft}>
                        <Pressable style={styles.backButton} onPress={handleBack}>
                            <ArrowLeft size={20} color="#111" strokeWidth={2.2} />
                        </Pressable>
                        <Text style={styles.navbarUsername}>{username}</Text>
                    </View>
                    {!isOwnProfile && currentUserId ? (
                        <Pressable
                            style={[styles.followButton, isFollowing && styles.followButtonActive]}
                            onPress={handleFollowToggle}
                            disabled={followLoading}
                        >
                            {followLoading ? (
                                <PremiumSpinner size={16} color="#ffffff" />
                            ) : isFollowing ? (
                                <>
                                    <UserMinus size={16} color="#fff" strokeWidth={2.2} />
                                    <Text style={styles.followButtonText}>Following</Text>
                                </>
                            ) : (
                                <>
                                    <UserPlus size={16} color="#fff" strokeWidth={2.2} />
                                    <Text style={styles.followButtonText}>Follow</Text>
                                </>
                            )}
                        </Pressable>
                    ) : null}
                </View>

                <View style={styles.headerSection}>
                    <View style={styles.headerMainRow}>
                        <View style={styles.identityCluster}>
                            <View style={styles.nameBlock}>
                                <Image
                                    source={profile.avatar_url ? { uri: profile.avatar_url } : require("../../../assets/icon.png")}
                                    style={styles.avatar}
                                />
                                <Text style={styles.displayName} numberOfLines={1}>
                                    {displayName}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.mainStats}>
                            <View style={[styles.statBox, styles.statBoxFollowers]}>
                                <Text style={styles.statValue}>{formatCount(displayedFollowers)}</Text>
                                <Text style={styles.statLabel}>Followers</Text>
                            </View>
                            <View style={[styles.statBox, styles.statBoxFollowing]}>
                                <Text style={styles.statValue}>{formatCount(displayedFollowing)}</Text>
                                <Text style={styles.statLabel}>Following</Text>
                            </View>
                            <View style={[styles.statBox, styles.statBoxTrades]}>
                                <Text style={styles.statValue}>{formatCount(displayedTrades, true)}</Text>
                                <Text style={styles.statLabel}>Trades</Text>
                            </View>
                        </View>
                    </View>
                    <Text style={styles.bio}>{bioText}</Text>
                </View>
            </View>

            <View style={styles.tabContainer}>
                <Pressable
                    style={[styles.tab, activeTab === "Overview" && styles.activeTab]}
                    onPress={() => setActiveTab("Overview")}
                >
                    <Text style={[styles.tabText, activeTab === "Overview" && styles.activeTabText]}>Overview</Text>
                </Pressable>
                <Pressable
                    style={[styles.tab, activeTab === "Posts" && styles.activeTab]}
                    onPress={() => setActiveTab("Posts")}
                >
                    <Text style={[styles.tabText, activeTab === "Posts" && styles.activeTabText]}>Posts</Text>
                </Pressable>
            </View>

            {activeTab === "Overview" ? (
                <View style={styles.overviewContainer}>
                    <View style={styles.valueSection}>
                        <View style={styles.valueHeader}>
                            <Text style={styles.totalValue}>{formatCurrency(realizedPnlUsd)}</Text>
                            <View style={styles.pnlRow}>
                                <Text
                                    style={[
                                        styles.pnlValue,
                                        typeof realizedPnlUsd === "number" && realizedPnlUsd < 0 ? styles.pnlNegative : styles.pnlPositive,
                                    ]}
                                >
                                    {formatCurrency(realizedPnlUsd)}
                                </Text>
                                <Text style={styles.pnlLabel}>{performanceLabel}</Text>
                            </View>
                        </View>

                        <View style={styles.chartCard}>
                            <MarketChartNative
                                data={balanceSeries}
                                color={chartColor}
                                activeRange={range}
                                onRangeChange={(nextRange) => setRange(nextRange as PortfolioPerformanceRange)}
                                valueType="price"
                                curveType="step"
                                hideHeader
                            />
                            {performanceLoading ? (
                                <View style={styles.chartLoadingOverlay} pointerEvents="none">
                                    <PremiumSpinner size={20} />
                                </View>
                            ) : null}
                        </View>

                        <View style={styles.summaryGrid}>
                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryLabel}>Realized Profit</Text>
                                <Text style={styles.summaryValue}>{formatCurrency(realizedPnlUsd)}</Text>
                            </View>
                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryLabel}>Win Rate</Text>
                                <Text style={styles.summaryValue}>
                                    {typeof winRate === "number" ? `${Math.round(winRate)}%` : "--"}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.positionsSection}>
                            <View style={styles.positionsHeader}>
                                <Text style={styles.positionsTitle}>Open Positions</Text>
                                <Text style={styles.positionsCount}>{activePositions.length}</Text>
                            </View>
                            <View style={styles.positionsCard}>
                                {positionsLoading ? (
                                    <View style={styles.positionsLoader}>
                                        <PremiumSpinner size={24} />
                                    </View>
                                ) : topOpenPositions.length > 0 ? (
                                    topOpenPositions.map((position, index) => (
                                        <View key={`${position.mint}-${index}`}>
                                            <PositionCard
                                                position={position}
                                                onPress={() => router.push({
                                                    pathname: "/market/[id]",
                                                    params: { id: position.marketId, single: "true" },
                                                })}
                                            />
                                            {index < topOpenPositions.length - 1 ? <View style={styles.positionDivider} /> : null}
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.positionsEmpty}>No open positions yet.</Text>
                                )}
                            </View>
                        </View>
                    </View>
                    <View style={styles.overviewSpacer} />
                </View>
            ) : (
                <ProfilePostsTab userId={profile.id} />
            )}

            <BottomProgressiveBlur style={styles.bottomBlur} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f9f9f9",
    },
    centerState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    errorText: {
        color: "#111",
        fontSize: 16,
        fontWeight: "600",
        textAlign: "center",
    },
    errorButton: {
        marginTop: 14,
        backgroundColor: "#111",
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 10,
    },
    errorButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    headerShell: {
        paddingHorizontal: 8,
        paddingTop: 2,
        paddingBottom: 8,
    },
    navbar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 6,
        paddingBottom: 8,
    },
    navbarLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
    },
    backButton: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 6,
    },
    navbarUsername: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
        opacity: 0.5,
        letterSpacing: -0.4,
    },
    followButton: {
        minWidth: 108,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 14,
    },
    followButtonActive: {
        backgroundColor: "#3b3b3b",
    },
    followButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    headerSection: {
        paddingBottom: 16,
    },
    headerMainRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    identityCluster: {
        flex: 1,
        minWidth: 0,
        marginRight: 12,
    },
    nameBlock: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 48,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    displayName: {
        color: "#000",
        fontSize: 24,
        fontWeight: "700",
        letterSpacing: -0.6,
        lineHeight: 24,
        flexShrink: 1,
    },
    mainStats: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    statBox: {
        alignItems: "center",
    },
    statBoxFollowers: {
        width: 54,
    },
    statBoxFollowing: {
        width: 60,
    },
    statBoxTrades: {
        width: 42,
    },
    statValue: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
        textAlign: "center",
    },
    statLabel: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: -0.3,
        textAlign: "center",
    },
    bio: {
        color: "#000",
        fontSize: 16,
        fontWeight: "500",
        marginTop: 16,
        letterSpacing: -0.6,
    },
    tabContainer: {
        flexDirection: "row",
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: "center",
        borderBottomWidth: 2,
        borderBottomColor: "transparent",
    },
    activeTab: {
        borderBottomColor: "#d9d9d9",
    },
    tabText: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        opacity: 0.5,
    },
    activeTabText: {
        opacity: 1,
    },
    overviewContainer: {
        flex: 1,
    },
    valueSection: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#d9d9d9",
        borderLeftWidth: 0,
        borderRightWidth: 0,
        paddingTop: 12,
        paddingBottom: 16,
    },
    valueHeader: {
        paddingHorizontal: 8,
    },
    totalValue: {
        color: "#000",
        fontSize: 40,
        fontWeight: "700",
        letterSpacing: -1.6,
        lineHeight: 42,
    },
    pnlRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 6,
    },
    pnlValue: {
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
    },
    pnlPositive: {
        color: "#34c759",
    },
    pnlNegative: {
        color: "#ef4444",
    },
    pnlLabel: {
        color: "rgba(0,0,0,0.5)",
        fontSize: 14,
        fontWeight: "600",
    },
    chartCard: {
        minHeight: 248,
        marginTop: 8,
        marginHorizontal: 8,
        position: "relative",
    },
    chartLoadingOverlay: {
        position: "absolute",
        top: 20,
        right: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    summaryGrid: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 8,
        paddingTop: 8,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: "#eee",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8,
    },
    summaryLabel: {
        color: "rgba(0,0,0,0.55)",
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    summaryValue: {
        color: "#000",
        fontSize: 26,
        fontWeight: "800",
        letterSpacing: -0.8,
    },
    positionsSection: {
        paddingHorizontal: 8,
        paddingTop: 8,
    },
    positionsHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 2,
        paddingBottom: 8,
    },
    positionsTitle: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
    },
    positionsCount: {
        color: "rgba(0,0,0,0.45)",
        fontSize: 15,
        fontWeight: "600",
    },
    positionsCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: "#e5e5e5",
    },
    positionsLoader: {
        paddingVertical: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    positionsEmpty: {
        color: "rgba(0,0,0,0.45)",
        fontSize: 14,
        fontWeight: "600",
        textAlign: "center",
        paddingVertical: 22,
    },
    positionDivider: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.08)",
    },
    overviewSpacer: {
        height: 100,
    },
    bottomBlur: {
        zIndex: 40,
    },
});
