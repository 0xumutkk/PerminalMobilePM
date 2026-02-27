import React from "react";
import { View, Pressable, StyleSheet, Dimensions, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import { HomeFilledIcon, GlobeFilledIcon, IncentiveIcon, SearchIcon } from "./TabBarIcons";

const PROFILE_AVATAR = "https://www.figma.com/api/mcp/asset/2e4567f9-2300-4518-964f-d6427d5eb261";
const TAB_BAR_WIDTH = 316;
const BOTTOM_BLUR_HEIGHT = 240;
/** Glass background: rgba(255,255,255,0.1) per Figma node 1-14233 */
const TAB_BAR_BG = "rgba(255,255,255,0.1)";
/** Selection fill from Figma node 1-14235 */
const ACTIVE_PILL_BG = "#ededed";
const ACTIVE_ICON = "#171717";
const INACTIVE_ICON = "#8e8e8e";

type TabIconComponent = React.ComponentType<{ color: string }>;
const ICONS: Record<string, TabIconComponent> = {
    index: HomeFilledIcon,
    "leaderboard/index": IncentiveIcon,
    "explore/index": GlobeFilledIcon,
    "search/index": SearchIcon,
};

const VISIBLE_ROUTES = ["index", "leaderboard/index", "explore/index", "search/index", "profile/index"];
const HIDDEN_ROUTES = ["market/[id]", "profile/[id]"];

const SUPPORTS_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

export function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
    const activeRoute = state.routes[state.index]?.name;
    if (HIDDEN_ROUTES.includes(activeRoute)) return null;

    const bottomInset = insets?.bottom ?? 0;
    const left = (Dimensions.get("window").width - TAB_BAR_WIDTH) / 2;
    const visibleRoutes = state.routes.filter((r) => VISIBLE_ROUTES.includes(r.name));

    return (
        <View
            style={styles.container}
            pointerEvents="box-none"
        >
            <View style={styles.bottomBlurLayer} pointerEvents="none">
                <BlurView intensity={14} tint="light" style={StyleSheet.absoluteFill} />
                <LinearGradient
                    colors={["rgba(217,217,217,0)", "#f9f9f9"]}
                    locations={[0.4204, 0.9005]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            <View
                style={[
                    styles.tabBarWrapper,
                    { left, bottom: Platform.OS === "ios" ? 10 + bottomInset : 8 + bottomInset },
                ]}
            >
                {/* Main Glass Background */}
                {SUPPORTS_GLASS ? (
                    <GlassView
                        style={StyleSheet.absoluteFill}
                        glassEffectStyle="clear"
                        /* @ts-ignore - Specific settings */
                        refraction={60}
                        depth={30}
                        frost={6}
                    />
                ) : (
                    <BlurView
                        intensity={20}
                        tint="light"
                        style={StyleSheet.absoluteFill}
                    />
                )}
                {/* 10% Tint Overlay matching Figma: FFFFFF 10% */}
                <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.1)" }]}
                    pointerEvents="none"
                />

                <View style={styles.tabBar}>
                    {visibleRoutes.map((route) => {
                        const index = state.routes.findIndex((r) => r.key === route.key);
                        const focused = index === state.index;
                        const isProfile = route.name === "profile/index";

                        const onPress = () => {
                            const event = navigation.emit({
                                type: "tabPress",
                                target: route.key,
                                canPreventDefault: true,
                            });
                            if (!focused && !event.defaultPrevented) {
                                navigation.navigate(route.name, route.params);
                            }
                        };

                        const IconComponent = ICONS[route.name];
                        const color = focused ? ACTIVE_ICON : INACTIVE_ICON;

                        return (
                            <Pressable
                                key={route.key}
                                onPress={onPress}
                                style={[
                                    styles.tabItem,
                                    !focused && !isProfile && styles.tabItemInactive,
                                ]}
                            >
                                {/* Active Selection Liquid Glass Effect */}
                                {focused && (
                                    <View style={[
                                        styles.selectionContainer,
                                        isProfile && { width: 44, alignSelf: 'flex-end', left: undefined, right: 0 }
                                    ]}>
                                        {SUPPORTS_GLASS ? (
                                            <GlassView
                                                style={StyleSheet.absoluteFill}
                                                glassEffectStyle="clear"
                                                /* @ts-ignore - Specific settings for Selection */
                                                refraction={60}
                                                depth={30}
                                                frost={6}
                                            />
                                        ) : (
                                            <View style={[StyleSheet.absoluteFill, { backgroundColor: ACTIVE_PILL_BG }]} />
                                        )}
                                        {/* Selection Tint: #ededed 85% opacity to keep it glassy but solid look */}
                                        <View style={[
                                            StyleSheet.absoluteFill,
                                            { backgroundColor: "rgba(237, 237, 237, 0.85)", borderRadius: 16 }
                                        ]} />
                                        {/* Light Source: -45 deg top-left highlight */}
                                        <LinearGradient
                                            colors={["rgba(255, 255, 255, 0.25)", "transparent"]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    </View>
                                )}

                                {isProfile ? (
                                    <View style={styles.profileContainer}>
                                        <Image
                                            source={{ uri: PROFILE_AVATAR }}
                                            contentFit="cover"
                                            style={styles.profileIcon}
                                        />
                                    </View>
                                ) : IconComponent ? (
                                    <IconComponent color={color} />
                                ) : null}
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
    },
    tabBarWrapper: {
        position: "absolute",
        width: TAB_BAR_WIDTH,
        height: 53,
        borderRadius: 20,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.2)", // White rim highlight
        // Premium subtle shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 5,
    },
    bottomBlurLayer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: BOTTOM_BLUR_HEIGHT,
    },
    glassOverlay: {
        backgroundColor: TAB_BAR_BG,
    },
    tabBar: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        gap: 2,
    },
    tabItem: {
        width: 60,
        height: 45,
        borderRadius: 16,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    selectionContainer: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
        overflow: "hidden",
    },
    selectionView: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
    },
    fallbackSelection: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#ededed",
        borderRadius: 16,
    },
    tabItemInactive: {
        opacity: 0.5,
    },
    profileContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
    profileIcon: {
        width: "100%",
        height: "100%",
    },
});
