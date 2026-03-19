import { Buffer } from "buffer";

type AppUserLike = {
    email?: {
        address?: string | null;
    } | null;
} | null | undefined;

type AppWalletLike = {
    address?: string | null;
} | null | undefined;

export function deriveCurrentUserId(user: AppUserLike, activeWallet?: AppWalletLike): string | null {
    const emailAddress = user?.email?.address?.trim();
    if (emailAddress) {
        try {
            return Buffer.from(emailAddress).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 36);
        } catch {
            return emailAddress;
        }
    }

    const walletAddress = activeWallet?.address?.trim();
    return walletAddress ? walletAddress : null;
}
