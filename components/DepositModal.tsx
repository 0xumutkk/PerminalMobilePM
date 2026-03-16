import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, Animated, Dimensions } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { X, CreditCard, ChevronRight, Scan, Smartphone, Globe } from "lucide-react-native";

interface DepositModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectMethod: (method: "apple_pay" | "google_pay" | "card" | "crypto") => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function DepositModal({ visible, onClose, onSelectMethod }: DepositModalProps) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(0);
            slideAnim.setValue(SCREEN_HEIGHT);
        }
    }, [visible]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onClose();
        });
    };

    return (
        <Modal
            visible={visible}
            animationType="none"
            transparent={true}
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                <Animated.View
                    style={[
                        styles.overlay,
                        { opacity: fadeAnim }
                    ]}
                >
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={handleClose}
                    />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.content,
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={styles.title}>Deposit</Text>
                    </View>

                    <View style={styles.methodList}>
                        <TouchableOpacity
                            style={styles.methodButton}
                            onPress={() => onSelectMethod("crypto")}
                        >
                                <View style={styles.methodInfo}>
                                    <Text style={styles.methodTitle}>Crypto</Text>
                                    <Text style={styles.methodDesc}>Receive USDC on Solana (not SOL)</Text>
                                </View>
                            <View style={[styles.iconContainer]}>
                                <Scan color="#000" size={28} strokeWidth={2} />
                            </View>
                        </TouchableOpacity>

                        {Platform.OS === "ios" && (
                            <TouchableOpacity
                                style={styles.methodButton}
                                onPress={() => onSelectMethod("apple_pay")}
                            >
                                <View style={styles.methodInfo}>
                                    <Text style={styles.methodTitle}>Apple Pay</Text>
                                    <Text style={styles.methodDesc}>Buy any prediction or deposit USDC with Apple Pay</Text>
                                </View>
                                <View style={[styles.iconContainer]}>
                                    <Smartphone color="#000" size={28} strokeWidth={2} />
                                </View>
                            </TouchableOpacity>
                        )}

                        {Platform.OS === "android" && (
                            <TouchableOpacity
                                style={styles.methodButton}
                                onPress={() => onSelectMethod("google_pay")}
                            >
                                <View style={styles.methodInfo}>
                                    <Text style={styles.methodTitle}>Google Pay</Text>
                                    <Text style={styles.methodDesc}>Pay with your Google account</Text>
                                </View>
                                <View style={[styles.iconContainer]}>
                                    <Globe color="#000" size={28} strokeWidth={2} />
                                </View>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.methodButton}
                            onPress={() => onSelectMethod("card")}
                        >
                            <View style={styles.methodInfo}>
                                <Text style={styles.methodTitle}>Debit Card</Text>
                                <Text style={styles.methodDesc}>Deposit USDC with your card</Text>
                            </View>
                            <View style={[styles.iconContainer]}>
                                <CreditCard color="#000" size={28} strokeWidth={2} />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            Powered by Privy & MoonPay
                        </Text>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "flex-end",
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    content: {
        backgroundColor: "#F5F5F5",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 8,
        paddingBottom: Platform.OS === "ios" ? 34 : 16,
        overflow: "hidden",
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: "#E5E5E5",
        borderRadius: 2,
        alignSelf: "center",
        marginBottom: 8,
    },
    header: {
        alignItems: "center",
        marginBottom: 12,
    },
    title: {
        color: "#171717",
        fontSize: 18,
        fontWeight: "600",
    },
    methodList: {
        gap: 8,
    },
    methodButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    methodInfo: {
        flex: 1,
    },
    methodTitle: {
        color: "#171717",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 2,
    },
    methodDesc: {
        color: "#737373",
        fontSize: 13,
        lineHeight: 16,
    },
    iconContainer: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 8,
    },
    footer: {
        marginTop: 16,
        alignItems: "center",
    },
    footerText: {
        color: "#A3A3A3",
        fontSize: 12,
        fontWeight: "500",
    },
});

export default DepositModal;
