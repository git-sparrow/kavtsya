import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { healthResponseSchema, type HealthResponse } from "@kavtsya/shared";

// iOS simulator reaches the host via localhost. Android emulator uses
// 10.0.2.2; a physical device needs your machine's LAN IP. Override with
// EXPO_PUBLIC_API_URL (see .env.example).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type State =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "error"; message: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const health = healthResponseSchema.parse(await res.json());
        if (!cancelled) setState({ kind: "ok", health });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.brand}>Кавця</Text>

      {state.kind === "loading" && <ActivityIndicator size="large" />}

      {state.kind === "ok" && (
        <View style={styles.card}>
          <Text style={styles.row}>API: {state.health.status}</Text>
          <Text style={styles.row}>DB: {state.health.db}</Text>
          <Text style={styles.muted}>{state.health.time}</Text>
        </View>
      )}

      {state.kind === "error" && (
        <View style={styles.card}>
          <Text style={styles.error}>Cannot reach API at {API_URL}</Text>
          <Text style={styles.muted}>{state.message}</Text>
        </View>
      )}
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
    alignItems: "center",
    gap: 4,
  },
  row: {
    fontSize: 18,
    color: "#3b2417",
  },
  muted: {
    fontSize: 13,
    color: "#9b8b7e",
  },
  error: {
    fontSize: 16,
    color: "#b00020",
    textAlign: "center",
  },
});
