/**
 * Shared types for Supabase public.profiles (and related) used across app.
 * Matches supabase-schema.sql + seed-data.sql (pnl, win_rate).
 */

/** Row from follows table (select following_id or follower_id). */
export type FollowRow = { following_id: string } | { follower_id: string };

export interface Profile {
    id: string;
    wallet_address: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio?: string | null;
    followers_count?: number;
    following_count?: number;
    trades_count?: number;
    pnl: number | null;
    win_rate: number | null;
    created_at?: string;
    updated_at?: string;
}
