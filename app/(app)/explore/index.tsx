import React, { useState, useCallback } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feed } from "../../../components/social/Feed";
import { CreatePost } from "../../../components/social/CreatePost";
import { Image } from "expo-image";
import { Plus, Grid } from "lucide-react-native";

export default function ExploreScreen() {
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreatePost, setShowCreatePost] = useState(false);

  const handlePostCreated = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setShowCreatePost(false);
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
          <Grid size={18} color="#000" strokeWidth={2.5} />
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
      />

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
    backgroundColor: "#000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#000",
  },
  headerLeft: {
    width: 36,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  feedTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  gridButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 24,
    backgroundColor: "#000",
  },
  tabButton: {
    paddingVertical: 14,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#fff",
  },
  tabText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  tabTextActive: {
    color: "#fff",
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
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
});
