// src/components/SummaryCard.tsx
import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';
import { styles } from '@/styles';
import { useTheme } from '@/providers/theme';

const fmt = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00');

function SummaryCardImpl() {
  const { theme } = useTheme();
  const transfers = useSplitStore(s => s.transfers);
  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return (id: string) => m.get(id) ?? 'Unknown';
  }, [participants]);

  const receiptTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  // Empty state
  if (!transfers.length) {
    return (
      <View style={{ marginTop: 12 }}>
        <View style={[styles.subtleCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
          <Text style={{ fontWeight: '800', marginBottom: 4, color: theme.text }}>
            Nothing to settle
          </Text>
          <Text style={{ color: theme.text, opacity: 0.75 }}>
            Add a few expenses to see who owes what.
          </Text>
        </View>
      </View>
    );
  }

  const totalToSettle = transfers.reduce((s, t) => s + t.amount, 0);

  return (
    <View style={[styles.card, { marginTop: 12, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
      <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 8, color: theme.text }}>
        Who owes who what
      </Text>

      <View style={{ gap: 6 }}>
        {transfers.map((t, idx) => (
          <Text key={idx} style={{ color: theme.text }}>
            {nameOf(t.from)} <Text>→</Text> {nameOf(t.to)}: {fmt(t.amount)}
          </Text>
        ))}
      </View>

      {/* Divider */}
      <View
        style={{
          height: 1,
          backgroundColor: theme.border,
          marginVertical: 12,
          opacity: 0.9,
        }}
      />

      {/* Receipt total for quick math check */}
      {expenses.length > 0 && (
        <Text style={{ color: theme.text, opacity: 0.75, marginBottom: 4 }}>
          Receipt total:{' '}
          <Text style={{ fontWeight: '800', color: theme.text }}>{fmt(receiptTotal)}</Text>
        </Text>
      )}

      <Text style={{ color: theme.text, opacity: 0.75 }}>
        Total to settle:{' '}
        <Text style={{ fontWeight: '800', color: theme.text }}>{fmt(totalToSettle)}</Text>
      </Text>
    </View>
  );
}

export default memo(SummaryCardImpl);
