import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Platform,
    Pressable,
    RefreshControl,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, FileText, Search as SearchIcon, TrendingUp, Users, X } from "lucide-react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Buffer } from "buffer";
import { fetchJupiterSearch } from "../../../lib/jupiter";
import { supabase } from "../../../lib/supabase";
import type { Market, MarketGroup } from "../../../lib/mock-data";
import { MarketCardNative } from "../../../components/MarketCardNative";
import { useAuth } from "../../../hooks/useAuth";

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();
const MIN_QUERY_LENGTH = 2;
const TRENDING_SUGGESTIONS = ["Bitcoin", "Solana", "Fed Rates", "Trump", "NBA", "Ethereum"];

type SearchTab = "all" | "people" | "markets" | "posts";

interface ProfileSearchResult {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio?: string | null;
    followers_count?: number | null;
    pnl?: number | null;
    win_rate?: number | null;
}

interface PostAuthor {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
}

interface PostSearchResult {
    id: string;
    content: string | null;
    market_id: string | null;
    market_slug: string | null;
    market_question: string | null;
    created_at: string;
    author: PostAuthor | null;
}

type SearchListItem =
    | { key: string; type: "person"; data: ProfileSearchResult }
    | { key: string; type: "market"; data: MarketGroup }
    | { key: string; type: "post"; data: PostSearchResult };

interface SearchSection {
    key: "people" | "markets" | "posts";
    title: string;
    data: SearchListItem[];
}

function sanitizeSearchQuery(raw: string): string {
    return raw.replace(/[,%]/g, " ").trim();
}

function formatFollowers(value?: number | null): string {
    const count = typeof value === "number" ? value : 0;
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return `${count}`;
}

