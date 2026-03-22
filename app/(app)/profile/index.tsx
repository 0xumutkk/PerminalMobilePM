import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter, useNavigation } from "expo-router";
import { usePrivy } from "@privy-io/expo";
import { useAuth } from "../../../hooks/useAuth";
import { useTrade } from "../../../hooks/useTrade";
import { useProfile } from "../../../hooks/useProfile";
import { useFollowCounts } from "../../../hooks/useFollowCounts";
import { useJupiterPortfolioPerformance } from "../../../hooks/useJupiterPortfolioPerformance";
import PortfolioTab from "../../../components/profile/PortfolioTab";
import { ProfilePostsTab } from "../../../components/profile/ProfilePostsTab";
import {
    Clock,
    Settings,
} from "lucide-react-native";
import { BottomProgressiveBlur } from "../../../components/ui/BottomProgressiveBlur";

export default function ProfileScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { logout } = usePrivy();
    const { activeWallet } = useAuth();
    const { profile, isLoading: profileLoading } = useProfile();
    const { usdcBalance, fetchBalance } = useTrade();
    const { followersCount, followingCount, refresh: refreshFollowCounts } = useFollowCounts(profile?.id ?? null);
    const {
        balanceSeries,
        isLoading: performanceLoading,
        range: performanceRange,
        realizedPnlUsd,
        refresh: refreshPerformance,
        setRange: setPerformanceRange,
    } = useJupiterPortfolioPerformance(activeWallet?.address ?? null);
    const [activeTab, setActiveTab] = useState<"Portfolio" | "Posts">("Portfolio");

    const formatCount = (count: number | null | undefined, isTrades = false) => {
        if (!count && count !== 0) return "0";
        if (count >= 1000) {
            const val = (count / 1000).toFixed(1);
            return isTrades ? val.replace(".", ",") + "k" : val + "K";
        }
        return count.toString();
    };

    const handleLogout = async () => {
        await logout();
        router.replace("/login");
    };

    const handleProfileRefresh = React.useCallback(async () => {
        await Promise.all([
            fetchBalance(),
            refreshFollowCounts(),
            refreshPerformance(),
        ]);
    }, [fetchBalance, refreshFollowCounts, refreshPerformance]);

    React.useEffect(() => {
        const unsubscribeList = [
            navigation.addListener("focus", () => {
                handleProfileRefresh();
            })
        ];
        return () => {
            for (const unsubscribe of unsubscribeList) {
                unsubscribe();
            }
        };
    }, [navigation, handleProfileRefresh]);

    const displayedFollowers = followersCount ?? profile?.followers_count;
    const displayedFollowing = followingCount ?? profile?.following_count;
    const displayedTrades = profile?.trades_count ?? 0;
    const displayName = profileLoading ? "Loading..." : profile?.display_name || profile?.username || "User";
    const username = `@${profile?.username || "user"}`;
    const bioText = profile?.bio?.trim() || "Do Everything Great or Die";

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.headerShell}>
                <View style={styles.navbar}>
                    <View style={styles.usernameRow}>
                        <Text style={styles.navbarUsername}>{username}</Text>
                        <View style={styles.xLogo}>
                            <Text style={styles.xLogoText}>𝕏</Text>
                        </View>
                    </View>
                    <View style={styles.navbarActions}>
                        <Pressable style={styles.navButton} onPress={() => router.push("/profile/history")}>
                            <Clock size={20} color="#111" strokeWidth={2} />
                        </Pressable>
                        <Pressable style={styles.navButton} onPress={handleLogout}>
                            <Settings size={20} color="#111" strokeWidth={2} />
                        </Pressable>
                    </View>
                </View>

                <View style={styles.headerSection}>
                    <View style={styles.headerMainRow}>
                        <View style={styles.identityCluster}>
                            <View style={styles.nameBlock}>
                                <Image
                                    source={profile?.avatar_url ? { uri: profile.avatar_url } : require("../../../assets/icon.png")}
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

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <Pressable
                    style={[styles.tab, activeTab === "Portfolio" && styles.activeTab]}
                    onPress={() => setActiveTab("Portfolio")}
                >
                    <Text style={[styles.tabText, activeTab === "Portfolio" && styles.activeTabText]}>Portfolio</Text>
                </Pressable>
                <Pressable
                    style={[styles.tab, activeTab === "Posts" && styles.activeTab]}
                    onPress={() => setActiveTab("Posts")}
                >
                    <Text style={[styles.tabText, activeTab === "Posts" && styles.activeTabText]}>Posts</Text>
                </Pressable>
            </View>

            {/* Tab Content */}
            {activeTab === "Portfolio" ? (
                <PortfolioTab
                    balanceSeries={balanceSeries}
                    isPerformanceLoading={performanceLoading}
                    performanceRange={performanceRange}
                    realizedPnlUsd={realizedPnlUsd}
                    onPerformanceRangeChange={setPerformanceRange}
                    usdcBalance={usdcBalance}
                    onRefresh={handleProfileRefresh}
                />
            ) : (
                <ProfilePostsTab userId={profile?.id} />
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
    headerShell: {
        paddingHorizontal: 8,
        paddingTop: 2,
        paddingBottom: 8,
    },
    navbar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 6,
        paddingBottom: 8,
    },
    usernameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    navbarUsername: {
        color: "#000",
        fontSize: 16,
        fontWeight: "600",
        opacity: 0.5,
        letterSpacing: -0.4,
    },
    xLogo: {
        width: 18,
        height: 18,
        borderRadius: 5,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
    },
    xLogoText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
    },
    navbarActions: {
        flexDirection: "row",
        gap: 8,
    },
    navButton: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
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
    bottomBlur: {
        zIndex: 40,
    },
});
