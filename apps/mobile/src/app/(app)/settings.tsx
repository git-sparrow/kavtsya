import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { BackHeader } from "@/components/back-header";
import { Badge } from "@/components/badge";
import {
  ListGroup,
  ListRow,
  RadioRow,
  RadioRowGroup,
  ToggleRow,
} from "@/components/list-row";
import { Screen } from "@/components/screen";
import { Surface } from "@/components/surface";
import { ErrorText, Muted, SectionLabel } from "@/components/text";
import {
  DeleteAccountDialog,
  useDeleteAccount,
} from "@/features/account/delete-account";
import { useMe } from "@/features/account/me-context";
import { useMode } from "@/features/mode/mode-context";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { updatePushConsent } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  fontFamily,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from "@/theme";

/**
/** The identity card (4a): avatar monogram, name, email, and the owner badge. */
function IdentityCard({
  name,
  email,
  owner,
}: {
  name: string;
  email: string;
  owner: boolean;
}) {
  const t = useTheme();
  return (
    <Surface
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[3],
        padding: t.space[4],
        borderRadius: t.radius.md,
      }}
    >
      <Avatar name={name} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: fontFamily.body.bold,
            color: t.c.foreground,
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
          }}
        >
          {email}
        </Text>
      </View>
      {owner ? <Badge label="КАВОВАР" /> : null}
    </Surface>
  );
}

/** A labelled settings group — an 11px/700 ls1.5 kicker over a `ListGroup`. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: "stretch", gap: t.space[2] }}>
      <SectionLabel style={{ letterSpacing: 1.5, marginLeft: t.space[1] }}>
        {label}
      </SectionLabel>
      {children}
    </View>
  );
}

/** The three ВИГЛЯД rows, in the order they appear (10a). */
const APPEARANCE_OPTIONS: {
  value: ThemePreference;
  icon: "phone" | "sun" | "moon";
  title: string;
  caption?: string;
}[] = [
  {
    value: "system",
    icon: "phone",
    title: "Системна",
    caption: "Слідує за налаштуванням телефона",
  },
  { value: "light", icon: "sun", title: "Світла" },
  { value: "dark", icon: "moon", title: "Темна" },
];

/**
 * ВИГЛЯД (#162, turn 10a): the three-way theme choice, identical for both roles
 * and placed directly under the identity card. It applies on tap — no confirm,
 * no restart — so this very screen repaints as its own live preview.
 *
 * Three options rather than a «Темна тема» switch: a binary can't express «як у
 * системі», so anyone whose phone dims itself in the evening would be flipping
 * it by hand twice a day (10b, rejected).
 */
function AppearanceSection() {
  const { preference, setPreference } = useThemePreference();
  return (
    <Section label="Вигляд">
      <RadioRowGroup label="Вигляд">
        {APPEARANCE_OPTIONS.map((option) => (
          <RadioRow
            key={option.value}
            testID={`settings.appearance.${option.value}`}
            icon={option.icon}
            title={option.title}
            caption={option.caption}
            selected={preference === option.value}
            onSelect={() => setPreference(option.value)}
          />
        ))}
      </RadioRowGroup>
      <Muted style={{ textAlign: "left" }}>
        Ворожка завжди приходить у темному — це її магія, незалежно від теми.
      </Muted>
    </Section>
  );
}

/**
 * Settings (#96, ADR 0015; redesign turn 4, screens 4a–4c): the excursion drawer
 * where identity, appearance, notifications, role transitions, and account
 * actions live — so the Mode surfaces stay uncluttered. The email lives HERE now
 * (moved off the Customer home). Renders in the theme chosen right here, in
 * ВИГЛЯД (#162; 4a/4b light, 4c dark).
 *
 * «Видалити акаунт» closes the АКАУНТ section for both roles (#143, screens
 * 6b/7d) now that #81's endpoint exists — the row opens the confirm, and the
 * confirm is where the consequences are named. Deletion is never blocked, not
 * even for a CafeOwner: transfer is post-v1 (#160, ADR 0014).
 */
