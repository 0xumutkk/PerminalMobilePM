import { useState } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/expo';
import { jupiterTradeService } from '../lib/services/jupiterTrade';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

export function useJupiterTrade() {
    const { user } = usePrivy();
    const { wallets } = useSolanaWallets();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get the user's embedded wallet.
    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

    const executeTrade = async (params: {
        marketId: string;
        side: "YES" | "NO";
        contracts: number;
        isBuy: boolean; // true for buy, false for sell
        maxBuyPriceUsd?: number;
        minSellPriceUsd?: number;
    }) => {
        setIsLoading(true);
        setError(null);

        try {
            if (!embeddedWallet) {
                throw new Error("No embedded wallet found. Please login.");
            }

            const ownerPubkey = embeddedWallet.address;
            let orderResponse;

            // 1. Create Order via Jupiter API
            if (params.isBuy) {
                orderResponse = await jupiterTradeService.buy({
                    ownerPubkey,
                    marketId: params.marketId,
                    side: params.side,
                    contracts: params.contracts,
                    maxBuyPriceUsd: params.maxBuyPriceUsd,
                });
            } else {
                orderResponse = await jupiterTradeService.sell({
                    ownerPubkey,
                    marketId: params.marketId,
                    side: params.side,
                    contracts: params.contracts,
                    minSellPriceUsd: params.minSellPriceUsd,
                });
            }

            if (!orderResponse.transaction) {
                throw new Error("No transaction returned from Jupiter API");
            }

            // 2. Deserialize Transaction Payload
            const transactionBuffer = Buffer.from(orderResponse.transaction, 'base64');
            const transaction = VersionedTransaction.deserialize(transactionBuffer);

            // 3. Sign and Send with Privy Embedded Wallet
            const provider = await embeddedWallet.getProvider();

            // Need a connection to broadcast
            // We use a public endpoint or your RPC from env
            const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
            const connection = new Connection(rpcUrl, 'confirmed');

            const signature = await provider.request({
                method: 'signAndSendTransaction',
                params: {
                    transaction,
                    connection,
                    // Privy handles fees if configured in dashboard
                }
            });

            console.log("Trade executed successfully. Signature:", signature);
            return { signature, orderResponse };

        } catch (err: any) {
            console.error("Trade execution failed:", err);
            setError(err.message || "An unknown error occurred during trade.");
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        executeTrade,
        isLoading,
        error
    };
}
