// app/split/assign.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/providers/theme";
import { useSplitStore } from "../../src/store/useSplitStore";
import type { Participant } from "../../src/types";

type Expense = {
  id: string;
  description: string;
  amount: number;
  category?: "food" | "alcohol" | "appetizer" | "tax" | "tip" | "ignore";
  assigned?: string[];
  shares?: Record<string, number>;
  splitAmong?: string[];
};

export default function AssignItems() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const participants = useSplitStore((s: any) => s.participants) as Participant[];
  const expenses = useSplitStore((s: any) => s.expenses) as Expense[];
  const assignItemsTo = useSplitStore((s: any) => s.assignItemsTo) as (ids: string[], pid: string) => void;
  const setExpenses = useSplitStore((s: any) => s.setExpenses) as (e: any) => void;
  const recompute = useSplitStore((s: any) => s.recompute) as () => void;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "unassigned" | "alcohol" | "appetizer">("all");

  const items = useMemo(() => {
    const base = (expenses || []).filter(
      (e) => e.category !== "tax" && e.category !== "tip" && e.category !== "ignore"
    );
    if (filter === "unassigned") return base.filter((e) => !e.assigned || e.assigned.length === 0);
    if (filter === "alcohol") return base.filter((e) => e.category === "alcohol");
    if (filter === "appetizer") return base.filter((e) => e.category === "appetizer");
    return base;
  }, [expenses, filter]);

  const unassignedCount = useMemo(
    () =>
      (expenses || []).filter(
        (e: Expense) =>
          e.category !== "tax" &&
          e.category !== "tip" &&
          e.category !== "ignore" &&
          (!e.assigned || e.assigned.length === 0)
      ).length,
    [expenses]
  );

  const toggleItem = (id: string) =>
    setSelectedIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const clearSelected = () => setSelectedIds([]);

  const shareAmongEveryone = () => {
    if (!selectedIds.length) return;
    const all = participants.map((p) => p.id);
    const next = expenses.map((e: Expense) =>
      selectedIds.includes(e.id) ? { ...e, assigned: all, shares: undefined } : e
    );
    setExpenses(next as any);
    recompute();
    setSelectedIds([]);
  };

  const assignToPerson = (pid: string) => {
    if (!selectedIds.length) return;
    assignItemsTo(selectedIds, pid);
    setSelectedIds([]);
  };

  const done = () => router.replace("/summary");

  const Badge = ({ text }: { text: string }) => (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
      }}
    >
      <Text style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );

  const CategoryBadge = ({ cat }: { cat?: Expense["category"] }) => {
    if (!cat || cat === "food") return null;
    const label =
      cat === "alcohol" ? "Alcohol" :
      cat === "appetizer" ? "Appetizer" :
      cat === "tax" ? "Tax" :
      cat === "tip" ? "Tip" : "Ignore";
    return <Badge text={label} />;
  };

  const FilterChip = ({
    label,
    value,
  }: {
    label: string;
    value: "all" | "unassigned" | "alcohol" | "appetizer";
  }) => {
    const active = filter === value;
    return (
      <Pressable
        onPress={() => setFilter(value)}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? theme.accent : theme.border,
          backgroundColor: active ? "rgba(37,99,235,0.15)" : theme.bg,
        }}
      >
        <Text style={{ color: active ? "#fff" : theme.text, fontWeight: "700", opacity: active ? 1 : 0.9 }}>
          {label}
        </Text>
      </Pressable>
    );
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
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", marginBottom: 8 }}>Assign items</Text>
      <Text style={{ color: "rgba(255,255,255,0.75)" }}>
        Select line items, then tap a person to assign. You can also share among everyone.
      </Text>

      {/* Filters */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <FilterChip label="All" value="all" />
        <FilterChip label={`Unassigned (${unassignedCount})`} value="unassigned" />
        <FilterChip label="Alcohol" value="alcohol" />
        <FilterChip label="Appetizers" value="appetizer" />
      </View>

      {/* Items */}
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: 12 }}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const assignedCount = item.assigned?.length || 0;
          return (
            <Pressable
              onPress={() => toggleItem(item.id)}
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? "rgba(37,99,235,0.15)" : theme.card,
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "700", marginRight: 8 }}>
                  {item.description} · ${item.amount.toFixed(2)}
                </Text>
                <CategoryBadge cat={item.category} />
              </View>

              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
                {assignedCount ? `Assigned to ${assignedCount}` : "Unassigned"}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* People row */}
      <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", marginBottom: 6 }}>
        Assign selected to:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4, gap: 8 }}>
        {participants.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => assignToPerson(p.id)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.bg,
              marginRight: 8,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>{p.name}</Text>
          </Pressable>
        ))}

        {/* Share among everyone */}
        <Pressable
          onPress={shareAmongEveryone}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>Share among everyone</Text>
        </Pressable>
      </ScrollView>

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={clearSelected}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>Clear selected</Text>
        </Pressable>

        <Pressable
          onPress={done}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.accent,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Done</Text>
        </Pressable>
      </View>

      {/* Back link */}
      <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: "center" }} hitSlop={8}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "700" }}>Back</Text>
      </Pressable>
    </View>
  );
}
