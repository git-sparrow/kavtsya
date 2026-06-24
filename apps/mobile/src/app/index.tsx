import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";

export default function Index() {
  const { data: session } = authClient.useSession();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>Кавця</Text>
        <Text style={styles.row}>
          Вітаємо, {session?.user.name || session?.user.email}!
        </Text>

        <Pressable style={styles.secondaryButton} onPress={() => authClient.signOut()}>
          <Text style={styles.secondaryButtonText}>Вийти</Text>
        </Pressable>
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
  row: {
    fontSize: 18,
    color: "#3b2417",
    textAlign: "center",
  },
  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d8c9bc",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#3b2417",
    fontSize: 16,
  },
});
