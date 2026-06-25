import type { Cafe, MeResponse, Reward, RewardType } from "@kavtsya/shared";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchMe,
  fetchProgram,
  fetchRewardDefaults,
  registerCafe,
  updateProgram,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export default function Index() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // CafeOwner Mode is a view toggle on top of the Customer experience (ADR 0003),
  // only reachable once the account holds the cafe_owner role.
  const [ownerMode, setOwnerMode] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMe(await fetchMe());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка завантаження");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>Кавця</Text>
        <Body
          me={me}
          error={error}
          ownerMode={ownerMode}
          onReload={load}
          onEnterOwnerMode={() => setOwnerMode(true)}
          onExitOwnerMode={() => setOwnerMode(false)}
        />
      </View>
    </SafeAreaView>
  );
}

function Body({
  me,
  error,
  ownerMode,
  onReload,
  onEnterOwnerMode,
  onExitOwnerMode,
}: {
  me: MeResponse | null;
  error: string | null;
  ownerMode: boolean;
  onReload: () => Promise<void>;
  onEnterOwnerMode: () => void;
  onExitOwnerMode: () => void;
}) {
  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void onReload()}>
          <Text style={styles.secondaryButtonText}>Спробувати знову</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => authClient.signOut()}>
          <Text style={styles.secondaryButtonText}>Вийти</Text>
        </Pressable>
      </View>
    );
  }

  if (!me) {
    return <ActivityIndicator size="large" color="#3b2417" />;
  }

  const isOwner = me.roles.includes("cafe_owner");

  if (ownerMode && isOwner) {
    return <CafeOwnerHome cafes={me.cafes} onExit={onExitOwnerMode} />;
  }

  return (
    <CustomerHome me={me} isOwner={isOwner} onEnterOwnerMode={onEnterOwnerMode} onCafeRegistered={onReload} />
  );
}

function CustomerHome({
  me,
  isOwner,
  onEnterOwnerMode,
  onCafeRegistered,
}: {
  me: MeResponse;
  isOwner: boolean;
  onEnterOwnerMode: () => void;
  onCafeRegistered: () => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.row}>Вітаємо, {me.name || me.email}!</Text>
      <Text style={styles.muted}>{me.email}</Text>

      {isOwner ? (
        <Pressable style={styles.primaryButton} onPress={onEnterOwnerMode}>
          <Text style={styles.primaryButtonText}>Режим Кавовара</Text>
        </Pressable>
      ) : (
        <RegisterCafeForm onRegistered={onCafeRegistered} />
      )}

      <Pressable style={styles.secondaryButton} onPress={() => authClient.signOut()}>
        <Text style={styles.secondaryButtonText}>Вийти</Text>
      </Pressable>
    </View>
  );
}

function RegisterCafeForm({ onRegistered }: { onRegistered: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await registerCafe(name.trim());
      await onRegistered(); // refetch /api/me → unlocks CafeOwner Mode
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зареєструвати");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.muted}>Стати Кавоваром — зареєструйте кав'ярню:</Text>
      <TextInput
        style={styles.input}
        placeholder="Назва кав'ярні"
        value={name}
        onChangeText={setName}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.primaryButton, (busy || !name.trim()) && styles.disabled]}
        disabled={busy || !name.trim()}
        onPress={submit}
      >
        <Text style={styles.primaryButtonText}>
          {busy ? "..." : "Зареєструвати кав'ярню"}
        </Text>
      </Pressable>
    </View>
  );
}

function CafeOwnerHome({ cafes, onExit }: { cafes: Cafe[]; onExit: () => void }) {
  // Pick a Café to configure its loyalty program; null = the Café list.
  const [selected, setSelected] = useState<Cafe | null>(null);

  if (selected) {
    return <CafeProgramConfig cafe={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.ownerBadge}>Режим Кавовара</Text>
      {cafes.map((cafe) => (
        <Pressable key={cafe.id} style={styles.cafeRow} onPress={() => setSelected(cafe)}>
          <Text style={styles.row}>{cafe.name}</Text>
          <Text style={styles.muted}>Налаштувати програму ›</Text>
        </Pressable>
      ))}
      <Text style={styles.muted}>Сканування QR з'явиться у наступному оновленні.</Text>
      <Pressable style={styles.secondaryButton} onPress={onExit}>
        <Text style={styles.secondaryButtonText}>Повернутися в режим клієнта</Text>
      </Pressable>
    </View>
  );
}

/** Reward types that carry a parameter, and the keyboard/placeholder to collect it. */
const REWARD_PARAM: Partial<
  Record<RewardType, { label: string; placeholder: string; numeric: boolean }>
> = {
  free_specific_drink: { label: "Напій", placeholder: "Напр. Капучино", numeric: false },
  fixed_discount: { label: "Знижка, ₴", placeholder: "Напр. 30", numeric: true },
  percent_discount: { label: "Знижка, %", placeholder: "Напр. 10", numeric: true },
};

/**
 * Loyalty program config for one Café (#18): the CafeOwner sets the Зернятко
 * threshold and picks a Reward from the platform-default set. Reads on mount and
 * writes back via the API; the server is the authority on valid Rewards.
 */
