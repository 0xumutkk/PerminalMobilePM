import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { Profile } from "../lib/database.types";
import { Buffer } from "buffer";

export function useProfile() {
    const { authenticated, activeWallet, user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getCurrentUserId = useCallback(() => {
        if (user?.id) return user.id; // Primary identifier: Privy stable ID

        if (user?.email?.address) {
            try {
                // Fallback for legacy web compatibility
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

    const fetchProfile = useCallback(async () => {
        const userId = getCurrentUserId();
        if (!userId) {
            setProfile(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            console.log("[useProfile] Fetching profile for ID:", userId);
            const { data, error: fetchError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .maybeSingle();

            if (fetchError) {
                console.error("[useProfile] Fetch error:", fetchError);
                throw fetchError;
            }

            if (data) {
                console.log("[useProfile] Found existing profile");
                setProfile(data as any);
            } else {
                console.log("[useProfile] Profile not found, creating one...");
                // Profile doesn't exist, create one
                // Generate a unique username
                const baseUsername = activeWallet?.address
                    ? `user_${activeWallet.address.slice(0, 8).toLowerCase()}`
                    : `user_${userId.slice(0, 8).toLowerCase()}`;

                const { data: newProfile, error: createError } = await supabase
                    .from("profiles")
                    .insert({
                        id: userId,
                        username: baseUsername,
                        display_name: null,
                        wallet_address: activeWallet?.address || null,
                        bio: null,
                        avatar_url: null,
                    } as any)
                    .select()
                    .single();

                if (createError) {
                    // Check for unique constraint violation (username or id)
                    if (createError.code === "23505") {
                        console.log("[useProfile] Conflict on insert, checking why...");

                        // If it's a username conflict, retry with random suffix
                        // If it's an ID conflict, it means someone else created the profile meanwhile
                        const randomSuffix = Math.random().toString(36).slice(2, 6);
                        const { data: retryProfile, error: retryError } = await supabase
                            .from("profiles")
                            .insert({
                                id: userId,
                                username: `${baseUsername}_${randomSuffix}`,
                                wallet_address: activeWallet?.address || null,
                            } as any)
                            .select()
                            .single();

                        if (retryError) {
                            if (retryError.code === "23505") {
                                // Probably ID conflict now (profile exists). Just fetch again.
                                const { data: finalProfile } = await supabase
                                    .from("profiles")
                                    .select("*")
                                    .eq("id", userId)
                                    .single();
                                if (finalProfile) setProfile(finalProfile);
                            } else {
                                console.error("[useProfile] Retry create error:", retryError);
                            }
                        } else if (retryProfile) {
                            setProfile(retryProfile);
                        }
                    } else {
                        console.error("[useProfile] Create profile error:", createError);
                    }
                } else if (newProfile) {
                    setProfile(newProfile as any);
                }
            }
        } catch (err) {
            console.error("[useProfile] General error:", err);
            setError(err instanceof Error ? err.message : "Profile Error");
        } finally {
            setIsLoading(false);
        }
    }, [getCurrentUserId, activeWallet]);


    useEffect(() => {
        if (authenticated) {
            fetchProfile();
        } else {
            setProfile(null);
        }
    }, [authenticated, fetchProfile]);

    return { profile, isLoading, error, fetchProfile };
}

export function useUserProfile(username: string | null) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!username) {
            setProfile(null);
            return;
        }

        const fetchUserProfile = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const { data, error: fetchError } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("username", username)
                    .single();

                if (fetchError && fetchError.code !== "PGRST116") {
                    throw fetchError;
                }

                setProfile(data as any);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to fetch profile";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserProfile();
    }, [username]);

    return { profile, isLoading, error };
}
