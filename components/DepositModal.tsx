import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { X, CreditCard, ChevronRight } from "lucide-react-native";
import { Image } from "expo-image";

interface DepositModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectMethod: (method: "apple_pay" | "google_pay" | "card") => void;
}

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

export function DepositModal({ visible, onClose, onSelectMethod }: DepositModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    style={styles.content}
                    activeOpacity={1}
                >
                    {SUPPORTS_GLASS ? (
                        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
                    ) : null}
                    <View style={styles.header}>
                        <Text style={styles.title}>Deposit Funds</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X color="#fff" size={24} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>Select your preferred payment method to fund your wallet.</Text>

                    <View style={styles.methodList}>
                        {Platform.OS === "ios" && (
                            <TouchableOpacity
                                style={styles.methodButton}
                                onPress={() => onSelectMethod("apple_pay")}
                            >
                                <View style={[styles.iconContainer, styles.appleIcon]}>
                                    <Text style={styles.appleText}>Pay</Text>
                                </View>
                                <View style={styles.methodInfo}>
                                    <Text style={styles.methodTitle}>Apple Pay</Text>
                                    <Text style={styles.methodDesc}>Fast and secure checkout</Text>
                                </View>
                                <ChevronRight color="#4b5563" size={20} />
                            </TouchableOpacity>
                        )}

                        {Platform.OS === "android" && (
                            <TouchableOpacity
                                style={styles.methodButton}
                                onPress={() => onSelectMethod("google_pay")}
                            >
                                <View style={[styles.iconContainer, styles.googleIcon]}>
                                    <Text style={styles.googleText}>G Pay</Text>
                                </View>
                                <View style={styles.methodInfo}>
                                    <Text style={styles.methodTitle}>Google Pay</Text>
                                    <Text style={styles.methodDesc}>Pay with your Google account</Text>
                                </View>
                                <ChevronRight color="#4b5563" size={20} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.methodButton}
                            onPress={() => onSelectMethod("card")}
                        >
                            <View style={[styles.iconContainer, styles.cardIcon]}>
                                <CreditCard color="#fff" size={20} />
                            </View>
                            <View style={styles.methodInfo}>
                                <Text style={styles.methodTitle}>Debit / Credit Card</Text>
                                <Text style={styles.methodDesc}>Visa, Mastercard, and more</Text>
                            </View>
                            <ChevronRight color="#4b5563" size={20} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            Powered by Privy & MoonPay
                        </Text>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "flex-end",
    },
    content: {
        backgroundColor: Platform.OS === "ios" ? "rgba(0,0,0,0.85)" : "#000",
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: Platform.OS === "ios" ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: "#1f2937",
        overflow: "hidden",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    title: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "800",
    },
    subtitle: {
        color: "#9ca3af",
        fontSize: 15,
        marginBottom: 32,
        marginTop: 4,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#1f2937",
        alignItems: "center",
        justifyContent: "center",
    },
    methodList: {
        gap: 12,
    },
    methodButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#111",
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: "#1f2937",
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    appleIcon: {
        backgroundColor: "#fff",
    },
    appleText: {
        color: "#000",
        fontWeight: "800",
        fontSize: 16,
    },
    googleIcon: {
        backgroundColor: "#fff",
    },
    googleText: {
        color: "#5f6368",
        fontWeight: "bold",
        fontSize: 16,
    },
    cardIcon: {
        backgroundColor: "#3b0764",
    },
    methodInfo: {
        flex: 1,
        marginLeft: 16,
    },
    methodTitle: {
        color: "#fff",
        fontSize: 17,
        fontWeight: "700",
    },
    methodDesc: {
        color: "#6b7280",
        fontSize: 13,
        marginTop: 2,
    },
    footer: {
        marginTop: 32,
        alignItems: "center",
    },
    footerText: {
        color: "#4b5563",
        fontSize: 12,
        fontWeight: "600",
    },
});
