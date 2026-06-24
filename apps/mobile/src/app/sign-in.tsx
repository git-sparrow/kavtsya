import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export default function SignIn() {
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
    // On success useSession picks up the new session and the root layout swaps
    // this screen for the authenticated home.
    if (result.error) {
      setError(result.error.message ?? "Не вдалося увійти");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>Кавця</Text>

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
      </View>
    </SafeAreaView>
  );
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
