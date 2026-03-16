import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
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

    const handleProfileRefresh = async () => {
        await Promise.all([
            fetchBalance(),
            refreshFollowCounts(),
            refreshPerformance(),
        ]);
    };

    const displayedFollowers = followersCount ?? profile?.followers_count;
    const displayedFollowing = followingCount ?? profile?.following_count;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header / Navbar */}
            <View style={styles.navbar}>
                <View style={styles.usernameRow}>
                    <Text style={styles.navbarUsername}>@{profile?.username || "user"}</Text>
                    <View style={styles.xLogo}>
                        <Text style={styles.xLogoText}>𝕏</Text>
                    </View>
                </View>
                <View style={styles.navbarActions}>
                    <TouchableOpacity style={styles.navButton} onPress={() => router.push("/profile/history")}>
                        <Clock size={20} color="#000" strokeWidth={1.8} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.navButton} onPress={handleLogout}>
                        <Settings size={20} color="#000" strokeWidth={1.8} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Profile Header */}
            <View style={styles.headerSection}>
                <View style={styles.avatarRow}>
                    <View style={styles.avatarNameGroup}>
                        <Image
                            source={profile?.avatar_url ? { uri: profile.avatar_url } : require("../../../assets/icon.png")}
                            style={styles.avatar}
                        />
                        <Text style={styles.displayName}>
                            {profileLoading ? "Loading..." : profile?.display_name || profile?.username || "User"}
                        </Text>
                    </View>
                    <View style={styles.mainStats}>
                        <View style={[styles.statBox, { width: 54 }]}>
                            <Text style={styles.statValue}>{formatCount(displayedFollowers)}</Text>
                            <Text style={styles.statLabel}>Followers</Text>
                        </View>
                        <View style={[styles.statBox, { width: 53 }]}>
                            <Text style={styles.statValue}>{formatCount(displayedFollowing)}</Text>
                            <Text style={styles.statLabel}>Following</Text>
                        </View>
                        <View style={[styles.statBox, { width: 42 }]}>
                            <Text style={styles.statValue}>{formatCount(profile?.trades_count, true)}</Text>
                            <Text style={styles.statLabel}>Trades</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.bio}>{profile?.bio || "Do Everything Great or Die"}</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === "Portfolio" && styles.activeTab]}
                    onPress={() => setActiveTab("Portfolio")}
                >
                    <Text style={[styles.tabText, activeTab === "Portfolio" && styles.activeTabText]}>Portfolio</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === "Posts" && styles.activeTab]}
                    onPress={() => setActiveTab("Posts")}
                >
                    <Text style={[styles.tabText, activeTab === "Posts" && styles.activeTabText]}>Posts</Text>
                </TouchableOpacity>
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
    navbar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 8,
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
        width: 20,
        height: 20,
        borderRadius: 5,
        backgroundColor: "#171717",
        alignItems: "center",
        justifyContent: "center",
    },
    xLogoText: {
        fontSize: 12,
        color: "#fff",
        fontWeight: "700",
    },
    navbarActions: {
        flexDirection: "row",
        gap: 8,
    },
    navButton: {},
    headerSection: {
        paddingHorizontal: 8,
        paddingBottom: 16,
    },
    avatarRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 52,
    },
    avatarNameGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    displayName: {
        color: "#000",
        fontSize: 24,
        fontWeight: "bold",
        letterSpacing: -0.6,
        lineHeight: 24,
    },
    mainStats: {
        flexDirection: "row",
        gap: 22,
    },
    statBox: {
        alignItems: "center",
    },
    statValue: {
        color: "#000",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: -0.4,
        textAlign: "center",
    },
    statLabel: {
        color: "#000",
        fontSize: 12,
        fontWeight: "600",
        opacity: 0.5,
        letterSpacing: -0.3,
        textAlign: "left",
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
