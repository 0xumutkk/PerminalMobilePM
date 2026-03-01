import React, { useEffect } from "react";
import { Text, View, TouchableOpacity, StyleSheet, Image, Platform } from "react-native";
import { usePrivy, useLoginWithOAuth } from "@privy-io/expo";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

// Simple icons
const AppleIcon = () => (
    <View style={{ marginRight: 8 }}>
        <Text style={{ fontSize: 20 }}></Text>
    </View>
);

function LoginButtons({ disabled }: { disabled: boolean }) {
    const { login } = useLoginWithOAuth();

    const handleLogin = async (provider: "google" | "apple" | "twitter" | "discord" | "tiktok" | "linkedin" | "spotify" | "instagram") => {
        try {
            await login({ provider });
        } catch (err) {
            console.error(`Login with ${provider} failed:`, err);
        }
    };

    return (
        <View style={styles.buttonContainer}>
            {Platform.OS === 'ios' && (
                <TouchableOpacity
                    onPress={() => handleLogin("apple")}
                    style={[styles.button, styles.appleButton, disabled && styles.buttonDisabled]}
                    disabled={disabled}
                    activeOpacity={0.8}
                >
                    <AppleIcon />
                    <Text style={styles.appleButtonText}>Sign in with Apple</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                onPress={() => handleLogin("google")}
                style={[styles.button, styles.googleButton, disabled && styles.buttonDisabled]}
                disabled={disabled}
                activeOpacity={0.8}
            >
                <Image
                    source={{ uri: "https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" }}
                    style={{ width: 18, height: 18, marginRight: 8 }}
                    resizeMode="contain"
                />
                {/* Better: Custom view for G if image fails */}
                <View style={styles.googleIconContainer}>
                    <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
        </View>
    );
}

export default function LoginScreen() {
    const { isReady, user } = usePrivy();

    useEffect(() => {
        const syncUser = async () => {
            if (isReady && user) {
                try {
                    let defaultUsername = user.id.slice(0, 10);

                    const twitterAccount = user.linked_accounts.find(a => a.type === 'twitter_oauth') as any;
                    const googleAccount = user.linked_accounts.find(a => a.type === 'google_oauth') as any;
                    const walletAccount = user.linked_accounts.find(a => a.type === 'wallet' || a.type === 'smart_wallet') as any;

                    if (twitterAccount?.username) {
                        defaultUsername = twitterAccount.username;
                    } else if (googleAccount?.name) {
                        defaultUsername = googleAccount.name.replace(/\\s+/g, '').toLowerCase();
                    }

                    const profileData: any = {
                        id: user.id,
                        wallet_address: walletAccount?.address || null,
                        username: defaultUsername,
                    };

                    const { error } = await supabase.from("profiles").upsert(
                        profileData,
                        { onConflict: 'id' }
                    );

                    if (error) {
                        console.error("Failed to sync user to Supabase profiles:", error);
                    } else {
                        console.log("User successfully synced to Supabase:", user.id);
                    }
                } catch (e) {
                    console.error("Unexpected error syncing user:", e);
                }
            }
        };

        syncUser();
    }, [isReady, user]);

    if (isReady && user) {
        return <Redirect href="/(app)" />;
    }

    const logoSource = require("../assets/logo.png");

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            <View style={styles.content}>
                <View style={styles.bottomSection}>
                    {/* Logo Section */}
                    <View style={styles.logoSection}>
                        <Image
                            source={logoSource}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Text Section */}
                    <View style={styles.textSection}>
                        <Text style={styles.headline}>
                            Start trading everything{"\n"}with your friends.
                        </Text>
                    </View>

                    {/* Login Buttons */}
                    <LoginButtons disabled={!isReady} />

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.termsText}>
                            By signing up, you agree to our{"\n"}Terms of Service and Privacy Policy.
                        </Text>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        justifyContent: "flex-end",
        paddingBottom: 20,
    },
    bottomSection: {
        width: "100%",
        gap: 16,
    },
    logoSection: {
        alignItems: "flex-start",
    },
    logo: {
        width: 72,
        height: 72,
    },
    textSection: {
        marginBottom: 8,
    },
    headline: {
        fontSize: 24,
        fontWeight: "600",
        color: "#1c1c1c",
        lineHeight: 30,
        letterSpacing: -0.6,
    },
    buttonContainer: {
        gap: 12,
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 54,
        borderRadius: 16,
        borderWidth: 2,
        width: "100%",
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    appleButton: {
        backgroundColor: "#fff",
        borderColor: "rgba(0,0,0,0.25)",
    },
    appleButtonText: {
        color: "#1c1c1c",
        fontSize: 20,
        fontWeight: "600",
        letterSpacing: -0.6,
        marginLeft: 8,
    },
    googleButton: {
        backgroundColor: "#171717",
        borderColor: "rgba(255,255,255,0.25)",
    },
    googleButtonText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "600",
        letterSpacing: -0.6,
        marginLeft: 8,
    },
    googleIconContainer: {
        display: "none",
    },
    googleIconText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold"
    },
    footer: {
        alignItems: "center",
        marginTop: 4,
    },
    termsText: {
        textAlign: "center",
        color: "rgba(0,0,0,0.5)",
        fontSize: 14,
        lineHeight: 20,
    },
});
