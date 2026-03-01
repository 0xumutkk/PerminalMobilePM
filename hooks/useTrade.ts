import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { jupiterTradeService } from "../lib/services/jupiterTrade";
import type { JupiterCreateOrderResponse } from "../lib/types/jupiter.types";
import { SOLANA_RPC_URL, getUsdcBalance } from "../lib/solana";

export type TradeSide = "YES" | "NO";
export type TradeMode = "BUY" | "SELL";

export interface TradeParams {
    marketId: string;
    amountUsdc: number; // Amount in USDC
    side: TradeSide;
    expectedPrice?: number; // Market price shown in UI for safety check
    slippageBps?: number;
}

export interface SellTradeParams {
    marketId: string;
    amountTokens: number; // Amount of outcome tokens (shares) to sell
    side: TradeSide;
    expectedPrice?: number;
    slippageBps?: number;
}

export interface RedeemTradeParams {
    positionPubkey: string; // The Jupiter position pubkey to claim
}

export interface TradeState {
    isLoading: boolean;
    isQuoting: boolean;
    isSigning: boolean;
    isConfirming: boolean;
    error: string | null;
    signature: string | null;
    quote: JupiterCreateOrderResponse | null;
    usdcBalance: number | null;
}

const initialState: TradeState = {
    isLoading: false,
    isQuoting: false,
    isSigning: false,
    isConfirming: false,
    error: null,
    signature: null,
    quote: null,
    usdcBalance: null,
};

const STRICT_PRICE_GUARD = process.env.EXPO_PUBLIC_STRICT_PRICE_GUARD === "true";

