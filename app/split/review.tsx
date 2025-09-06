// app/split/review.tsx
import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/providers/theme';
import { useSplitStore } from '../../src/store/useSplitStore';
import { useHeaderHeight } from '@react-navigation/elements';
import type { Expense, ExpenseItem, Participant } from '../../src/types';

export default function ReviewSplit() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  // If the Stack header exists, keep only a small pad; otherwise respect safe area.
  const topPad = headerHeight > 0 ? 6 : insets.top + 6;

  const participants = useSplitStore(s => s.participants) as Participant[];
  const expenses     = useSplitStore(s => s.expenses) as Expense[];

  // latest itemized expense
  const exp = useMemo(() => {
    const list = [...expenses].reverse();
    return list.find(e => e.splitMethod === 'itemized' && Array.isArray(e.items));
  }, [expenses]);

  const items: ExpenseItem[] = exp?.items ?? [];
  const tax  = Number(exp?.tax || 0);
  const tip  = Number(exp?.tip || 0);
  const itemsTotal   = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const receiptTotal = itemsTotal + tax + tip;

  const payerId = (exp as any)?.paidBy ?? null;
  const payer   = participants.find(p => p.id === payerId) || null;

  // group items by person (items-only subtotals)
  const byPerson = useMemo(() => {
    const map: Record<string, { person: Participant; items: ExpenseItem[]; subtotal: number }> = {};
    for (const p of participants) map[p.id] = { person: p, items: [], subtotal: 0 };

    for (const it of items) {
      const assign = it.splitAmong ?? [];
      if (assign.length === 1) {
        const pid = assign[0];
        if (map[pid]) {
          map[pid].items.push(it);
          map[pid].subtotal += Number(it.amount) || 0;
        }
      } else if (assign.length > 1) {
        const each = (Number(it.amount) || 0) / assign.length;
        for (const pid of assign) {
          if (map[pid]) {
            map[pid].items.push({
              ...it,
              description: `${it.description} (split ${assign.length})`,
              amount: each,
            } as ExpenseItem);
            map[pid].subtotal += each;
          }
        }
      }
    }
    return Object.values(map);
  }, [participants, items]);

  const unassigned = items.filter(it => !it.splitAmong?.length);
  const peopleSum  = byPerson.reduce((s, row) => s + row.subtotal, 0);
  const checkOk    = Math.abs(peopleSum - itemsTotal) < 0.005;

  // Allocate tax & tip proportionally to items subtotal
  const perPersonWithShares = useMemo(() => {
    const rows = byPerson.map(row => {
      const weight   = itemsTotal > 0 ? row.subtotal / itemsTotal : 0;
      const taxShare = tax * weight;
      const tipShare = tip * weight;
      const total    = row.subtotal + taxShare + tipShare;
      return { ...row, taxShare, tipShare, total };
    });
    return rows;
  }, [byPerson, itemsTotal, tax, tip]);

  const payerRow = perPersonWithShares.find(r => r.person.id === payerId);
  const othersOweList = perPersonWithShares.filter(r => r.person.id !== payerId && r.total > 0);
  const totalOwedToPayer = othersOweList.reduce((s, r) => s + r.total, 0);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg,
        paddingTop: topPad,
        paddingBottom: insets.bottom,
      }}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
          Review assignments
        </Text>
        <Text style={{ color: theme.subtext }}>
          Confirm who got what. Unassigned items will be ignored in the split.
        </Text>

        {/* Totals summary */}
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            borderRadius: 12,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '800' }}>Totals</Text>
          <Text style={{ color: theme.text }}>Items total: ${itemsTotal.toFixed(2)}</Text>
          <Text style={{ color: theme.text }}>
            Tax: ${tax.toFixed(2)} · Tip: ${tip.toFixed(2)}
          </Text>
          <Text style={{ color: theme.text, fontWeight: '800' }}>
            Receipt total: ${receiptTotal.toFixed(2)}
          </Text>
          <Text
            style={{
              color: checkOk ? '#22c55e' : '#f97316',
              fontWeight: '800',
              marginTop: 4,
            }}
          >
            {checkOk
              ? '✓ Assigned items sum matches items total'
              : '⚠ Assigned sum doesn’t match items total'}
          </Text>
        </View>

        {/* Payer & who owes what */}
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            borderRadius: 12,
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '800' }}>Who paid?</Text>
          <Text style={{ color: payer ? theme.text : theme.subtext }}>
            {payer ? payer.name : 'Not selected'}
          </Text>

          {payer && (
            <>
              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />
              <Text style={{ color: theme.text, fontWeight: '800' }}>Each person owes</Text>
              {othersOweList.length === 0 ? (
                <Text style={{ color: theme.subtext, marginTop: 4 }}>
                  Nobody owes anything.
                </Text>
              ) : (
                <View style={{ marginTop: 6, gap: 6 }}>
                  {othersOweList.map(r => (
                    <View
                      key={r.person.id}
                      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <Text style={{ color: theme.text, flex: 1, paddingRight: 8 }}>
                        {r.person.name}
                      </Text>
                      <Text style={{ color: theme.text }}>
                        ${r.total.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />
              <Text style={{ color: theme.text }}>
                {payer.name} consumed: ${((payerRow?.total ?? 0)).toFixed(2)}
              </Text>
              <Text style={{ color: theme.text, fontWeight: '800' }}>
                Total owed to {payer.name}: ${totalOwedToPayer.toFixed(2)}
              </Text>
            </>
          )}
        </View>

        {/* Per-person cards (item lines and subtotals) */}
        {perPersonWithShares.map(row => (
          <View
            key={row.person.id}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '800' }}>{row.person.name}</Text>

            {row.items.length === 0 ? (
              <Text style={{ color: theme.subtext, marginTop: 6 }}>No items</Text>
            ) : (
              <View style={{ marginTop: 6, gap: 6 }}>
                {row.items.map((it, idx) => (
                  <View
                    key={it.id + '_' + idx}
                    style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                  >
                    <Text style={{ color: theme.text, flex: 1, paddingRight: 8 }}>
                      {it.description}
                    </Text>
                    <Text style={{ color: theme.text }}>
                      ${Number(it.amount).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 8 }} />
            <Text style={{ color: theme.text }}>
              Items subtotal: ${row.subtotal.toFixed(2)}
            </Text>
            <Text style={{ color: theme.text }}>
              + Tax share: ${row.taxShare.toFixed(2)} · Tip share: ${row.tipShare.toFixed(2)}
            </Text>
            <Text style={{ color: theme.text, fontWeight: '800', marginTop: 2 }}>
              Total: ${row.total.toFixed(2)}
            </Text>
          </View>
        ))}

        {/* Unassigned warning */}
        {unassigned.length > 0 && (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ color: '#f97316', fontWeight: '800' }}>
              Unassigned items ({unassigned.length})
            </Text>
            <View style={{ marginTop: 6, gap: 6 }}>
              {unassigned.map(it => (
                <View
                  key={it.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: theme.text, flex: 1, paddingRight: 8 }}>
                    {it.description}
                  </Text>
                  <Text style={{ color: theme.text }}>
                    ${Number(it.amount).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ color: theme.subtext, marginTop: 6 }}>
              These will not be included unless you assign them.
            </Text>
          </View>
        )}

        {/* Buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* back to assign (explicit path, since Assign -> Review used replace) */}
          <Pressable
            onPress={() => router.replace('/split/assign')}
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
            <Text style={{ color: theme.text, fontWeight: '700' }}>Back to Assign</Text>
          </Pressable>

          {/* finish -> home */}
          <Pressable
            onPress={() => router.replace('/')}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.accent,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Finish</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
