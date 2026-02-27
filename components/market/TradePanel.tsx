import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from "react-native";
import { useTrade, TradeSide, TradeMode } from "../../hooks/useTrade";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { Market } from "../../lib/mock-data";
import { Image } from "expo-image";
import { ChevronDown, Delete } from "lucide-react-native";
import { SwipeToBuy } from "./SwipeToBuy";
import { getTokenBalance } from "../../lib/solana";

interface TradePanelProps {
    market: Market;
    onSuccess?: (signature: string) => void;
    initialSide?: TradeSide;
    initialTradeMode?: TradeMode;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.92;
const CONTENT_HORIZONTAL_PADDING = 12;
const KEY_HEIGHT = 46;
const FOOTER_BOTTOM_PADDING = Platform.OS === "ios" ? 6 : 4;
const FEEDBACK_BOTTOM = Platform.OS === "ios" ? 8 : 6;

export function TradePanel({
    market,
    onSuccess,
    initialSide = "YES",
    initialTradeMode = "BUY",
}: TradePanelProps) {
    const {
        buy,
        sell,
        getQuote,
        getSwapQuote,
        isLoading,
        error,
        quote,
        reset,
        usdcBalance,
        walletAddress,
    } = useTrade();
    const { fundWallet } = useFundSolanaWallet();
    const [side, setSide] = useState<TradeSide>(initialSide);
    const [tradeMode, setTradeMode] = useState<TradeMode>(initialTradeMode);
    const [amount, setAmount] = useState<string>("");
    const [sideBalance, setSideBalance] = useState<number>(0);
    const [slippageBps] = useState<number | null>(null); // null = Auto
    const [showDetails, setShowDetails] = useState(false);
    const selectedOutcomeMint = side === "YES" ? market.yesMint : market.noMint;
    const settlementMint = market.collateralMint || USDC_MINT;

    // Sync side if initialSide changes
    useEffect(() => {
        setSide(initialSide);
    }, [initialSide]);

    useEffect(() => {
        setTradeMode(initialTradeMode);
    }, [initialTradeMode]);

    // Reset state when market changes
    useEffect(() => {
        reset();
        setAmount("");
    }, [market.id, reset]);

    useEffect(() => {
        reset();
        setAmount("");
    }, [tradeMode, reset]);

    const refreshSideBalance = useCallback(async () => {
        if (!walletAddress || !selectedOutcomeMint) {
            setSideBalance(0);
            return;
        }
        try {
            const balance = await getTokenBalance(walletAddress, selectedOutcomeMint);
            setSideBalance(balance);
        } catch {
            setSideBalance(0);
        }
    }, [walletAddress, selectedOutcomeMint]);

    useEffect(() => {
        refreshSideBalance();
    }, [refreshSideBalance]);

    // Auto-quote when amount or side changes (debounced)
    useEffect(() => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0.1) return;
        if (!selectedOutcomeMint) return;

        const timeoutId = setTimeout(() => {
            const expectedPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);
            if (tradeMode === "BUY") {
                getQuote({
                    marketId: market.id,
                    amountUsdc: numAmount,
                    side,
                    expectedPrice,
                    slippageBps: slippageBps ?? undefined,
                });
            } else {
                getSwapQuote({
                    marketId: market.id,
                    amountTokens: numAmount,
                    side,
                    expectedPrice,
                    slippageBps: slippageBps ?? undefined,
                });
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [
        amount,
        side,
        selectedOutcomeMint,
        settlementMint,
        slippageBps,
        tradeMode,
        getQuote,
        getSwapQuote,
    ]);

    const handleKeyPress = useCallback((key: string) => {
        if (key === "backspace") {
            setAmount(prev => prev.slice(0, -1));
        } else if (key === ".") {
            if (!amount.includes(".")) {
                setAmount(prev => (prev === "" ? "0." : prev + "."));
            }
        } else {
            // Limit to 2 decimal places
            if (amount.includes(".")) {
                const [, decimal] = amount.split(".");
                if (decimal && decimal.length >= 2) return;
            }
            setAmount(prev => (prev === "0" ? key : prev + key));
        }
    }, [amount]);

    const handleQuickAmount = useCallback((val: string) => {
        const maxValue = tradeMode === "BUY" ? (usdcBalance ?? 0) : sideBalance;
        if (val === "MAX") {
            if (maxValue > 0) setAmount(maxValue.toFixed(2));
            return;
        }

        const current = parseFloat(amount) || 0;
        const add = tradeMode === "BUY"
            ? parseFloat(val.replace("+$", ""))
            : parseFloat(val.replace("+", ""));
        setAmount((current + add).toFixed(2));
    }, [amount, usdcBalance, sideBalance, tradeMode]);

    const handleTrade = async () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount < 0.1) return;
        if (!selectedOutcomeMint) return;

        const expectedPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);
        const signature =
            tradeMode === "BUY"
                ? await buy({
                    marketId: market.id,
                    amountUsdc: numAmount,
                    side,
                    slippageBps: slippageBps ?? undefined,
                    expectedPrice,
                })
                : await sell({
                    marketId: market.id,
                    amountTokens: numAmount,
                    side,
                    slippageBps: slippageBps ?? undefined,
                    expectedPrice,
                });

