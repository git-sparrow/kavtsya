import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";
import { ThemeProvider, fontAssets } from "@/theme";

// Hold the splash until both the cached session and the brand fonts resolve, so
// the app never flashes a wrong-font or signed-out frame on launch.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // useSession reads the SecureStore-cached session first, so a returning
  // Customer lands authenticated without a network round-trip on launch.
  const { data: session, isPending } = authClient.useSession();
  // A font failure shouldn't wedge launch — fall through to system fonts.
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const ready = !isPending && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null; // splash stays up until the app is ready to paint

  return (
    <ThemeProvider theme="light">
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {/* Stack.Protected gates routes on the session: when a group's guard is
            false the router redirects to the first available screen, so signing
            in/out reactively swaps the auth screen for the app and back. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
