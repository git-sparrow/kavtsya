import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { ErrorText, Muted } from "@/components/text";
import { TextField } from "@/components/text-field";
import { registerCafe } from "@/lib/api";

/**
 * Lets a Customer become a CafeOwner by registering their first Café. On
 * success it asks the caller to refetch /api/me, which is what unlocks
 * CafeOwner Mode (ADR 0003).
 */
export function RegisterCafeForm({ onRegistered }: { onRegistered: () => Promise<void> }) {
  const [name, setName] = useState("");
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
    <View style={styles.section}>
      <Muted>Стати Кавоваром — зареєструйте кав&apos;ярню:</Muted>
      <TextField placeholder="Назва кав'ярні" value={name} onChangeText={setName} />
      {error && <ErrorText>{error}</ErrorText>}
      <Button
        title="Зареєструвати кав'ярню"
        onPress={submit}
        disabled={!name.trim()}
        busy={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 4,
  },
});
