export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    wallet_address: string | null;
                    username: string;
                    display_name: string | null;
                    avatar_url: string | null;
                    bio: string | null;
                    followers_count: number;
                    following_count: number;
                    trades_count: number;
                    pnl: number;
                    win_rate: number;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    wallet_address?: string | null;
                    username: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    bio?: string | null;
                    followers_count?: number;
                    following_count?: number;
                    trades_count?: number;
                    pnl?: number;
                    win_rate?: number;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    wallet_address?: string | null;
                    username?: string;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    bio?: string | null;
                    followers_count?: number;
                    following_count?: number;
                    trades_count?: number;
                    pnl?: number;
                    win_rate?: number;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            follows: {
                Row: {
                    id: string;
                    follower_id: string;
                    following_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    follower_id: string;
                    following_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    follower_id?: string;
                    following_id?: string;
                    created_at?: string;
                };
            };
            posts: {
                Row: {
                    id: string;
                    user_id: string;
                    content: string | null;
                    market_id: string | null;
                    market_slug: string | null;
                    market_question: string | null;
                    media_urls: string[] | null;
                    likes_count: number;
                    reposts_count: number;
                    comments_count: number;
                    post_type: string;
                    trade_metadata: Json;
                    is_verified: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    content?: string | null;
                    market_id?: string | null;
                    market_slug?: string | null;
                    market_question?: string | null;
                    media_urls?: string[] | null;
                    likes_count?: number;
                    reposts_count?: number;
                    comments_count?: number;
                    post_type?: string;
                    trade_metadata?: Json;
                    is_verified?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    content?: string | null;
                    market_id?: string | null;
                    market_slug?: string | null;
                    market_question?: string | null;
                    media_urls?: string[] | null;
                    likes_count?: number;
                    reposts_count?: number;
                    comments_count?: number;
                    post_type?: string;
                    trade_metadata?: Json;
                    is_verified?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            likes: {
                Row: {
                    id: string;
                    user_id: string;
                    post_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    post_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    post_id?: string;
                    created_at?: string;
                };
            };
            reposts: {
                Row: {
                    id: string;
                    user_id: string;
                    post_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    post_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    post_id?: string;
                    created_at?: string;
                };
            };
            comments: {
                Row: {
                    id: string;
                    user_id: string;
                    post_id: string;
                    content: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    post_id: string;
                    content: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    post_id?: string;
                    content?: string;
                    created_at?: string;
                    updated_at?: string;
                };
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            increment_followers: {
                Args: { user_id: string };
                Returns: void;
            };
            decrement_followers: {
                Args: { user_id: string };
                Returns: void;
            };
            increment_following: {
                Args: { user_id: string };
                Returns: void;
            };
            decrement_following: {
                Args: { user_id: string };
                Returns: void;
            };
            toggle_like: {
                Args: { target_post_id: string; target_user_id: string };
                Returns: boolean;
            };
            toggle_repost: {
                Args: { target_post_id: string; target_user_id: string };
                Returns: boolean;
            };
        };
        Enums: {
            [_ in never]: never;
        };
    };
}

// Helper types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type Follow = Database["public"]["Tables"]["follows"]["Row"];
export type FollowInsert = Database["public"]["Tables"]["follows"]["Insert"];

export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type PostInsert = Database["public"]["Tables"]["posts"]["Insert"];
export type PostUpdate = Database["public"]["Tables"]["posts"]["Update"];

export type Like = Database["public"]["Tables"]["likes"]["Row"];
export type LikeInsert = Database["public"]["Tables"]["likes"]["Insert"];

export type Repost = Database["public"]["Tables"]["reposts"]["Row"];
export type RepostInsert = Database["public"]["Tables"]["reposts"]["Insert"];

export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type CommentInsert = Database["public"]["Tables"]["comments"]["Insert"];
export type CommentUpdate = Database["public"]["Tables"]["comments"]["Update"];
