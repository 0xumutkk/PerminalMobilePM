import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Post, Profile } from "../lib/database.types";

export interface FeedPost extends Post {
    author: Profile;
    user_has_liked: boolean;
    user_has_reposted: boolean;
}

export function useFeed(userId?: string, marketId?: string) {
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFeed = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Basic query: fetch all posts with author profile
            let query = supabase
                .from("posts")
                .select(`
                    *,
                    author:profiles!user_id(*)
                `)
                .order("created_at", { ascending: false });

            // If userId is provided, fetch only that user's posts
            if (userId) {
                query = query.eq("user_id", userId);
            }

            // If marketId is provided, fetch only posts tagged to that market
            if (marketId) {
                query = query.eq("market_id", marketId);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            // Transform data to match FeedPost interface
            const feedPosts: FeedPost[] = (data || []).map((post: any) => ({
                ...post,
                author: post.author,
                post_type: post.post_type || 'standard',
                trade_metadata: post.trade_metadata || {},
                is_verified: post.is_verified || false,
                user_has_liked: false, // TODO: Implement real check
                user_has_reposted: false // TODO: Implement real check
            }));

            setPosts(feedPosts);
        } catch (err) {
            console.error("Error fetching feed:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch feed");
        } finally {
            setIsLoading(false);
        }
    }, [userId, marketId]);

    // Real-time updates
    useEffect(() => {
        const channel = supabase
            .channel('public:posts')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'posts'
            }, async (payload) => {
                // When a new post is inserted, fetch its author and add it to the feed
                const { data: newPost, error: fetchError } = await supabase
                    .from("posts")
                    .select(`
                        *,
                        author:profiles!user_id(*)
                    `)
                    .eq('id', payload.new.id)
                    .single();

                if (!fetchError && newPost) {
                    const postData = newPost as any;
                    const transformedPost: FeedPost = {
                        ...postData,
                        author: postData.author,
                        post_type: postData.post_type || 'standard',
                        trade_metadata: postData.trade_metadata || {},
                        is_verified: postData.is_verified || false,
                        user_has_liked: false,
                        user_has_reposted: false
                    };
                    setPosts(current => [transformedPost, ...current]);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return { posts, isLoading, error, fetchFeed };
}
