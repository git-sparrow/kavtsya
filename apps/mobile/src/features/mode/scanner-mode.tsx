import type { Shift } from "@kavtsya/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { ErrorText, SectionLabel } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { ScanWorkstation } from "@/features/scan/scan-workstation";
import { endMyShift } from "@/lib/api";
import { fontFamily, useTheme } from "@/theme";

import { useMode } from "./mode-context";

/**
 * The Scanner Mode banner (2g/2l): «ЗМІНА · {Café}» over the barista's name.
 * No expiry time (design decision — the cap is invisible upkeep, not a countdown
 * the barista should watch). It rides inside the workstation's theme provider,
 * so it themes with the rest of the screen: indigo `secondary` fill in light,
 * `surface` + `border` in dark (where `secondary` is lavender, not a fill).
 */
function ShiftBanner({ shift, name }: { shift: Shift; name: string }) {
  const t = useTheme();
  const onDark = t.themeName === "dark";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[3],
        backgroundColor: onDark ? t.c.surface : t.c.secondary,
        borderWidth: onDark ? 1 : 0,
        borderColor: t.c.border,
        borderRadius: t.radius.md,
        paddingVertical: t.space[3],
        paddingHorizontal: t.space[4],
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <SectionLabel
          style={{
            letterSpacing: 2,
            color: onDark ? t.c.foreground : t.color.neutral[100],
          }}
        >
          Зміна · {shift.cafeName}
        </SectionLabel>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 16,
            fontFamily: fontFamily.body.semibold,
            color: onDark ? t.c.foreground : t.color.neutral[100],
          }}
        >
          {name}
        </Text>
      </View>
      <Berehynia size={16} />
    </View>
  );
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
  const { me } = useMe();
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
      header={<ShiftBanner shift={shift} name={me?.name || me?.email || ""} />}
      exit={
        <>
          <Button
            title="Завершити зміну"
            variant="secondary"
            testID="scanner.end-shift"
            busy={ending}
            onPress={() => void endShift()}
          />
          {error && <ErrorText testID="scanner.error">{error}</ErrorText>}
        </>
      }
    />
  );
}
