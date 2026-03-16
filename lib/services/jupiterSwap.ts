import Constants from "expo-constants";

export interface JupiterSwapQuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: "ExactIn" | "ExactOut";
    slippageBps: number;
    priceImpactPct: string;
    routePlan: Array<{
        swapInfo: {
            inputMint: string;
            outputMint: string;
            inAmount: string;
            outAmount: string;
            label: string;
            feeAmount?: string;
            feeMint?: string;
        };
        percent?: number;
        bps?: number;
    }>;
    [key: string]: unknown;
}

export interface JupiterSwapBuildResponse {
    swapTransaction: string;
    lastValidBlockHeight: number;
    simulationError?: string | null;
}

const extra = Constants.expoConfig?.extra ?? {};
const JUPITER_API_KEY = (extra.jupiterApiKey ?? process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? "").trim();
const JUPITER_SWAP_BASE_URL = "https://api.jup.ag/swap/v1";

function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (JUPITER_API_KEY) headers["x-api-key"] = JUPITER_API_KEY;
    return headers;
}

async function parseErrorResponse(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    if (!text.trim()) return `Swap request failed (${res.status}).`;

    try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        return parsed.error || parsed.message || text;
    } catch {
        return text;
    }
}

export const jupiterSwapService = {
    async getExactOutQuote(params: {
        inputMint: string;
        outputMint: string;
        outputAmount: string;
        slippageBps?: number;
    }): Promise<JupiterSwapQuoteResponse> {
        const url = new URL(`${JUPITER_SWAP_BASE_URL}/quote`);
        url.searchParams.set("inputMint", params.inputMint);
        url.searchParams.set("outputMint", params.outputMint);
        url.searchParams.set("amount", params.outputAmount);
        url.searchParams.set("swapMode", "ExactOut");
        url.searchParams.set("slippageBps", String(params.slippageBps ?? 100));
        url.searchParams.set("restrictIntermediateTokens", "true");
        url.searchParams.set("instructionVersion", "V2");

        const res = await fetch(url.toString(), {
            headers: getHeaders(),
        });

        if (!res.ok) {
            throw new Error(await parseErrorResponse(res));
        }

        return (await res.json()) as JupiterSwapQuoteResponse;
    },

    async buildSwapTransaction(params: {
        userPublicKey: string;
        quoteResponse: JupiterSwapQuoteResponse;
    }): Promise<JupiterSwapBuildResponse> {
        const res = await fetch(`${JUPITER_SWAP_BASE_URL}/swap`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
                quoteResponse: params.quoteResponse,
                userPublicKey: params.userPublicKey,
                dynamicComputeUnitLimit: true,
            }),
        });

        if (!res.ok) {
            throw new Error(await parseErrorResponse(res));
        }

        return (await res.json()) as JupiterSwapBuildResponse;
    },
};
