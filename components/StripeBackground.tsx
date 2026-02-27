import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";

const STRIPE_WIDTH = 8;
const WHITE = "#FFFFFF";
const LIGHT_GREY = "#E5E5E5";

export function StripeBackground() {
    const { width } = Dimensions.get("window");
    const numStripes = Math.ceil(width / STRIPE_WIDTH) + 2;

    return (
        <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents="none">
            <View style={styles.stripesRow}>
                {Array.from({ length: numStripes }, (_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.stripe,
                            { backgroundColor: i % 2 === 0 ? WHITE : LIGHT_GREY },
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        zIndex: -1,
    },
    stripesRow: {
        flex: 1,
        flexDirection: "row",
    },
    stripe: {
        width: STRIPE_WIDTH,
        flex: 0,
    },
});
