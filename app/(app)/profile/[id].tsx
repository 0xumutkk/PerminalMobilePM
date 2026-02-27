import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePrivy } from "@privy-io/expo";
import { supabase } from "../../../lib/supabase";
import type { Profile } from "../../../lib/supabase-types";
import { UserPlus, UserMinus } from "lucide-react-native";

function formatPnl(value: number): string {
    const abs = Math.abs(value);
    const sign = value >= 0 ? "+" : "-";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(2)}`;
}

export default function ProfileDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = usePrivy();
    const myId = user?.id ?? null;

    const [profile, setProfile] = useState<Profile | null>(null);
    const [followCounts, setFollowCounts] = useState<{ followers: number; following: number } | null>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);

    const isOwnProfile = myId != null && id != null && myId === id;

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
                const { data, error: err } = await supabase
                    .from("profiles")
                    .select("id, wallet_address, username, display_name, avatar_url, bio, pnl, win_rate")
                    .eq("id", id)
                    .single();

                if (cancelled) return;
                if (err) {
                    setError(err.message);
                    setProfile(null);
                    return;
                }
                setProfile(data as Profile);

                const [followRes, followingRes, followersRes] = await Promise.all([
                    myId
                        ? supabase.from("follows").select("id").eq("follower_id", myId).eq("following_id", id).maybeSingle()
                        : Promise.resolve({ data: null }),
                    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
                    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", id),
                ]);
                if (cancelled) return;
                setIsFollowing(followRes.data != null);
                setFollowCounts({
                    following: typeof followingRes.count === "number" ? followingRes.count : 0,
                    followers: typeof followersRes.count === "number" ? followersRes.count : 0,
                });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [id, myId]);

    const handleFollow = async () => {
        if (!myId || !id || followLoading) return;
        setFollowLoading(true);
        const { error: err } = await supabase.from("follows").insert({ follower_id: myId, following_id: id } as any);
        setFollowLoading(false);
        if (err) {
            Alert.alert("Follow failed", err.message);
            return;
        }
        setIsFollowing(true);
        setFollowCounts((prev) => (prev ? { ...prev, followers: prev.followers + 1 } : { followers: 1, following: 0 }));
    };

    const handleUnfollow = async () => {
        if (!myId || !id || followLoading) return;
        setFollowLoading(true);
        const { error: err } = await supabase.from("follows").delete().eq("follower_id", myId).eq("following_id", id);
        setFollowLoading(false);
        if (err) {
            Alert.alert("Unfollow failed", err.message);
            return;
        }
        setIsFollowing(false);
        setFollowCounts((prev) => (prev ? { ...prev, followers: Math.max(0, prev.followers - 1) } : null));
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#a855f7" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !profile) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <Text style={styles.errorText}>{error ?? "Profile not found"}</Text>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>Go back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const pnl = profile.pnl ?? 0;
    const winRate = profile.win_rate ?? 0;

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
                        <Text style={styles.backIconText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Profile</Text>
                    <View style={styles.headerRight} />
                </View>

                <View style={styles.profileCard}>
                    {profile.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarPlaceholderText}>
                                {(profile.display_name || profile.username).charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <Text style={styles.displayName}>{profile.display_name || profile.username || "—"}</Text>
                    <Text style={styles.handle}>@{profile.username}</Text>
                    {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                    <View style={styles.statsRow}>
                        <Text style={styles.statText}>PnL: {formatPnl(pnl)}</Text>
                        <Text style={styles.statText}>Win rate: {Math.round(winRate)}%</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statText}>
                            {(followCounts?.followers ?? 0).toLocaleString()} followers
                        </Text>
                        <Text style={styles.statText}>
                            {(followCounts?.following ?? 0).toLocaleString()} following
                        </Text>
                    </View>

                    {isOwnProfile ? (
                        <TouchableOpacity
                            style={styles.followButton}
                            onPress={() => router.replace("/profile")}
                        >
                            <Text style={styles.followButtonText}>Edit profile</Text>
                        </TouchableOpacity>
                    ) : myId ? (
                        isFollowing ? (
                            <TouchableOpacity
                                style={[styles.followButton, styles.unfollowButton]}
                                onPress={handleUnfollow}
                                disabled={followLoading}
                            >
                                {followLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <UserMinus color="#fff" size={18} strokeWidth={2} style={{ marginRight: 8 }} />
                                        <Text style={styles.followButtonText}>Unfollow</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.followButton}
                                onPress={handleFollow}
                                disabled={followLoading}
                            >
                                {followLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <UserPlus color="#fff" size={18} strokeWidth={2} style={{ marginRight: 8 }} />
                                        <Text style={styles.followButtonText}>Follow</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )
                    ) : null}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    scrollContent: { padding: 20, paddingTop: 8 },
    errorText: { color: "#ef4444", fontSize: 15, textAlign: "center" },
    backButton: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#333", borderRadius: 8 },
    backButtonText: { color: "#fff", fontWeight: "600" },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
    },
    backIcon: { padding: 8, marginLeft: -8 },
    backIconText: { color: "#fff", fontSize: 24 },
    headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
    headerRight: { width: 40 },
    profileCard: {
        width: "100%",
        backgroundColor: "#111",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: "#222",
        alignItems: "center",
    },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarPlaceholder: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: "#333",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarPlaceholderText: { color: "#9ca3af", fontSize: 32, fontWeight: "bold" },
    displayName: { color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 12 },
    handle: { color: "#a855f7", fontSize: 15, marginTop: 4 },
    bio: { color: "#9ca3af", fontSize: 14, marginTop: 12, textAlign: "center" },
    statsRow: { flexDirection: "row", gap: 20, marginTop: 12 },
    statText: { color: "#6b7280", fontSize: 14 },
    followButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 20,
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: "#3b0764",
        borderRadius: 10,
        minWidth: 140,
    },
    unfollowButton: { backgroundColor: "#333", borderWidth: 1, borderColor: "#444" },
    followButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
