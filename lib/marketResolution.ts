import type { Market } from "./mock-data";

export type OutcomeSide = "YES" | "NO";
export type PositionOutcome = "won" | "lost";

type ResolvableMarket = Pick<Market, "result" | "status" | "isTradeable"> | null | undefined;

export type MarketResolution = {
    isResolved: boolean;
    winningSide: OutcomeSide | null;
    resultLabel: string;
    actionLabel: string;
    detailLabel: string;
    positionOutcome: PositionOutcome | null;
    positionOutcomeLabel: string | null;
};

function normalizeSide(value: unknown): OutcomeSide | null {
    if (typeof value !== "string") return null;

    const normalized = value.trim().toUpperCase();
    if (normalized === "YES") return "YES";
    if (normalized === "NO") return "NO";
    return null;
}

export function getTradeMetadataSide(tradeMetadata: unknown): OutcomeSide | null {
    if (!tradeMetadata || typeof tradeMetadata !== "object" || Array.isArray(tradeMetadata)) {
        return null;
    }

    const candidateKeys = ["side", "outcome", "positionSide"];
    for (const key of candidateKeys) {
        const normalized = normalizeSide((tradeMetadata as Record<string, unknown>)[key]);
        if (normalized) return normalized;
    }

    return null;
}

export function getMarketWinningSide(market: ResolvableMarket): OutcomeSide | null {
    return normalizeSide(market?.result);
}

export function isMarketResolved(market: ResolvableMarket): boolean {
    if (getMarketWinningSide(market)) return true;
    return market?.status === "closed" && market?.isTradeable === false;
}

export function getMarketResolution(
    market: ResolvableMarket,
    heldSide?: OutcomeSide | null
): MarketResolution {
    const winningSide = getMarketWinningSide(market);
    const resolved = isMarketResolved(market);
    const positionOutcome =
        resolved && winningSide && heldSide
            ? (winningSide === heldSide ? "won" : "lost")
            : null;

    const resultLabel = winningSide ? `${winningSide} won` : "Resolved";
    const positionOutcomeLabel = positionOutcome ? positionOutcome.charAt(0).toUpperCase() + positionOutcome.slice(1) : null;

    return {
        isResolved: resolved,
        winningSide,
        resultLabel,
        actionLabel: resultLabel,
        detailLabel: winningSide
            ? `${winningSide} shares settled in the money.`
            : "This market is settled and no longer tradeable.",
        positionOutcome,
        positionOutcomeLabel,
    };
}
