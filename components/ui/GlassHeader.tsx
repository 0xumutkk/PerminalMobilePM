import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { ChevronLeft, Star, Send } from "lucide-react-native";
import { Pressable } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

export interface GlassHeaderProps {
    title?: string;
    onBack?: () => void;
    onRightAction1?: () => void;
    onRightAction2?: () => void;
    rightIcon1?: React.ReactNode;
    rightIcon2?: React.ReactNode;
}

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

/**
 * GlassHeader component implemented following Figma 1:17057 design patterns.
 * Updated to use expo-glass-effect for native Liquid Glass rendering on iOS.
 */
export function GlassHeader({
    title = "Dec 18, 2025",
    onBack,
    onRightAction1,
    onRightAction2,
    rightIcon1,
    rightIcon2,
}: GlassHeaderProps) {
    return (
        <View style={styles.container}>
            {/* Background elements if needed (optional) */}

            {/* Left Action: Chevron Left with Glass effect */}
            <View style={styles.sideSection}>
                {onBack && (
                    <Pressable
                        onPress={onBack}
                        hitSlop={10}
                        style={({ pressed }) => [
                            styles.glassButton,
                            pressed && styles.pressed
                        ]}
                    >
                        {SUPPORTS_GLASS ? (
                            <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" />
                        ) : (
                            <>
                                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                                <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
                            </>
                        )}
                        <View style={styles.iconWrapper}>
                            <ChevronLeft color="#000" size={20} strokeWidth={2.5} />
                        </View>
                    </Pressable>
                )}
            </View>

            {/* Content Area: Absolutely Centered Title */}
            <View style={styles.centerSection} pointerEvents="none">
                <View style={styles.dateContainer}>
                    <Text style={styles.dateText} numberOfLines={1}>{title}</Text>
                </View>
            </View>

            {/* Right Actions: Glass effect buttons */}
            <View style={[styles.sideSection, styles.rightSection]}>
                {onRightAction1 && (
                    <Pressable
                        onPress={onRightAction1}
                        style={({ pressed }) => [
                            styles.glassButton,
                            pressed && styles.pressed
                        ]}
                    >
                        {SUPPORTS_GLASS ? (
                            <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" />
                        ) : (
                            <>
                                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                                <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
                            </>
                        )}
                        <View style={styles.iconWrapper}>
                            {rightIcon1 || <Star color="#000" size={20} strokeWidth={2} />}
                        </View>
                    </Pressable>
                )}

                {onRightAction2 && (
                    <Pressable
                        onPress={onRightAction2}
                        style={({ pressed }) => [
                            styles.glassButton,
                            pressed && styles.pressed
                        ]}
                    >
                        {SUPPORTS_GLASS ? (
                            <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" />
                        ) : (
                            <>
                                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                                <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
                            </>
                        )}
                        <View style={styles.iconWrapper}>
                            {rightIcon2 || <Send color="#000" size={20} strokeWidth={2.5} />}
                        </View>
                    </Pressable>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        paddingHorizontal: 16,
        backgroundColor: "transparent",
        height: 54,
        zIndex: 10,
    },
    sideSection: {
        flexDirection: "row",
        alignItems: "center",
        minWidth: 44, // Ensures space even if no back button
        zIndex: 20,
    },
    rightSection: {
        justifyContent: "flex-end",
        gap: 12,
        minWidth: 100, // Roughly 2 buttons + gap
    },
    glassButton: {
        width: 44,
        height: 32,
        borderRadius: 12,
        borderCurve: "continuous",
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: "0px 0px 1.6px rgba(0, 0, 0, 0.06)",
    },
    glassOverlay: {
        backgroundColor: "rgba(255, 255, 255, 0.45)",
    },
    pressed: {
        opacity: 0.7,
        transform: [{ scale: 0.96 }],
    },
    iconWrapper: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    centerSection: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 5,
    },
    dateContainer: {
        paddingHorizontal: 110, // Leave room for side buttons (44px left, ~100px right)
    },
    dateText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#171717",
        fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-medium",
        textAlign: "center",
    },
});
