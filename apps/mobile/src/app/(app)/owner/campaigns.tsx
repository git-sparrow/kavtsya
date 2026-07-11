import type { CampaignResult } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMe } from "@/features/account/me-context";
import { sendCampaign } from "@/lib/api";

/** Where a Free owner reaches Kavtsya about Pro — Telegram-first (grilling 2026-07-10). */
const KAVTSYA_TELEGRAM_URL = "https://t.me/kavtsya";
const KAVTSYA_EMAIL = "hello@kavtsya.app";

/** The API caps the message at 200 — mirror it so the counter is honest. */
const MESSAGE_LIMIT = 200;

/**
 * The campaigns screen (#24, ADR 0011): on Pro — write a short message, one
 * tap, and it reaches the Café's recently-active Customers who opted in to
 * café news. On Free — the same section as a pitch: what Pro buys and how to
 * get it (the Platform flips the flag by hand in v1; billing is deferred).
 */
export default function OwnerCampaigns() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafe = me?.cafes.find((entry) => entry.id === cafeId);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Screen>
      <Card>
        <OwnerBadge>Розсилка — {cafe?.name ?? ""}</OwnerBadge>

        {cafe?.plan === "pro" ? (
          sent ? (
            <>
              <Title>✓ Надіслано</Title>
              <Muted>
                {sent.recipients > 0
                  ? `Отримають ${sent.recipients} ваших клієнтів.`
                  : "Поки нема кому: розсилку отримують клієнти, які були у вас за останні 90 днів і увімкнули новини."}
              </Muted>
              <Muted>Наступна розсилка — завтра (1 на день).</Muted>
            </>
          ) : (
            <>
              <Muted>
                Коротке повідомлення вашим клієнтам — тим, хто був у вас за
                останні 90 днів і хоче новин. Одна розсилка на день.
              </Muted>
              <TextField
                value={message}
                onChangeText={setMessage}
                placeholder="Напр.: Сьогодні новий сезонний напій!"
                maxLength={MESSAGE_LIMIT}
                multiline
              />
              <Muted>
                {message.length} / {MESSAGE_LIMIT}
              </Muted>
              <Button
                title="Надіслати розсилку"
                disabled={sending}
                onPress={() => void send()}
              />
            </>
          )
        ) : (
          <>
            <Title>Розсилки — це Pro ✨</Title>
            <Muted>
              Заповнюйте тихі години: одне повідомлення — і ваші постійні
              клієнти знають про новий напій чи акцію. Отримують лише ті, хто
              був у вас нещодавно та увімкнув новини.
            </Muted>
            <Button
              title="Написати нам у Telegram"
              onPress={() => void Linking.openURL(KAVTSYA_TELEGRAM_URL)}
            />
            <Muted>або {KAVTSYA_EMAIL}</Muted>
          </>
        )}
        {error && <ErrorText>{error}</ErrorText>}

        <Button
          title="Назад"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Card>
    </Screen>
  );
}
