import { useState, useCallback, useEffect, useRef } from "react";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { AppState } from "react-native";
import { useAuth } from "./useAuth";
import { jupiterTradeService } from "../lib/services/jupiterTrade";
import { jupiterSwapService } from "../lib/services/jupiterSwap";
import {
    usdToMicroUsd,
    type JupiterCreateOrderResponse,
    type JupiterKnownOrderStatus,
    type JupiterOrder,
} from "../lib/types/jupiter.types";
import {
    JUP_USD_MINT_ADDRESS,
    SOLANA_RPC_URL,
    USDC_MINT_ADDRESS,
    getSolBalance,
    getStablecoinBalances,
} from "../lib/solana";

export type TradeSide = "YES" | "NO";
export type TradeMode = "BUY" | "SELL";
export type TradeSubmitPhase =
    | "idle"
    | "preparing_funds"
    | "signing"
    | "confirming_transaction"
    | "transaction_submitted"
    | "order_resolved";

export interface QuoteContext {
    marketId: string;
    tradeMode: TradeMode;
    side: TradeSide;
    amount: number;
    depositMint: string | null;
    positionPubkey: string | null;
    selectedPositionId: string | null;
}

export interface TradeExecutionResult {
    signature: string;
    orderPubkey: string;
    resolutionStatus: JupiterKnownOrderStatus;
    quote: JupiterCreateOrderResponse;
}

export interface TradeParams {
    marketId: string;
    amountUsdc: number;
    side: TradeSide;
    expectedPrice?: number;
    slippageBps?: number;
    depositMint?: string;
    selectedPositionId?: string | null;
}

export interface SellTradeParams {
    marketId: string;
    amountTokens: number;
    side: TradeSide;
    expectedPrice?: number;
    slippageBps?: number;
    positionPubkey?: string;
    selectedPositionId?: string | null;
}

export interface RedeemTradeParams {
    positionPubkey: string;
}

export interface TradeState {
    isLoading: boolean;
    isQuoting: boolean;
    isSigning: boolean;
    isConfirming: boolean;
    error: string | null;
    signature: string | null;
    quote: JupiterCreateOrderResponse | null;
    quoteContext: QuoteContext | null;
    selectedPositionId: string | null;
    submitPhase: TradeSubmitPhase;
    orderStatus: JupiterKnownOrderStatus | null;
    orderPubkey: string | null;
    usdcBalance: number | null;
    usdcTokenBalance: number | null;
    jupUsdBalance: number | null;
    solBalance: number | null;
}

const initialState: TradeState = {
    isLoading: false,
    isQuoting: false,
    isSigning: false,
    isConfirming: false,
    error: null,
    signature: null,
    quote: null,
    quoteContext: null,
    selectedPositionId: null,
    submitPhase: "idle",
    orderStatus: null,
    orderPubkey: null,
    usdcBalance: null,
    usdcTokenBalance: null,
    jupUsdBalance: null,
    solBalance: null,
};

const STRICT_PRICE_GUARD = process.env.EXPO_PUBLIC_STRICT_PRICE_GUARD === "true";
const MIN_BUY_ORDER_USD = 1.01;
const ORDER_STATUS_POLL_INTERVAL_MS = 2_000;
const ORDER_STATUS_TIMEOUT_MS = 30_000;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOrderStatus(status?: string | null): JupiterKnownOrderStatus | null {
    switch (status) {
        case "created":
        case "pending":
        case "processing":
        case "open":
            return "open";
        case "filled":
        case "partially_filled":
        case "cancelled":
        case "expired":
            return status;
        default:
            return null;
    }
}

function getQuoteContextForBuy(params: TradeParams): QuoteContext {
    return {
        marketId: params.marketId,
        tradeMode: "BUY",
        side: params.side,
        amount: params.amountUsdc,
        depositMint: params.depositMint ?? null,
        positionPubkey: null,
        selectedPositionId: params.selectedPositionId ?? null,
    };
}

