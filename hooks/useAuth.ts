import { usePrivy, useEmbeddedSolanaWallet, isConnected } from "@privy-io/expo";
import { useCallback, useMemo } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";

const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export function useAuth() {
    const { user, isReady: privyReady } = usePrivy();
    const solanaWallet = useEmbeddedSolanaWallet();

    // Map Privy user to the interface expected by social hooks
    // Look specifically for a Solana wallet
    const solanaAccount = user?.linked_accounts?.find((a: any) =>
        (a.type === 'wallet' && a.chain_type === 'solana')
    );
    const emailAccount = user?.linked_accounts?.find((a: any) => a.type === 'email');

    // Also try to get address directly from useEmbeddedSolanaWallet if connected
    const embeddedAddress = isConnected(solanaWallet) ? solanaWallet.wallets[0]?.address : null;

    // Memoize user and activeWallet to prevent infinite loops in hooks/components depending on them
    const memoizedActiveWallet = useMemo(() => {
        const address = (solanaAccount as any)?.address || embeddedAddress;
        return address ? { address } : null;
    }, [(solanaAccount as any)?.address, embeddedAddress]);

    const memoizedUser = useMemo(() => {
        if (!user) return null;
        return {
            ...user,
            email: emailAccount ? { address: (emailAccount as any).address } : undefined
        };
    }, [user, emailAccount]);


    const signAndSendTransaction = useCallback(async (transaction: VersionedTransaction) => {
        if (!isConnected(solanaWallet)) {
            throw new Error("Solana wallet not connected");
        }

        const wallet = solanaWallet.wallets[0];
        const provider = await wallet.getProvider();

        // Create connection for the provider
        const connection = new Connection(SOLANA_RPC_URL, "confirmed");

        console.log("[useAuth] Requesting signAndSendTransaction via Privy...");

        // Privy Solana provider expects the transaction object and connection
        const result = await provider.request({
            method: 'signAndSendTransaction',
            params: {
                transaction,
                connection,
            }
        });

        if (!result || !result.signature) {
            throw new Error("Failed to get signature from wallet provider");
        }

        console.log("[useAuth] Transaction signed and sent, signature:", result.signature);
        return { signature: result.signature };
    }, [solanaWallet]);

    return {
        authenticated: !!user,
        user: memoizedUser,
        activeWallet: memoizedActiveWallet,
        isReady: privyReady && isConnected(solanaWallet),
        signAndSendTransaction,
        solanaWalletStatus: solanaWallet.status,
    };
}

