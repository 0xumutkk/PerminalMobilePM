import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

interface BottomProgressiveBlurProps {
    height?: number;
    style?: StyleProp<ViewStyle>;
}

const BLUR_SLICES = [
    { top: "67.66%", intensity: 1, opacity: 0.03 },
    { top: "73.05%", intensity: 2, opacity: 0.04 },
    { top: "78.44%", intensity: 4, opacity: 0.05 },
    { top: "83.83%", intensity: 6, opacity: 0.065 },
    { top: "89.22%", intensity: 8, opacity: 0.08 },
    { top: "94.61%", intensity: 9, opacity: 0.1 },
] as const;

export function BottomProgressiveBlur({
    height = 240,
    style,
}: BottomProgressiveBlurProps) {
    return (
        <View pointerEvents="none" style={[styles.container, { height }, style]}>
            <LinearGradient
                colors={["rgba(217, 217, 217, 0)", "#F9F9F9"]}
                locations={[0.4204, 0.9005]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Layered slices approximate Figma's progressive background blur in React Native. */}
            {BLUR_SLICES.map((slice) => (
                <View
                    key={slice.top}
                    style={[
                        styles.blurSlice,
                        {
                            top: slice.top,
                            opacity: slice.opacity,
                        },
                    ]}
                >
                    <BlurView intensity={slice.intensity} tint="light" style={StyleSheet.absoluteFill} />
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        position: "absolute",
    },
    blurSlice: {
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        position: "absolute",
    },
});
