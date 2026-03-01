import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface CircularProgressProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    backgroundColor?: string;
}

export function CircularProgress({
    percentage,
    size = 40,
    strokeWidth = 4,
    color = "#34c759",
    backgroundColor = "#e5e7eb"
}: CircularProgressProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    // We want a semi-circle (like a gauge) that goes from -90deg to +90deg (or something similar), 
    // but the design seems to show a 3/4 circle gauge from bottom left to bottom right.
    // Looking closely at the screenshot, it's roughly a 270-degree arc where the gap is at the bottom right quadrant.
    // Let's implement a standard circular progress starting from top center.
    // A gap can be added by adjusting the dasharray and rotation.

    // For a simple full circle progress:
    const safePercentage = Math.min(100, Math.max(0, percentage));

    // However, the Figma design shows it as an arc that looks like 75% of a full circle.
    // Let's create an arc that covers 270 degrees.
    const arcLength = circumference * 0.75;
    const progressLength = arcLength * (safePercentage / 100);
    const dashoffset = circumference - progressLength;
    const backgroundDashoffset = circumference - arcLength;

    return (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '135deg' }] }}>
                {/* Background track */}
                <Circle
                    stroke={backgroundColor}
                    fill="transparent"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={backgroundDashoffset}
                    strokeLinecap="round"
                />
                {/* Progress track */}
                <Circle
                    stroke={color}
                    fill="transparent"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashoffset}
                    strokeLinecap="round"
                />
            </Svg>
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none" />
            <Text style={[styles.text, { fontSize: size * 0.3 }]}>
                {Math.round(safePercentage)}%
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    text: {
        position: "absolute",
        fontWeight: "700",
        color: "#000",
    }
});
