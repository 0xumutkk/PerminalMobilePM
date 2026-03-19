import React from "react";
import { View, Pressable, StyleSheet, Dimensions, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { HomeFilledIcon, GlobeFilledIcon, IncentiveIcon, SearchIcon } from "./TabBarIcons";

const PROFILE_AVATAR = "https://www.figma.com/api/mcp/asset/2e4567f9-2300-4518-964f-d6427d5eb261";
const TAB_BAR_WIDTH = 316;
const ACTIVE_ICON = "#171717";
const INACTIVE_ICON = "#8e8e8e";
const TAB_ITEM_WIDTH = 60;
const TAB_ITEM_HEIGHT = 45;
const TAB_ITEM_GAP = 2;
const TAB_BAR_PADDING = 4;
const PROFILE_SELECTION_WIDTH = 44;

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
    const activeVisibleIndex = visibleRoutes.findIndex((route) => route.name === activeRoute);

    const getSelectionMetrics = React.useMemo(
        () => (routeName?: string, visibleIndex?: number) => {
            const index = visibleIndex ?? visibleRoutes.findIndex((route) => route.name === routeName);
            const safeIndex = index < 0 ? 0 : index;
            const isProfile = routeName === "profile/index";
            const slotLeft = TAB_BAR_PADDING + safeIndex * (TAB_ITEM_WIDTH + TAB_ITEM_GAP);

            return {
                left: isProfile ? slotLeft + 8 : slotLeft,
                width: isProfile ? PROFILE_SELECTION_WIDTH : TAB_ITEM_WIDTH,
            };
        },
        [visibleRoutes],
    );
    const initialSelection = getSelectionMetrics(activeRoute, activeVisibleIndex);
    const selectionLeft = useSharedValue(initialSelection.left);
    const selectionWidth = useSharedValue(initialSelection.width);

    React.useEffect(() => {
        const nextSelection = getSelectionMetrics(activeRoute, activeVisibleIndex);

        selectionLeft.value = withSpring(nextSelection.left, {
            damping: 18,
            stiffness: 180,
            mass: 0.8,
        });
        selectionWidth.value = withSpring(nextSelection.width, {
            damping: 20,
            stiffness: 210,
            mass: 0.9,
        });
    }, [activeRoute, activeVisibleIndex, getSelectionMetrics, selectionLeft, selectionWidth]);

    const movingSelectionStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: selectionLeft.value }],
        width: selectionWidth.value,
    }));

    return (
        <View
            style={styles.container}
            pointerEvents="box-none"
        >
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
                <LinearGradient
                    colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.12)"]}
                    start={{ x: 0.05, y: 0 }}
                    end={{ x: 0.95, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
                <View style={styles.outerRim} pointerEvents="none" />

                <View style={styles.tabBar}>
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.movingSelection, movingSelectionStyle]}
                    >
                        {SUPPORTS_GLASS ? (
                            <GlassView
                                style={StyleSheet.absoluteFill}
                                glassEffectStyle="clear"
                                /* @ts-ignore */
                                refraction={82}
                                depth={42}
                                frost={12}
                            />
                        ) : (
                            <View style={styles.fallbackSelection} />
                        )}
                        <View style={styles.activeSelectionTint} />
                        <LinearGradient
                            colors={["rgba(255,255,255,0.38)", "rgba(255,255,255,0.10)", "transparent"]}
                            start={{ x: 0.05, y: 0 }}
                            end={{ x: 0.92, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <LinearGradient
                            colors={["rgba(255,255,255,0.08)", "transparent", "rgba(255,255,255,0.20)"]}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.selectionRim} />
                        <View style={styles.selectionCoreGlow} />
                    </Animated.View>

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
                            <Pressable key={route.key} onPress={onPress}>
                                {({ pressed }) => (
                                    <View
                                        style={[
                                            styles.tabItem,
                                            !focused && !isProfile && styles.tabItemInactive,
                                            pressed && styles.tabItemPressed,
                                        ]}
                                    >
                                        {isProfile ? (
                                            <View style={[styles.profileContainer, pressed && styles.profileContainerPressed]}>
                                                <Image
                                                    source={{ uri: PROFILE_AVATAR }}
                                                    contentFit="cover"
                                                    style={styles.profileIcon}
                                                />
                                            </View>
                                        ) : IconComponent ? (
                                            <IconComponent color={color} />
                                        ) : null}
                                    </View>
                                )}
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
        zIndex: 60,
    },
    tabBarWrapper: {
        position: "absolute",
        width: TAB_BAR_WIDTH,
        height: 53,
        borderRadius: 20,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 4,
    },
    tabBar: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: TAB_BAR_PADDING,
        gap: TAB_ITEM_GAP,
    },
    outerRim: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
    },
    tabItem: {
        width: TAB_ITEM_WIDTH,
        height: TAB_ITEM_HEIGHT,
        borderRadius: 16,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    tabItemPressed: {
        transform: [{ scale: 0.97 }],
    },
    fallbackSelection: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(255,255,255,0.28)",
        borderRadius: 16,
    },
    movingSelection: {
        position: "absolute",
        top: TAB_BAR_PADDING,
        left: 0,
        height: TAB_ITEM_HEIGHT,
        borderRadius: 16,
        overflow: "hidden",
    },
    activeSelectionTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 16,
    },
    selectionRim: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.34)",
    },
    selectionCoreGlow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.18)",
        shadowColor: "#ffffff",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
    },
    tabItemInactive: {
        opacity: 0.76,
    },
    profileContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.26)",
    },
    profileContainerPressed: {
        transform: [{ scale: 0.985 }],
    },
    profileIcon: {
        width: "100%",
        height: "100%",
    },
});