function getInitials(name: string): string {
    const tokens = name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
    if (tokens.length === 0) return "?";
    return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function formatRelativeTime(value: string): string {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "";
    const diffMs = Date.now() - timestamp;
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h`;
    return `${Math.floor(diffMs / day)}d`;
}

export default function SearchScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user, activeWallet } = useAuth();

    const [query, setQuery] = useState("");
    const [activeTab, setActiveTab] = useState<SearchTab>("all");
    const [markets, setMarkets] = useState<Market[]>([]);
    const [people, setPeople] = useState<ProfileSearchResult[]>([]);
    const [posts, setPosts] = useState<PostSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const requestSequenceRef = useRef(0);

    const currentUserId = useMemo(() => {
        if (user?.id) return user.id;
        if (user?.email?.address) {
            try {
                return Buffer.from(user.email.address).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 36);
            } catch {
                return user.email.address;
            }
        }
        if (activeWallet?.address) return activeWallet.address;
        return null;
    }, [user, activeWallet]);

    const searchPeople = useCallback(async (term: string): Promise<ProfileSearchResult[]> => {
        const clean = sanitizeSearchQuery(term);
        if (!clean) return [];
        const likeTerm = `%${clean}%`;
        const { data, error } = await supabase
            .from("profiles")
            .select("id,username,display_name,avatar_url,bio,followers_count,pnl,win_rate")
            .or(`username.ilike.${likeTerm},display_name.ilike.${likeTerm}`)
            .order("followers_count", { ascending: false })
            .limit(12);

        if (error) {
            console.error("[Search] Failed to search people:", error);
            return [];
        }
        return (data as ProfileSearchResult[] | null) ?? [];
    }, []);

    const searchPosts = useCallback(async (term: string): Promise<PostSearchResult[]> => {
        const clean = sanitizeSearchQuery(term);
        if (!clean) return [];
        const likeTerm = `%${clean}%`;
        const { data, error } = await supabase
            .from("posts")
            .select(`
                id,
                content,
                market_id,
                market_slug,
                market_question,
                created_at,
                author:profiles!user_id(id,username,display_name,avatar_url)
            `)
            .or(`content.ilike.${likeTerm},market_question.ilike.${likeTerm}`)
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) {
            console.error("[Search] Failed to search posts:", error);
            return [];
        }

        return ((data as any[]) ?? []).map((item) => {
            const authorData = Array.isArray(item.author) ? item.author[0] : item.author;
            return {
                id: item.id,
                content: item.content,
                market_id: item.market_id,
                market_slug: item.market_slug,
                market_question: item.market_question,
                created_at: item.created_at,
                author: authorData
                    ? {
                        id: authorData.id,
                        username: authorData.username,
                        display_name: authorData.display_name,
                        avatar_url: authorData.avatar_url,
                    }
                    : null,
            };
        });
    }, []);

    const performSearch = useCallback(
        async (rawQuery: string) => {
            const requestId = ++requestSequenceRef.current;
            const clean = rawQuery.trim();
            if (clean.length < MIN_QUERY_LENGTH) {
                setPeople([]);
                setMarkets([]);
                setPosts([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const [peopleResult, marketResult, postsResult] = await Promise.all([
                    searchPeople(clean),
                    fetchJupiterSearch(clean),
                    searchPosts(clean),
                ]);
                if (requestId !== requestSequenceRef.current) return;
                setPeople(peopleResult);
                setMarkets(marketResult.slice(0, 200));
                setPosts(postsResult);
            } catch (error) {
                if (requestId !== requestSequenceRef.current) return;
                console.error("[Search] Failed global search:", error);
                setPeople([]);
                setMarkets([]);
                setPosts([]);
            } finally {
                if (requestId !== requestSequenceRef.current) return;
                setLoading(false);
            }
        },
        [searchPeople, searchPosts]
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(query);
        }, 350);
        return () => clearTimeout(timer);
    }, [query, performSearch]);

    const handleRefresh = useCallback(async () => {
        if (query.trim().length < MIN_QUERY_LENGTH) return;
        setRefreshing(true);
        await performSearch(query);
        setRefreshing(false);
    }, [performSearch, query]);

    const handleOpenProfile = useCallback(
        (profileId: string) => {
            if (!profileId) return;
            if (currentUserId && currentUserId === profileId) {
                router.push("/profile");
                return;
            }
            router.push({ pathname: "/profile/[id]", params: { id: profileId } });
        },
        [currentUserId, router]
    );

    const handleOpenMarket = useCallback(
        (marketId: string) => {
            if (!marketId) return;
            router.push({ pathname: "/market/[id]", params: { id: marketId } });
        },
        [router]
    );

    const handleOpenPostTarget = useCallback(
        (post: PostSearchResult) => {
            const marketId = post.market_id || post.market_slug;
            if (marketId) {
                handleOpenMarket(marketId);
                return;
            }
            if (post.author?.id) {
                handleOpenProfile(post.author.id);
            }
        },
        [handleOpenMarket, handleOpenProfile]
    );

    const groupedMarkets = useMemo(() => {
        const groupMap = new Map<string, MarketGroup>();
        for (const m of markets) {
            const eid = m.eventId || m.id;
            if (!groupMap.has(eid)) {
                groupMap.set(eid, {
                    eventId: eid,
                    title: m.title,
                    description: m.description,
                    category: m.category,
                    imageUrl: m.imageUrl,
                    markets: [m],
                    volume: m.volume,
                    resolveDate: m.resolveDate,
                    status: m.status,
                    provider: m.provider,
                });
            } else {
                const g = groupMap.get(eid)!;
                g.markets.push(m);
                g.volume += m.volume;
            }
        }
        return Array.from(groupMap.values());
    }, [markets]);

    const sections = useMemo<SearchSection[]>(() => {
        const nextSections: SearchSection[] = [];
        if (activeTab === "all" || activeTab === "people") {
            nextSections.push({
                key: "people",
                title: "People",
                data: people.map((item) => ({ key: `person-${item.id}`, type: "person", data: item })),
            });
        }
        if (activeTab === "all" || activeTab === "markets") {
            nextSections.push({
                key: "markets",
                title: "Markets",
                data: groupedMarkets.map((item) => ({ key: `market-${item.eventId}`, type: "market", data: item })),
            });
        }

        if (activeTab === "all" || activeTab === "posts") {
            nextSections.push({
                key: "posts",
                title: "Posts",
                data: posts.map((item) => ({ key: `post-${item.id}`, type: "post", data: item })),
            });
        }
        return nextSections.filter((section) => section.data.length > 0);
    }, [activeTab, markets, people, posts]);

    const renderSectionHeader = useCallback(({ section }: { section: SearchSection }) => {
        return <Text style={styles.sectionTitle}>{section.title}</Text>;
    }, []);

    const renderPersonItem = useCallback(
        (profile: ProfileSearchResult) => {
            const name = profile.display_name || profile.username || "Unknown";
            return (
                <Pressable style={styles.personCard} onPress={() => handleOpenProfile(profile.id)}>
                    {profile.avatar_url ? (
                        <Image source={profile.avatar_url} style={styles.personAvatar} contentFit="cover" />
                    ) : (
                        <View style={styles.personAvatarFallback}>
                            <Text style={styles.personAvatarFallbackText}>{getInitials(name)}</Text>
                        </View>
                    )}
                    <View style={styles.personMeta}>
                        <Text style={styles.personName} numberOfLines={1}>
                            {name}
                        </Text>
                        <Text style={styles.personHandle} numberOfLines={1}>
                            @{profile.username}
                        </Text>
                    </View>
                    <View style={styles.personRight}>
                        <Users size={14} color="#6b7280" />
                        <Text style={styles.personStat}>{formatFollowers(profile.followers_count)}</Text>
                    </View>
                </Pressable>
            );
        },
        [handleOpenProfile]
    );

    const renderPostItem = useCallback(
        (post: PostSearchResult) => {
            const authorName = post.author?.display_name || post.author?.username || "Unknown";
            const targetTitle = post.market_question || post.content || "Open post";
            return (
                <Pressable style={styles.postCard} onPress={() => handleOpenPostTarget(post)}>
                    <View style={styles.postCardTop}>
                        <FileText size={16} color="#4b5563" />
                        <Text style={styles.postAuthor} numberOfLines={1}>
                            {authorName}
                        </Text>
                        <Text style={styles.postTime}>{formatRelativeTime(post.created_at)}</Text>
                    </View>
                    <Text style={styles.postText} numberOfLines={2}>
                        {targetTitle}
                    </Text>
                </Pressable>
            );
        },
        [handleOpenPostTarget]
    );

    const renderItem = useCallback(
        ({ item }: { item: SearchListItem }) => {
            if (item.type === "person") return renderPersonItem(item.data as ProfileSearchResult);
            if (item.type === "post") return renderPostItem(item.data as PostSearchResult);

            return (
                <MarketCardNative
                    group={item.data as MarketGroup}
                    onBuyYes={(m) => handleOpenMarket(m.id)}
                    onBuyNo={(m) => handleOpenMarket(m.id)}
                />
            );
        },
        [handleOpenMarket, renderPersonItem, renderPostItem]
    );

    const renderEmptyState = () => {
        if (loading) return null;
        if (query.length === 0) {
            return (
                <View style={styles.emptyContainer}>
                    <TrendingUp size={48} color="#e5e7eb" strokeWidth={1.5} />
                    <Text style={styles.emptyTitle}>Global Search</Text>
                    <Text style={styles.emptySubtitle}>People, markets and posts</Text>
                    <View style={styles.tagCloud}>
                        {TRENDING_SUGGESTIONS.map((tag) => (
                            <Pressable key={tag} style={styles.tagPill} onPress={() => setQuery(tag)}>
                                <Text style={styles.tagText}>{tag}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            );
        }

        if (query.trim().length < MIN_QUERY_LENGTH) {
            return (
                <View style={styles.emptyContainer}>
                    <SearchIcon size={42} color="#e5e7eb" strokeWidth={1.6} />
                    <Text style={styles.emptyTitle}>Type at least 2 characters</Text>
                    <Text style={styles.emptySubtitle}>Search users, markets or posts</Text>
                </View>
            );
        }

        return (
            <View style={styles.emptyContainer}>
                <SearchIcon size={48} color="#e5e7eb" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptySubtitle}>Try another keyword</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={["left", "right"]}>
            <StatusBar style="dark" />

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <View style={styles.searchBarContainer}>
                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={22} color="#111827" />
                    </Pressable>

                    <View style={styles.inputWrapper}>
                        {SUPPORTS_GLASS ? (
                            <GlassView
                                style={StyleSheet.absoluteFill}
                                glassEffectStyle="clear"
                                /* @ts-ignore */
                                refraction={40}
                                depth={20}
                                frost={4}
                            />
                        ) : (
                            <View style={styles.inputFallback} />
                        )}

                        <SearchIcon size={18} color="#9ca3af" style={styles.searchIcon} />
                        <TextInput
                            placeholder="Search people, markets, posts..."
                            placeholderTextColor="#9ca3af"
                            style={styles.input}
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                        />
                        {query.length > 0 && (
                            <Pressable onPress={() => setQuery("")} style={styles.clearButton}>
                                <X size={16} color="#9ca3af" />
                            </Pressable>
                        )}
                    </View>
                </View>

                <View style={styles.filterRow}>
                    {[
                        { key: "all", label: "All" },
                        { key: "people", label: "People" },
                        { key: "markets", label: "Markets" },
                        { key: "posts", label: "Posts" },
                    ].map((tab) => (
                        <Pressable
                            key={tab.key}
                            style={[styles.filterPill, activeTab === tab.key && styles.filterPillActive]}
                            onPress={() => setActiveTab(tab.key as SearchTab)}
                        >
                            <Text style={[styles.filterText, activeTab === tab.key && styles.filterTextActive]}>
                                {tab.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            <SectionList<SearchListItem, SearchSection>
                sections={sections}
                keyExtractor={(item) => item.key}
                contentContainerStyle={styles.listContent}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={renderEmptyState}
                ListHeaderComponent={
                    loading ? <ActivityIndicator style={styles.loadingIndicator} color="#111827" /> : null
                }
                stickySectionHeadersEnabled={false}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={Keyboard.dismiss}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        tintColor="#111827"
                        enabled={query.trim().length >= MIN_QUERY_LENGTH}
                    />
                }
                ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f3f4f6",
    },
    searchBarContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    backButton: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    inputWrapper: {
        flex: 1,
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 12,
        overflow: "hidden",
        paddingHorizontal: 12,
    },
    inputFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#f3f4f6",
        borderRadius: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        color: "#111827",
        fontSize: 16,
        height: "100%",
    },
    clearButton: {
        padding: 4,
    },
    filterRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 12,
    },
    filterPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    filterPillActive: {
        backgroundColor: "#111827",
        borderColor: "#111827",
    },
    filterText: {
        color: "#4b5563",
        fontSize: 13,
        fontWeight: "600",
    },
    filterTextActive: {
        color: "#fff",
    },
    listContent: {
        padding: 16,
        paddingBottom: 32,
        gap: 12,
    },
    loadingIndicator: {
        marginTop: 8,
        marginBottom: 8,
    },
    sectionTitle: {
        color: "#111827",
        fontSize: 15,
        fontWeight: "700",
        marginBottom: 10,
        marginTop: 2,
    },
    personCard: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#f0f2f5",
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    personAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    personAvatarFallback: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#eef2ff",
        alignItems: "center",
        justifyContent: "center",
    },
    personAvatarFallbackText: {
        color: "#4338ca",
        fontSize: 14,
        fontWeight: "700",
    },
    personMeta: {
        flex: 1,
        gap: 3,
    },
    personName: {
        color: "#111827",
        fontSize: 15,
        fontWeight: "700",
    },
    personHandle: {
        color: "#6b7280",
        fontSize: 13,
        fontWeight: "500",
    },
    personRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    personStat: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "600",
    },
    postCard: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#f0f2f5",
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8,
    },
    postCardTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    postAuthor: {
        flex: 1,
        color: "#111827",
        fontSize: 13,
        fontWeight: "700",
    },
    postTime: {
        color: "#9ca3af",
        fontSize: 12,
        fontWeight: "600",
    },
    postText: {
        color: "#374151",
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "500",
    },
    itemSeparator: {
        height: 8,
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 84,
    },
    emptyTitle: {
        color: "#1f2937",
        fontSize: 18,
        fontWeight: "600",
        marginTop: 14,
    },
    emptySubtitle: {
        color: "#6b7280",
        fontSize: 14,
        marginTop: 5,
    },
    tagCloud: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 10,
        marginTop: 22,
        paddingHorizontal: 22,
    },
    tagPill: {
        backgroundColor: "#f9fafb",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#f3f4f6",
    },
    tagText: {
        color: "#4b5563",
        fontSize: 14,
        fontWeight: "500",
    },
});