export default function Settings() {
  const t = useTheme();
  const { me, reload } = useMe();
  const { mode, switchTo, clearExcursion } = useMode();
  const deletion = useDeleteAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = me?.roles.includes("cafe_owner") ?? false;

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await updatePushConsent(next);
      await reload();
      // Fire-and-forget, AFTER the UI state settled: the token fetch can hang
      // where push isn't supported (Expo Go) and must never freeze the switch.
      if (next) void registerDeviceForPush();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти вибір");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <Screen
        header={<BackHeader title="Налаштування" testID="settings.back" />}
      >
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={t.c.foreground} />
        </View>
      </Screen>
    );
  }

  // The café-news toggle — same anatomy in both layouts, placed per the mocks
  // (before РОЛІ for a Customer, after МОЇ КАВ'ЯРНІ + РОЛІ for an owner).
  const notifications = (
    <Section label="Сповіщення">
      <ListGroup>
        <ToggleRow
          testID="settings.push-consent"
          title="Новини від кав'ярень"
          caption="Push лише від кав'ярень, де ти буваєш"
          value={me.pushConsent}
          disabled={busy}
          onValueChange={(next) => void toggle(next)}
        />
      </ListGroup>
      {error ? (
        <ErrorText style={{ textAlign: "left" }}>{error}</ErrorText>
      ) : null}
    </Section>
  );

  // Leaving, in both its sizes: the reversible exit and the permanent one. The
  // delete row only OPENS the question — it fetches what deletion would cost
  // and hands it to the confirm (#81, #143), which is the only place the
  // account can actually answer.
  const account = (
    <Section label="Акаунт">
      <ListGroup>
        <ListRow
          testID="settings.sign-out"
          icon="logout"
          title="Вийти"
          chevron={false}
          onPress={() => void authClient.signOut()}
        />
        <ListRow
          testID="settings.delete-account"
          icon="trash"
          title="Видалити акаунт"
          tone="danger"
          chevron={false}
          // Fetching the inventory is the first half of the tap; the row stays
          // frozen (and says so) until the confirm can open with real numbers.
          disabled={deletion.loading}
          onPress={() => void deletion.open()}
        />
      </ListGroup>
      {deletion.error ? (
        <ErrorText style={{ textAlign: "left" }}>{deletion.error}</ErrorText>
      ) : null}
    </Section>
  );

  return (
    <Screen header={<BackHeader title="Налаштування" testID="settings.back" />}>
      <IdentityCard name={me.name} email={me.email} owner={isOwner} />

      {/* Same rows in the same place for both roles (10a): the theme is a
          property of the person holding the phone, not of the role they run. */}
      <AppearanceSection />

      {isOwner ? (
        <>
          <Section label="Мої кав'ярні">
            <ListGroup>
              {me.cafes.map((cafe) => (
                <ListRow
                  key={cafe.id}
                  testID={`settings.cafe.${cafe.id}`}
                  icon="storefront"
                  title={cafe.name}
                  onPress={() =>
                    router.push({
                      pathname: "/owner/[cafeId]",
                      params: { cafeId: cafe.id },
                    })
                  }
                />
              ))}
              <ListRow
                testID="settings.register-cafe"
                icon="plus"
                title="Зареєструвати ще одну"
                chevron={false}
                onPress={() => router.push("/cafe/register")}
              />
            </ListGroup>
          </Section>

          <Section label="Ролі">
            <ListGroup>
              {mode === "customer" ? (
                <ListRow
                  testID="settings.owner-mode"
                  icon="storefront"
                  title="Повернутися в режим Кавовара"
                  chevron={false}
                  onPress={() => {
                    clearExcursion();
                    router.back();
                  }}
                />
              ) : (
                <ListRow
                  testID="settings.customer-mode"
                  icon="user"
                  title="Мій профіль клієнта"
                  caption="Твій QR і зернятка — як у Customer Mode"
                  onPress={() => {
                    switchTo("customer");
                    router.back();
                  }}
                />
              )}
            </ListGroup>
          </Section>

          {notifications}
          {account}
        </>
      ) : (
        <>
          {notifications}

          <Section label="Ролі">
            <ListGroup>
              <ListRow
                testID="settings.become-owner"
                icon="storefront"
                title="Стати Кавоваром"
                onPress={() => router.push("/cafe/register")}
              />
              <ListRow
                testID="settings.join-cafe"
                icon="scan"
                title="Приєднатися до кав'ярні"
                onPress={() => router.push("/shift/request")}
              />
            </ListGroup>
            <Muted style={{ textAlign: "left" }}>
              Реєструєш свою кав&apos;ярню — відкривається Режим Кавовара.
              Бариста? Скануй постер кав&apos;ярні, щоб почати Зміну.
            </Muted>
          </Section>

          {account}
        </>
      )}

      <DeleteAccountDialog
        preview={deletion.preview}
        deleting={deletion.deleting}
        onConfirm={() => void deletion.confirm()}
        onCancel={deletion.cancel}
      />
    </Screen>
  );
}
