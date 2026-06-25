import type { ComponentProps } from "react";
import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors } from "@/src/theme";

type TabsProps = ComponentProps<typeof Tabs>;

/** Shared look for both the admin and portal tab bars. */
export const tabScreenOptions: TabsProps["screenOptions"] = {
  headerShown: false,
  sceneStyle: { backgroundColor: colors.background },
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: "600",
  },
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
};

/** A light selection tick when switching tabs. No-op on web. */
export const tabPressListeners = {
  tabPress: () => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }
  },
};
