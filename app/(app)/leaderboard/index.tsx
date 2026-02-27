import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    Pressable,
    Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { usePrivy, useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { supabase } from "../../../lib/supabase";
import { Profile } from "../../../lib/database.types";
import {
    User,
    Flame,
    Bitcoin,
    UserPlus,
    Award,
    Bell,
    ArrowUpCircle,
} from "lucide-react-native";
import Animated, {
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    interpolate,
    Extrapolation,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

function formatPnl(value: number): string {
    const abs = Math.abs(value);
    const sign = value >= 0 ? "+" : "-";
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(2)}`;
}

function formatPnlParts(value: number): { whole: string; decimal: string } | null {
    if (value === null || value === undefined) return null;
    const abs = Math.abs(value);
    const sign = value >= 0 ? "+" : "-";
    if (abs >= 1_000) return { whole: `${sign}$${(abs / 1_000).toFixed(1)}K`, decimal: "" };
    const fixed = value.toFixed(2);
    const [wholePart, decimalPart] = fixed.split(".");
    return { whole: `${sign}$${wholePart}.`, decimal: decimalPart };
}

function formatRank(rank: number): string {
    if (rank >= 1_000) return `#${(rank / 1_000).toFixed(2)}K`;
    return `#${rank.toLocaleString()}`;
}

function RankBadge({ rank }: { rank: number }) {
    const isTopThree = rank <= 3;
    if (rank === 1) return <Award size={14} color="#EAB308" fill="#EAB308" />;
    if (rank === 2) return <Award size={14} color="#94A3B8" fill="#94A3B8" />;
    if (rank === 3) return <Award size={14} color="#B45309" fill="#B45309" />;
    return (
        <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank}</Text>
        </View>
    );
}

function MetricItem({ icon: Icon, value, width }: { icon: any; value: string | number; width?: number }) {
    return (
        <View style={[styles.metricItem, width ? { width } : null]}>
            <Icon size={16} color="rgba(0,0,0,0.6)" strokeWidth={2} />
            <Text style={styles.metricValue}>{value}</Text>
        </View>
    );
}

