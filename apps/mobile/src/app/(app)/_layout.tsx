import { Stack } from "expo-router";

import { MeProvider } from "@/features/account/me-context";
import { ModeProvider } from "@/features/mode/mode-context";

/**
 * Catches what the screens' own boundaries cannot: a throw in this layout or its
 * providers. The whole signed-in stack is gone at that point, so there is no
 * «Назад» to offer, only another try.
 */
export { RenderErrorFallback as ErrorBoundary } from "@/components/render-error-fallback";

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
