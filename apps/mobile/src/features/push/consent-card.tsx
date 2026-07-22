import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Berehynia } from "@/components/berehynia";
import { Button } from "@/components/button";
import { Surface } from "@/components/surface";
import { useMe } from "@/features/account/me-context";
import { useBalances } from "@/features/loyalty/use-balances";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { updatePushConsent } from "@/lib/api";
import { fontFamily, useTheme } from "@/theme";

/**
 * Whether THIS account already answered the consent question on this device —
 * keyed per account (the #91 lesson), so a shared phone never inherits the
 * previous user's "already asked".
 */
function decidedKeyFor(userId: string): string {
  return `kavtsya.push_consent_decided.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/**
 * The café-news consent prompt (#24): asked at the moment of demonstrated
 * value — after the Customer's FIRST earned Зернятко — never at first app
 * open. Renders nothing until that moment, and never again once answered
 * (either way); the settings toggle is where minds change later.
 */
export function ConsentCard() {
  const t = useTheme();
  const { me, reload } = useMe();
  const { balances } = useBalances();
  const userId = me?.id;
  const [decided, setDecided] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void SecureStore.getItemAsync(decidedKeyFor(userId)).then((stored) => {
      if (active) setDecided(stored !== null);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const hasEarned = (balances?.length ?? 0) > 0;
  // Consent set elsewhere (another device) counts as decided too.
  if (!me || !userId || !hasEarned || decided !== false || me.pushConsent) {
    return null;
  }

  async function answer(consent: boolean) {
    setBusy(true);
    try {
      await updatePushConsent(consent);
      await SecureStore.setItemAsync(
        decidedKeyFor(userId!),
        consent ? "yes" : "no",
      );
      setDecided(true);
      await reload();
      // Fire-and-forget, AFTER the UI state settled: the token fetch can hang
      // where push isn't supported (Expo Go) and must never strand the screen.
      if (consent) void registerDeviceForPush();
    } catch {
      // Couldn't save — leave the card up; the next tap retries.
      setBusy(false);
    }
  }

  return (
    <Surface emphasis="promise" style={{ gap: t.space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Berehynia size={18} />
        <Text
          style={{
            fontSize: t.font.size.lg,
            fontFamily: fontFamily.body.semibold,
            color: t.c.foreground,
          }}
        >
          Перше зернятко!
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13.5,
          lineHeight: 20,
          fontFamily: fontFamily.body.regular,
          color: t.c["text-secondary"],
        }}
      >
        Хочеш новини і подарунки від твоїх кав&apos;ярень? Лише від тих, де ти
        буваєш — і це завжди можна вимкнути в налаштуваннях.
      </Text>
      <Button
        title="Хочу новини й подарунки"
        busy={busy}
        onPress={() => void answer(true)}
      />
      <Button
        title="Ні, дякую"
        variant="quiet"
        disabled={busy}
        onPress={() => void answer(false)}
      />
    </Surface>
  );
}
