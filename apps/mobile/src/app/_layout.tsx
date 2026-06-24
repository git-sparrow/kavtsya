import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";

export default function RootLayout() {
  // useSession reads the SecureStore-cached session first, so a returning
  // Customer lands authenticated without a network round-trip on launch.
  const { data: session, isPending } = authClient.useSession();

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#3b2417" />
        </View>
      ) : (
        // Stack.Protected gates routes on the session: when a group's guard is
        // false the router redirects to the first available screen, so signing
        // in/out reactively swaps the auth screen for the app and back.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="index" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffaf3",
  },
});
