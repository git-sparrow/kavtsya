import type { CampaignResult } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Text, useColorScheme, View } from "react-native";

import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Heading, Muted } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMe } from "@/features/account/me-context";
import { sendCampaign } from "@/lib/api";
import { fontFamily, ThemeProvider, useTheme } from "@/theme";

/** Where a Free owner reaches Kavtsya about Pro — Telegram-first (grilling 2026-07-10). */
const KAVTSYA_TELEGRAM_URL = "https://t.me/kavtsya";
const KAVTSYA_EMAIL = "hello@kavtsya.app";

/** The API caps the message at 200 — mirror it so the counter is honest. */
const MESSAGE_LIMIT = 200;

/**
 * The campaigns screen (#24, ADR 0011; redesign turn 5a): on Pro — write a short
 * message, one tap, and it reaches the Café's recently-active Customers who opted
 * into café news. On Free — the same section as a pitch: what Pro buys (serif
 * headline + benefit checklist), the price strip (ADR 0011 — «від ₴390/міс», 14
 * днів безкоштовно), and the Telegram-first contact CTA the Platform answers to
 * flip the flag by hand. Follows the OS colour scheme like the rest of the owner
 * surface (5a light / 5g dark).
 */
export default function OwnerCampaigns() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider theme={scheme}>
      <OwnerCampaignsBody />
    </ThemeProvider>
  );
}

/** One benefit line in the pitch: a green check glyph + the promise. */
function Benefit({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space[3] }}>
      <Icon name="check" size={20} color={t.c.success} strokeWidth={2.4} />
      <Text
        style={{
          flex: 1,
          fontSize: t.font.size.base,
          lineHeight: t.font.size.base * t.font.lineHeight.snug,
          fontFamily: fontFamily.body.regular,
          color: t.c.foreground,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/** The «Pro — від ₴390/міс · 14 днів безкоштовно» price strip (ADR 0011). */
function PriceStrip() {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Pro — від 390 гривень на місяць. 14 днів безкоштовно."
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: t.space[4],
        backgroundColor: t.c["accent-surface"],
        borderRadius: t.radius.md,
        paddingVertical: t.space[4],
        paddingHorizontal: t.space[5],
      }}
    >
      <Text
        style={{
          fontSize: t.font.size.lg,
          fontFamily: fontFamily.body.bold,
          color: t.c.foreground,
        }}
      >
        Pro — від ₴390/міс
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: t.font.size.sm,
          fontFamily: fontFamily.body.semibold,
          color: t.c["text-secondary"],
        }}
      >
        14 днів{"\n"}безкоштовно
      </Text>
    </View>
  );
}

function OwnerCampaignsBody() {
  const t = useTheme();
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafe = me?.cafes.find((entry) => entry.id === cafeId);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const header = (
    <RoleHeader
      kicker="Розсилка · PRO"
      title={cafe?.name ?? ""}
      action={{
        icon: "chevron-left",
        label: "Назад",
        testID: "campaigns-back",
        onPress: () => router.back(),
      }}
    />
  );

  async function send() {
    if (!message.trim()) {
      setError("Напишіть повідомлення");
      return;
    }
    setSending(true);
    setError(null);
    try {
      setSent(await sendCampaign(cafeId, message.trim()));
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати");
    } finally {
      setSending(false);
    }
  }

  // Free (5a): the pitch — headline, benefits, price, and the contact CTA.
  if (cafe?.plan !== "pro") {
    return (
      <Screen header={header}>
        <Surface>
          <Heading size={26} accessibilityRole="header">
            Розкажи постійним про нове — одним повідомленням
          </Heading>
          <Muted
            style={{
              textAlign: "left",
              fontSize: t.font.size.base,
              lineHeight: t.font.size.base * t.font.lineHeight.snug,
              color: t.c["text-secondary"],
            }}
          >
            Заповнюй тихі години: одне повідомлення — і твої постійні клієнти
            знають про новий напій чи акцію.
          </Muted>
          <View style={{ gap: t.space[3], marginTop: t.space[1] }}>
            <Benefit>
              Отримують лише ті, хто був у тебе нещодавно та ввімкнув новини
            </Benefit>
            <Benefit>Кампанія в один дотик — без POS, без IT</Benefit>
            <Benefit>
              Разом з Аналітикою: пікові години, нові та постійні клієнти
            </Benefit>
          </View>
        </Surface>
        <PriceStrip />
        <View style={{ flex: 1 }} />
        <Button
          title="Написати нам у Telegram"
          testID="campaigns-telegram"
          onPress={() => void Linking.openURL(KAVTSYA_TELEGRAM_URL)}
        />
        <Muted>або {KAVTSYA_EMAIL}</Muted>
      </Screen>
    );
  }

  // Pro, just sent (confirmation IS the screen's focus).
  if (sent) {
    return (
      <Screen header={header}>
        <StatusStrip
          testID="campaigns-sent"
          intent="success"
          solid
          title="Надіслано"
          detail={
            sent.recipients > 0
              ? `Отримають ${sent.recipients} твоїх клієнтів`
              : "Поки нема кому: розсилку отримують клієнти, які були в тебе за останні 90 днів і ввімкнули новини"
          }
        />
        <Muted style={{ textAlign: "left" }}>
          Наступна розсилка — завтра (одна на день).
        </Muted>
        <View style={{ flex: 1 }} />
        <Button title="Готово" onPress={() => router.back()} />
      </Screen>
    );
  }

  // Pro, composing.
  return (
    <Screen header={header}>
      <Muted style={{ textAlign: "left" }}>
        Коротке повідомлення твоїм клієнтам — тим, хто був у тебе за останні 90
        днів і хоче новин. Одна розсилка на день.
      </Muted>
      <TextField
        testID="campaigns-message"
        value={message}
        onChangeText={setMessage}
        placeholder="Напр.: Сьогодні новий сезонний напій!"
        maxLength={MESSAGE_LIMIT}
        multiline
        style={{ minHeight: 96, textAlignVertical: "top" }}
      />
      <Muted style={{ textAlign: "right" }}>
        {message.length} / {MESSAGE_LIMIT}
      </Muted>
      {error && (
        <StatusStrip testID="campaigns-error" intent="danger" title={error} />
      )}
      <View style={{ flex: 1 }} />
      <Button
        title="Надіслати розсилку"
        testID="campaigns-send"
        busy={sending}
        onPress={() => void send()}
      />
    </Screen>
  );
}
