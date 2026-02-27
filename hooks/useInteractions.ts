import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { Buffer } from "buffer";

export function useInteractions() {
    const { user, activeWallet } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getCurrentUserId = useCallback(() => {
        if (user?.email?.address) {
            try {
                return Buffer.from(user.email.address).toString('base64').replace(/[^a-zA-Z0-9]/g, "").slice(0, 36);
            } catch (e) {
                return user.email.address;
            }
        }
        if (activeWallet?.address) {
            return activeWallet.address;
        }
        return null;
    }, [user, activeWallet]);

    const toggleLike = useCallback(async (postId: string) => {
        const userId = getCurrentUserId();
        if (!userId) return false;

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase.rpc("toggle_like", {
                target_post_id: postId,
                target_user_id: userId
            } as any);

            if (error) throw error;
            return data as boolean; // Returns true if liked, false if unliked
        } catch (err) {
            console.error("Error toggling like:", err);
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getCurrentUserId]);

    const toggleRepost = useCallback(async (postId: string) => {
        const userId = getCurrentUserId();
        if (!userId) return false;

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase.rpc("toggle_repost", {
                target_post_id: postId,
                target_user_id: userId
            } as any);

            if (error) throw error;
            return data as boolean;
        } catch (err) {
            console.error("Error toggling repost:", err);
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getCurrentUserId]);

    const createPost = useCallback(async (
        content: string,
        marketId?: string,
        marketSlug?: string,
        marketQuestion?: string,
        postType: string = 'standard',
        tradeMetadata: any = {},
        isVerified: boolean = false
    ) => {
        const userId = getCurrentUserId();
        if (!userId) return null;

        setIsSubmitting(true);
        try {
            const { data, error } = await supabase
                .from("posts")
                .insert({
                    user_id: userId,
                    content,
                    market_id: marketId,
                    market_slug: marketSlug,
                    market_question: marketQuestion,
                    post_type: postType,
                    trade_metadata: tradeMetadata,
                    is_verified: isVerified
                } as any)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Error creating post:", err);
            return null;
        } finally {
            setIsSubmitting(false);
        }
    }, [getCurrentUserId]);

    return {
        toggleLike,
        toggleRepost,
        createPost,
        isSubmitting
    };
}
