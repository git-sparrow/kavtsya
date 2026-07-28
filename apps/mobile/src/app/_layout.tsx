import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";
import { ThemePreferenceProvider, fontAssets } from "@/theme";

// Hold the splash until both the cached session and the brand fonts resolve, so
// the app never flashes a wrong-font or signed-out frame on launch.
SplashScreen.preventAutoHideAsync();

/**
 * The theme wraps everything, including the splash gate: the provider renders
 * nothing until the remembered ВИГЛЯД choice is read off the device (#162), and
 * the splash is only hidden from inside it — so the first painted frame is
 * already in the Customer's theme, never a light flash before a dark one.
 */
export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <RootShell />
    </ThemePreferenceProvider>
  );
}

function RootShell() {
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
  );
}