function getQuoteContextForSell(params: SellTradeParams): QuoteContext {
    return {
        marketId: params.marketId,
        tradeMode: "SELL",
        side: params.side,
        amount: params.amountTokens,
        depositMint: null,
        positionPubkey: params.positionPubkey ?? null,
        selectedPositionId: params.selectedPositionId ?? params.positionPubkey ?? null,
    };
}

function doesQuoteContextMatch(current: QuoteContext | null, next: QuoteContext): boolean {
    if (!current) return false;
    return (
        current.marketId === next.marketId &&
        current.tradeMode === next.tradeMode &&
        current.side === next.side &&
        current.amount === next.amount &&
        current.depositMint === next.depositMint &&
        current.positionPubkey === next.positionPubkey &&
        current.selectedPositionId === next.selectedPositionId
    );
}

function getTerminalOrderMessage(status: JupiterKnownOrderStatus): string | null {
    if (status === "cancelled") {
        return "Order was cancelled before it filled. You can adjust and try again.";
    }
    if (status === "expired") {
        return "Order expired before it filled. You can adjust and try again.";
    }
    return null;
}

export function useTrade() {
    const { isReady, authenticated, activeWallet, signAndSendTransaction } = useAuth();
    const [state, setState] = useState<TradeState>(initialState);
    const latestQuoteRequestRef = useRef(0);
    const walletAddress = activeWallet?.address ?? null;

    const fetchBalance = useCallback(async () => {
        if (!walletAddress) return;
        try {
            const [stablecoinResult, solResult] = await Promise.allSettled([
                getStablecoinBalances(walletAddress),
                getSolBalance(walletAddress),
            ]);

            setState((s) => ({
                ...s,
                usdcBalance: stablecoinResult.status === "fulfilled" ? stablecoinResult.value.total : s.usdcBalance,
                usdcTokenBalance: stablecoinResult.status === "fulfilled" ? stablecoinResult.value.usdc : s.usdcTokenBalance,
                jupUsdBalance: stablecoinResult.status === "fulfilled" ? stablecoinResult.value.jupUsd : s.jupUsdBalance,
                solBalance: solResult.status === "fulfilled" ? solResult.value : s.solBalance,
            }));
        } catch (error) {
            console.error("[Trade] Failed to fetch balance:", error);
        }
    }, [walletAddress]);

    useEffect(() => {
        if (authenticated && walletAddress) {
            setState((s) => ({ ...s, error: null }));
            void fetchBalance();
        }
    }, [authenticated, fetchBalance, walletAddress]);

    useEffect(() => {
        if (!authenticated || !walletAddress) return;

        const subscription = AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") {
                void fetchBalance();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [authenticated, fetchBalance, walletAddress]);

    const clearQuote = useCallback(() => {
        latestQuoteRequestRef.current += 1;
        setState((s) => ({
            ...s,
            isQuoting: false,
            error: null,
            quote: null,
            quoteContext: null,
            selectedPositionId: null,
            submitPhase: s.isLoading ? s.submitPhase : "idle",
            orderStatus: s.isLoading ? s.orderStatus : null,
            orderPubkey: s.isLoading ? s.orderPubkey : null,
        }));
    }, []);

    const reset = useCallback(() => {
        latestQuoteRequestRef.current += 1;
        setState((s) => ({
            ...initialState,
            usdcBalance: s.usdcBalance,
            usdcTokenBalance: s.usdcTokenBalance,
            jupUsdBalance: s.jupUsdBalance,
            solBalance: s.solBalance,
        }));
    }, []);

    const confirmTransaction = useCallback(async (signature: string) => {
        const connection = new Connection(SOLANA_RPC_URL, {
            commitment: "confirmed",
            confirmTransactionInitialTimeout: 60_000,
        });

        const startedAt = Date.now();
        while (Date.now() - startedAt < 60_000) {
            const { value: status } = await connection.getSignatureStatus(signature);
            if (status?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
                return;
            }
            await sleep(2_000);
        }

        throw new Error("Transaction confirmation timed out.");
    }, []);

    const swapUsdcToJupUsd = useCallback(async (missingAmountUsd: number, slippageBps?: number) => {
        if (!isReady || !authenticated || !walletAddress) {
            throw new Error("Please connect your wallet first");
        }

        const outputAmount = usdToMicroUsd(missingAmountUsd);
        if (outputAmount <= 0) return null;

        const quote = await jupiterSwapService.getExactOutQuote({
            inputMint: USDC_MINT_ADDRESS,
            outputMint: JUP_USD_MINT_ADDRESS,
            outputAmount: String(outputAmount),
            slippageBps,
        });

        const swapTx = await jupiterSwapService.buildSwapTransaction({
            userPublicKey: walletAddress,
            quoteResponse: quote,
        });

        if (!swapTx.swapTransaction) {
            throw new Error("No swap transaction returned from Jupiter.");
        }

        const transactionBytes = Buffer.from(swapTx.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(transactionBytes);
        const result = await signAndSendTransaction(transaction);
        const signature = result.signature;
        await confirmTransaction(signature);
        return signature;
    }, [authenticated, confirmTransaction, isReady, signAndSendTransaction, walletAddress]);

    const pollOrderResolution = useCallback(async (orderPubkey: string) => {
        let latestOrder: JupiterOrder | null = null;
        const startedAt = Date.now();

        while (Date.now() - startedAt < ORDER_STATUS_TIMEOUT_MS) {
            latestOrder = await jupiterTradeService.getOrderStatus(orderPubkey);
            const normalized = normalizeOrderStatus(latestOrder.status);
            if (!normalized) {
                console.warn(`[Trade] Unknown order status while polling: ${latestOrder.status}`);
                await sleep(ORDER_STATUS_POLL_INTERVAL_MS);
                continue;
            }
            if (normalized !== "open") {
                return { order: latestOrder, status: normalized };
            }

            await sleep(ORDER_STATUS_POLL_INTERVAL_MS);
        }

        return { order: latestOrder, status: "open" as const };
    }, []);

    const getQuote = useCallback(async (params: TradeParams) => {
        if (!activeWallet?.address) {
            setState((s) => ({ ...s, error: "Wallet not connected" }));
            return null;
        }

        const context = getQuoteContextForBuy(params);
        const requestId = ++latestQuoteRequestRef.current;
        setState((s) => ({
            ...s,
            isQuoting: true,
            error: null,
            quote: null,
            quoteContext: null,
            selectedPositionId: context.selectedPositionId,
            submitPhase: "idle",
            orderStatus: null,
            orderPubkey: null,
        }));

        if (params.amountUsdc < MIN_BUY_ORDER_USD) {
            setState((s) => ({
                ...s,
                isQuoting: false,
                error: "Minimum order is above $1.00 on Jupiter. Try $1.01 or more.",
                quote: null,
                quoteContext: null,
                selectedPositionId: context.selectedPositionId,
            }));
            return null;
        }

        try {
            const maxPrice = params.expectedPrice ? Math.min(0.999999, params.expectedPrice * 1.05) : undefined;
            const shouldRetryForFundingSync = params.depositMint === JUP_USD_MINT_ADDRESS;
            const maxAttempts = shouldRetryForFundingSync ? 3 : 1;
            let quote: JupiterCreateOrderResponse | null = null;
            let lastMessage = "Quote failed";

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                try {
                    quote = await jupiterTradeService.buy({
                        ownerPubkey: activeWallet.address,
                        marketId: params.marketId,
                        side: params.side,
                        amountUsdc: params.amountUsdc,
                        maxBuyPriceUsd: maxPrice,
                        depositMint: params.depositMint,
                        slippageBps: params.slippageBps,
                    });
                    break;
                } catch (error) {
                    lastMessage = error instanceof Error ? error.message : "Quote failed";
                    const isFundingLag = shouldRetryForFundingSync
                        && /insufficient funds/i.test(lastMessage)
                        && attempt < maxAttempts - 1;
                    if (!isFundingLag) {
                        throw error;
                    }

                    await sleep(1_500 * (attempt + 1));
                    await fetchBalance();
                }
            }

            if (!quote) {
                throw new Error(lastMessage);
            }

            if (requestId !== latestQuoteRequestRef.current) return null;

            setState((s) => ({
                ...s,
                isQuoting: false,
                quote,
                quoteContext: context,
                selectedPositionId: context.selectedPositionId,
            }));
            return quote;
        } catch (error) {
            if (requestId !== latestQuoteRequestRef.current) return null;
            const message = error instanceof Error ? error.message : "Quote failed";
            setState((s) => ({
                ...s,
                isQuoting: false,
                error: message,
                quote: null,
                quoteContext: null,
                selectedPositionId: context.selectedPositionId,
            }));
            return null;
        }
    }, [activeWallet, fetchBalance]);

    const getSwapQuote = useCallback(async (params: SellTradeParams) => {
        if (!activeWallet?.address) {
            setState((s) => ({ ...s, error: "Wallet not connected" }));
            return null;
        }

        const context = getQuoteContextForSell(params);
        const requestId = ++latestQuoteRequestRef.current;
        setState((s) => ({
            ...s,
            isQuoting: true,
            error: null,
            quote: null,
            quoteContext: null,
            selectedPositionId: context.selectedPositionId,
            submitPhase: "idle",
            orderStatus: null,
            orderPubkey: null,
        }));

        try {
            if (!params.positionPubkey) {
                throw new Error("Select a position to sell.");
            }

            const contractsCount = Math.floor(params.amountTokens);
            if (contractsCount <= 0) {
                throw new Error("Minimum sell is 1 share.");
            }

            const quote = await jupiterTradeService.sell({
                ownerPubkey: activeWallet.address,
                marketId: params.marketId,
                side: params.side,
                contracts: contractsCount,
                positionPubkey: params.positionPubkey,
                slippageBps: params.slippageBps,
            });

            if (requestId !== latestQuoteRequestRef.current) return null;

            setState((s) => ({
                ...s,
                isQuoting: false,
                quote,
                quoteContext: context,
                selectedPositionId: context.selectedPositionId,
            }));
            return quote;
        } catch (error) {
            if (requestId !== latestQuoteRequestRef.current) return null;
            const message = error instanceof Error ? error.message : "Quote failed";
            setState((s) => ({
                ...s,
                isQuoting: false,
                error: message,
                quote: null,
                quoteContext: null,
                selectedPositionId: context.selectedPositionId,
            }));
            return null;
        }
    }, [activeWallet]);

    const executeSwap = useCallback(async (
        action: "buy" | "sell",
        quote: JupiterCreateOrderResponse | null,
        expectedPrice?: number
    ): Promise<TradeExecutionResult | null> => {
        if (!isReady || !authenticated || !activeWallet?.address) {
            setState((s) => ({ ...s, error: "Please connect your wallet first" }));
            return null;
        }

        if (!quote) {
            setState((s) => ({ ...s, error: s.error || "No valid quote available" }));
            return null;
        }

        setState((s) => ({
            ...s,
            isLoading: true,
            isSigning: true,
            error: null,
            submitPhase: "signing",
            orderStatus: null,
            orderPubkey: quote.order.orderPubkey ?? null,
        }));

        try {
            const orderObj = quote.order;
            const rawEffectivePrice = orderObj
                ? (parseInt(orderObj.orderCostUsd ?? "0", 10) / parseInt(orderObj.contracts ?? "1", 10)) / 1_000_000
                : 0;

            if (expectedPrice && expectedPrice > 0 && rawEffectivePrice > 0) {
                const gap = Math.abs(rawEffectivePrice - expectedPrice) / expectedPrice;
                if (gap > 0.25 && STRICT_PRICE_GUARD) {
                    throw new Error(
                        `Price Alert: Execution price ${rawEffectivePrice.toFixed(4)} is too far from expected ${expectedPrice.toFixed(4)}.`
                    );
                }
            }

            const transactionBytes = Buffer.from(quote.transaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBytes);
            const result = await signAndSendTransaction(transaction);
            const walletSignature = result.signature;

            setState((s) => ({
                ...s,
                isSigning: false,
                isConfirming: true,
                signature: walletSignature,
                submitPhase: "confirming_transaction",
            }));

            await confirmTransaction(walletSignature);

            const orderPubkey = quote.order.orderPubkey;
            if (!orderPubkey) {
                throw new Error("Missing order pubkey in quote response.");
            }

            setState((s) => ({
                ...s,
                isConfirming: false,
                submitPhase: "transaction_submitted",
                orderStatus: "open",
                orderPubkey,
                signature: walletSignature,
            }));

            const resolution = await pollOrderResolution(orderPubkey);

            await fetchBalance();

            if (resolution.status === "open") {
                setState((s) => ({
                    ...s,
                    isLoading: false,
                    isSigning: false,
                    isConfirming: false,
                    error: "Order submitted and confirmed, but it is still pending fill. You can close this sheet and check back.",
                    quote: null,
                    quoteContext: null,
                    selectedPositionId: null,
                    submitPhase: "transaction_submitted",
                    orderStatus: "open",
                    orderPubkey,
                    signature: walletSignature,
                }));
                return {
                    signature: walletSignature,
                    orderPubkey,
                    resolutionStatus: "open",
                    quote,
                };
            }

            const terminalMessage = getTerminalOrderMessage(resolution.status);
            setState((s) => ({
                ...s,
                isLoading: false,
                isSigning: false,
                isConfirming: false,
                error: terminalMessage,
                quote: null,
                quoteContext: null,
                selectedPositionId: null,
                submitPhase: "order_resolved",
                orderStatus: resolution.status,
                orderPubkey,
                signature: walletSignature,
            }));

            return {
                signature: walletSignature,
                orderPubkey,
                resolutionStatus: resolution.status,
                quote,
            };
        } catch (error) {
            console.error(`[Trade] ${action} error:`, error);
            const message = error instanceof Error ? error.message : "Trade failed";
            setState((s) => ({
                ...s,
                isLoading: false,
                isSigning: false,
                isConfirming: false,
                error: message,
                quote: null,
                quoteContext: null,
                selectedPositionId: null,
                submitPhase: "idle",
                orderStatus: null,
                orderPubkey: null,
            }));
            return null;
        }
    }, [activeWallet, authenticated, confirmTransaction, fetchBalance, isReady, pollOrderResolution, signAndSendTransaction]);

    const buy = useCallback(async (params: TradeParams) => {
        if (params.amountUsdc <= 0) {
            setState((s) => ({ ...s, error: "Enter a valid amount." }));
            return null;
        }

        if (params.amountUsdc < MIN_BUY_ORDER_USD) {
            setState((s) => ({ ...s, error: "Minimum order is above $1.00 on Jupiter. Try $1.01 or more." }));
            return null;
        }

        const requestedMint = params.depositMint ?? USDC_MINT_ADDRESS;
        const currentJupUsd = state.jupUsdBalance ?? 0;
        const currentUsdc = state.usdcTokenBalance ?? 0;
        const needsJupUsdTopUp = requestedMint === JUP_USD_MINT_ADDRESS
            && currentJupUsd + 0.000001 < params.amountUsdc
            && currentJupUsd + currentUsdc + 0.000001 >= params.amountUsdc;

        if (needsJupUsdTopUp) {
            const missingAmount = Math.max(0, params.amountUsdc - currentJupUsd);
            setState((s) => ({
                ...s,
                isLoading: true,
                error: null,
                quote: null,
                quoteContext: null,
                selectedPositionId: params.selectedPositionId ?? null,
                submitPhase: "preparing_funds",
                orderStatus: null,
                orderPubkey: null,
            }));

            try {
                await swapUsdcToJupUsd(missingAmount, params.slippageBps);
                await fetchBalance();
                setState((s) => ({
                    ...s,
                    isLoading: false,
                    submitPhase: "idle",
                    signature: null,
                }));
            } catch (error) {
                console.error("[Trade] JupUSD top-up swap error:", error);
                const message = error instanceof Error ? error.message : "Failed to prepare JupUSD for trade.";
                setState((s) => ({
                    ...s,
                    isLoading: false,
                    isSigning: false,
                    isConfirming: false,
                    error: message,
                    quote: null,
                    quoteContext: null,
                    selectedPositionId: null,
                    submitPhase: "idle",
                    orderStatus: null,
                    orderPubkey: null,
                }));
                return null;
            }
        }

        const context = getQuoteContextForBuy(params);
        const quote = !needsJupUsdTopUp && doesQuoteContextMatch(state.quoteContext, context)
            ? state.quote
            : await getQuote(params);

        return executeSwap("buy", quote, params.expectedPrice);
    }, [
        executeSwap,
        fetchBalance,
        getQuote,
        state.jupUsdBalance,
        state.quote,
        state.quoteContext,
        state.usdcTokenBalance,
        swapUsdcToJupUsd,
    ]);

    const sell = useCallback(async (params: SellTradeParams) => {
        if (!params.positionPubkey) {
            setState((s) => ({ ...s, error: "Select a position to sell." }));
            return null;
        }

        const context = getQuoteContextForSell(params);
        const quote = doesQuoteContextMatch(state.quoteContext, context)
            ? state.quote
            : await getSwapQuote(params);

        return executeSwap("sell", quote, params.expectedPrice);
    }, [executeSwap, getSwapQuote, state.quote, state.quoteContext]);

    const redeem = useCallback(async (params: RedeemTradeParams) => {
        if (!isReady || !authenticated || !activeWallet?.address) {
            setState((s) => ({ ...s, error: "Please connect your wallet first" }));
            return null;
        }

        setState((s) => ({
            ...s,
            isLoading: true,
            isSigning: true,
            error: null,
            submitPhase: "signing",
            orderStatus: null,
            orderPubkey: null,
        }));

        try {
            const claimResponse = await jupiterTradeService.claimPosition(params.positionPubkey);
            const transactionBytes = Buffer.from(claimResponse.transaction, "base64");
            const transaction = VersionedTransaction.deserialize(transactionBytes);
            const result = await signAndSendTransaction(transaction);
            const walletSignature = result.signature;

            setState((s) => ({
                ...s,
                isSigning: false,
                isConfirming: true,
                signature: walletSignature,
                submitPhase: "confirming_transaction",
            }));

            await confirmTransaction(walletSignature);
            await fetchBalance();

            setState((s) => ({
                ...s,
                isLoading: false,
                isSigning: false,
                isConfirming: false,
                submitPhase: "order_resolved",
                orderStatus: null,
                orderPubkey: null,
                signature: walletSignature,
            }));
            return walletSignature;
        } catch (error) {
            console.error("[Trade] Claim error:", error);
            const message = error instanceof Error ? error.message : "Claim failed";
            setState((s) => ({
                ...s,
                isLoading: false,
                isSigning: false,
                isConfirming: false,
                error: message,
                submitPhase: "idle",
                orderStatus: null,
                orderPubkey: null,
            }));
            return null;
        }
    }, [activeWallet, authenticated, confirmTransaction, fetchBalance, isReady, signAndSendTransaction]);

    return {
        buy,
        sell,
        redeem,
        getQuote,
        getSwapQuote,
        clearQuote,
        reset,
        ...state,
        fetchBalance,
        isWalletConnected: authenticated && !!activeWallet?.address,
        walletAddress: activeWallet?.address,
        isJupiter: (marketId: string) => !marketId.includes("-") || marketId.startsWith("POLY-"),
    };
}
