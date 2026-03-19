import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
import { ArrowLeft, FileText, Search as SearchIcon, TrendingUp, Users, X, History } from "lucide-react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Buffer } from "buffer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { fetchJupiterSearch } from "../../../lib/jupiter";
import { supabase } from "../../../lib/supabase";
import type { Market, MarketGroup } from "../../../lib/mock-data";
import { MarketCardNative } from "../../../components/MarketCardNative";
import { useAuth } from "../../../hooks/useAuth";
import { resolvePostMarketId } from "../../../lib/postMarkets";
import { BottomProgressiveBlur } from "../../../components/ui/BottomProgressiveBlur";
import { PremiumSpinner } from "../../../components/ui/PremiumSpinner";

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();
const MIN_QUERY_LENGTH = 2;
const TRENDING_SUGGESTIONS = ["Bitcoin", "Solana", "Fed Rates", "Trump", "NBA", "Ethereum"];
const SEARCH_HISTORY_KEY = "perminal_search_history";
const MAX_HISTORY_ITEMS = 10;
const PEOPLE_PAGE_SIZE = 12;
const POSTS_PAGE_SIZE = 10;
const EDGE_SWIPE_WIDTH = 20;
const EDGE_SWIPE_TRIGGER_DISTANCE = 72;
const EDGE_SWIPE_TRIGGER_VELOCITY = 700;

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
    return raw.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim();
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

