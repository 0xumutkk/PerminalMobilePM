import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useProfile } from "../../hooks/useProfile";
import { useInteractions } from "../../hooks/useInteractions";

export function CreatePost({ onPostCreated }: { onPostCreated: () => void }) {
    const { profile } = useProfile();
    const { createPost, isSubmitting } = useInteractions();
    const [content, setContent] = useState("");
    const [postType, setPostType] = useState<'standard' | 'trade' | 'thesis'>('standard');

    const handlePost = async () => {
        if (!content.trim()) return;

        let tradeMetadata = {};
        if (postType === 'trade') {
            tradeMetadata = {
                avg_entry: 0.47,
                current_price: 0.97,
                shares_count: '12.3K',
                total_value: '12,234.56',
                pnl_percent: 1234.2
            };
        }

        const result = await createPost(
            content,
            undefined,
            undefined,
            undefined,
            postType,
            tradeMetadata,
            postType === 'trade'
        );

        if (result) {
            setContent("");
            setPostType('standard');
            onPostCreated();
        }
    };

    if (!profile) return null;

    return (
        <View style={styles.container}>
            <View style={styles.avatarContainer}>
                {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarFallback}>
                        <Text style={styles.fallbackText}>{(profile?.username || "U").charAt(0).toUpperCase()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    placeholder="What's happening?"
                    placeholderTextColor="#6b7280"
                    style={styles.input}
                    multiline
                    value={content}
                    onChangeText={setContent}
                />

                <View style={styles.typeSelector}>
                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'standard' && styles.typeButtonActive]}
                        onPress={() => setPostType('standard')}
                    >
                        <Text style={[styles.typeButtonText, postType === 'standard' && styles.typeButtonTextActive]}>Standard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'trade' && styles.typeButtonActive]}
                        onPress={() => setPostType('trade')}
                    >
                        <Text style={[styles.typeButtonText, postType === 'trade' && styles.typeButtonTextActive]}>Position</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'thesis' && styles.typeButtonActive]}
                        onPress={() => setPostType('thesis')}
                    >
                        <Text style={[styles.typeButtonText, postType === 'thesis' && styles.typeButtonTextActive]}>Thesis</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.button, (!content.trim() || isSubmitting) && styles.disabledButton]}
                        onPress={handlePost}
                        disabled={!content.trim() || isSubmitting}
                    >
                        {isSubmitting ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.buttonText}>Post</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#1f2937",
        backgroundColor: "#000",
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#1f2937",
    },
    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#3b82f6",
        alignItems: "center",
        justifyContent: "center",
    },
    fallbackText: {
        color: "#fff",
        fontWeight: "bold",
    },
    inputContainer: {
        flex: 1,
    },
    input: {
        color: "#fff",
        fontSize: 16,
        minHeight: 40,
        textAlignVertical: "top",
        marginBottom: 8,
    },
    typeSelector: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
    },
    typeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: "#111",
        borderWidth: 1,
        borderColor: "#1f2937",
    },
    typeButtonActive: {
        backgroundColor: "rgba(52, 211, 153, 0.1)",
        borderColor: "#34d399",
    },
    typeButtonText: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: "700",
    },
    typeButtonTextActive: {
        color: "#34d399",
    },
    footer: {
        flexDirection: "row",
        justifyContent: "flex-end",
    },
    button: {
        backgroundColor: "#34d399",
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    disabledButton: {
        opacity: 0.5,
    },
    buttonText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "700",
    },
});
