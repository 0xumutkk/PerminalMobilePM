import { Connection, PublicKey } from "@solana/web3.js";

const LAMPORTS_PER_SOL = 1e9;

/** USDC mint on Solana mainnet */
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function getAssociatedTokenAddress(
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey
): PublicKey {
    const [address] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
}

export const SOLANA_RPC_URL =
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

let connection: Connection | null = null;

export function getConnection(): Connection {
    if (!connection) {
        connection = new Connection(SOLANA_RPC_URL);
    }
    return connection;
}

/**
 * Fetch SOL balance in lamports, then convert to SOL.
 */
export async function getSolBalance(address: string): Promise<number> {
    const conn = getConnection();
    const publicKey = new PublicKey(address);
    const lamports = await conn.getBalance(publicKey);
    return lamports / LAMPORTS_PER_SOL;
}

/**
 * Fetch SPL token balance for an address and mint.
 * Uses the derived Associated Token Account to avoid RPC errors from
 * getParsedTokenAccountsByOwner when mints are invalid or closed.
 * Returns 0 if no token account exists.
 */
export async function getTokenBalance(address: string, mintAddress: string): Promise<number> {
    if (!address || !mintAddress) return 0;
    try {
        const conn = getConnection();
        const owner = new PublicKey(address);
        const mint = new PublicKey(mintAddress);
        const tokenPrograms = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
        let maxBalance = 0;

        for (const tokenProgram of tokenPrograms) {
            try {
                const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);
                const balance = await conn.getTokenAccountBalance(ata);
                const uiAmount = balance.value?.uiAmount;
                if (typeof uiAmount === "number") {
                    maxBalance = Math.max(maxBalance, uiAmount);
                    if (uiAmount > 0) return uiAmount;
                }
            } catch {
                // Ignore and try the next token program.
            }
        }

        return maxBalance;
    } catch {
        // Account doesn't exist or mint is invalid - return 0 silently
        return 0;
    }
}

/**
 * Fetch USDC (SPL token) balance for an address.
 */
export async function getUsdcBalance(address: string): Promise<number> {
    return getTokenBalance(address, USDC_MINT.toBase58());
}

/**
 * Fetch current SOL/USD price from CoinGecko (no key required).
 * Returns null on error or if rate-limited.
 */
export async function getSolPriceUsd(): Promise<number | null> {
    try {
        const res = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
            { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { solana?: { usd?: number } };
        return data.solana?.usd ?? null;
    } catch {
        return null;
    }
}
