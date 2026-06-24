import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Index() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>Кавця</Text>
        <Text style={styles.muted}>Expo SDK 56 · Expo Router</Text>
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
    gap: 8,
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: "#3b2417",
  },
  muted: {
    fontSize: 13,
    color: "#9b8b7e",
  },
});
