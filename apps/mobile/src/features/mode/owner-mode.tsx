import type { OwnerCafe } from "@kavtsya/shared";
import { router } from "expo-router";
import { Pressable, Text, useColorScheme, View } from "react-native";

import { Icon } from "@/components/icon";
import { ListGroup, ListRow } from "@/components/list-row";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import { Heading, Muted } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CLIENT_FORMS, pluralizeUk } from "@/lib/plural";
import { fontFamily, ThemeProvider, useTheme } from "@/theme";

/**
 * The single free teaser stat (#25, ADR 0011) — the café-home number every
 * owner sees, Free and Pro alike: how many Customers came back in 30 days.
 */
function ReturningStat({ count }: { count: number }) {
  const t = useTheme();
  return (
    // Same card chrome as the menu groups below — reuse ListGroup rather than
    // re-declaring surface/border/radius/shadow.
    <ListGroup>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: t.space[3],
          minHeight: 52,
          paddingHorizontal: t.space[4],
          paddingVertical: t.space[3],
        }}
      >
        <Icon name="people" size={22} color={t.c["text-secondary"]} />
        <Text
          style={{
            flex: 1,
            fontSize: t.font.size.base,
            fontFamily: fontFamily.body.medium,
            color: t.c["text-secondary"],
          }}
        >
          {count} {pluralizeUk(count, CLIENT_FORMS)} повернулися за 30 днів
        </Text>
      </View>
    </ListGroup>
  );
}

/**
 * The 56pt hero (3a): the one action a barista reaches for every sale. A local
 * one-off (icon + label, taller than a standard CTA) rather than a Button
 * variant — the catalog keeps it a style override, not a new size in the
 * primitive.
 */
function ScanHeroButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const title = "Сканувати QR клієнта";
  return (
    <Pressable
      testID="owner-scan"
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: t.space[3],
        minHeight: 56,
        borderRadius: t.radius.md,
        backgroundColor: t.c.primary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon
        name="scan"
        size={24}
        color={t.c["primary-foreground"]}
        strokeWidth={2}
      />
      <Text
        style={{
          fontSize: t.font.size.lg,
          fontFamily: fontFamily.body.bold,
          color: t.c["primary-foreground"],
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * One Café's operator surface (3a): the free stat, the scan hero, then two
 * grouped menus — management (always available) and growth (Pro, but the row
 * still opens the pitch, never a hard block — ADR 0011). The Café name repeats
 * as a heading only when the owner runs more than one Café; with one, the role
 * header already carries it.
 */
function OwnerCafeHome({
  cafe,
  showName,
}: {
  cafe: OwnerCafe;
  showName: boolean;
}) {
  const t = useTheme();
  const go = (
    pathname:
      | "/owner/scan"
      | "/owner/[cafeId]"
      | "/owner/shifts"
      | "/owner/roster"
      | "/owner/campaigns"
      | "/owner/analytics",
  ) => router.push({ pathname, params: { cafeId: cafe.id } });
  return (
    <View style={{ alignSelf: "stretch", gap: t.space[4] }}>
      {showName ? (
        <Heading size={22} accessibilityRole="header">
          {cafe.name}
        </Heading>
      ) : null}
      <ReturningStat count={cafe.returningCustomers30d} />
      <ScanHeroButton onPress={() => go("/owner/scan")} />
      <ListGroup>
        <ListRow
          testID="owner-program"
          icon="settings"
          title="Програма лояльності"
          onPress={() => go("/owner/[cafeId]")}
        />
        <ListRow
          testID="owner-shifts"
          icon="clock"
          title="Зміни"
          onPress={() => go("/owner/shifts")}
        />
        <ListRow
          testID="owner-roster"
          icon="people"
          title="Ростер бариста"
          onPress={() => go("/owner/roster")}
        />
      </ListGroup>
      <ListGroup>
        <ListRow
          testID="owner-campaigns"
          icon="megaphone"
          title="Розсилка"
          badge="PRO"
          onPress={() => go("/owner/campaigns")}
        />
        <ListRow
          testID="owner-analytics"
          icon="chart"
          title="Аналітика"
          badge="PRO"
          onPress={() => go("/owner/analytics")}
        />
      </ListGroup>
    </View>
  );
}

/**
 * CafeOwner Mode (#96, ADR 0015): the owner's default landing — their Cafés and
 * the operator controls for each (scan a Customer, tune the program, run a
 * «Зміна», send a Розсилка). Owner-primary: reaching their own Customer Mode is
 * a Settings excursion, not a button here, so the operator surface stays focused
 * on running the café.
 *
 * The redesign (turn 3) drops the logo for a role header, groups the controls
 * into menu lists, and — like the Customer and scan surfaces — follows the OS
 * colour scheme (3a light / 3d dark).
 */
export function OwnerMode() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const { me } = useMe();
  const cafes = me?.cafes ?? [];
  const single = cafes.length === 1;

  return (
    <ThemeProvider theme={scheme}>
      <Screen
        header={
          <RoleHeader
            kicker="Режим Кавовара"
            title={single ? cafes[0].name : "Мої кав'ярні"}
            action={{
              icon: "settings",
              label: "Налаштування",
              testID: "owner-settings",
              onPress: () => router.push("/settings"),
            }}
          />
        }
      >
        {cafes.map((cafe) => (
          <OwnerCafeHome key={cafe.id} cafe={cafe} showName={!single} />
        ))}
        <View style={{ flex: 1 }} />
        <Muted>Твій особистий профіль — у Налаштуваннях</Muted>
      </Screen>
    </ThemeProvider>
  );
}
