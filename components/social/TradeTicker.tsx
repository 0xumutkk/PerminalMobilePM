import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

const recentTrades = [
    "User72 bought $500 YES for SOL price",
    "TraderX sold $200 NO for ETH merge",
    "CryptoKing bought $1,200 YES for BTC 100k",
    "WhaleWatcher sold $5,000 NO for US Election",
];

export function TradeTicker() {
    const [index, setIndex] = useState(0);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const interval = setInterval(() => {
            Animated.sequence([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start();

            setIndex((prev) => (prev + 1) % recentTrades.length);
        }, 4000);

        // Initial fade in
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
        }).start();

        return () => clearInterval(interval);
    }, []);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <View style={styles.dot} />
                <Text style={styles.text}>{recentTrades[index]}</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 32,
        backgroundColor: "rgba(34, 197, 94, 0.05)",
        borderBottomWidth: 1,
        borderBottomColor: "#111",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    content: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#22c55e",
    },
    text: {
        color: "#22c55e",
        fontSize: 12,
        fontWeight: "800",
        textTransform: 'uppercase',
    },
});