function LeaderboardRow({
    profile,
    rank,
    onPress,
}: {
    profile: Profile;
    rank: number;
    onPress?: () => void;
}) {
    const pnl = profile.pnl ?? 0;
    const tradesCount = profile.trades_count ?? 0;
    const winRate = profile.win_rate ?? 0;
    const pnlParts = formatPnlParts(pnl);
    const isPositive = pnl >= 0;

    return (
        <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={onPress}
        >
            <View style={styles.rankBadgeCell}>
                <View style={styles.rankContent}>
                    <Text style={styles.rankText}>{rank}</Text>
                    {rank <= 3 && <RankBadge rank={rank} />}
                </View>
            </View>

            <View style={styles.rowMainContent}>
                <View style={styles.userInfo}>
                    <View style={styles.avatarWrap}>
                        {profile.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <User color="#52525b" size={14} strokeWidth={2} />
                            </View>
                        )}
                    </View>
                    <Text style={styles.displayName} numberOfLines={1}>
                        {profile.display_name || profile.username || "..."}
                    </Text>
                </View>

                <MetricItem icon={UserPlus} value={tradesCount} width={49} />
                <MetricItem icon={Flame} value={`${Math.round(winRate)}`} width={48} />

                <View style={styles.pnlCol}>
                    <Text
                        style={[
                            styles.pnl,
                            isPositive ? styles.pnlPositive : styles.pnlNegative,
                        ]}
                        numberOfLines={1}
                    >
                        {pnlParts?.whole ?? "..."}
                    </Text>
                    {pnlParts?.decimal ? (
                        <Text
                            style={[
                                styles.pnlDecimal,
                                isPositive ? styles.pnlPositiveDecimal : styles.pnlNegativeDecimal,
                            ]}
                        >
                            {pnlParts.decimal}
                        </Text>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}


export default function LeaderboardScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = usePrivy();
    const solanaWallet = useEmbeddedSolanaWallet();
    const primaryAddress =
        isConnected(solanaWallet) && solanaWallet.wallets?.[0]
            ? solanaWallet.wallets[0].address
            : null;

    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
    });

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<"Friends" | "All">("All");
    const [followingIds, setFollowingIds] = useState<string[]>([]);
    const [followRefreshKey, setFollowRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const { data, error: err } = await supabase
                    .from("profiles")
                    .select("id, wallet_address, username, display_name, avatar_url, pnl, win_rate, trades_count")
                    .order("pnl", { ascending: false });

                if (cancelled) return;
                if (err) {
                    setError(err.message);
                    setProfiles([]);
                    return;
                }
                setProfiles((data as Profile[]) ?? []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const myProfile = useMemo(
        () =>
            primaryAddress
                ? profiles.find((p) => p.wallet_address === primaryAddress)
                : null,
        [profiles, primaryAddress]
    );
    const myRank = myProfile
        ? profiles.findIndex((p) => p.id === myProfile.id) + 1
        : null;
    const myPnl = myProfile?.pnl ?? null;

    // Takip ettiklerim: aynı cüzdana ait tüm profil id'leri için (wallet-id ve did:privy id) follows çek
    const myProfileIds = useMemo(() => {
        const ids = new Set<string>();
        if (user?.id) ids.add(user.id);
        if (primaryAddress && profiles.length)
            profiles.filter((p) => p.wallet_address === primaryAddress).forEach((p) => ids.add(p.id));
        return Array.from(ids);
    }, [user?.id, primaryAddress, profiles]);

    useEffect(() => {
        if (myProfileIds.length === 0) {
            setFollowingIds([]);
            return;
        }
        let cancelled = false;
        supabase
            .from("follows")
            .select("following_id")
            .in("follower_id", myProfileIds)
            .then(({ data }) => {
                if (cancelled) return;
                const ids = (data ?? []).map((r: any) => r.following_id);
                setFollowingIds([...new Set(ids)]);
            });
        return () => { cancelled = true; };
    }, [myProfileIds.join(","), followRefreshKey]);

    useFocusEffect(
        useCallback(() => {
            setFollowRefreshKey((k) => k + 1);
        }, [])
    );

    const listData = useMemo(
        () =>
            tab === "Friends"
                ? profiles.filter((p) => followingIds.includes(p.id))
                : profiles,
        [tab, profiles, followingIds]
    );

    const renderHeader = () => {
        const pnlParts = myPnl != null ? formatPnlParts(myPnl) : null;
        return (
            <>
                <View style={[styles.topCard, { marginTop: insets.top }]}>
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>Leaderboard</Text>
                        <Pressable style={styles.bellButton}>
                            <Bell size={20} color="#8d8d8d" strokeWidth={1.8} />
                        </Pressable>
                    </View>

                    <View style={styles.yourRankContent}>
                        <View style={styles.yourRankLeft}>
                            <View style={styles.yourRankAvatarWrap}>
                                {myProfile?.avatar_url ? (
                                    <Image
                                        source={{ uri: myProfile.avatar_url }}
                                        style={styles.yourRankAvatar}
                                    />
                                ) : (
                                    <View style={styles.yourRankAvatarPlaceholder}>
                                        <User color="#52525b" size={24} strokeWidth={2} />
                                    </View>
                                )}
                            </View>
                            <View style={styles.yourRankTextCol}>
                                <Text style={styles.yourRankLabel}>Rank</Text>
                                <Text style={styles.yourRankNumber}>
                                    {myRank != null ? formatRank(myRank) : "—"}
                                </Text>
                            </View>
                        </View>
                        {pnlParts && (
                            <View style={styles.yourRankPnlWrap}>
                                <Text
                                    style={[
                                        styles.yourRankPnl,
                                        myPnl! >= 0 ? styles.pnlPositive : styles.pnlNegative,
                                    ]}
                                >
                                    {pnlParts.whole}
                                </Text>
                                {pnlParts.decimal ? (
                                    <Text
                                        style={[
                                            styles.yourRankPnlDecimal,
                                            myPnl! >= 0 ? styles.pnlPositiveDecimal : styles.pnlNegativeDecimal,
                                        ]}
                                    >
                                        {pnlParts.decimal}
                                    </Text>
                                ) : null}
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.tabsWrapper}>
                    <View style={styles.tabsPillContainer}>
                        <Pressable
                            style={[styles.tabPill, tab === "All" ? styles.tabActive : styles.tabInactive]}
                            onPress={() => setTab("All")}
                        >
                            <Flame size={20} color={tab === "All" ? "#3b82f7" : "rgba(0,0,0,0.4)"} strokeWidth={2} />
                            <Text style={[styles.tabText, tab === "All" && styles.tabTextActive]} numberOfLines={1}>
                                All
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabPill, tab === "Friends" ? styles.tabActive : styles.tabInactive]}
                            onPress={() => setTab("Friends")}
                        >
                            <Bitcoin size={20} color={tab === "Friends" ? "#3b82f7" : "rgba(0,0,0,0.4)"} strokeWidth={2} />
                            <Text style={[styles.tabText, tab === "Friends" && styles.tabTextActive]} numberOfLines={1}>
                                Following
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </>
        );
    };

    const renderStickyHeader = () => {
        const animatedStyle = useAnimatedStyle(() => {
            return {
                opacity: interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP),
                transform: [
                    { translateY: interpolate(scrollY.value, [40, 80], [-20, 0], Extrapolation.CLAMP) },
                ],
            };
        });

        return (
            <Animated.View style={[styles.stickyHeaderContainer, animatedStyle]} pointerEvents="box-none">
                <View style={[styles.stickyHeaderContent, { paddingTop: insets.top }]}>
                    <View style={styles.stickyTopRow}>
                        <View style={styles.stickyMetricsRow}>
                            <View style={styles.stickyMetricItem}>
                                <Award size={16} color="#EAB308" fill="#EAB308" />
                                <Text style={styles.stickyMetricValue}>
                                    {myRank != null ? myRank.toLocaleString() : "—"}
                                </Text>
                            </View>
                            <View style={styles.stickyMetricItem}>
                                <ArrowUpCircle size={16} color="#34C759" />
                                <Text style={styles.stickyMetricValue}>
                                    {myPnl != null ? formatPnl(myPnl) : "—"}
                                </Text>
                            </View>
                        </View>
                        <Pressable style={styles.stickyBellButton}>
                            <Bell size={24} color="#000" strokeWidth={1.8} />
                        </Pressable>
                    </View>

                    <View style={styles.stickyTabsRow}>
                        <Pressable
                            style={[styles.tabPill, tab === "All" ? styles.tabActive : styles.tabInactive]}
                            onPress={() => setTab("All")}
                        >
                            <Flame size={20} color={tab === "All" ? "#3b82f7" : "rgba(0,0,0,0.4)"} strokeWidth={2} />
                            <Text style={[styles.tabText, tab === "All" && styles.tabTextActive]} numberOfLines={1}>
                                All
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tabPill, tab === "Friends" ? styles.tabActive : styles.tabInactive]}
                            onPress={() => setTab("Friends")}
                        >
                            <Bitcoin size={20} color={tab === "Friends" ? "#3b82f7" : "rgba(0,0,0,0.4)"} strokeWidth={2} />
                            <Text style={[styles.tabText, tab === "Friends" && styles.tabTextActive]} numberOfLines={1}>
                                Following
                            </Text>
                        </Pressable>
                    </View>
                </View>
                <View style={styles.stickyHeaderBorder} />
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {renderStickyHeader()}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#3b82f7" />
                </View>
            ) : error ? (
                <View style={styles.centered}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : (
                <Animated.FlatList
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    data={listData}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={renderHeader}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item, index }) => (
                        <LeaderboardRow
                            profile={item}
                            rank={index + 1}
                            onPress={() => router.push(`/profile/${item.id}`)}
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>
                                {tab === "Friends"
                                    ? !myProfile
                                        ? "Sign in to see friends."
                                        : "No friends yet. Follow users to see them here."
                                    : "No profiles yet."}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f0f0f0",
    },
    centered: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        justifyContent: "center",
        alignItems: "center",
    },
    errorText: {
        color: "#ef4444",
        fontSize: 15,
    },
    topCard: {
        backgroundColor: "#fff",
        borderRadius: 24,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.08)",
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
        marginBottom: 8,
    },
    titleRow: {
        height: 42,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    title: {
        color: "#171717",
        fontSize: 24,
        lineHeight: 32,
        fontWeight: "700",
        letterSpacing: -0.6,
    },
    bellButton: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
    },
    tabsWrapper: {
        paddingHorizontal: 0, // List container already has 14px padding
        paddingVertical: 4,
        marginTop: 0,
        opacity: 1,
        alignItems: "center",
        width: "100%",
    },
    tabsPillContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    tabPill: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        height: 30,
        paddingLeft: 5,
        paddingRight: 10,
        borderRadius: 32,
        borderCurve: "continuous",
    },
    tabActive: {
        backgroundColor: "rgba(59, 130, 247, 0.15)",
    },
    tabInactive: {
        backgroundColor: "rgba(0, 0, 0, 0.05)",
    },
    tabText: {
        color: "rgba(0, 0, 0, 0.4)",
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
        textAlign: "left",
    },
    tabTextActive: {
        color: "#3b82f7",
        fontWeight: "500",
    },
    yourRankContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
    },
    yourRankLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    yourRankTextCol: {
        gap: 8,
    },
    yourRankLabel: {
        color: "rgba(0, 0, 0, 0.4)",
        fontSize: 14,
        fontWeight: "600",
        lineHeight: 16,
    },
    yourRankAvatarWrap: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.08)",
    },
    yourRankAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderCurve: "continuous",
    },
    yourRankAvatarPlaceholder: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderCurve: "continuous",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.08)",
        alignItems: "center",
        justifyContent: "center",
    },
    yourRankNumber: {
        color: "#171717",
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "500",
    },
    yourRankPnlWrap: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 88,
    },
    yourRankPnl: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "500",
    },
    yourRankPnlDecimal: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "500",
    },
    listContent: {
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 24,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        height: 44,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(0,0,0,0.05)",
    },
    rowPressed: {
        opacity: 0.7,
    },
    rankBadgeCell: {
        width: 32,
    },
    rankContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    rankBadge: {
        width: 14,
        height: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    rankText: {
        color: "rgba(0, 0, 0, 0.8)",
        fontSize: 14,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
    },
    rowMainContent: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    userInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        width: 96,
    },
    avatarWrap: {
        width: 20,
        height: 20,
        borderRadius: 41,
        overflow: "hidden",
        backgroundColor: "rgba(230,230,230,0.35)",
    },
    avatar: {
        width: 20,
        height: 20,
    },
    avatarPlaceholder: {
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    displayName: {
        color: "rgba(0, 0, 0, 0.8)",
        fontSize: 14,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
        flex: 1,
    },
    metricItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    metricValue: {
        color: "rgba(0, 0, 0, 0.8)",
        fontSize: 14,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
    },
    pnlCol: {
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "flex-end",
        width: 78,
    },
    pnl: {
        fontSize: 14,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
        lineHeight: 20,
    },
    pnlDecimal: {
        fontSize: 14,
        fontWeight: "500",
        fontFamily: "Geist-Medium",
        lineHeight: 20,
    },
    pnlPositive: {
        color: "rgba(0, 0, 0, 0.8)", // Figma shows pnl in same color as others in this specific node
    },
    pnlPositiveDecimal: {
        color: "rgba(0, 0, 0, 0.4)",
    },
    pnlNegative: {
        color: "#ef4444",
    },
    pnlNegativeDecimal: {
        color: "rgba(239, 68, 68, 0.5)",
    },
    empty: {
        paddingVertical: 80,
        alignItems: "center",
        backgroundColor: "#f5f5f5",
    },
    emptyText: {
        color: "rgba(0, 0, 0, 0.4)",
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    stickyHeaderContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: "#ffffff",
        overflow: "hidden",
    },
    stickyHeaderContent: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    stickyTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        height: 31,
        marginTop: 8,
        gap: 20,
    },
    stickyMetricsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    stickyMetricItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    stickyMetricValue: {
        fontSize: 16,
        fontWeight: "500",
        color: "#000",
    },
    stickyBellButton: {
        width: 85,
        height: 31,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
    },
    stickyTabsRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 8,
    },
    stickyHeaderBorder: {
        height: 1,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
});
