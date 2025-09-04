// app/split/by-person.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/providers/theme";
import { useSplitStore } from "../../src/store/useSplitStore";
import type { Participant } from "../../src/types";

export default function ByPersonSetup() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const participants = useSplitStore((s: any) => s.participants) as Participant[];
  const excludeAlcoholFor = useSplitStore((s: any) => s.excludeAlcoholFor) as (ids: string[]) => void;

  const [noAlcoholIds, setNoAlcoholIds] = useState<string[]>([]);

  const hasPeople = participants.length > 0;
  const allIds = useMemo(() => participants.map((p: Participant) => p.id), [participants]);

  const toggle = (id: string) =>
    setNoAlcoholIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const selectNone = () => setNoAlcoholIds([]);
  const selectAll = () => setNoAlcoholIds([...allIds]);

  const onNext = () => {
    if (noAlcoholIds.length) excludeAlcoholFor(noAlcoholIds);
    router.push("/split/assign");
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg,
        paddingTop: insets.top + 6,
        paddingBottom: insets.bottom,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
          Who’s in?
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.75)" }}>
          Mark anyone who <Text style={{ fontWeight: "800", color: theme.text }}>didn’t drink alcohol</Text>.
          You can assign food items on the next screen.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={selectNone}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.bg,
            }}
          >
            <Text style={{ color: theme.text }}>Select none</Text>
          </Pressable>
          <Pressable
            onPress={selectAll}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.bg,
            }}
          >
            <Text style={{ color: theme.text }}>Everyone didn’t drink</Text>
          </Pressable>
        </View>
      </View>

      {!hasPeople ? (
        <View
          style={{
            flex: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
            No participants yet. Add people first, then continue.
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={participants}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item }) => {
            const selected = noAlcoholIds.includes(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? theme.accent : theme.border,
                  backgroundColor: selected ? "rgba(37,99,235,0.15)" : theme.card,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: "700" }}>{item.name}</Text>
                <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  {selected ? "Will NOT be charged for alcohol" : "Will be charged for alcohol if present"}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        disabled={!hasPeople}
        onPress={onNext}
        style={{
          height: 52,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 10,
          backgroundColor: hasPeople ? theme.accent : "rgba(255,255,255,0.15)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>Next: Assign Items</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: "center" }} hitSlop={8}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "700" }}>Back</Text>
      </Pressable>
    </View>
  );
}
