// src/components/SummaryCard.tsx
import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';
import { styles } from '@/styles';
import { colors } from '@/ui/theme';

const fmt = (n: number) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00');

function SummaryCardImpl() {
  const transfers = useSplitStore(s => s.transfers);
  const participants = useSplitStore(s => s.participants);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return (id: string) => m.get(id) ?? 'Unknown';
  }, [participants]);

  // Empty state — friendly card
  if (!transfers.length) {
    return (
      <View style={{ marginTop: 12 }}>
        <View style={styles.subtleCard}>
          <Text style={{ fontWeight: '800', marginBottom: 4, color: colors.text }}>
            Nothing to settle
          </Text>
          <Text style={{ color: colors.subtext }}>
            Add a few expenses to see who owes what.
          </Text>
        </View>
      </View>
    );
  }

  const totalToSettle = transfers.reduce((s, t) => s + t.amount, 0);

  return (
    <View style={[styles.card, { marginTop: 12 }]}>
      <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 8, color: colors.text }}>
        Who owes who what
      </Text>

      <View style={{ gap: 6 }}>
        {transfers.map((t, idx) => (
          <Text key={idx} style={{ color: colors.text }}>
            {nameOf(t.from)} <Text>→</Text> {nameOf(t.to)}: {fmt(t.amount)}
          </Text>
        ))}
      </View>

      {/* Divider + footer */}
      <View
        style={{
          height: 1,
          backgroundColor: colors.ring,
          marginVertical: 12,
          opacity: 0.9,
        }}
      />
      <Text style={{ color: colors.subtext }}>
        Total to settle: <Text style={{ fontWeight: '800', color: colors.text }}>{fmt(totalToSettle)}</Text>
      </Text>
    </View>
  );
}

export default memo(SummaryCardImpl);
