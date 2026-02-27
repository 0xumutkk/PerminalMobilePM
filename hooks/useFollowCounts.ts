import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface FollowCountsState {
    followersCount: number | null;
    followingCount: number | null;
    isLoading: boolean;
    error: string | null;
}

const INITIAL_STATE: FollowCountsState = {
    followersCount: null,
    followingCount: null,
    isLoading: false,
    error: null,
};

export function useFollowCounts(userId: string | null) {
    const [state, setState] = useState<FollowCountsState>(INITIAL_STATE);

    const fetchCounts = useCallback(async () => {
        if (!userId) {
            setState(INITIAL_STATE);
            return;
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const [followersRes, followingRes] = await Promise.all([
                supabase
                    .from("follows")
                    .select("id", { count: "exact", head: true })
                    .eq("following_id", userId),
                supabase
                    .from("follows")
                    .select("id", { count: "exact", head: true })
                    .eq("follower_id", userId),
            ]);

            if (followersRes.error) throw followersRes.error;
            if (followingRes.error) throw followingRes.error;

            setState({
                followersCount: typeof followersRes.count === "number" ? followersRes.count : 0,
                followingCount: typeof followingRes.count === "number" ? followingRes.count : 0,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Failed to fetch follow counts",
            }));
        }
    }, [userId]);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`follow-counts:${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "follows",
                    filter: `following_id=eq.${userId}`,
                },
                () => {
                    fetchCounts();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "follows",
                    filter: `follower_id=eq.${userId}`,
                },
                () => {
                    fetchCounts();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, fetchCounts]);

    return {
        ...state,
        refresh: fetchCounts,
    };
}
