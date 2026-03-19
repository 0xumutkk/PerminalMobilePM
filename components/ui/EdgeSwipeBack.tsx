import React, { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

const EDGE_SWIPE_TRIGGER_DISTANCE = 72;
const EDGE_SWIPE_TRIGGER_VELOCITY = 700;

interface EdgeSwipeBackProps {
    onBack: () => void;
    disabled?: boolean;
}

export function EdgeSwipeBack({ onBack, disabled = false }: EdgeSwipeBackProps) {
    const edgeSwipeGesture = useMemo(
        () =>
            Gesture.Pan()
                .enabled(Platform.OS === "ios" && !disabled)
                .activeOffsetX([12, 9999])
                .failOffsetY([-12, 12])
                .onEnd((event) => {
                    const shouldGoBack =
                        event.translationX >= EDGE_SWIPE_TRIGGER_DISTANCE ||
                        event.velocityX >= EDGE_SWIPE_TRIGGER_VELOCITY;

                    if (shouldGoBack) {
                        runOnJS(onBack)();
                    }
                }),
        [disabled, onBack],
    );

    if (Platform.OS !== "ios") return null;

    return (
        <GestureDetector gesture={edgeSwipeGesture}>
            <View collapsable={false} style={styles.edgeSwipeArea} />
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    edgeSwipeArea: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 24,
        zIndex: 45,
    },
});
