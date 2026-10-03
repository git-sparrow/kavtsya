import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { NoticeBanner } from "@/components/notice-banner";
import { Screen } from "@/components/screen";
import { ErrorText } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CustomerMode } from "@/features/mode/customer-mode";
import { useMode } from "@/features/mode/mode-context";
import { OwnerMode } from "@/features/mode/owner-mode";
import { ScannerMode } from "@/features/mode/scanner-mode";
import { authClient } from "@/lib/auth-client";
import { useScreenAction } from "@/lib/use-screen-action";
import { useTheme } from "@/theme";

/**
 * What a failed shift check actually costs, in the second line of its banner
 * (#187).
 *
 * Phrased as a condition because the app cannot scope the banner to the people
 * it is for: roster membership is not a role, so `/api/me` says «customer» for a
 * barista and a customer alike, and the failed read is exactly the answer that
 * would have told them apart. «Якщо ви на зміні» is how a Customer reads past a
 * Mode's vocabulary that was never theirs (ADR 0015), while the barista who
 * needs it still gets told what is missing.
 */
const SHIFT_CHECK_FAILED_DETAIL = "Якщо ви на зміні, сканер поки недоступний.";

/**
 * The Mode dispatcher (#96, ADR 0015). The app opens here and renders exactly
 * one of the three surfaces, chosen fresh from live account facts — active
 * Shift → Scanner; else CafeOwner → CafeOwner; else Customer. Nothing is
 * persisted: the landing re-derives on every focus (a returning excursion, a
 * finished sub-screen, a foreground), so the visible Mode never lags server
 * truth.
 */
export default function Home() {
  const t = useTheme();
  const { me, error, reload } = useMe();
  const {
    mode,
    loading,
    shift,
    shiftError,
    reloadShift,
    endedNotice,
    dismissEndedNotice,
  } = useMode();
  // The shift check gets the same treatment every other read in the app gets:
  // one line, dismissible per message, so waving it away once doesn't hide the
  // next failure — and the focus refetch below can't re-raise the one they just
  // dismissed either.
  const shiftCheck = useScreenAction({ error: shiftError });

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadShift();
    }, [reload, reloadShift]),
  );

  if (error) {
    return (
      <Screen>
        <Card>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
          />
          <Button
            title="Вийти"
            variant="secondary"
            onPress={() => authClient.signOut()}
          />
        </Card>
      </Screen>
    );
  }

  if (loading || !me) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={t.c.foreground} />
      </Screen>
    );
  }

  const surface =
    mode === "scanner" ? (
      <ScannerMode />
    ) : mode === "owner" ? (
      <OwnerMode />
    ) : (
      <CustomerMode />
    );

  return (
    <>
      {surface}
      {/* A shift just ended (#99): the app has already re-derived to the
          barista's default Mode; this only tells them why the kiosk is gone
          (owner ended it, removed them, or the cap lapsed). It belongs to the
          Mode they dropped back to — never over the kiosk (a fresh shift means
          nothing to announce). */}
      {endedNotice && mode !== "scanner" && (
        <NoticeBanner
          intent="info"
          title={`Зміну в «${endedNotice}» завершено.`}
          onDismiss={dismissEndedNotice}
        />
      )}
      {/* What a failed shift check costs, said out loud (#187): with no answer
          the app derives the default Mode rather than spinning forever, so "no
          answer" and "off duty" look identical — this is the difference made
          visible. Only when the failure actually cost something: a refresh that
          fails over a shift already on screen keeps showing real data (the hook
          holds the last answer), so there is nothing to warn about. Both
          notices want the same slot, and the ended notice is the more specific
          news; it clears itself in a few seconds, after which this one takes
          the space if it is still true. */}
      {shiftCheck.error && shift == null && !endedNotice && (
        <NoticeBanner
          testID="home.shift-check-failed"
          intent="danger"
          title={shiftCheck.error}
          detail={SHIFT_CHECK_FAILED_DETAIL}
          onDismiss={shiftCheck.clear}
          action={
            <Button
              title="Спробувати знову"
              variant="secondary"
              testID="home.shift-check-failed.retry"
              busy={shiftCheck.busy}
              onPress={() =>
                void shiftCheck.run(reloadShift, "Не вдалося перевірити зміну")
              }
            />
          }
        />
      )}
    </>
  );
}
