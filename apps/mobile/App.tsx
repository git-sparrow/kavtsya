import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Cafe, MeResponse } from "@kavtsya/shared";
import { fetchMe, registerCafe } from "./src/api";
import { authClient } from "./src/authClient";

export default function App() {
  // useSession reads the SecureStore-cached session first, so a returning
  // Customer lands authenticated without a network round-trip on launch.
  const { data: session, isPending } = authClient.useSession();

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.brand}>Кавця</Text>

      {isPending ? (
        <ActivityIndicator size="large" />
      ) : session ? (
        <SignedIn />
      ) : (
        <AuthForm />
      )}
    </View>
  );
}

function SignedIn() {
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

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void load()}>
          <Text style={styles.secondaryButtonText}>Спробувати знову</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => authClient.signOut()}>
          <Text style={styles.secondaryButtonText}>Вийти</Text>
        </Pressable>
      </View>
    );
  }

  if (!me) {
    return <ActivityIndicator size="large" />;
  }

  const isOwner = me.roles.includes("cafe_owner");

  if (ownerMode && isOwner) {
    return <CafeOwnerHome cafes={me.cafes} onExit={() => setOwnerMode(false)} />;
  }

  return (
    <CustomerHome
      me={me}
      isOwner={isOwner}
      onEnterOwnerMode={() => setOwnerMode(true)}
      onCafeRegistered={load}
    />
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
  return (
    <View style={styles.card}>
      <Text style={styles.ownerBadge}>Режим Кавовара</Text>
      {cafes.map((cafe) => (
        <Text key={cafe.id} style={styles.row}>
          {cafe.name}
        </Text>
      ))}
      <Text style={styles.muted}>Сканування QR з'явиться у наступному оновленні.</Text>
      <Pressable style={styles.secondaryButton} onPress={onExit}>
        <Text style={styles.secondaryButtonText}>Повернутися в режим клієнта</Text>
      </Pressable>
    </View>
  );
}

type Mode = "signin" | "signup";

function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit() {
    setError(null);
    setBusy(true);
    const result = isSignup
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    // On success useSession picks up the new session and this form unmounts.
    if (result.error) {
      setError(result.error.message ?? "Не вдалося увійти");
    }
  }

  return (
    <View style={styles.card}>
      {isSignup && (
        <TextInput
          style={styles.input}
          placeholder="Ім'я"
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.primaryButton, busy && styles.disabled]}
        disabled={busy}
        onPress={submit}
      >
        <Text style={styles.primaryButtonText}>
          {busy ? "..." : isSignup ? "Зареєструватися" : "Увійти"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setError(null);
          setMode(isSignup ? "signin" : "signup");
        }}
      >
        <Text style={styles.link}>
          {isSignup ? "Вже маєте акаунт? Увійти" : "Немає акаунта? Зареєструватися"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffaf3",
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
  link: {
    color: "#7a5c45",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  error: {
    color: "#b00020",
    fontSize: 14,
    textAlign: "center",
  },
});
