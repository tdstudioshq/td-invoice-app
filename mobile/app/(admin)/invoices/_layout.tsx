import { Stack } from "expo-router";

import { colors } from "@/src/theme";

export default function InvoicesLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Invoice" }} />
      <Stack.Screen name="new" options={{ title: "New invoice" }} />
      <Stack.Screen name="edit" options={{ title: "Edit invoice" }} />
    </Stack>
  );
}
