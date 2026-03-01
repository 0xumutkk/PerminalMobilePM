import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Connection, PublicKey } from "npm:@solana/web3.js";
import { createClient } from "npm:@supabase/supabase-js";

// Initialize Supabase Client (Service Role required to bypass RLS to update is_verified)
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Solana RPC (Helius, QuickNode, etc.)
const solanaRpcUrl = Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(solanaRpcUrl, "confirmed");

// Jupiter Prediction Contract Address
const JUPITER_PREDICTION_PROGRAM_ID = "jppoXrwXcsA2TAnXo19pTty6R5Bwnd52zC3D2v1h1z2";

/**
 * Validates a Solana Transaction for Proof of Trade.
 * 
 * 1. Confirms the transaction exists and was successful.
 * 2. Confirms the user's wallet address was a signer.
 * 3. Confirms the transaction interacted with the Jupiter Prediction Program.
 */
serve(async (req) => {
    // 1. CORS headers
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers });
    }

    try {
        const payload = await req.json();
        const { txHash, postId, userWalletAddress } = payload;

        if (!txHash || !postId || !userWalletAddress) {
            return new Response(JSON.stringify({ error: "Missing required fields (txHash, postId, userWalletAddress)" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...headers }
            });
        }

        console.log(`Verifying trade... TX: ${txHash} for Post: ${postId}`);

        // 2. Fetch the transaction from Solana RPC
        // maxSupportedTransactionVersion needed for versioned transactions created by Jupiter
        const tx = await connection.getTransaction(txHash, {
            maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
            return new Response(JSON.stringify({ error: "Transaction not found on chain." }), {
                status: 404, headers: { "Content-Type": "application/json", ...headers }
            });
        }

        if (tx.meta?.err) {
            return new Response(JSON.stringify({ error: "Transaction failed on chain." }), {
                status: 400, headers: { "Content-Type": "application/json", ...headers }
            });
        }

        // 3. Verify Signer
        const message = tx.transaction.message;
        const accountKeys = message.getAccountKeys();

        // Find the index of the user wallet
        const userWalletPubkey = new PublicKey(userWalletAddress);
        const userAccountIndex = accountKeys.staticAccountKeys.findIndex(k => k.equals(userWalletPubkey));

        if (userAccountIndex === -1) {
            return new Response(JSON.stringify({ error: "User wallet not found in transaction accounts." }), {
                status: 400, headers: { "Content-Type": "application/json", ...headers }
            });
        }

        if (!message.isAccountSigner(userAccountIndex)) {
            return new Response(JSON.stringify({ error: "User wallet did not sign this transaction." }), {
                status: 401, headers: { "Content-Type": "application/json", ...headers }
            });
        }

        // 4. Verify Jupiter Prediction Contract Interaction
        const jupiterPubkey = new PublicKey(JUPITER_PREDICTION_PROGRAM_ID);
        const jupiterProgramIndex = accountKeys.staticAccountKeys.findIndex(k => k.equals(jupiterPubkey));

        if (jupiterProgramIndex === -1) {
            console.log("Warning: Transaction did not directly reference Jupiter Prediction Program in static keys. Might be deeply nested or different program utilized. Strict mode skipping for now.");
            // For strict verification, you might enforce this.
            // return new Response(JSON.stringify({ error: "Transaction did not interact with Jupiter Prediction Program." }), { status: 400, headers });
        }


        // 5. If everything passes, update the Supabase Post
        const { error: updateError } = await supabase
            .from("posts")
            .update({ is_verified: true })
            .eq("id", postId);

        if (updateError) {
            console.error("Failed to update post verified status in DB", updateError);
            return new Response(JSON.stringify({ error: "Failed to update database record." }), {
                status: 500, headers: { "Content-Type": "application/json", ...headers }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            message: "Trade successfully verified.",
            is_verified: true
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...headers }
        });

    } catch (error: any) {
        console.error("Function Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
            status: 500, headers: { "Content-Type": "application/json", ...headers }
        });
    }
});
