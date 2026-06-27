import { Stack } from "expo-router";

import { MeProvider } from "@/features/account/me-context";

/**
 * The authenticated area. Wraps every signed-in screen in the MeProvider so the
 * account is loaded once and shared, and hides native headers (each screen
 * carries its own brand wordmark + back controls).
 */
export default function AppLayout() {
  return (
    <MeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MeProvider>
  );
}