function mergeUniqueById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
    if (incoming.length === 0) return current;

    const seen = new Set(current.map((item) => item.id));
    const next = [...current];
    for (const item of incoming) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        next.push(item);
    }
    return next;
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
    const [searchHistory, setSearchHistory] = useState<string[]>([]);
    const [hasMorePeople, setHasMorePeople] = useState(true);
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [peoplePage, setPeoplePage] = useState(0);
    const [postsPage, setPostsPage] = useState(0);
    const [fetchingMore, setFetchingMore] = useState(false);
    const requestSequenceRef = useRef(0);
    const paginationSequenceRef = useRef(0);

    // Load history
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const stored = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
                if (stored) {
                    setSearchHistory(JSON.parse(stored));
                }
            } catch (error) {
                console.error("[Search] Failed to load history:", error);
            }
        };
        loadHistory();
    }, []);

    const saveToHistory = useCallback(async (searchTerm: string) => {
        const clean = searchTerm.trim();
        if (!clean || clean.length < MIN_QUERY_LENGTH) return;

        setSearchHistory((prev) => {
            const next = [clean, ...prev.filter((item) => item !== clean)].slice(0, MAX_HISTORY_ITEMS);
            AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)).catch(err => 
                console.error("[Search] Failed to save history:", err)
            );
            return next;
        });
    }, []);

    const removeFromHistory = useCallback(async (searchTerm: string) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSearchHistory((prev) => {
            const next = prev.filter((item) => item !== searchTerm);
            AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)).catch(err => 
                console.error("[Search] Failed to remove item:", err)
            );
            return next;
        });
    }, []);

    const clearHistory = useCallback(async () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSearchHistory([]);
        await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    }, []);

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

    const resetPaginationState = useCallback((hasMore = false) => {
        paginationSequenceRef.current += 1;
        setPeoplePage(0);
        setPostsPage(0);
        setHasMorePeople(hasMore);
        setHasMorePosts(hasMore);
        setFetchingMore(false);
    }, []);

    const searchPeople = useCallback(async (term: string, page = 0): Promise<ProfileSearchResult[]> => {
        const clean = sanitizeSearchQuery(term);
        if (!clean) return [];
        const likeTerm = `%${clean}%`;
        const from = page * PEOPLE_PAGE_SIZE;
        const to = from + PEOPLE_PAGE_SIZE - 1;

        const { data, error } = await supabase
            .from("profiles")
            .select("id,username,display_name,avatar_url,bio,followers_count,pnl,win_rate")
            .or(`username.ilike.${likeTerm},display_name.ilike.${likeTerm}`)
            .order("followers_count", { ascending: false })
            .range(from, to);

        if (error) {
            console.error("[Search] Failed to search people:", error);
            return [];
        }
        return (data as ProfileSearchResult[] | null) ?? [];
    }, []);

    const searchPosts = useCallback(async (term: string, page = 0): Promise<PostSearchResult[]> => {
        const clean = sanitizeSearchQuery(term);
        if (!clean) return [];
        const likeTerm = `%${clean}%`;
        const from = page * POSTS_PAGE_SIZE;
        const to = from + POSTS_PAGE_SIZE - 1;

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
            .range(from, to);

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
            const clean = sanitizeSearchQuery(rawQuery);
            if (clean.length < MIN_QUERY_LENGTH) {
                setPeople([]);
                setMarkets([]);
                setPosts([]);
                resetPaginationState();
                setLoading(false);
                return;
            }

            setLoading(true);
            resetPaginationState(true);
            try {
                const results = await Promise.allSettled([
                    searchPeople(clean, 0),
                    fetchJupiterSearch(clean),
                    searchPosts(clean, 0),
                ]);

                if (requestId !== requestSequenceRef.current) return;

                const peopleResult = results[0].status === "fulfilled" ? results[0].value : [];
                const marketResult = results[1].status === "fulfilled" ? results[1].value : [];
                const postsResult = results[2].status === "fulfilled" ? results[2].value : [];
                setPeople(peopleResult);
                setMarkets(marketResult.slice(0, 200));
                setPosts(postsResult);
                setHasMorePeople(peopleResult.length >= PEOPLE_PAGE_SIZE);
                setHasMorePosts(postsResult.length >= POSTS_PAGE_SIZE);
                saveToHistory(clean);
            } catch (error) {
                if (requestId !== requestSequenceRef.current) return;
                console.error("[Search] Failed global search:", error);
                setPeople([]);
                setMarkets([]);
                setPosts([]);
                resetPaginationState();
            } finally {
                if (requestId !== requestSequenceRef.current) return;
                setLoading(false);
            }
        },
        [resetPaginationState, saveToHistory, searchPeople, searchPosts]
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(query);
        }, 350);
        return () => clearTimeout(timer);
    }, [query, performSearch]);

    const loadMore = useCallback(async () => {
        if (loading || fetchingMore || query.trim().length < MIN_QUERY_LENGTH) return;

        const term = query.trim();
        const requestId = requestSequenceRef.current;
        const shouldLoadPeople = activeTab === "people" && hasMorePeople;
        const shouldLoadPosts = activeTab === "posts" && hasMorePosts;

        if (!shouldLoadPeople && !shouldLoadPosts) return;

        const paginationRequestId = ++paginationSequenceRef.current;
        setFetchingMore(true);

        try {
            if (shouldLoadPeople) {
                const nextPage = peoplePage + 1;
                const morePeople = await searchPeople(term, nextPage);
                if (
                    requestId !== requestSequenceRef.current ||
                    paginationRequestId !== paginationSequenceRef.current
                ) {
                    return;
                }

                setPeople((prev) => mergeUniqueById(prev, morePeople));
                setPeoplePage(nextPage);
                setHasMorePeople(morePeople.length >= PEOPLE_PAGE_SIZE);
                return;
            }

            const nextPage = postsPage + 1;
            const morePosts = await searchPosts(term, nextPage);
            if (
                requestId === requestSequenceRef.current &&
                paginationRequestId === paginationSequenceRef.current
            ) {
                setPosts((prev) => mergeUniqueById(prev, morePosts));
                setPostsPage(nextPage);
                setHasMorePosts(morePosts.length >= POSTS_PAGE_SIZE);
            }
        } catch (error) {
            console.error("[Search] Failed to load more results:", error);
        } finally {
            if (paginationRequestId === paginationSequenceRef.current) {
                setFetchingMore(false);
            }
        }
    }, [loading, fetchingMore, query, activeTab, hasMorePeople, peoplePage, searchPeople, hasMorePosts, postsPage, searchPosts]);

    const handleRefresh = useCallback(async () => {
        if (query.trim().length < MIN_QUERY_LENGTH) return;
        setRefreshing(true);
        await performSearch(query);
        setRefreshing(false);
    }, [performSearch, query]);

    const handleBack = useCallback(() => {
        router.back();
    }, [router]);

    const edgeSwipeGesture = useMemo(
        () =>
            Gesture.Pan()
                .enabled(Platform.OS === "ios")
                .activeOffsetX([12, 9999])
                .failOffsetY([-12, 12])
                .onEnd((event) => {
                    const shouldGoBack =
                        event.translationX >= EDGE_SWIPE_TRIGGER_DISTANCE ||
                        event.velocityX >= EDGE_SWIPE_TRIGGER_VELOCITY;

                    if (shouldGoBack) {
                        runOnJS(handleBack)();
                    }
                }),
        [handleBack]
    );

    const handleOpenProfile = useCallback(
        (profileId: string) => {
            if (!profileId) return;
            if (currentUserId && currentUserId === profileId) {
                router.push("/profile");
                return;
            }
            router.push({ pathname: "/profile/[id]", params: { id: profileId, from: "search" } });
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
        async (post: PostSearchResult) => {
            const marketId = await resolvePostMarketId(post);
            if (marketId) {
                handleOpenMarket(marketId);
                return;
            }
            if (post.author?.id) {
                handleOpenProfile(post.author.id);
                return;
            }
            Alert.alert("Post unavailable", "Bu post icin acilabilir bir market bulunamadi.");
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
        return (
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
        );
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
                    {searchHistory.length > 0 && (
                        <View style={styles.historySection}>
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyTitle}>Recent Searches</Text>
                                <Pressable onPress={clearHistory} style={styles.clearAllButton}>
                                    <Text style={styles.clearAllText}>Clear All</Text>
                                </Pressable>
                            </View>
                            <View style={styles.historyList}>
                                {searchHistory.map((item) => (
                                    <View key={item} style={styles.historyItemRow}>
                                        <Pressable
                                            style={styles.historyItem}
                                            onPress={() => {
                                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                setQuery(item);
                                            }}
                                        >
                                            <History size={16} color="#6b7280" />
                                            <Text style={styles.historyItemText}>{item}</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => removeFromHistory(item)}
                                            style={styles.historyDeleteButton}
                                        >
                                            <X size={14} color="#9ca3af" />
                                        </Pressable>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={styles.trendingSection}>
                        <View style={styles.trendingHeader}>
                            <TrendingUp size={18} color="#4b5563" />
                            <Text style={styles.trendingTitle}>TRENDING TOPICS</Text>
                        </View>
                        <View style={styles.tagCloud}>
                            {TRENDING_SUGGESTIONS.map((tag) => (
                                <Pressable
                                    key={tag}
                                    style={styles.tagPill}
                                    onPress={() => {
                                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        setQuery(tag);
                                    }}
                                >
                                    <Text style={styles.tagText}>{tag}</Text>
                                </Pressable>
                            ))}
                        </View>
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
            {Platform.OS === "ios" ? (
                <GestureDetector gesture={edgeSwipeGesture}>
                    <View style={styles.edgeSwipeArea} />
                </GestureDetector>
            ) : null}

            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <View style={styles.searchBarContainer}>
                    <Pressable onPress={handleBack} style={styles.backButton}>
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
                            <Pressable
                                onPress={() => {
                                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setQuery("");
                                }}
                                style={styles.clearButton}
                            >
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
                            onPress={() => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTab(tab.key as SearchTab);
                            }}
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
                    loading ? <View style={styles.loadingIndicator}><PremiumSpinner size={20} /></View> : null
                }
                ListFooterComponent={
                    fetchingMore ? <View style={styles.footerIndicator}><PremiumSpinner size={18} /></View> : null
                }
                stickySectionHeadersEnabled={false}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={Keyboard.dismiss}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
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
            <BottomProgressiveBlur style={styles.bottomBlur} />
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
    edgeSwipeArea: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: EDGE_SWIPE_WIDTH,
        zIndex: 30,
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
        paddingHorizontal: 16,
        paddingBottom: 120,
    },
    loadingIndicator: {
        marginTop: 8,
        marginBottom: 8,
    },
    footerIndicator: {
        marginVertical: 16,
    },
    sectionHeader: {
        backgroundColor: "#fff",
        paddingVertical: 8,
    },
    sectionTitle: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    personCard: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#f3f4f6",
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
        backgroundColor: "#f3f4f6",
        alignItems: "center",
        justifyContent: "center",
    },
    personAvatarFallbackText: {
        color: "#6b7280",
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
        borderColor: "#f3f4f6",
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
        flex: 1,
        paddingTop: 20,
    },
    emptyTitle: {
        color: "#111827",
        fontSize: 18,
        fontWeight: "700",
        marginTop: 20,
        textAlign: "center",
    },
    emptySubtitle: {
        color: "#6b7280",
        fontSize: 14,
        marginTop: 8,
        textAlign: "center",
    },
    historySection: {
        width: "100%",
        marginBottom: 32,
    },
    historyHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    historyTitle: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    clearAllButton: {
        padding: 4,
    },
    clearAllText: {
        color: "#111827",
        fontSize: 12,
        fontWeight: "700",
    },
    historyList: {
        gap: 8,
    },
    historyItemRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f9fafb",
        borderRadius: 12,
        paddingLeft: 12,
        borderWidth: 1,
        borderColor: "#f3f4f6",
    },
    historyItem: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        gap: 8,
    },
    historyItemText: {
        color: "#111827",
        fontSize: 14,
        fontWeight: "600",
    },
    historyDeleteButton: {
        padding: 10,
    },
    trendingSection: {
        width: "100%",
    },
    trendingHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
    },
    trendingTitle: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    tagCloud: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tagPill: {
        backgroundColor: "#f9fafb",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: "#f3f4f6",
    },
    tagText: {
        color: "#111827",
        fontSize: 14,
        fontWeight: "600",
    },
    bottomBlur: {
        zIndex: 40,
    },
});
