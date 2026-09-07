import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

import { Berehynia } from "@/components/berehynia";
import { Icon } from "@/components/icon";
import { Screen } from "@/components/screen";
import { Heading, SectionLabel } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CafeBalances } from "@/features/loyalty/cafe-balances";
import { CustomerQr } from "@/features/loyalty/customer-qr";
import { usePendingFortune } from "@/features/loyalty/use-pending-fortune";
import { VorozhkaReveal } from "@/features/loyalty/vorozhka-reveal";
import { ConsentCard } from "@/features/push/consent-card";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { useTheme } from "@/theme";

/** The greeting + settings row that replaces the brand logo on home (1a). */
function HomeHeader({ name }: { name: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: t.space[3],
      }}
    >
      <Heading size={23} accessibilityRole="header" style={{ flexShrink: 1 }}>
        Вітаємо, {name}!
      </Heading>
      <Pressable
        testID="customer-home.settings"
        accessibilityRole="button"
        accessibilityLabel="Налаштування"
        hitSlop={8}
        onPress={() => router.push("/settings")}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: t.radius.full,
        }}
      >
        <Icon name="settings" size={22} color={t.c["text-secondary"]} />
      </Pressable>
    </View>
  );
}

/** «МОЇ КАВ'ЯРНІ» with the small Берегиня mark that prefixes it (1a). */
function CafeSectionLabel() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
      }}
    >
      <Berehynia size={13} />
      <SectionLabel style={{ letterSpacing: 1.5 }}>
        Мої кав&apos;ярні
      </SectionLabel>
    </View>
  );
}

/**
 * Customer Mode (#96, ADR 0015): the clean identity surface for a plain
 * Customer — their QR/member code, their Зернятка balances, the #24 consent
 * moment, and the way into Settings. Nothing role-specific ever appears here:
 * becoming an owner or a barista lives in Settings, so this screen never
 * accretes another role's clutter.
 *
 * The redesign (turn 1) drops the brand logo (greeting + settings icon instead),
 * moves the raw email to Settings, and renders in the theme chosen in Settings →
 * ВИГЛЯД — the home was designed in both themes (1a/1b …).
 */
export function CustomerMode() {
  const { me } = useMe();
  // The Ворожка reveal (#23): appears when the CafeOwner scans (the Customer is
  // holding their QR up — the natural moment).
  const { fortune, dismiss } = usePendingFortune();

  // Token upkeep (#24): a consenting account refreshes this device's push token
  // on arrival, so a rotated token re-homes itself without user action.
  const consentsToPush = me?.pushConsent ?? false;
  useEffect(() => {
    if (consentsToPush) void registerDeviceForPush();
  }, [consentsToPush]);

  return (
    <>
      <Screen header={<HomeHeader name={me?.name || me?.email || ""} />}>
        <CustomerQr />

        {/* The café-news moment (#24): asked once, after the first Зернятко. */}
        <ConsentCard />

        <CafeSectionLabel />
        <CafeBalances reloadSignal={fortune?.id ?? null} />
      </Screen>
      {fortune ? (
        <VorozhkaReveal fortune={fortune} onDismiss={dismiss} />
      ) : null}
    </>
  );
}
