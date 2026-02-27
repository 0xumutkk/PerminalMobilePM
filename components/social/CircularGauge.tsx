import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface CircularGaugeProps {
    percentage: number; // 0-100
    size?: number;
    strokeWidth?: number;
}

export function CircularGauge({ percentage, size = 48, strokeWidth = 4 }: CircularGaugeProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    // Color based on percentage (green for Yes leading, red for No leading)
    const color = percentage >= 50 ? "#22c55e" : "#ef4444";

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size} style={styles.svg}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Progress circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${size / 2}, ${size / 2}`}
                />
            </Svg>
            <View style={styles.textContainer}>
                <Text style={[styles.percentageText, { color }]}>{percentage}%</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
    },
    svg: {
        position: "absolute",
    },
    textContainer: {
        alignItems: "center",
        justifyContent: "center",
    },
    percentageText: {
        fontSize: 11,
        fontWeight: "900",
    },
});
