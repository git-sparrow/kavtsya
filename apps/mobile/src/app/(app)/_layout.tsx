import { Stack } from "expo-router";

import { MeProvider } from "@/features/account/me-context";
import { ModeProvider } from "@/features/mode/mode-context";

/**
 * The authenticated area. Wraps every signed-in screen in the MeProvider (the
 * account, loaded once and shared) and the ModeProvider (the derived Role Mode,
 * ADR 0015 — it reads the account + active shift and owns the excursion
 * override). Native headers are hidden; each screen carries its own brand
 * wordmark + back controls.
 */
export default function AppLayout() {
  return (
    <MeProvider>
      <ModeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ModeProvider>
    </MeProvider>
  );
}