function CafeProgramConfig({ cafe, onBack }: { cafe: Cafe; onBack: () => void }) {
  const [threshold, setThreshold] = useState("10");
  // null = "no Reward yet"; otherwise one of the platform-default types.
  const [rewardType, setRewardType] = useState<RewardType | null>(null);
  const [param, setParam] = useState("");
  const [defaults, setDefaults] = useState<{ type: RewardType; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [program, rewardDefaults] = await Promise.all([
          fetchProgram(cafe.id),
          fetchRewardDefaults(),
        ]);
        if (!active) return;
        setDefaults(rewardDefaults);
        setThreshold(String(program.threshold));
        setRewardType(program.reward?.type ?? null);
        setParam(rewardParamValue(program.reward));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cafe.id]);

  function selectReward(type: RewardType | null) {
    setRewardType(type);
    setParam("");
    setSaved(false);
  }

  async function save() {
    setError(null);
    setSaved(false);
    const thresholdNum = Number(threshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 1) {
      setError("Поріг має бути цілим числом від 1");
      return;
    }
    let reward: Reward | null;
    try {
      reward = buildReward(rewardType, param);
    } catch {
      setError("Заповніть деталі винагороди");
      return;
    }

    setBusy(true);
    try {
      const written = await updateProgram(cafe.id, { threshold: thresholdNum, reward });
      setThreshold(String(written.threshold));
      setRewardType(written.reward?.type ?? null);
      setParam(rewardParamValue(written.reward));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ActivityIndicator size="large" color="#3b2417" />;

  const paramSpec = rewardType ? REWARD_PARAM[rewardType] : undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.ownerBadge}>{cafe.name}</Text>

      <Text style={styles.muted}>Поріг Зернятка (скільки до винагороди):</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={threshold}
        onChangeText={(t) => {
          setThreshold(t);
          setSaved(false);
        }}
      />

      <Text style={styles.muted}>Винагорода:</Text>
      <RewardChip
        label="Без винагороди"
        active={rewardType === null}
        onPress={() => selectReward(null)}
      />
      {defaults.map((d) => (
        <RewardChip
          key={d.type}
          label={d.label}
          active={rewardType === d.type}
          onPress={() => selectReward(d.type)}
        />
      ))}

      {paramSpec && (
        <TextInput
          style={styles.input}
          placeholder={paramSpec.placeholder}
          keyboardType={paramSpec.numeric ? "number-pad" : "default"}
          value={param}
          onChangeText={(t) => {
            setParam(t);
            setSaved(false);
          }}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.muted}>Збережено ✓</Text>}

      <Pressable
        style={[styles.primaryButton, busy && styles.disabled]}
        disabled={busy}
        onPress={save}
      >
        <Text style={styles.primaryButtonText}>{busy ? "..." : "Зберегти"}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Назад</Text>
      </Pressable>
    </View>
  );
}

function RewardChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** The editable param of a Reward as a text-input string ("" when none). */
function rewardParamValue(reward: Reward | null): string {
  if (!reward) return "";
  if (reward.type === "free_specific_drink") return reward.item;
  if (reward.type === "fixed_discount") return String(reward.amountUah);
  if (reward.type === "percent_discount") return String(reward.percent);
  return "";
}

/** Assemble a Reward from the chosen type + raw param; throws if the param is missing. */
function buildReward(type: RewardType | null, param: string): Reward | null {
  if (type === null) return null;
  const trimmed = param.trim();
  switch (type) {
    case "free_drink":
      return { type };
    case "free_specific_drink":
      if (!trimmed) throw new Error("missing item");
      return { type, item: trimmed };
    case "fixed_discount":
      if (!trimmed) throw new Error("missing amount");
      return { type, amountUah: Number(trimmed) };
    case "percent_discount":
      if (!trimmed) throw new Error("missing percent");
      return { type, percent: Number(trimmed) };
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fffaf3",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: "#3b2417",
  },
  card: {
    alignItems: "stretch",
    alignSelf: "stretch",
    gap: 12,
  },
  section: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 4,
  },
  ownerBadge: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#7a5c45",
    textAlign: "center",
  },
  row: {
    fontSize: 18,
    color: "#3b2417",
    textAlign: "center",
  },
  cafeRow: {
    borderWidth: 1,
    borderColor: "#d8c9bc",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d8c9bc",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipActive: {
    borderColor: "#3b2417",
    backgroundColor: "#f0e6db",
  },
  chipText: {
    fontSize: 15,
    color: "#7a5c45",
  },
  chipTextActive: {
    color: "#3b2417",
    fontWeight: "600",
  },
  muted: {
    fontSize: 13,
    color: "#9b8b7e",
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d8c9bc",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#3b2417",
  },
  primaryButton: {
    backgroundColor: "#3b2417",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fffaf3",
    fontSize: 16,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d8c9bc",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#3b2417",
    fontSize: 16,
  },
  error: {
    color: "#b00020",
    fontSize: 14,
    textAlign: "center",
  },
});
