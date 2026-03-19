import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feed } from "../../../components/social/Feed";
import { CreatePost } from "../../../components/social/CreatePost";
import { Image } from "expo-image";
import { Plus, Grid } from "lucide-react-native";
import { BottomProgressiveBlur } from "../../../components/ui/BottomProgressiveBlur";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

export default function ExploreScreen() {
  const [tab, setTab] = useState<"for_you" | "following">("for_you");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [tabContainerWidth, setTabContainerWidth] = useState(0);

  const handlePostCreated = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setShowCreatePost(false);
  }, []);

  const navigation = useNavigation();

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

  const underlineOffset = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  useEffect(() => {
    if (!tabContainerWidth) return;

    const segmentWidth = tabContainerWidth / 2;
    underlineWidth.value = withSpring(segmentWidth, {
      damping: 18,
      stiffness: 200,
      mass: 0.85,
    });
    underlineOffset.value = withSpring(tab === "for_you" ? 0 : segmentWidth, {
      damping: 18,
      stiffness: 200,
      mass: 0.85,
    });
  }, [tab, tabContainerWidth, underlineOffset, underlineWidth]);

  const animatedUnderlineStyle = useAnimatedStyle(() => ({
    width: underlineWidth.value,
    transform: [{ translateX: underlineOffset.value }],
  }));

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
      <View
        style={styles.tabContainer}
        onLayout={(event) => setTabContainerWidth(event.nativeEvent.layout.width)}
      >
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setTab("for_you")}
        >
          <Text style={[styles.tabText, tab === "for_you" && styles.tabTextActive]}>For you</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setTab('following')}
        >
          <Text style={[styles.tabText, tab === 'following' && styles.tabTextActive]}>Following</Text>
        </TouchableOpacity>
        <Animated.View style={[styles.tabUnderline, animatedUnderlineStyle]} />
      </View>

      {/* Feed */}
      <Feed
        key={`${tab}-${refreshKey}`}
        mode={tab}
      />

      <BottomProgressiveBlur style={styles.bottomBlur} />

      <Modal
        visible={showCreatePost}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreatePost(false)}
      >
        <View style={styles.createPostOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreatePost(false)} />
          <View style={styles.createPostSheet}>
            <CreatePost onPostCreated={handlePostCreated} />
          </View>
        </View>
      </Modal>

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
    backgroundColor: "#fff",
    position: "relative",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
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
  tabUnderline: {
    position: "absolute",
    left: 16,
    bottom: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#000",
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
  createPostOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "flex-start",
  },
  createPostSheet: {
    marginTop: 110,
    marginHorizontal: 12,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 10,
  },
});
