import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { ErrorText, Muted, OwnerBadge } from "@/components/text";
import { ScanWorkstation } from "@/features/scan/scan-workstation";
import { endMyShift } from "@/lib/api";
import { theme, useTheme } from "@/theme";

import { useMode } from "./mode-context";

/** An instant as the wall-clock time the barista reasons in. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Scanner Mode (#96, ADR 0015): a near-kiosk while a «Зміна» is active — the
 * shared counter workstation (scan + Redemption confirm) framed by the shift
 * banner and one exit, «Завершити зміну». Because an active grant pins the app
 * to this Mode, exiting must actually END the grant (not just leave a screen);
 * ending it makes `/api/me/shift` go null, so the app re-derives back to the
 * barista's own Customer or CafeOwner Mode. There is deliberately no QR, no
 * Settings, no sign-out here — those require ending the shift first.
 */
export function ScannerMode() {
  const t = useTheme();
  const { shift, reloadShift } = useMode();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: the dispatcher only shows this Mode when a shift is active, but keep
  // the type honest.
  if (!shift) return null;

  async function endShift() {
    setEnding(true);
    setError(null);
    try {
      await endMyShift();
      // Re-derive: with no active shift the app drops out of the kiosk on its own.
      await reloadShift();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завершити зміну");
      setEnding(false);
    }
  }

  return (
    <ScanWorkstation
      cafeId={shift.cafeId}
      header={
        <View
          style={[
            styles.banner,
            { borderColor: t.c["border-strong"], borderRadius: t.radius.md },
          ]}
        >
          <OwnerBadge>Зміна — {shift.cafeName}</OwnerBadge>
          <Muted>до {timeOf(shift.expiresAt)}</Muted>
        </View>
      }
      exit={
        <>
          <Button
            title="Завершити зміну"
            variant="secondary"
            busy={ending}
            onPress={() => void endShift()}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    gap: 2,
  },
});
