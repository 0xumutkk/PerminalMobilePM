import React, { useState } from "react";
import { StyleSheet, View, Text, LayoutChangeEvent } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    runOnJS,
    withTiming,
    interpolate,
    Extrapolate,
} from "react-native-reanimated";
import { ChevronsRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";

interface SwipeToBuyProps {
    onSwipe: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    label?: string;
    resetTrigger?: string | number;
}

const BUTTON_HEIGHT = 56;
const TOGGLE_SIZE = 46;
const PADDING = 5;

export function SwipeToBuy({
    onSwipe,
    isLoading,
    disabled,
    label = "Swipe to buy",
    resetTrigger,
}: SwipeToBuyProps) {
    const translateX = useSharedValue(0);
    const [swiped, setSwiped] = useState(false);
    const [width, setWidth] = useState(0);

    const swipeThreshold = width ? width - TOGGLE_SIZE - (PADDING * 2) : 0;

    const onLayout = (event: LayoutChangeEvent) => {
        setWidth(event.nativeEvent.layout.width);
    };

    const panGesture = Gesture.Pan()
        .enabled(!disabled && !isLoading && !swiped)
        .activeOffsetX([-10, 10])
        .onUpdate((event) => {
            if (!swipeThreshold) return;
            const val = Math.max(0, Math.min(event.translationX, swipeThreshold));
            translateX.value = val;
        })
        .onEnd(() => {
            if (!swipeThreshold) return;
            if (translateX.value >= swipeThreshold * 0.7) {
                translateX.value = withSpring(swipeThreshold, { damping: 20, stiffness: 200 });
                runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
                runOnJS(setSwiped)(true);
                runOnJS(onSwipe)();
            } else {
                translateX.value = withSpring(0);
            }
        });

    const animatedToggleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const animatedTextStyle = useAnimatedStyle(() => {
        if (!swipeThreshold) return { opacity: 1 };
        const opacity = interpolate(
            translateX.value,
            [0, swipeThreshold / 2],
            [1, 0.2],
            Extrapolate.CLAMP
        );
        return { opacity };
    });

    // Reset when the caller invalidates the current swipe or the CTA becomes disabled.
    React.useEffect(() => {
        if (disabled && swiped) {
            translateX.value = withTiming(0);
            setSwiped(false);
        }
    }, [disabled, swiped, translateX]);

    React.useEffect(() => {
        translateX.value = withTiming(0);
        setSwiped(false);
    }, [resetTrigger, translateX]);

    return (
        <View
            style={[
                styles.container,
                (disabled || swiped) && styles.disabled,
            ]}
            onLayout={onLayout}
        >
            {/* Glass Background for the button track */}
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />

            <View style={styles.track}>
                <Animated.View style={[styles.textContainer, animatedTextStyle]}>
                    <Text style={styles.label}>{isLoading ? "Processing..." : label}</Text>
                </Animated.View>

                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.toggle, animatedToggleStyle]}>
                        <View style={styles.iconBg}>
                            <ChevronsRight color="#000" size={24} strokeWidth={2.5} />
                        </View>
                    </Animated.View>
                </GestureDetector>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: BUTTON_HEIGHT,
        backgroundColor: "rgba(23, 23, 23, 0.8)", // Dark glass base
        borderRadius: 16,
        padding: PADDING,
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255, 255, 255, 0.15)",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    disabled: {
        opacity: 0.5,
    },
    track: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        position: "relative",
    },
    toggle: {
        width: TOGGLE_SIZE,
        height: TOGGLE_SIZE,
        backgroundColor: "#fff",
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    iconBg: {
        justifyContent: "center",
        alignItems: "center",
    },
    textContainer: {
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
        textAlign: "center",
        letterSpacing: -0.4,
    },
});
