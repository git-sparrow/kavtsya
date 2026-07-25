import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Button } from "@/components/button";
import { StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Muted, SectionLabel } from "@/components/text";
import { registerCafe } from "@/lib/api";
import { fontFamily, useTheme } from "@/theme";

/**
 * «Стати Кавоваром» — the register-café subscreen body (#137, redesign turn 5d):
 * a subtitle promise, one labelled field, a what-you-unlock card, and the CTA,
 * with the «безкоштовно» footer (ADR 0011 — Pro is separate, opt-in). Registering
 * a Café is what unlocks CafeOwner Mode (ADR 0003); on success it asks the caller
 * to refetch /api/me, which is what flips the app into the new Mode.
 *
 * City is deliberately not collected in v1 — the mockup shows a Місто field, but
 * the `cafes` table and `POST /api/cafes` carry only a name; wiring city is a
 * later data slice, not this restyle.
 */
export function RegisterCafeForm({
  onRegistered,
}: {
  onRegistered: () => Promise<void>;
}) {
  const t = useTheme();
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await registerCafe(name.trim());
      await onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зареєструвати");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, alignSelf: "stretch", gap: t.space[4] }}>
      <Muted style={{ textAlign: "left" }}>
        Зареєструй свою кав&apos;ярню — і зернятка запрацюють за кілька хвилин.
      </Muted>

      {/* One labelled field: the uppercase caption rides inside the box, gold
          border on focus (5d). */}
      <View
        style={{
          borderWidth: 1.5,
          borderColor: focused ? t.c.primary : t.c.border,
          borderRadius: t.radius.md,
          backgroundColor: t.c.surface,
          paddingHorizontal: t.space[4],
          paddingVertical: t.space[3],
          gap: t.space[1],
        }}
      >
        <SectionLabel>Назва кав&apos;ярні</SectionLabel>
        <TextInput
          testID="register-cafe.name"
          accessibilityLabel="Назва кав'ярні"
          placeholder="Напр.: Кав'ярня «Демо»"
          placeholderTextColor={t.c["text-muted"]}
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            fontSize: t.font.size.xl,
            fontFamily: fontFamily.body.semibold,
            color: t.c.foreground,
            padding: 0,
          }}
        />
      </View>

      {/* What registering unlocks. */}
      <Surface emphasis="promise">
        <Text
          style={{
            fontSize: t.font.size.base,
            lineHeight: t.font.size.base * t.font.lineHeight.snug,
            fontFamily: fontFamily.body.regular,
            color: t.c.foreground,
          }}
        >
          Після реєстрації з&apos;явиться{" "}
          <Text style={{ fontFamily: fontFamily.body.bold }}>
            Режим Кавовара
          </Text>
          : програма зернят, постер для каси, ростер бариста.
        </Text>
      </Surface>

      {error && (
        <StatusStrip
          testID="register-cafe.error"
          intent="danger"
          title={error}
        />
      )}

      <View style={{ flex: 1 }} />
      <Button
        title="Зареєструвати кав'ярню"
        testID="register-cafe.submit"
        onPress={submit}
        disabled={!name.trim()}
        busy={busy}
      />
      <Muted>Безкоштовно. Pro-функції — окремо, коли захочеш</Muted>
    </View>
  );
}
