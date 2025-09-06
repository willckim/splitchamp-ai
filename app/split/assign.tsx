// app/split/assign.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Alert, Modal, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/providers/theme';
import { useSplitStore } from '../../src/store/useSplitStore';
import { useHeaderHeight } from '@react-navigation/elements';
import type { Expense, ExpenseItem, Participant } from '../../src/types';

// ⬇️ Added "assigned"
type Filter = 'all' | 'unassigned' | 'assigned';

export default function AssignItems() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const topPad = headerHeight > 0 ? 6 : insets.top + 6;

  const participants = useSplitStore(s => s.participants) as Participant[];
  const expenses     = useSplitStore(s => s.expenses) as Expense[];
  const calculate    = useSplitStore(s => s.calculate);

  // find latest itemized expense
  const targetExpense = useMemo(() => {
    const list = [...expenses].reverse();
    return list.find(
      e => e.splitMethod === 'itemized' && Array.isArray(e.items) && e.items.length
    );
  }, [expenses]);

  const everyoneIds = useMemo(() => participants.map(p => p.id), [participants]);

  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // assign sheet
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);

  // payer modal
  const [payerModalOpen, setPayerModalOpen] = useState(false);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(
    (targetExpense as any)?.paidBy ?? null
  );

  // split modal
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTargetId, setSplitTargetId] = useState<string | null>(null);
  const [splitCountText, setSplitCountText] = useState('2');

  // items for the list
  const items = useMemo(() => {
    const base = targetExpense?.items ?? [];
    if (filter === 'unassigned') return base.filter(it => !it.splitAmong?.length);
    // ⬇️ New branch for "assigned"
    if (filter === 'assigned') return base.filter(it => (it.splitAmong?.length ?? 0) > 0);
    return base;
  }, [targetExpense, filter]);

  const unassignedCount = useMemo(
    () => (targetExpense?.items ?? []).filter(it => !it.splitAmong?.length).length,
    [targetExpense]
  );

  // ⬇️ Count for assigned
  const assignedCount = useMemo(
    () => (targetExpense?.items ?? []).filter(it => (it.splitAmong?.length ?? 0) > 0).length,
    [targetExpense]
  );

  const toggleItem = (id: string) =>
    setSelectedIds(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));

  const clearSelected = () => setSelectedIds([]);

  // --- store update helpers
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
    calculate();
  };

  const updateExpenseFields = (mutate: (prev: Expense) => Expense) => {
    const idx = expenses.findIndex(e => e.id === targetExpense?.id);
    if (idx < 0) return;
    useSplitStore.setState(s => {
      const prev = s.expenses[idx];
      const next = mutate(prev);
      const copy = [...s.expenses];
      copy[idx] = next;
      return { expenses: copy };
    });
    calculate();
  };

  // --- actions
  const assignToPerson = (pid: string) => {
    if (!selectedIds.length) return;
    updateItems(prev =>
      prev.map(it => (selectedIds.includes(it.id) ? { ...it, splitAmong: [pid] } : it))
    );
    setSelectedIds([]);
    setAssignSheetOpen(false);
  };

  const shareAmongEveryone = () => {
    if (!selectedIds.length) return;
    updateItems(prev =>
      prev.map(it => (selectedIds.includes(it.id) ? { ...it, splitAmong: everyoneIds } : it))
    );
    setSelectedIds([]);
    setAssignSheetOpen(false);
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

  // Flow: Done → ask payer → save → review
  const done = () => {
    if (!targetExpense) {
      router.replace('/split/review');
      return;
    }
    const remaining = targetExpense.items?.some(it => !it.splitAmong?.length);
    if (remaining) {
      Alert.alert('Some items unassigned', 'Unassigned items are ignored in the split.');
    }
    setPayerModalOpen(true);
  };

  const confirmPayerAndContinue = () => {
    if (!targetExpense || !selectedPayerId) {
      setPayerModalOpen(false);
      return;
    }
    // Persist payer on the expense (field name: paidBy)
    updateExpenseFields(prev => ({ ...(prev as any), paidBy: selectedPayerId } as Expense));
    setPayerModalOpen(false);
    router.replace('/split/review');
  };

  // --- split into N copies
  const openSplitFor = (id: string) => {
    setSplitTargetId(id);
    setSplitCountText('2');
    setSplitModalOpen(true);
  };

  const confirmSplit = () => {
    const count = Math.max(2, parseInt((splitCountText || '2').replace(/[^0-9]/g, ''), 10) || 2);
    const id = splitTargetId;
    setSplitModalOpen(false);
    setSplitTargetId(null);
    if (!id || !targetExpense?.items?.length) return;

    updateItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx < 0) return prev;
      const orig = prev[idx];
      const total = Number(orig.amount) || 0;

      const cents = Math.round(total * 100);
      const base = Math.floor(cents / count);
      const remainder = cents - base * count;

      const clones: ExpenseItem[] = Array.from({ length: count }).map((_, i) => ({
        id: `${orig.id}_part${i}_${Date.now()}`,
        description: `${orig.description} (${i + 1}/${count})`,
        amount: (base + (i < remainder ? 1 : 0)) / 100,
        splitAmong: [],
      }));

      const copy = [...prev];
      copy.splice(idx, 1, ...clones);
      return copy;
    });
  };

  // ---------- UI bits ----------
  const secondaryText = theme.subtext;

  const ACTION_BAR_PAD = 170; // space reserved so list never hides behind the bar

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
          marginRight: 8,
        }}
      >
        <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    );
  };

  // Polished floating action bar (fills width, consistent buttons)
  const ActionBar = () => {
    const hasSel = selectedIds.length > 0;

    const OutlineBtn = ({
      children,
      onPress,
      disabled,
      style,
    }: {
      children: React.ReactNode;
      onPress: () => void;
      disabled?: boolean;
      style?: any;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          {
            flex: 1,
            height: 48,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <Text style={{ color: theme.text, fontWeight: '700' }}>{children}</Text>
      </Pressable>
    );

    const SolidBtn = ({
      children,
      onPress,
      disabled,
      style,
    }: {
      children: React.ReactNode;
      onPress: () => void;
      disabled?: boolean;
      style?: any;
    }) => {
      const bg = disabled ? theme.card : theme.accent;
      const txt = disabled ? theme.subtext : '#fff';
      const borderStyle = disabled ? { borderWidth: 1, borderColor: theme.border } : null;

      return (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={[
            {
              flex: 1,
              height: 48,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: bg,
            },
            borderStyle,
            style,
          ]}
        >
          <Text style={{ color: txt, fontWeight: '800' }}>{children}</Text>
        </Pressable>
      );
    };

    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom ? Math.max(insets.bottom, 10) : 10,
          paddingHorizontal: 16,
          paddingTop: 10,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          backgroundColor: theme.card,
          borderTopWidth: 1,
          borderColor: theme.border,
          gap: 10,
        }}
      >
        {/* Row 1: Assign + Done (equal widths) */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SolidBtn onPress={() => setAssignSheetOpen(true)} disabled={!hasSel}>
            {hasSel ? `Assign (${selectedIds.length})` : 'Assign'}
          </SolidBtn>
          <SolidBtn onPress={done}>Done</SolidBtn>
        </View>

        {/* Row 2: Unassign + Clear + Reset */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <OutlineBtn onPress={unassignSelected} disabled={!hasSel}>Unassign</OutlineBtn>
          <OutlineBtn onPress={clearSelected}>Clear selection</OutlineBtn>
          <OutlineBtn onPress={resetAllAssignments}>Reset all</OutlineBtn>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: topPad }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
        <Text
          style={{
            color: theme.text,
            fontSize: 22,
            fontWeight: '800',
            marginBottom: 4,
          }}
        >
          Assign items
        </Text>
        <Text
          style={{
            color: secondaryText,
            marginBottom: 6,
          }}
        >
          Tap to select. Long-press a line to “Split into N copies”.
        </Text>

        <View style={{ flexDirection: 'row' }}>
          <FilterChip label="All" value="all" />
          <FilterChip label={`Unassigned (${unassignedCount})`} value="unassigned" />
          {/* ⬇️ New chip */}
          <FilterChip label={`Assigned (${assignedCount})`} value="assigned" />
        </View>
      </View>

      {/* Items list */}
      <FlatList
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: ACTION_BAR_PAD }}
        data={items}
        keyExtractor={e => e.id}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const assignedCount = item.splitAmong?.length || 0;
          return (
            <Pressable
              onPress={() => toggleItem(item.id)}
              onLongPress={() => openSplitFor(item.id)}
              delayLongPress={300}
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? 'rgba(37,99,235,0.15)' : theme.card,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {item.description} · ${Number(item.amount).toFixed(2)}
              </Text>
              <Text style={{ color: secondaryText, marginTop: 6 }}>
                {assignedCount ? `Assigned to ${assignedCount}` : 'Unassigned'}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Floating action bar */}
      <ActionBar />

      {/* Assign sheet */}
      <Modal
        transparent
        visible={assignSheetOpen}
        animationType="slide"
        onRequestClose={() => setAssignSheetOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.card,
              padding: 18,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTopWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
              Assign to
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{p.name}</Text>
                </Pressable>
              ))}
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
            </View>

            <Pressable onPress={() => setAssignSheetOpen(false)} style={{ marginTop: 12, alignItems: 'center', padding: 8 }}>
              <Text style={{ color: secondaryText, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Payer picker modal */}
      <Modal
        transparent
        visible={payerModalOpen}
        animationType="slide"
        onRequestClose={() => setPayerModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.card,
              padding: 18,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderTopWidth: 1,
              borderColor: theme.border,
              gap: 12,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
              Who paid?
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {participants.map(p => {
                const active = selectedPayerId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPayerId(p.id)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? theme.accent : theme.border,
                      backgroundColor: active ? 'rgba(37,99,235,0.15)' : theme.bg,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700' }}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setPayerModalOpen(false)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.card,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Back</Text>
              </Pressable>

              <Pressable
                onPress={confirmPayerAndContinue}
                disabled={!selectedPayerId}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selectedPayerId ? theme.accent : theme.card,
                  borderWidth: selectedPayerId ? 0 : 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: selectedPayerId ? '#fff' : theme.subtext, fontWeight: '800' }}>
                  Confirm
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Split-into-N modal */}
      <Modal
        transparent
        visible={splitModalOpen}
        animationType="fade"
        onRequestClose={() => setSplitModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
              Split into copies
            </Text>
            <Text style={{ color: secondaryText, marginBottom: 10 }}>
              Enter how many identical copies you need (e.g., 5 for “5 Diet Cokes”). The total will be divided evenly.
            </Text>
            <TextInput
              value={splitCountText}
              onChangeText={t => setSplitCountText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor={secondaryText}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                padding: 12,
                color: theme.text,
                marginBottom: 12,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setSplitModalOpen(false)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.card,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmSplit}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.accent,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Split</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
