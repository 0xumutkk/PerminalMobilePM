import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feed } from "../../../components/social/Feed";
import { CreatePost } from "../../../components/social/CreatePost";
import { migrateFigmaPosts } from "../../../lib/migrate";
import { Image } from "expo-image";
import { Plus, Grid } from "lucide-react-native";
import { BottomProgressiveBlur } from "../../../components/ui/BottomProgressiveBlur";

export default function ExploreScreen() {
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const handlePostCreated = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setShowCreatePost(false);
  }, []);

  const router = useRouter();
  const navigation = useNavigation();

  const handleTradePress = useCallback((marketId: string) => {
    router.push({
      pathname: "/(app)/market/[id]",
      params: { id: marketId }
    });
  }, [router]);

  useEffect(() => {
    // Refresh when landing on the page
    const unsubscribeFocus = navigation.addListener('focus', () => {
      setRefreshKey(prev => prev + 1);
    });

    // Refresh when tapping the tab icon while already focused
    const unsubscribeTabPress = navigation.addListener('tabPress' as any, (e: any) => {
      if (navigation.isFocused()) {
        setRefreshKey(prev => prev + 1);
      }
    });

    return () => {
      unsubscribeFocus();
      unsubscribeTabPress();
    };
  }, [navigation]);

  React.useEffect(() => {
    // Temporary migration trigger
    migrateFigmaPosts().then(res => console.log("Migration result:", res));
  }, []);

  const ListHeaderComponent = () => (
    <>
      {showCreatePost && (
        <CreatePost onPostCreated={handlePostCreated} />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../../assets/icon.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </View>
        <Text style={styles.feedTitle}>Feed</Text>
        <TouchableOpacity style={styles.gridButton}>
          <Grid size={18} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* For You / Following Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'foryou' && styles.tabActive]}
          onPress={() => setTab('foryou')}
        >
          <Text style={[styles.tabText, tab === 'foryou' && styles.tabTextActive]}>For you</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'following' && styles.tabActive]}
          onPress={() => setTab('following')}
        >
          <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>Following</Text>
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <Feed
        key={`${tab}-${refreshKey}`}
        ListHeaderComponent={ListHeaderComponent}
        onTradePress={handleTradePress}
      />

      <BottomProgressiveBlur style={styles.bottomBlur} />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreatePost(!showCreatePost)}
      >
        <Plus size={28} color="#000" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  headerLeft: {
    width: 36,
    height: 36,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  feedTitle: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  gridButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 24,
    backgroundColor: "#fff",
  },
  tabButton: {
    paddingVertical: 14,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#000",
  },
  tabText: {
    color: "rgba(0,0,0,0.4)",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  tabTextActive: {
    color: "#000",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#34d399",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  bottomBlur: {
    zIndex: 40,
  },
});
