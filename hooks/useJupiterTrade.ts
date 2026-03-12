import { useState } from "react";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { jupiterTradeService } from "../lib/services/jupiterTrade";

export function useJupiterTrade() {
    const solanaWallet = useEmbeddedSolanaWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const executeTrade = async (params: {
        marketId: string;
        side: "YES" | "NO";
        isBuy: boolean; // true for buy, false for sell
        amountUsdc?: number;
        contracts?: number;
        positionPubkey?: string;
        maxBuyPriceUsd?: number;
        minSellPriceUsd?: number;
    }) => {
        setIsLoading(true);
        setError(null);

        try {
            const activeWallet = solanaWallet.wallets?.[0];
            if (solanaWallet.status !== 'connected' || !activeWallet) {
                throw new Error("No connected embedded solana wallet found. Please login.");
            }

            const ownerPubkey = activeWallet.address;
            let orderResponse;

            // 1. Create Order via Jupiter API
            if (params.isBuy) {
                if (params.amountUsdc == null) {
                    throw new Error("Buy trades require amountUsdc.");
                }
                orderResponse = await jupiterTradeService.buy({
                    ownerPubkey,
                    marketId: params.marketId,
                    side: params.side,
                    amountUsdc: params.amountUsdc,
                    maxBuyPriceUsd: params.maxBuyPriceUsd,
                });
            } else {
                if (params.contracts == null || !params.positionPubkey) {
                    throw new Error("Sell trades require contracts and positionPubkey.");
                }
                orderResponse = await jupiterTradeService.sell({
                    ownerPubkey,
                    marketId: params.marketId,
                    side: params.side,
                    contracts: params.contracts,
                    minSellPriceUsd: params.minSellPriceUsd,
                    positionPubkey: params.positionPubkey,
                });
            }

            if (!orderResponse.transaction) {
                throw new Error("No transaction returned from Jupiter API");
            }

            // 2. Deserialize Transaction Payload
            const transactionBuffer = Buffer.from(orderResponse.transaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBuffer);

            // 3. Sign and Send with Privy Embedded Wallet
            const provider = await solanaWallet.getProvider();

            // Need a connection to broadcast
            // We use a public endpoint or your RPC from env
            const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
            const connection = new Connection(rpcUrl, "confirmed");

            const signature = await provider.request({
                method: "signAndSendTransaction",
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
        error,
    };
}
