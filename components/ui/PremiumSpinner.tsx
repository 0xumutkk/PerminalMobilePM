import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type PremiumSpinnerProps = {
    size?: number;
    color?: string;
};

const SPOKE_COUNT = 12;

export function PremiumSpinner({ size = 28, color = "#111111" }: PremiumSpinnerProps) {
    const rotation = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(rotation, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        );

        loop.start();

        return () => {
            loop.stop();
            rotation.setValue(0);
        };
    }, [rotation]);

    const rotate = rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    });

    const barWidth = Math.max(2, size * 0.08);
    const barHeight = Math.max(7, size * 0.24);
    const spokeRadius = size * 0.34;

    return (
        <Animated.View
            style={[
                styles.spinner,
                {
                    width: size,
                    height: size,
                    transform: [{ rotate }],
                },
            ]}
        >
            {Array.from({ length: SPOKE_COUNT }).map((_, index) => (
                <View
                    key={index}
                    style={[
                        styles.spokeWrapper,
                        {
                            width: size,
                            height: size,
                            transform: [{ rotate: `${index * (360 / SPOKE_COUNT)}deg` }],
                        },
                    ]}
                >
                    <View
                        style={[
                            styles.spoke,
                            {
                                width: barWidth,
                                height: barHeight,
                                borderRadius: barWidth,
                                backgroundColor: color,
                                opacity: 0.12 + (index + 1) / SPOKE_COUNT * 0.88,
                                transform: [{ translateY: -spokeRadius }],
                            },
                        ]}
                    />
                </View>
            ))}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    spinner: {
        alignItems: "center",
        justifyContent: "center",
    },
    spokeWrapper: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
    },
    spoke: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
    },
});
