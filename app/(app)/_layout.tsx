import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { ProfileSync } from "../../components/ProfileSync";
import { CustomTabBar } from "../../components/CustomTabBar";
import { StripeBackground } from "../../components/StripeBackground";

export default function AppLayout() {
    return (
        <View style={styles.root}>
            <StripeBackground />
            <ProfileSync />
            <Tabs
                tabBar={(props) => <CustomTabBar {...props} />}
                screenOptions={{
                    headerShown: false,
                    tabBarShowLabel: false,
                    sceneStyle: styles.scene,
                }}
            >
                <Tabs.Screen name="index" options={{ title: "Home" }} />
                <Tabs.Screen name="leaderboard/index" options={{ title: "Leaderboard" }} />
                <Tabs.Screen name="explore/index" options={{ title: "Explore" }} />
                <Tabs.Screen name="search/index" options={{ title: "Search" }} />
                <Tabs.Screen name="profile/index" options={{ title: "Profile" }} />
                <Tabs.Screen
                    name="market/[id]"
                    options={{
                        href: null,
                        tabBarStyle: { display: "none" },
                    }}
                />
                <Tabs.Screen
                    name="profile/[id]"
                    options={{
                        href: null,
                        tabBarStyle: { display: "none" },
                    }}
                />
            </Tabs>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scene: {
        backgroundColor: "transparent",
    },
});
