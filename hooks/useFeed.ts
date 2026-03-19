import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { Post, Profile } from "../lib/database.types";

export type FeedMode = "for_you" | "following";

export interface FeedPost extends Post {
    author: Profile;
    user_has_liked: boolean;
    user_has_reposted: boolean;
}

interface UseFeedParams {
    mode?: FeedMode;
    viewerId?: string | null;
    userId?: string;
    marketId?: string;
    pageSize?: number;
}

type SupabaseErrorLike = {
    code?: string;
    message?: string;
    details?: string | null;
};

type RawFeedPost = Post & {
    author: Profile | Profile[] | null;
};

function mergeUniquePosts(current: FeedPost[], incoming: FeedPost[]) {
    if (incoming.length === 0) return current;

    const seen = new Set(current.map((post) => post.id));
    const next = [...current];

    for (const post of incoming) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        next.push(post);
    }

    return next;
}

function normalizeRawPost(
    post: RawFeedPost,
    likedIds: Set<string>,
    repostedIds: Set<string>
): FeedPost {
    const author = Array.isArray(post.author) ? post.author[0] : post.author;

    return {
        ...post,
        author: author as Profile,
        post_type: post.post_type || "standard",
        trade_metadata: post.trade_metadata || {},
        is_verified: post.is_verified || false,
        user_has_liked: likedIds.has(post.id),
        user_has_reposted: repostedIds.has(post.id),
    };
}

function isMissingFeedRankingRpcError(error: unknown): boolean {
    const candidate = error as SupabaseErrorLike | null;
    const message = String(candidate?.message ?? "");
    const details = String(candidate?.details ?? "");
    return candidate?.code === "PGRST202"
        && /get_feed_ranking/i.test(`${message} ${details}`);
}

