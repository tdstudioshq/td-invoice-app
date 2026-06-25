import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoadingState } from "@/src/components/ui";
import { AuthProvider, useAuth } from "@/src/providers/auth-provider";
import { BiometricProvider } from "@/src/providers/biometric-provider";
import { colors } from "@/src/theme";

function RootNavigator() {
  const { loading, role, session } = useAuth();

  if (loading) return <LoadingState label="Starting TD Studios…" />;

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
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role === "admin")}>
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session && role === "portal")}>
        <Stack.Screen name="(portal)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <BiometricProvider>
          <RootNavigator />
        </BiometricProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
