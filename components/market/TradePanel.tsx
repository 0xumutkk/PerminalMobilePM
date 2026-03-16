import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { ChevronDown, Delete } from "lucide-react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    withTiming,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { useTrade, TradeSide, TradeMode } from "../../hooks/useTrade";
import { usePositions } from "../../hooks/usePositions";
import { Market } from "../../lib/mock-data";
import { JUP_USD_MINT_ADDRESS } from "../../lib/solana";
import { SwipeToBuy } from "./SwipeToBuy";

interface TradePanelProps {
    market: Market;
    onSuccess?: (details: {
        signature: string;
        outcome: TradeSide;
        amount: number;
        price: number;
        mode: TradeMode;
        marketId: string;
        resolutionStatus: "filled" | "partially_filled";
    }) => void | Promise<void>;
    initialSide?: TradeSide;
    initialTradeMode?: TradeMode;
    onClose?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MIN_BUY_ORDER_USD = 1.01;
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.92;
const CONTENT_HORIZONTAL_PADDING = 12;
const KEY_HEIGHT = 46;
const FOOTER_BOTTOM_PADDING = Platform.OS === "ios" ? 6 : 4;
const FEEDBACK_BOTTOM = Platform.OS === "ios" ? 8 : 6;
const LOW_SOL_BALANCE_WARNING = 0.003;

function formatPositionId(positionId: string): string {
    return `${positionId.slice(0, 4)}...${positionId.slice(-4)}`;
}

function formatWholeShares(value: number): string {
    return Math.max(0, Math.floor(value)).toLocaleString();
}

export function TradePanel({
    market,
    onSuccess,
    initialSide = "YES",
    initialTradeMode = "BUY",
    onClose,
}: TradePanelProps) {
    const translateY = useSharedValue(0);
    const marketId = market.marketId || market.id;

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 150 || event.velocityY > 500) {
                translateY.value = withTiming(SCREEN_HEIGHT, {}, () => {
                    if (onClose) runOnJS(onClose)();
                });
            } else {
                translateY.value = withSpring(0);
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const {
        buy,
        sell,
        getQuote,
        getSwapQuote,
        clearQuote,
        fetchBalance,
        isLoading,
        isQuoting,
        error,
        quote,
        quoteContext,
        orderStatus,
        submitPhase,
        reset,
        usdcBalance,
        usdcTokenBalance,
        jupUsdBalance,
        solBalance,
        walletAddress,
    } = useTrade();
    const { activePositions } = usePositions();
    const { fundWallet } = useFundSolanaWallet();

    const [side, setSide] = useState<TradeSide>(initialSide);
    const [tradeMode, setTradeMode] = useState<TradeMode>(initialTradeMode);
    const [amount, setAmount] = useState<string>("");
    const [showDetails, setShowDetails] = useState(false);
    const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

    const marketPositions = activePositions.filter((position) => position.marketId === marketId);
    const matchingPositions = marketPositions.filter((position) => position.side === side);
    const selectedPosition = matchingPositions.find((position) => position.mint === selectedPositionId) ?? null;

    const isOrderPending = submitPhase === "transaction_submitted" && orderStatus === "open";
    const interactionLocked = isLoading || isOrderPending;
    const numericAmount = parseFloat(amount) || 0;
    const resolvedUsdcBalance = usdcTokenBalance ?? 0;
    const resolvedJupUsdBalance = jupUsdBalance ?? 0;
    const totalStableBalance = (usdcBalance ?? 0);
    const needsJupUsdTopUp = tradeMode === "BUY"
        && numericAmount > 0
        && resolvedJupUsdBalance + 0.000001 < numericAmount
        && totalStableBalance + 0.000001 >= numericAmount
        && resolvedUsdcBalance > 0;
    const preferredBuySource = {
        label: needsJupUsdTopUp ? "Stable" : "JupUSD",
        available: needsJupUsdTopUp ? totalStableBalance : resolvedJupUsdBalance,
        depositMint: JUP_USD_MINT_ADDRESS,
    };

    useEffect(() => {
        setSide(initialSide);
    }, [initialSide]);

    useEffect(() => {
        setTradeMode(initialTradeMode);
    }, [initialTradeMode]);

    useEffect(() => {
        reset();
        setAmount("");
        setSelectedPositionId(null);
        setShowDetails(false);
    }, [market.id, reset]);

    useEffect(() => {
        if (tradeMode !== "SELL") {
            setSelectedPositionId(null);
            return;
        }

        const yesPositions = marketPositions.filter((position) => position.side === "YES");
        const noPositions = marketPositions.filter((position) => position.side === "NO");
        const hasCurrentSideInventory = matchingPositions.length > 0;

        if (hasCurrentSideInventory) return;

        if (yesPositions.length > 0 && noPositions.length === 0) {
            setSide("YES");
            return;
        }

        if (noPositions.length > 0 && yesPositions.length === 0) {
            setSide("NO");
            return;
        }

        if (yesPositions.length > 0 || noPositions.length > 0) {
            const yesContracts = yesPositions.reduce((sum, position) => sum + position.amount, 0);
            const noContracts = noPositions.reduce((sum, position) => sum + position.amount, 0);
            setSide(yesContracts >= noContracts ? "YES" : "NO");
        }
    }, [matchingPositions.length, marketPositions, side, tradeMode]);

    useEffect(() => {
        if (tradeMode !== "SELL") {
            setSelectedPositionId(null);
            return;
        }

        if (matchingPositions.length === 1) {
            setSelectedPositionId(matchingPositions[0].mint);
            return;
        }

        if (!matchingPositions.some((position) => position.mint === selectedPositionId)) {
            setSelectedPositionId(null);
        }
    }, [matchingPositions, selectedPositionId, tradeMode]);

    useEffect(() => {
        clearQuote();
    }, [amount, clearQuote, market.id, selectedPositionId, side, tradeMode]);

    useEffect(() => {
        if (interactionLocked || !market.id || market.isTradeable === false) return;
        if (!amount) return;

        const numericAmount = parseFloat(amount);
        if (tradeMode === "BUY") {
            if (isNaN(numericAmount) || numericAmount < MIN_BUY_ORDER_USD) return;
            if (needsJupUsdTopUp) return;
        } else {
            if (!selectedPosition) return;
            if (!/^\d+$/.test(amount)) return;
            if (isNaN(numericAmount) || numericAmount < 1 || numericAmount > selectedPosition.amount) return;
        }

        const selectedPositionPubkey = selectedPosition?.mint ?? null;
        const timeoutId = setTimeout(() => {
            const expectedPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);

            if (tradeMode === "BUY") {
                getQuote({
                    marketId: market.id,
                    amountUsdc: numericAmount,
                    side,
                    depositMint: preferredBuySource.depositMint,
                    expectedPrice,
                    selectedPositionId: null,
                });
                return;
            }

            if (!selectedPositionPubkey) return;

            getSwapQuote({
                marketId: market.id,
                amountTokens: numericAmount,
                side,
                expectedPrice,
                positionPubkey: selectedPositionPubkey,
                selectedPositionId: selectedPositionPubkey,
            });
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [
        amount,
        getQuote,
        getSwapQuote,
        interactionLocked,
        market.id,
        market.isTradeable,
        market.yesPrice,
        preferredBuySource.depositMint,
        selectedPosition,
        side,
        needsJupUsdTopUp,
        jupUsdBalance,
        solBalance,
        tradeMode,
        usdcBalance,
        usdcTokenBalance,
    ]);

    const handleKeyPress = useCallback((key: string) => {
        if (interactionLocked) return;

        if (key === "backspace") {
            setAmount((prev) => prev.slice(0, -1));
            return;
        }

        if (tradeMode === "SELL") {
            if (key === ".") return;
            setAmount((prev) => (prev === "0" ? key : prev + key));
            return;
        }

        if (key === ".") {
            setAmount((prev) => {
                if (prev.includes(".")) return prev;
                return prev === "" ? "0." : `${prev}.`;
            });
            return;
        }

        setAmount((prev) => {
            if (prev.includes(".")) {
                const [, decimal] = prev.split(".");
                if (decimal.length >= 2) return prev;
            }
            return prev === "0" ? key : prev + key;
        });
    }, [interactionLocked, tradeMode]);

    const handleQuickAmount = useCallback((value: string) => {
        if (interactionLocked) return;

        if (tradeMode === "BUY") {
            const maxValue = preferredBuySource.available;
            if (value === "MAX") {
                if (maxValue > 0) setAmount(maxValue.toFixed(2));
                return;
            }

            const current = parseFloat(amount) || 0;
            const increment = parseFloat(value.replace("+$", ""));
            setAmount((current + increment).toFixed(2));
            return;
        }

        if (!selectedPosition) return;
        const maxContracts = Math.floor(selectedPosition.amount);
        if (value === "MAX") {
            if (maxContracts >= 1) setAmount(String(maxContracts));
            return;
        }

        const current = parseInt(amount || "0", 10) || 0;
        const increment = parseInt(value.replace("+", ""), 10);
        setAmount(String(current + increment));
    }, [amount, interactionLocked, preferredBuySource.available, selectedPosition, tradeMode]);

    const handleTrade = async () => {
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || !market.id) return;

        const expectedPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);
        const result = tradeMode === "BUY"
            ? await buy({
                marketId: market.id,
                amountUsdc: numericAmount,
                side,
                depositMint: preferredBuySource.depositMint,
                expectedPrice,
                selectedPositionId: null,
            })
            : selectedPosition
                ? await sell({
                    marketId: market.id,
                    amountTokens: numericAmount,
                    side,
                    expectedPrice,
                    positionPubkey: selectedPosition.mint,
                    selectedPositionId: selectedPosition.mint,
                })
                : null;

        if (!result) return;

        if (result.resolutionStatus === "filled" || result.resolutionStatus === "partially_filled") {
            const orderObj = result.quote.order;
            const quoteContracts = parseInt(orderObj.contracts ?? "0", 10);
            const quoteTotalCost = parseInt(orderObj.orderCostUsd ?? "0", 10) / 1_000_000;
            const quotePrice = quoteContracts > 0 ? quoteTotalCost / quoteContracts : 0;

            if (onSuccess) {
                await onSuccess({
                    signature: result.signature,
                    outcome: side,
                    amount: numericAmount,
                    price: quotePrice > 0 ? quotePrice : (side === "YES" ? market.yesPrice : (1 - market.yesPrice)),
                    mode: tradeMode,
                    marketId,
                    resolutionStatus: result.resolutionStatus,
                });
            }
        }
    };

    const handleFundWallet = async () => {
        if (!walletAddress) return;
        try {
            await fundWallet({ address: walletAddress });
        } catch (fundError) {
            console.error("[TradePanel] Funding error:", fundError);
        }
    };

    const isMarketTradeable = !!marketId && market.isTradeable !== false;
    const hasSellInventory = matchingPositions.length > 0;
    const needsPositionSelection = tradeMode === "SELL" && matchingPositions.length > 1 && !selectedPosition;
    const expectedPositionPubkey = tradeMode === "SELL" ? (selectedPosition?.mint ?? null) : null;
    const expectedDepositMint = tradeMode === "BUY" ? preferredBuySource.depositMint : null;
    const currentQuoteMatches = !!quote && !!quoteContext && (
        quoteContext.marketId === market.id &&
        quoteContext.tradeMode === tradeMode &&
        quoteContext.side === side &&
        quoteContext.amount === numericAmount &&
        quoteContext.depositMint === expectedDepositMint &&
        quoteContext.positionPubkey === expectedPositionPubkey &&
        quoteContext.selectedPositionId === (selectedPositionId ?? null)
    );
    const activeQuote = currentQuoteMatches ? quote : null;
    const orderObj = activeQuote?.order;
    const quoteContracts = orderObj ? parseInt(orderObj.contracts ?? "0", 10) : 0;
    const quoteTotalCost = orderObj ? parseInt(orderObj.orderCostUsd ?? "0", 10) / 1_000_000 : 0;
    const quoteTotalFee = orderObj ? parseInt(orderObj.estimatedTotalFeeUsd ?? "0", 10) / 1_000_000 : 0;
    const requiredBuyBalance = activeQuote ? Math.max(numericAmount, quoteTotalCost + quoteTotalFee) : numericAmount;
    const availableBalance = tradeMode === "BUY" ? preferredBuySource.available : (selectedPosition?.amount ?? 0);
    const isInsufficientBalance = !!amount && (
        tradeMode === "BUY"
            ? requiredBuyBalance > availableBalance + 0.000001
            : numericAmount > availableBalance
    );
    const isCurrentSellAmountValid = tradeMode === "SELL"
        ? !!selectedPosition && /^\d+$/.test(amount) && numericAmount >= 1 && numericAmount <= selectedPosition.amount
        : true;
    const hasValidQuote = (currentQuoteMatches && !!activeQuote) || needsJupUsdTopUp;
    const insufficientFundsLooksLikeSol = tradeMode === "BUY"
        && !!error
        && /insufficient funds/i.test(error)
        && numericAmount > 0
        && !isInsufficientBalance
        && solBalance != null
        && solBalance < LOW_SOL_BALANCE_WARNING;

    const tradeBlockedReason = isOrderPending
        ? "Order submitted and still pending fill. You can close this sheet and check back."
        : !isMarketTradeable
            ? "This market is not tradeable right now."
            : tradeMode === "SELL" && !hasSellInventory
                ? `No ${side} shares available to sell.`
                : needsPositionSelection
                    ? "Select a position to sell."
                    : tradeMode === "SELL" && !!amount && !/^\d+$/.test(amount)
                        ? "Sell amount must be a whole number of shares."
                        : tradeMode === "SELL" && !!amount && numericAmount < 1
                            ? "Minimum sell is 1 share."
                            : tradeMode === "BUY" && !!amount && numericAmount < MIN_BUY_ORDER_USD
                                ? "Minimum order is above $1.00 on Jupiter. Try $1.01 or more."
                                : null;

    const balanceErrorMessage = insufficientFundsLooksLikeSol
        ? "USDC balance is enough, but this trade also needs a small SOL balance for network/account fees."
        : error;
    const insufficientBalanceMessage = tradeMode === "BUY" && isInsufficientBalance
            ? `Need $${requiredBuyBalance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })} in JupUSD buying power. SOL only covers network/account fees.`
        : tradeMode === "SELL" && isInsufficientBalance
            ? "Selected position does not have enough shares for this sell."
            : null;
    const isButtonDisabled =
        interactionLocked ||
        isQuoting ||
        !amount ||
        !!tradeBlockedReason ||
        isInsufficientBalance ||
        !hasValidQuote ||
        (tradeMode === "SELL" && !isCurrentSellAmountValid);

    const quotePrice = quoteContracts > 0 ? quoteTotalCost / quoteContracts : 0;
    const currentPrice = side === "YES" ? market.yesPrice : (1 - market.yesPrice);
    const safeCurrentPrice = currentPrice > 0 ? currentPrice : 1;
    const executionPrice = quotePrice > 0 ? quotePrice : currentPrice;
    const rawPriceImpactPct = quotePrice > 0
        ? tradeMode === "BUY"
            ? ((executionPrice - safeCurrentPrice) / safeCurrentPrice) * 100
            : ((safeCurrentPrice - executionPrice) / safeCurrentPrice) * 100
        : 0;
    const priceImpactPct = Math.max(0, rawPriceImpactPct);
    const estimatedBuyContracts = quoteContracts > 0
        ? quoteContracts
        : safeCurrentPrice > 0
            ? Math.floor(numericAmount / safeCurrentPrice)
            : 0;
    const estimatedBuyContractsLabel = formatWholeShares(estimatedBuyContracts);
    const primaryValue = tradeMode === "BUY"
        ? estimatedBuyContracts
        : quotePrice > 0
            ? quoteContracts * quotePrice
            : numericAmount * safeCurrentPrice;
    const primaryValueFormatted = primaryValue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const quickButtons = tradeMode === "BUY" ? ["+$1", "+$20", "+$100", "MAX"] : ["+1", "+5", "+10", "MAX"];
    const keypadRows = tradeMode === "BUY"
        ? [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "backspace"]]
        : [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "backspace"]];
    const swipeLabel = isOrderPending
        ? "Order pending"
        : isQuoting
            ? "Fetching quote..."
            : tradeMode === "SELL" && !hasSellInventory
                ? "No shares to sell"
                : needsPositionSelection
                    ? "Select a position"
                    : insufficientFundsLooksLikeSol
                        ? "Need SOL for fees"
                    : needsJupUsdTopUp
                        ? "Swap & buy"
                    : isInsufficientBalance
                        ? "Insufficient Balance"
                        : !isMarketTradeable
                            ? "Market not tradeable"
                            : tradeMode === "BUY"
                                ? "Swipe to buy"
                                : "Swipe to sell";
    const topUpMessage = needsJupUsdTopUp
        ? `Will swap ${Math.max(0, numericAmount - resolvedJupUsdBalance).toFixed(2)} USDC to JupUSD before buying.`
        : null;
    const feedbackMessage = tradeBlockedReason || insufficientBalanceMessage || balanceErrorMessage || topUpMessage || (isQuoting ? "Fetching latest quote..." : null);
    const balanceLabel = tradeMode === "BUY"
        ? needsJupUsdTopUp ? "Stable Balance" : "JupUSD Balance"
        : matchingPositions.length > 1 && !selectedPosition
            ? "Position Balance"
            : "Selected Position";
    const balanceValue = tradeMode === "BUY"
        ? `$${preferredBuySource.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : matchingPositions.length > 1 && !selectedPosition
            ? "Select a position"
            : `${formatWholeShares(availableBalance)} shares`;
    const resetTrigger = [
        tradeMode,
        side,
        amount,
        selectedPositionId ?? "none",
        submitPhase,
        orderStatus ?? "none",
        error ?? "none",
    ].join("|");

    useEffect(() => {
        if (!walletAddress) return;
        if (tradeMode !== "BUY") return;
        if (!amount) return;
        if (!error || !/insufficient funds/i.test(error)) return;

        void fetchBalance();
    }, [amount, error, fetchBalance, tradeMode, walletAddress]);

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.container, animatedStyle]}>
                <View style={styles.dragHandleContainer}>
                    <View style={styles.dragHandle} />
                </View>

                <View style={styles.content}>
                    <View style={styles.marketHeader}>
                        <Image source={{ uri: market.imageUrl }} style={styles.marketIcon} />
                        <Text style={styles.marketTitle} numberOfLines={1}>{market.title}</Text>
                    </View>

                    <View style={styles.toggleWrapper}>
                        <View style={styles.tradeTypeToggle}>
                            <Pressable
                                style={[styles.toggleBtn, tradeMode === "BUY" && styles.toggleBtnActive, interactionLocked && styles.toggleBtnDisabled]}
                                onPress={() => setTradeMode("BUY")}
                                disabled={interactionLocked}
                            >
                                <Text style={[styles.toggleText, tradeMode === "BUY" && styles.toggleTextActive]}>Buy</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.toggleBtn, tradeMode === "SELL" && styles.toggleBtnActive, interactionLocked && styles.toggleBtnDisabled]}
                                onPress={() => setTradeMode("SELL")}
                                disabled={interactionLocked}
                            >
                                <Text style={[styles.toggleText, tradeMode === "SELL" && styles.toggleTextActive]}>Sell</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.amountDisplayContainer}>
                        <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
                            {tradeMode === "BUY"
                                ? `$${numericAmount === 0 ? "0.00" : amount}`
                                : `${numericAmount === 0 ? "0" : amount}`}
                        </Text>
                        {tradeMode === "SELL" && <Text style={styles.amountSuffix}>Shares</Text>}
                        <Text style={styles.sharesEstimate}>
                            {tradeMode === "BUY"
                                ? `${estimatedBuyContractsLabel} ${estimatedBuyContracts === 1 ? "Share" : "Shares"} max`
                                : `≈$${primaryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} Proceeds`}
                        </Text>
                    </View>

                    <Pressable
                        style={styles.balanceSelector}
                        onPress={tradeMode === "BUY" ? handleFundWallet : undefined}
                        disabled={tradeMode !== "BUY"}
                    >
                        <View style={styles.balanceIconBg}>
                            <Text style={styles.balanceIconText}>$</Text>
                        </View>
                        <View style={styles.balanceInfo}>
                            <Text style={styles.balanceLabel}>{balanceLabel}</Text>
                            <Text style={styles.balanceValue}>{balanceValue}</Text>
                        </View>
                        <ChevronDown color="#999" size={14} />
                    </Pressable>

                    <View style={styles.sidePillsContainer}>
                        <Pressable
                            style={[styles.sidePill, side === "YES" ? styles.yesPillActive : styles.pillInactive, interactionLocked && styles.disabledPill]}
                            onPress={() => setSide("YES")}
                            disabled={interactionLocked}
                        >
                            <Text style={[styles.pillText, side === "YES" && styles.pillTextActive]}>
                                Yes {(market.yesPrice * 100).toFixed(0)}¢
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.sidePill, side === "NO" ? styles.noPillActive : styles.pillInactive, interactionLocked && styles.disabledPill]}
                            onPress={() => setSide("NO")}
                            disabled={interactionLocked}
                        >
                            <Text style={[styles.pillText, side === "NO" && styles.pillTextActive]}>
                                No {((1 - market.yesPrice) * 100).toFixed(0)}¢
                            </Text>
                        </Pressable>
                    </View>

                    {tradeMode === "SELL" && matchingPositions.length > 1 && (
                        <View style={styles.positionSelectorSection}>
                            <Text style={styles.positionSelectorTitle}>Position to sell</Text>
                            {matchingPositions.map((position) => {
                                const avgPrice = position.amount > 0 ? position.costBasis / position.amount : 0;
                                const isSelected = position.mint === selectedPositionId;
                                return (
                                    <Pressable
                                        key={position.mint}
                                        style={[styles.positionOption, isSelected && styles.positionOptionSelected]}
                                        onPress={() => setSelectedPositionId(position.mint)}
                                        disabled={interactionLocked}
                                    >
                                        <View>
                                            <Text style={[styles.positionOptionValue, isSelected && styles.positionOptionValueSelected]}>
                                                {formatWholeShares(position.amount)} shares
                                            </Text>
                                            <Text style={styles.positionOptionMeta}>
                                                Avg {avgPrice.toFixed(2)} USD
                                            </Text>
                                        </View>
                                        <Text style={styles.positionOptionId}>{formatPositionId(position.mint)}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    <View style={styles.toWinContainer}>
                        <Text style={styles.toWinLabel}>{tradeMode === "BUY" ? "To Win" : "To Receive"}</Text>
                        <Text style={styles.toWinValue}>
                            ${primaryValueFormatted}
                        </Text>
                    </View>

                    <Pressable
                        style={styles.detailsHeader}
                        onPress={() => setShowDetails((prev) => !prev)}
                    >
                        <Text style={styles.detailsHeaderText}>Order Details</Text>
                        <ChevronDown color="#999" size={16} style={{ transform: [{ rotate: showDetails ? "180deg" : "0deg" }] }} />
                    </Pressable>

                    {showDetails && (
                        <View style={styles.detailsContent}>
                            {tradeMode === "BUY" && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Max Shares</Text>
                                    <Text style={styles.detailValue}>{estimatedBuyContractsLabel}</Text>
                                </View>
                            )}
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

                    <View style={styles.quickAmountsRow}>
                        {quickButtons.map((value) => (
                            <Pressable
                                key={value}
                                style={[styles.quickBtn, interactionLocked && styles.quickBtnDisabled]}
                                onPress={() => handleQuickAmount(value)}
                                disabled={interactionLocked}
                            >
                                <Text style={styles.quickBtnText}>{value}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <View style={styles.keypad}>
                        {keypadRows.map((row, index) => (
                            <View key={index} style={styles.keypadRow}>
                                {row.map((key) => {
                                    const isBlankKey = key === "";
                                    return (
                                        <Pressable
                                            key={`${index}-${key || "blank"}`}
                                            style={[
                                                styles.key,
                                                (key === "backspace" || key === "." || isBlankKey) && styles.keySpecial,
                                                interactionLocked && styles.keyDisabled,
                                            ]}
                                            onPress={() => {
                                                if (!isBlankKey) handleKeyPress(key);
                                            }}
                                            disabled={interactionLocked || isBlankKey}
                                        >
                                            {key === "backspace" ? (
                                                <Delete color="#000" size={20} />
                                            ) : (
                                                <Text style={styles.keyText}>{key}</Text>
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.actionFixedFooter}>
                    <SwipeToBuy
                        onSwipe={handleTrade}
                        isLoading={isLoading}
                        disabled={isButtonDisabled}
                        label={swipeLabel}
                        resetTrigger={resetTrigger}
                    />
                </View>

                {!!feedbackMessage && <Text style={styles.errorFeedback}>{feedbackMessage}</Text>}
            </Animated.View>
        </GestureDetector>
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
    disabledPill: {
        opacity: 0.55,
    },
    pillText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#9F9F9F",
    },
    pillTextActive: {
        color: "#fff",
    },
    positionSelectorSection: {
        marginBottom: 10,
        gap: 6,
    },
    positionSelectorTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#171717",
    },
    positionOption: {
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(0, 0, 0, 0.12)",
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    positionOptionSelected: {
        borderColor: "#171717",
        backgroundColor: "#F2F2F7",
    },
    positionOptionValue: {
        fontSize: 14,
        fontWeight: "700",
        color: "#171717",
    },
    positionOptionValueSelected: {
        color: "#000",
    },
    positionOptionMeta: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7280",
        marginTop: 2,
    },
    positionOptionId: {
        fontSize: 12,
        fontWeight: "700",
        color: "#6B7280",
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
    quickBtnDisabled: {
        opacity: 0.55,
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
    keyDisabled: {
        opacity: 0.55,
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