export function useTrade() {
    const { isReady, authenticated, activeWallet, signAndSendTransaction } = useAuth();
    const [state, setState] = useState<TradeState>(initialState);
    const latestQuoteRequestRef = useRef(0);

    const fetchBalance = useCallback(async () => {
        if (!activeWallet?.address) return;
        try {
            const usdcBalance = await getUsdcBalance(activeWallet.address);
            setState((s) => ({ ...s, usdcBalance }));
        } catch (error) {
            console.error("[Trade] Failed to fetch balance:", error);
        }
    }, [activeWallet]);

    useEffect(() => {
        if (authenticated && activeWallet?.address) {
            fetchBalance();
        }
    }, [authenticated, activeWallet, fetchBalance]);

    const reset = useCallback(() => {
        latestQuoteRequestRef.current += 1;
        setState((s) => ({ ...initialState, usdcBalance: s.usdcBalance }));
    }, []);

    const getQuote = useCallback(async (params: Omit<TradeParams, "marketId"> & { marketId: string }) => {
        if (!activeWallet?.address) {
            setState((s) => ({ ...s, error: "Wallet not connected" }));
            return null;
        }

        const requestId = ++latestQuoteRequestRef.current;
        setState((s) => ({ ...s, isQuoting: true, error: null }));

        try {
            // Jupiter requires 'contracts'. For buy, contracts = amountUsdc / expectedPrice
            const priceToUse = params.expectedPrice || 0.5; // fallback
            const contracts = Math.max(1, Math.floor(params.amountUsdc / priceToUse));

            const quote = await jupiterTradeService.buy({
                ownerPubkey: activeWallet.address,
                marketId: params.marketId,
                side: params.side,
                contracts,
            });

            if (requestId !== latestQuoteRequestRef.current) return null;

            setState((s) => ({ ...s, isQuoting: false, quote }));
            return quote;
        } catch (error) {
            if (requestId !== latestQuoteRequestRef.current) return null;
            const message = error instanceof Error ? error.message : "Quote failed";
            setState((s) => ({ ...s, isQuoting: false, error: message }));
            return null;
        }
    }, [activeWallet]);

    const getSwapQuote = useCallback(async (params: Omit<SellTradeParams, "marketId"> & { marketId: string }) => {
        if (!activeWallet?.address) {
            setState((s) => ({ ...s, error: "Wallet not connected" }));
            return null;
        }

        const requestId = ++latestQuoteRequestRef.current;
        setState((s) => ({ ...s, isQuoting: true, error: null }));

        try {
            const quote = await jupiterTradeService.sell({
                ownerPubkey: activeWallet.address,
                marketId: params.marketId,
                side: params.side,
                contracts: Math.floor(params.amountTokens),
            });

            if (requestId !== latestQuoteRequestRef.current) return null;

            setState((s) => ({ ...s, isQuoting: false, quote }));
            return quote;
        } catch (error) {
            if (requestId !== latestQuoteRequestRef.current) return null;
            const message = error instanceof Error ? error.message : "Quote failed";
            setState((s) => ({ ...s, isQuoting: false, error: message }));
            return null;
        }
    }, [activeWallet]);

    const executeSwap = useCallback(async (action: "buy" | "sell", quote: JupiterCreateOrderResponse | null, expectedPrice?: number) => {
        if (!isReady || !authenticated || !activeWallet?.address) {
            setState((s) => ({ ...s, error: "Please connect your wallet first" }));
            return null;
        }
        if (!quote) {
            setState((s) => ({ ...s, error: "No valid quote available" }));
            return null;
        }

        setState((s) => ({ ...s, isLoading: true, isSigning: true, error: null }));

        try {
            const rawEffectivePrice = parseInt(quote.priceUsd ?? "0", 10) / 1000000;
            if (expectedPrice && expectedPrice > 0 && rawEffectivePrice > 0) {
                // simple price gap check
                const gap = Math.abs(rawEffectivePrice - expectedPrice) / expectedPrice;
                if (gap > 0.15) {
                    if (STRICT_PRICE_GUARD) {
                        throw new Error(`Price Alert: Execution price ${rawEffectivePrice.toFixed(4)} is too far from expected ${expectedPrice.toFixed(4)}.`);
                    }
                    console.warn(`[Trade] Price gap ${gap * 100}% - Strict guard disabled.`);
                }
            }

            console.log("[Trade] Preparing transaction...");
            const transactionBytes = Buffer.from(quote.transaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBytes);

            console.log("[Trade] Signing and sending via Privy...");
            const result = await signAndSendTransaction(transaction);
            const walletSignature = result.signature;

            setState((s) => ({ ...s, isSigning: false, isConfirming: true }));
            console.log(`[Trade] Transaction sent: ${walletSignature}`);

            // Confirm transaction
            const connection = new Connection(SOLANA_RPC_URL, {
                commitment: "confirmed",
                confirmTransactionInitialTimeout: 60000,
            });

            let confirmed = false;
            const startTime = Date.now();
            while (Date.now() - startTime < 60000) {
                const { value: status } = await connection.getSignatureStatus(walletSignature);
                if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
                if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
                    confirmed = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            if (!confirmed) throw new Error("Transaction confirmation timed out.");

            await fetchBalance();
            setState((s) => ({ ...s, isLoading: false, isConfirming: false, signature: walletSignature }));
            return walletSignature;
        } catch (error) {
            console.error("[Trade] Error:", error);
            const message = error instanceof Error ? error.message : "Trade failed";
            setState((s) => ({ ...s, isLoading: false, isSigning: false, isConfirming: false, error: message }));
            return null;
        }
    }, [isReady, authenticated, activeWallet, signAndSendTransaction, fetchBalance]);

    const buy = useCallback(async (params: TradeParams) => {
        const quote = state.quote || await getQuote(params);
        return executeSwap("buy", quote, params.expectedPrice);
    }, [state.quote, getQuote, executeSwap]);

    const sell = useCallback(async (params: SellTradeParams) => {
        const quote = state.quote || await getSwapQuote(params);
        return executeSwap("sell", quote, params.expectedPrice);
    }, [state.quote, getSwapQuote, executeSwap]);

    const redeem = useCallback(async (params: RedeemTradeParams) => {
        if (!isReady || !authenticated || !activeWallet?.address) {
            setState((s) => ({ ...s, error: "Please connect your wallet first" }));
            return null;
        }

        setState((s) => ({ ...s, isLoading: true, isSigning: true, error: null }));
        try {
            const claimResponse = await jupiterTradeService.claimPosition(params.positionPubkey);

            const transactionBytes = Buffer.from(claimResponse.transaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBytes);

            const result = await signAndSendTransaction(transaction);
            const walletSignature = result.signature;

            setState((s) => ({ ...s, isSigning: false, isConfirming: true }));

            const connection = new Connection(SOLANA_RPC_URL, {
                commitment: "confirmed",
                confirmTransactionInitialTimeout: 60000,
            });

            let confirmed = false;
            const startTime = Date.now();
            while (Date.now() - startTime < 60000) {
                const { value: status } = await connection.getSignatureStatus(walletSignature);
                if (status?.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
                if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
                    confirmed = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            if (!confirmed) throw new Error("Transaction confirmation timed out.");
            await fetchBalance();
            setState((s) => ({ ...s, isLoading: false, isConfirming: false, signature: walletSignature }));
            return walletSignature;
        } catch (error) {
            console.error("[Trade] Claim error:", error);
            const message = error instanceof Error ? error.message : "Claim failed";
            setState((s) => ({ ...s, isLoading: false, isSigning: false, isConfirming: false, error: message }));
            return null;
        }
    }, [isReady, authenticated, activeWallet, signAndSendTransaction, fetchBalance]);

    return {
        buy,
        sell,
        redeem,
        getQuote,
        getSwapQuote,
        reset,
        ...state,
        fetchBalance,
        isWalletConnected: authenticated && !!activeWallet?.address,
        walletAddress: activeWallet?.address,
        isJupiter: (marketId: string) => !marketId.includes("-") || marketId.startsWith("POLY-"),
    };
}
