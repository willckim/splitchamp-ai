// src/components/SummaryCard.tsx
import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';
import { styles } from '@/styles';
import { useTheme } from '@/providers/theme';

const fmt = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00');

function SummaryCardImpl() {
  const { theme } = useTheme();

  // ✅ one selector per value (stable, prevents infinite loop)
  const participants = useSplitStore(s => s.participants);
  const expenses     = useSplitStore(s => s.expenses);
  const transfers    = useSplitStore(s => s.transfers);
  const totals       = useSplitStore(s => (s as any).totals);
  const settlement   = useSplitStore(s => (s as any).settlement);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return (id: string) => m.get(id) ?? 'Unknown';
  }, [participants]);

  const fallbackReceiptTotal = useMemo(
    () => expenses.reduce((sum, e: any) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const fallbackToSettle = useMemo(
    () => transfers.reduce((s, t: any) => s + (Number(t.amount) || 0), 0),
    [transfers]
  );

  const receiptTotal = Number(totals?.receipt ?? fallbackReceiptTotal);
  const totalToSettle = Number(totals?.toSettle ?? fallbackToSettle);

  if (!transfers.length) {
    return (
      <View style={{ marginTop: 12 }}>
        <View
          style={[
            styles.subtleCard,
            { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
          ]}
        >
          <Text style={{ fontWeight: '800', marginBottom: 4, color: theme.text }}>
            Nothing to settle
          </Text>
          <Text style={{ color: theme.text, opacity: 0.75 }}>
            Add or edit items to see who owes what.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { marginTop: 12, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
      ]}
    >
      <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 8, color: theme.text }}>
        Who owes who what
      </Text>

      {settlement?.summary ? (
        <Text style={{ color: theme.text, marginBottom: 6 }}>{settlement.summary}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {transfers.map((t: any, idx: number) => (
            <Text key={idx} style={{ color: theme.text }}>
              {nameOf(t.from)} <Text>→</Text> {nameOf(t.to)}: {fmt(Number(t.amount))}
            </Text>
          ))}
        </View>
      )}

      <View
        style={{
          height: 1,
          backgroundColor: theme.border,
          marginVertical: 12,
          opacity: 0.9,
        }}
      />

      {expenses.length > 0 && (
        <Text style={{ color: theme.text, opacity: 0.8, marginBottom: 4 }}>
          Receipt total:{' '}
          <Text style={{ fontWeight: '800', color: theme.text }}>{fmt(receiptTotal)}</Text>
        </Text>
      )}

      <Text style={{ color: theme.text, opacity: 0.85 }}>
        Total to settle:{' '}
        <Text style={{ fontWeight: '800', color: theme.text }}>{fmt(totalToSettle)}</Text>
      </Text>
    </View>
  );
}

export default memo(SummaryCardImpl);
