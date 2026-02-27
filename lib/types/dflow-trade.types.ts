/**
 * dFlow Trade API Types
 * Based on: https://pond.dflow.net/build/trade-api/
 */

export interface DFlowQuoteRequest {
    inputMint?: string; // Default: USDC
    outputMint: string; // Token to receive (yesMint or noMint)
    amount: string;     // Amount in smallest unit (e.g., amount * 10^6 for USDC)
    slippageBps?: string; // Default: 50 (0.5%)
    userPublicKey: string; // User's Solana wallet
}

export interface DFlowQuoteResponse {
    // Transaction data
    transaction: string; // Base64 encoded transaction to sign
    lastValidBlockHeight: number;

    // Execution mode
    executionMode: "sync" | "async";

    // Quote details
    inAmount: string;
    outAmount: string;
    priceImpactPct: string;

    // Route information
    routePlan: Array<{
        swapInfo: {
            ammKey: string;
            label: string;
            inputMint: string;
            outputMint: string;
            inAmount: string;
            outAmount: string;
            feeAmount: string;
            feeMint: string;
        };
        percent: number;
    }>;

    // For async orders
    orderId?: string;
}

export interface DFlowOrderStatus {
    status: "open" | "pendingClose" | "closed" | "failed" | "pending" | "processing" | "completed";
    signature?: string;
    error?: string;
    inAmount?: string;
    outAmount?: string;
    totalInputAmount?: string;
    totalOutputAmount?: string;
    fills?: Array<{
        inputAmount: string;
        outputAmount: string;
        fillTime?: number;
    }>;
}