        if (signature && onSuccess) {
            onSuccess(signature);
        }
        if (signature) {
            await refreshSideBalance();
        }
    };

    const handleFundWallet = async () => {
        if (!walletAddress) return;
        try {
            await fundWallet({ address: walletAddress });
        } catch (e) {
            console.error("[TradePanel] Funding error:", e);
        }
    };

    const availableBalance = tradeMode === "BUY" ? (usdcBalance ?? 0) : sideBalance;
    const isInsufficientBalance = !!amount && parseFloat(amount) > availableBalance;
    const selectedOutputMint = selectedOutcomeMint;
    const hasSellInventory = sideBalance > 0;
    const isMarketTradeable =
        !!selectedOutputMint &&
        market.isTradeable !== false;
    const tradeBlockedReason = !selectedOutputMint
        ? "This market has no tradeable token mint."
        : tradeMode === "SELL" && !hasSellInventory
            ? `No ${side} shares available to sell.`
            : market.isTradeable === false
                ? "This market is not tradeable right now."
                : null;
    const isButtonDisabled =
        isLoading ||
        isInsufficientBalance ||
        !amount ||
        parseFloat(amount) < 0.1 ||
        !isMarketTradeable ||
        (tradeMode === "SELL" && !hasSellInventory);

    // Calculations for UI
    const numAmount = parseFloat(amount) || 0;
    const currentPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);

    // Technical Details Calculation from Quote
    const quotePrice = quote ? parseInt(quote.priceUsd ?? "0", 10) / 1000000 : 0;
    const quoteContracts = quote ? parseInt(quote.contracts ?? "0", 10) : 0;

    // Execution checks
    const safeCurrentPrice = currentPrice > 0 ? currentPrice : 1;
    const executionPrice = quotePrice > 0 ? quotePrice : currentPrice;

    const rawPriceImpactPct = quotePrice > 0
        ? tradeMode === "BUY"
            ? ((executionPrice - safeCurrentPrice) / safeCurrentPrice) * 100
            : ((safeCurrentPrice - executionPrice) / safeCurrentPrice) * 100
        : 0;
    const priceImpactPct = Math.max(0, rawPriceImpactPct);

    const primaryValue = tradeMode === "BUY"
        ? quoteContracts > 0
            ? quoteContracts
            : safeCurrentPrice > 0
                ? numAmount / safeCurrentPrice
                : 0
        : quotePrice > 0
            ? quoteContracts * quotePrice
            : numAmount * safeCurrentPrice;
    const primaryValueFormatted = primaryValue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const quickButtons = tradeMode === "BUY" ? ["+$1", "+$20", "+$100", "MAX"] : ["+1", "+5", "+10", "MAX"];
    const swipeLabel = isInsufficientBalance
        ? "Insufficient Balance"
        : tradeMode === "SELL" && !hasSellInventory
            ? "No shares to sell"
            : !isMarketTradeable
                ? "Market not tradeable"
                : tradeMode === "BUY"
                    ? "Swipe to buy"
                    : "Swipe to sell";
    const feedbackMessage = tradeBlockedReason || error;

    return (
        <View style={styles.container}>
            <View style={styles.dragHandleContainer}>
                <View style={styles.dragHandle} />
            </View>

            <View style={styles.content}>
                {/* Market Header */}
                <View style={styles.marketHeader}>
                    <Image source={{ uri: market.imageUrl }} style={styles.marketIcon} />
                    <Text style={styles.marketTitle} numberOfLines={1}>{market.title}</Text>
                </View>

                {/* Buy/Sell Toggle */}
                <View style={styles.toggleWrapper}>
                    <View style={styles.tradeTypeToggle}>
                        <Pressable
                            style={[styles.toggleBtn, tradeMode === "BUY" && styles.toggleBtnActive]}
                            onPress={() => setTradeMode("BUY")}
                        >
                            <Text style={[styles.toggleText, tradeMode === "BUY" && styles.toggleTextActive]}>Buy</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.toggleBtn, tradeMode === "SELL" && styles.toggleBtnActive]}
                            onPress={() => setTradeMode("SELL")}
                        >
                            <Text style={[styles.toggleText, tradeMode === "SELL" && styles.toggleTextActive]}>Sell</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Main Amount Display */}
                <View style={styles.amountDisplayContainer}>
                    <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
                        {tradeMode === "BUY" ? `$${numAmount === 0 ? "0.00" : amount}` : `${numAmount === 0 ? "0.00" : amount}`}
                    </Text>
                    {tradeMode === "SELL" && <Text style={styles.amountSuffix}>Shares</Text>}
                    <Text style={styles.sharesEstimate}>
                        {tradeMode === "BUY"
                            ? `≈${primaryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} Shares`
                            : `≈$${primaryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} Proceeds`}
                    </Text>
                </View>

                {/* Balance Selector */}
                <Pressable style={styles.balanceSelector} onPress={tradeMode === "BUY" ? handleFundWallet : undefined}>
                    <View style={styles.balanceIconBg}>
                        <Text style={styles.balanceIconText}>$</Text>
                    </View>
                    <View style={styles.balanceInfo}>
                        <Text style={styles.balanceLabel}>{tradeMode === "BUY" ? "Cash Balance" : `${side} Balance`}</Text>
                        <Text style={styles.balanceValue}>
                            {tradeMode === "BUY"
                                ? `$${(usdcBalance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : `${sideBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} shares`}
                        </Text>
                    </View>
                    <ChevronDown color="#999" size={14} />
                </Pressable>

                {/* Yes/No Selection Pills */}
                <View style={styles.sidePillsContainer}>
                    <Pressable
                        style={[styles.sidePill, side === "YES" ? styles.yesPillActive : styles.pillInactive]}
                        onPress={() => setSide("YES")}
                    >
                        <Text style={[styles.pillText, side === "YES" && styles.pillTextActive]}>
                            Yes {(market.yesPrice * 100).toFixed(0)}¢
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[styles.sidePill, side === "NO" ? styles.noPillActive : styles.pillInactive]}
                        onPress={() => setSide("NO")}
                    >
                        <Text style={[styles.pillText, side === "NO" && styles.pillTextActive]}>
                            No {((1 - market.yesPrice) * 100).toFixed(0)}¢
                        </Text>
                    </Pressable>
                </View>

                {/* Potential Win Display */}
                <View style={styles.toWinContainer}>
                    <Text style={styles.toWinLabel}>{tradeMode === "BUY" ? "To Win" : "To Receive"}</Text>
                    <Text style={styles.toWinValue}>
                        ${primaryValueFormatted}
                    </Text>
                </View>

                {/* Technical Details Accordion */}
                <Pressable
                    style={styles.detailsHeader}
                    onPress={() => setShowDetails(!showDetails)}
                >
                    <Text style={styles.detailsHeaderText}>Order Details</Text>
                    <ChevronDown color="#999" size={16} style={{ transform: [{ rotate: showDetails ? "180deg" : "0deg" }] }} />
                </Pressable>

                {showDetails && (
                    <View style={styles.detailsContent}>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Execution Price</Text>
                            <Text style={styles.detailValue}>{(executionPrice * 100).toFixed(2)}¢</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Price Impact</Text>
                            <Text style={[styles.detailValue, priceImpactPct > 5 ? styles.warningText : {}]}>
                                {priceImpactPct > 0.01 ? `${priceImpactPct.toFixed(2)}%` : "< 0.01%"}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Quick Amounts */}
                <View style={styles.quickAmountsRow}>
                    {quickButtons.map((val) => (
                        <Pressable key={val} style={styles.quickBtn} onPress={() => handleQuickAmount(val)}>
                            <Text style={styles.quickBtnText}>{val}</Text>
                        </Pressable>
                    ))}
                </View>

                {/* Numeric Keypad */}
                <View style={styles.keypad}>
                    {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "backspace"]].map((row, i) => (
                        <View key={i} style={styles.keypadRow}>
                            {row.map((key) => (
                                <Pressable
                                    key={key}
                                    style={[styles.key, (key === "backspace" || key === ".") && styles.keySpecial]}
                                    onPress={() => handleKeyPress(key)}
                                >
                                    {key === "backspace" ? (
                                        <Delete color="#000" size={20} />
                                    ) : (
                                        <Text style={styles.keyText}>{key}</Text>
                                    )}
                                </Pressable>
                            ))}
                        </View>
                    ))}
                </View>
            </View>

            {/* Sticky Swipe Action Footer */}
            <View style={styles.actionFixedFooter}>
                <SwipeToBuy
                    onSwipe={handleTrade}
                    isLoading={isLoading}
                    disabled={isButtonDisabled}
                    label={swipeLabel}
                />
            </View>

            {!!feedbackMessage && <Text style={styles.errorFeedback}>{feedbackMessage}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#F9F9F9",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        width: "100%",
        height: PANEL_HEIGHT,
        paddingTop: 6,
        position: "relative",
        overflow: "hidden",
    },
    dragHandleContainer: {
        width: "100%",
        height: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 30,
        backgroundColor: "rgba(23, 23, 23, 0.22)",
    },
    content: {
        paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
        flex: 1,
    },
    marketHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
        gap: 8,
    },
    marketIcon: {
        width: 40,
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.15)",
    },
    marketTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: "700",
        color: "#171717",
    },
    toggleWrapper: {
        alignItems: "center",
        marginBottom: 12,
    },
    tradeTypeToggle: {
        flexDirection: "row",
        backgroundColor: "#E7E7E7",
        borderRadius: 10,
        padding: 2,
        width: 97,
    },
    toggleBtn: {
        flex: 1,
        height: 26,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    toggleBtnActive: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.15)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 1,
        elevation: 1,
    },
    toggleBtnDisabled: {
        opacity: 0.55,
    },
    toggleText: {
        fontSize: 16,
        fontWeight: "600",
        color: "rgba(0, 0, 0, 0.5)",
    },
    toggleTextActive: {
        color: "#000",
    },
    amountDisplayContainer: {
        alignItems: "center",
        marginBottom: 12,
    },
    amountText: {
        fontSize: 64,
        fontWeight: "700",
        color: "#000",
        letterSpacing: -1.4,
        lineHeight: 68,
    },
    amountSuffix: {
        fontSize: 16,
        color: "#8E8E93",
        fontWeight: "700",
        marginTop: -2,
    },
    sharesEstimate: {
        fontSize: 12,
        color: "rgba(0, 0, 0, 0.5)",
        fontWeight: "600",
        marginTop: 0,
    },
    balanceSelector: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.15)",
        borderRadius: 30,
        paddingHorizontal: 9,
        paddingVertical: 1,
        alignSelf: "center",
        marginBottom: 10,
        gap: 6,
    },
    balanceIconBg: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "#34C759",
        justifyContent: "center",
        alignItems: "center",
    },
    balanceIconText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 16,
    },
    balanceInfo: {
        marginRight: 2,
    },
    balanceLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: "#000",
    },
    balanceValue: {
        fontSize: 11,
        fontWeight: "600",
        color: "#000",
    },
    sidePillsContainer: {
        flexDirection: "row",
        gap: 4,
        marginBottom: 10,
    },
    sidePill: {
        flex: 1,
        height: 40,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    yesPillActive: {
        backgroundColor: "#34C759",
    },
    noPillActive: {
        backgroundColor: "#FF383C",
    },
    pillInactive: {
        backgroundColor: "#D4D4D4",
    },
    pillText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#9F9F9F",
    },
    pillTextActive: {
        color: "#fff",
    },
    toWinContainer: {
        borderWidth: 2,
        borderColor: "rgba(0, 0, 0, 0.15)",
        borderStyle: "dashed",
        borderRadius: 16,
        paddingVertical: 10,
        alignItems: "center",
        marginBottom: 6,
    },
    toWinLabel: {
        fontSize: 16,
        fontWeight: "700",
        color: "#000",
        marginBottom: 6,
    },
    toWinValue: {
        fontSize: 24,
        fontWeight: "700",
        color: "#34C759",
    },
    detailsHeader: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        paddingVertical: 2,
        marginBottom: 8,
    },
    detailsHeaderText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#8E8E93",
    },
    detailsContent: {
        backgroundColor: "#F9F9F9",
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        gap: 6,
    },
    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    detailLabel: {
        fontSize: 13,
        color: "#8E8E93",
        fontWeight: "600",
    },
    detailValue: {
        fontSize: 13,
        color: "#000",
        fontWeight: "700",
    },
    quickAmountsRow: {
        flexDirection: "row",
        gap: 4,
        marginBottom: 8,
    },
    quickBtn: {
        flex: 1,
        height: 36,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.15)",
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
    },
    quickBtnText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#000",
    },
    keypad: {
        gap: 6,
    },
    keypadRow: {
        flexDirection: "row",
        gap: 5,
    },
    key: {
        flex: 1,
        height: KEY_HEIGHT,
        backgroundColor: "#F2F2F7",
        borderRadius: 6,
        justifyContent: "center",
        alignItems: "center",
    },
    keyText: {
        fontSize: 24,
        fontWeight: "700",
        color: "#000",
    },
    keySpecial: {
        backgroundColor: "transparent",
    },
    actionFixedFooter: {
        paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
        paddingBottom: FOOTER_BOTTOM_PADDING,
        paddingTop: 6,
        backgroundColor: "#F9F9F9",
    },
    errorFeedback: {
        color: "#FF3B30",
        fontSize: 13,
        fontWeight: "600",
        textAlign: "center",
        position: "absolute",
        left: CONTENT_HORIZONTAL_PADDING,
        right: CONTENT_HORIZONTAL_PADDING,
        bottom: FEEDBACK_BOTTOM + 56,
    },
    warningText: {
        color: "#FF9500",
    },
});
