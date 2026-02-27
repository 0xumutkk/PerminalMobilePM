import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/expo";
import { useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { supabase } from "../lib/supabase";

/**
 * Syncs current user (Privy + Solana wallet) to Supabase profiles.
 * Renders nothing. Run once when user.id and primaryAddress are available
 * so Leaderboard "Your rank" and Profile screen have a row.
 */
export function ProfileSync() {
    const { user } = usePrivy();
    const solanaWallet = useEmbeddedSolanaWallet();
    const didUpsert = useRef(false);

    const primaryAddress =
        isConnected(solanaWallet) && solanaWallet.wallets?.[0]
            ? solanaWallet.wallets[0].address
            : null;

    useEffect(() => {
        if (!user?.id || !primaryAddress) return;
        if (didUpsert.current) return;

        const id = user.id;
        const wallet_address = primaryAddress;
        const updated_at = new Date().toISOString();

        supabase
            .from("profiles")
            .select("id")
            .eq("id", id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) {
                    didUpsert.current = true;
                    return supabase
                        .from("profiles")
                        // @ts-ignore
                        .update({ wallet_address, updated_at })
                        .eq("id", id);
                }
                didUpsert.current = true;
                const username =
                    "user_" +
                    String(id)
                        .replace(/[^a-zA-Z0-9]/g, "_")
                        .slice(-16);
                // @ts-ignore
                return supabase.from("profiles").insert({
                    id,
                    wallet_address,
                    username,
                    display_name: "Anonymous",
                });
            })
            .then(({ error }) => {
                if (error) didUpsert.current = false;
            });
    }, [user?.id, primaryAddress]);

    return null;
}
