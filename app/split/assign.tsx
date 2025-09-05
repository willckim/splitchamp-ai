// app/split/assign.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/providers/theme';
import { useSplitStore } from '../../src/store/useSplitStore';
import type { Expense, ExpenseItem, Participant } from '../../src/types';

type Filter = 'all' | 'unassigned';

export default function AssignItems() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // pull from store
  const participants = useSplitStore(s => s.participants) as Participant[];
  const expenses     = useSplitStore(s => s.expenses) as Expense[];
  const calculate    = useSplitStore(s => s.calculate);

  // find the latest/only itemized expense
  const targetExpense = useMemo(() => {
    const list = [...expenses].reverse();
    return list.find(e => e.splitMethod === 'itemized' && Array.isArray(e.items) && e.items.length);
  }, [expenses]);

  const everyoneIds = useMemo(() => participants.map(p => p.id), [participants]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  // derive visible items
  const items = useMemo(() => {
    const base = targetExpense?.items ?? [];
    if (filter === 'unassigned') {
      return base.filter(it => !it.splitAmong || it.splitAmong.length === 0);
    }
    return base;
  }, [targetExpense, filter]);

  const unassignedCount = useMemo(
    () => (targetExpense?.items ?? []).filter(it => !it.splitAmong || it.splitAmong.length === 0).length,
    [targetExpense]
  );

  // Select all *visible* items
  const onSelectAll = useCallback(() => {
    if (!items.length) return;
    setSelectedIds(items.map(it => it.id));
  }, [items]);

  // Clear selection whenever the visible set changes (or filter flips)
  useEffect(() => {
    setSelectedIds([]);
  }, [filter, items]);

  const toggleItem = (id: string) =>
    setSelectedIds(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));

  const clearSelected = () => setSelectedIds([]);

  // --- store update helper (keeps the same expense id; no duplication) ---
  const updateItems = (updater: (prev: ExpenseItem[]) => ExpenseItem[]) => {
    const idx = expenses.findIndex(e => e.id === targetExpense?.id);
    if (idx < 0) return;

    useSplitStore.setState(s => {
      const prev = s.expenses[idx];
      const nextItems = updater(prev.items ?? []);
      const nextExpense: Expense = { ...prev, items: nextItems };
      const copy = [...s.expenses];
      copy[idx] = nextExpense;
      return { expenses: copy };
    });
    calculate(); // recompute settlements
  };

  const assignToPerson = (pid: string) => {
    if (!selectedIds.length) return;
    updateItems(prev =>
      prev.map(it => (selectedIds.includes(it.id) ? { ...it, splitAmong: [pid] } : it))
    );
    setSelectedIds([]);
  };

  const shareAmongEveryone = () => {
    if (!selectedIds.length) return;
    updateItems(prev =>
      prev.map(it => (selectedIds.includes(it.id) ? { ...it, splitAmong: everyoneIds } : it))
    );
    setSelectedIds([]);
  };

  const unassignSelected = () => {
    if (!selectedIds.length) return;
    updateItems(prev =>
      prev.map(it => (selectedIds.includes(it.id) ? { ...it, splitAmong: [] } : it))
    );
    setSelectedIds([]);
  };

  const resetAllAssignments = () => {
    if (!targetExpense?.items?.length) return;
    updateItems(prev => prev.map(it => ({ ...it, splitAmong: [] })));
    setSelectedIds([]);
  };

  const done = () => {
    if (!targetExpense) return router.replace('/summary');
    const remaining = targetExpense.items?.some(it => !it.splitAmong || it.splitAmong.length === 0);
    if (remaining) {
      Alert.alert('Some items unassigned', 'You can leave items unassigned, but they won’t be included in the split.');
    }
    router.replace('/summary');
  };

  const FilterChip = ({ label, value }: { label: string; value: Filter }) => {
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
          backgroundColor: active ? 'rgba(37,99,235,0.15)' : theme.bg,
        }}
      >
        <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', opacity: active ? 1 : 0.9 }}>
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
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
        Assign items
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)' }}>
        Select line items, then tap a person to assign. You can also share among everyone or unassign.
      </Text>

      {/* Filters */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <FilterChip label="All" value="all" />
        <FilterChip label={`Unassigned (${unassignedCount})`} value="unassigned" />
      </View>

      {/* Items */}
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={e => e.id}
        contentContainerStyle={{ paddingBottom: 12 }}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const assignedCount = item.splitAmong?.length || 0;
          return (
            <Pressable
              onPress={() => toggleItem(item.id)}
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? 'rgba(37,99,235,0.15)' : theme.card,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {item.description} · ${Number(item.amount).toFixed(2)}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
                {assignedCount ? `Assigned to ${assignedCount}` : 'Unassigned'}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* People row */}
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginBottom: 6 }}>
        Assign selected to:
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
      >
        {participants.map(p => (
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
            <Text style={{ color: theme.text, fontWeight: '700' }}>{p.name}</Text>
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
          <Text style={{ color: theme.text, fontWeight: '700' }}>Share among everyone</Text>
        </Pressable>
      </ScrollView>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={onSelectAll}
          disabled={!items.length}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: items.length ? 1 : 0.5,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '700' }}>Select all</Text>
        </Pressable>

        <Pressable
          onPress={clearSelected}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '700' }}>Clear selection</Text>
        </Pressable>

        <Pressable
          onPress={unassignSelected}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '700' }}>Unassign selected</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Pressable
          onPress={resetAllAssignments}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '700' }}>Reset all</Text>
        </Pressable>

        <Pressable
          onPress={done}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.accent,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Done</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.back()} style={{ paddingVertical: 14, alignItems: 'center' }} hitSlop={8}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700' }}>Back</Text>
      </Pressable>
    </View>
  );
}
