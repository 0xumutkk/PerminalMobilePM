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
            const fetchedPosts: FeedPost[] = (data || []).map((post: any) => ({
                ...post,
                author: post.author,
                post_type: post.post_type || 'standard',
                trade_metadata: post.trade_metadata || {},
                is_verified: post.is_verified || false,
                user_has_liked: false,
                user_has_reposted: false
            }));

            // Inject Figma sample posts for demonstration
            const samplePosts: FeedPost[] = [
                {
                    id: 'sample-1',
                    created_at: new Date().toISOString(),
                    content: "Since the Q3 2025 earnings came out on October 22 showing record revenue but a profit miss no new updates this week have shifted the outlook. Social media highlights sales softness and model transitions, reinforcing negative sentiment. With no fresh data, the market’s “No” view still reflects the earlier miss.",
                    user_id: 'sample-user',
                    author: {
                        id: 'sample-user',
                        username: 'adilcreates',
                        display_name: 'adil',
                        avatar_url: 'https://i.pravatar.cc/150?u=adil'
                    } as any,
                    market_id: 'fed-rates',
                    market_slug: 'fed-rates-2025',
                    market_question: "No change in Fed interest rates after December 2025 meeting?",
                    post_type: 'trade',
                    is_verified: true,
                    trade_metadata: {
                        outcome: 'Yes',
                        shares_count: '12.3K',
                        total_value: '12,234.56',
                        avg_entry: 0.47,
                        current_price: 0.97,
                        pnl_percent: 1234.2
                    } as any,
                    user_has_liked: false,
                    user_has_reposted: false,
                    likes_count: 12300,
                    reposts_count: 1200,
                    media_urls: [],
                    comments_count: 42,
                    updated_at: new Date().toISOString()
                },
                {
                    id: 'sample-2',
                    created_at: new Date(Date.now() - 3600000).toISOString(),
                    content: "Since the Q3 2025 earnings came out on October 22 showing record revenue but a profit miss no new updates this week have shifted the outlook.",
                    user_id: 'sample-user',
                    author: {
                        id: 'sample-user',
                        username: 'adilcreates',
                        display_name: 'adil',
                        avatar_url: 'https://i.pravatar.cc/150?u=adil'
                    } as any,
                    market_id: 'fed-rates',
                    market_slug: 'fed-rates-2025',
                    market_question: "No change in Fed interest rates after December 2025 meeting?",
                    post_type: 'thesis',
                    is_verified: false,
                    trade_metadata: {
                        current_price: 0.97
                    },
                    user_has_liked: false,
                    user_has_reposted: false,
                    likes_count: 2300,
                    reposts_count: 450,
                    media_urls: [],
                    comments_count: 15,
                    updated_at: new Date().toISOString()
                },
                {
                    id: 'sample-3',
                    created_at: new Date(Date.now() - 7200000).toISOString(),
                    content: "Closing out this position as the outlook has fundamentally changed.",
                    user_id: 'sample-user',
                    author: {
                        id: 'sample-user',
                        username: 'adilcreates',
                        display_name: 'adil',
                        avatar_url: 'https://i.pravatar.cc/150?u=adil'
                    } as any,
                    market_id: 'fed-rates',
                    market_slug: 'fed-rates-2025',
                    market_question: "No change in Fed interest rates after December 2025 meeting?",
                    post_type: 'sold',
                    is_verified: true,
                    trade_metadata: {
                        outcome: 'No',
                        current_price: 0.97
                    },
                    user_has_liked: false,
                    user_has_reposted: false,
                    likes_count: 850,
                    reposts_count: 120,
                    media_urls: [],
                    comments_count: 8,
                    updated_at: new Date().toISOString()
                }
            ];

            setPosts([...samplePosts, ...fetchedPosts]);
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
