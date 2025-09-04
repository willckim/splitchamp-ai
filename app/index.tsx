// app/index.tsx
import { Link } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 20 }}>
        Welcome to SplitChamp
      </Text>

      <Link href="/capture" asChild>
        <TouchableOpacity
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            alignItems: "center",
            backgroundColor: "#2563EB",
          }}
        >
          <Text style={{ fontWeight: "700", color: "white" }}>📷 Scan Receipt (AI)</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/manual" asChild>
        <TouchableOpacity
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "700" }}>✍️ Manual Entry</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