export function useFeed({
    mode = "for_you",
    viewerId,
    userId,
    marketId,
    pageSize = 20,
}: UseFeedParams = {}) {
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const followingIdsRef = useRef<Set<string>>(new Set());
    const rankedFeedAvailableRef = useRef(true);
    const rankedFeedMissingLoggedRef = useRef(false);

    const fetchInteractionFlags = useCallback(async (postIds: string[]) => {
        if (!viewerId || postIds.length === 0) {
            return {
                likedIds: new Set<string>(),
                repostedIds: new Set<string>(),
            };
        }

        const [likesResult, repostsResult] = await Promise.all([
            supabase.from("likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
            supabase.from("reposts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
        ]);

        if (likesResult.error) throw likesResult.error;
        if (repostsResult.error) throw repostsResult.error;

        return {
            likedIds: new Set((likesResult.data ?? []).map((row: any) => String(row.post_id))),
            repostedIds: new Set((repostsResult.data ?? []).map((row: any) => String(row.post_id))),
        };
    }, [viewerId]);

    const fetchFollowingIds = useCallback(async () => {
        if (!viewerId) {
            followingIdsRef.current = new Set();
            return [];
        }

        const { data, error: followsError } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", viewerId);

        if (followsError) throw followsError;

        const ids = (data ?? [])
            .map((row: any) => String(row.following_id))
            .filter(Boolean);

        followingIdsRef.current = new Set(ids);
        return ids;
    }, [viewerId]);

    const fetchPostsByIds = useCallback(async (postIds: string[]) => {
        if (postIds.length === 0) return [];

        const { data, error: postsError } = await supabase
            .from("posts")
            .select(`
                *,
                author:profiles!user_id(*)
            `)
            .in("id", postIds);

        if (postsError) throw postsError;

        const { likedIds, repostedIds } = await fetchInteractionFlags(postIds);
        const order = new Map(postIds.map((id, index) => [id, index]));

        return ((data as RawFeedPost[] | null) ?? [])
            .map((post) => normalizeRawPost(post, likedIds, repostedIds))
            .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }, [fetchInteractionFlags]);

    const fetchScopedPage = useCallback(async (pageToLoad: number) => {
        let query = supabase
            .from("posts")
            .select(`
                *,
                author:profiles!user_id(*)
            `)
            .order("created_at", { ascending: false });

        if (userId) {
            query = query.eq("user_id", userId);
        }

        if (marketId) {
            query = query.eq("market_id", marketId);
        }

        if (mode === "following" && !userId && !marketId) {
            const followingIds = await fetchFollowingIds();
            if (followingIds.length === 0) return [];
            query = query.in("user_id", followingIds);
        }

        const from = (pageToLoad - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, error: postsError } = await query.range(from, to);

        if (postsError) throw postsError;

        const rawPosts = (data as RawFeedPost[] | null) ?? [];
        const postIds = rawPosts.map((post) => post.id);
        const { likedIds, repostedIds } = await fetchInteractionFlags(postIds);

        return rawPosts.map((post) => normalizeRawPost(post, likedIds, repostedIds));
    }, [fetchFollowingIds, fetchInteractionFlags, marketId, mode, pageSize, userId]);

    const fetchRankedPage = useCallback(async (pageToLoad: number) => {
        const { data, error: rankingError } = await supabase.rpc("get_feed_ranking", {
            page: pageToLoad,
            page_size: pageSize,
        } as any);

        if (rankingError) throw rankingError;

        const postIds = ((data as any[]) ?? []).map((row) => String(row.id)).filter(Boolean);
        return fetchPostsByIds(postIds);
    }, [fetchPostsByIds, pageSize]);

    const fetchPage = useCallback(async (pageToLoad: number) => {
        const shouldUseRanking = mode === "for_you"
            && !userId
            && !marketId
            && rankedFeedAvailableRef.current;
        if (!shouldUseRanking) {
            return fetchScopedPage(pageToLoad);
        }

        try {
            return await fetchRankedPage(pageToLoad);
        } catch (error) {
            if (isMissingFeedRankingRpcError(error)) {
                rankedFeedAvailableRef.current = false;
                if (!rankedFeedMissingLoggedRef.current) {
                    rankedFeedMissingLoggedRef.current = true;
                    console.warn("[useFeed] get_feed_ranking RPC is unavailable; using created_at fallback feed.");
                }
            } else {
                console.error("[useFeed] Ranked feed failed, falling back to created_at ordering:", error);
            }
            return fetchScopedPage(pageToLoad);
        }
    }, [fetchRankedPage, fetchScopedPage, marketId, mode, userId]);

    const fetchFeed = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const nextPosts = await fetchPage(1);
            setPosts(nextPosts);
            setPage(1);
            setHasMore(nextPosts.length >= pageSize);
        } catch (err) {
            console.error("[useFeed] Error fetching feed:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch feed");
            setPosts([]);
            setHasMore(false);
        } finally {
            setIsLoading(false);
        }
    }, [fetchPage, pageSize]);

    const fetchNextPage = useCallback(async () => {
        if (isLoading || isFetchingMore || !hasMore) return;

        const nextPage = page + 1;
        setIsFetchingMore(true);

        try {
            const nextPosts = await fetchPage(nextPage);
            setPosts((current) => mergeUniquePosts(current, nextPosts));
            setPage(nextPage);
            setHasMore(nextPosts.length >= pageSize);
        } catch (err) {
            console.error("[useFeed] Error fetching more feed items:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch more feed items");
        } finally {
            setIsFetchingMore(false);
        }
    }, [fetchPage, hasMore, isFetchingMore, isLoading, page, pageSize]);

    useEffect(() => {
        void fetchFeed();
    }, [fetchFeed]);

    useEffect(() => {
        const matchesScope = async (rawPost: Post) => {
            if (userId && rawPost.user_id !== userId) return false;
            if (marketId && rawPost.market_id !== marketId) return false;

            if (mode !== "following" || userId || marketId) {
                return true;
            }

            if (!viewerId) return false;

            if (!followingIdsRef.current.size) {
                await fetchFollowingIds();
            }

            return followingIdsRef.current.has(rawPost.user_id);
        };

        const channel = supabase
            .channel(`public:posts:${mode}:${userId ?? "all"}:${marketId ?? "all"}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "posts",
            }, async (payload) => {
                const rawPost = payload.new as Post;
                if (!(await matchesScope(rawPost))) {
                    return;
                }

                try {
                    const nextPosts = await fetchPostsByIds([String(rawPost.id)]);
                    const nextPost = nextPosts[0];

                    if (!nextPost) return;

                    setPosts((current) => {
                        if (current.some((post) => post.id === nextPost.id)) return current;
                        return [nextPost, ...current];
                    });
                } catch (insertError) {
                    console.error("[useFeed] Failed to append realtime post:", insertError);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchFollowingIds, fetchPostsByIds, marketId, mode, userId, viewerId]);

    return {
        posts,
        isLoading,
        isFetchingMore,
        hasMore,
        error,
        fetchFeed,
        fetchNextPage,
    };
}
