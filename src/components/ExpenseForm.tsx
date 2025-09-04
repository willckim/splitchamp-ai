// src/components/ExpenseForm.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, Text, Alert } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';
import { styles } from '@/styles';
import { colors } from '@/ui/theme';
import { useTheme } from '@/providers/theme';

export default function ExpenseForm() {
  const { theme } = useTheme();

  const participants = useSplitStore(s => s.participants);
  const addExpense = useSplitStore(s => s.addExpense);

  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidById, setPaidById] = useState<string>(participants[0]?.id ?? '');
  const [splitAmong, setSplitAmong] = useState<string[]>(participants.map(p => p.id)); // default: everyone

  // Tip/Tax helper state (optional)
  const [showHelper, setShowHelper] = useState(false);
  const [subtotalText, setSubtotalText] = useState('');
  const [taxText, setTaxText] = useState('');
  const [tipText, setTipText] = useState(''); // if user types absolute tip
  const [tipPct, setTipPct] = useState<number | null>(null); // if user uses % chips

  const amountRef = useRef<TextInput>(null);

  // Keep selections in sync when participant list changes
  useEffect(() => {
    if (!paidById && participants[0]?.id) setPaidById(participants[0].id);
    setSplitAmong(prev => prev.filter(id => participants.some(p => p.id === id)));
    if (participants.length > 0 && splitAmong.length === 0) {
      setSplitAmong(participants.map(p => p.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants]);

  const everyoneSelected = useMemo(
    () => participants.length > 0 && splitAmong.length === participants.length,
    [participants.length, splitAmong.length]
  );

  const togglePerson = (id: string) => {
    setSplitAmong(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const setEveryone = () => {
    if (participants.length === 0) return;
    setSplitAmong(participants.map(p => p.id));
  };

  // --- Amount sanitizers/helpers ---
  const sanitizeMoney = (txt: string) => {
    const cleaned = txt.replace(/[^\d.]/g, '');
    return cleaned.split('.').slice(0, 2).join('.');
  };
  const onChangeAmount = (txt: string) => setAmountText(sanitizeMoney(txt));
  const onChangeSubtotal = (txt: string) => setSubtotalText(sanitizeMoney(txt));
  const onChangeTax = (txt: string) => setTaxText(sanitizeMoney(txt));
  const onChangeTip = (txt: string) => {
    // If user types a tip $, clear tipPct
    setTipPct(null);
    setTipText(sanitizeMoney(txt));
  };

  // Recompute Amount from helper inputs
  useEffect(() => {
    if (!showHelper) return;
    const sub = Number(subtotalText) || 0;
    const tax = Number(taxText) || 0;
    const tip = tipPct !== null ? sub * tipPct : Number(tipText) || 0;
    const total = sub + tax + tip;
    if (total > 0) setAmountText(total.toFixed(2));
  }, [showHelper, subtotalText, taxText, tipText, tipPct]);

  const onAddExpense = () => {
    if (participants.length === 0) {
      Alert.alert('Add participants first', 'Please add at least one participant.');
      return;
    }
    const amount = Number(amountText);
    if (!description.trim()) {
      Alert.alert('Description required', 'Please enter a description.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount greater than 0.');
      return;
    }
    const payer = paidById || participants[0]?.id || '';
    if (!payer) {
      Alert.alert('Choose who paid', 'Please select a payer.');
      return;
    }
    const validSplit = splitAmong.length ? splitAmong : participants.map(p => p.id);
    if (validSplit.length === 0) {
      Alert.alert('Choose split', 'Select at least one participant to split among.');
      return;
    }

    addExpense({
      description: description.trim(),
      amount,
      paidBy: payer,
      splitAmong: validSplit,
    });

    // reset UI (keep helper expanded state as-is)
    setDescription('');
    setAmountText('');
    setPaidById(participants[0]?.id ?? '');
    setSplitAmong(participants.map(p => p.id));
    setSubtotalText('');
    setTaxText('');
    setTipText('');
    setTipPct(null);
  };

  const canSubmit =
    !!description.trim() && !!Number(amountText) && participants.length > 0;

  return (
    <View style={[styles.card, { gap: 10 }]}>
      {/* Title */}
      <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }}>Add Expense</Text>

      {/* Description */}
      <TextInput
        placeholder="Description (e.g., Dinner)"
        value={description}
        onChangeText={setDescription}
        returnKeyType="next"
        onSubmitEditing={() => amountRef.current?.focus()}
        placeholderTextColor={`${colors.text}66`}
        style={{
          borderWidth: 1,
          borderColor: colors.ring,
          borderRadius: 10,
          padding: 12,
          backgroundColor: '#fff',
          color: colors.text,
        }}
      />

      {/* Amount */}
      <TextInput
        ref={amountRef}
        placeholder="Amount (e.g., 42.50)"
        value={amountText}
        onChangeText={onChangeAmount}
        inputMode="decimal"
        keyboardType="decimal-pad"
        returnKeyType="done"
        onSubmitEditing={canSubmit ? onAddExpense : undefined}
        placeholderTextColor={`${colors.text}66`}
        style={{
          borderWidth: 1,
          borderColor: colors.ring,
          borderRadius: 10,
          padding: 12,
          backgroundColor: '#fff',
          color: colors.text,
        }}
      />

      {/* Tip/Tax helper (optional) */}
      <Pressable
        onPress={() => setShowHelper(v => !v)}
        android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
        style={{
          alignSelf: 'flex-start',
          marginTop: 2,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 8,
          backgroundColor: '#F8FAFC',
          borderWidth: 1,
          borderColor: colors.ring,
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>
          {showHelper ? 'Hide Tip/Tax helper' : 'Tip/Tax helper (optional)'}
        </Text>
      </Pressable>

      {showHelper && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              placeholder="Subtotal"
              value={subtotalText}
              onChangeText={onChangeSubtotal}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholderTextColor={`${colors.text}66`}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.ring,
                borderRadius: 10,
                padding: 12,
                backgroundColor: '#fff',
                color: colors.text,
              }}
            />
            <TextInput
              placeholder="Tax"
              value={taxText}
              onChangeText={onChangeTax}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholderTextColor={`${colors.text}66`}
              style={{
                width: 120,
                borderWidth: 1,
                borderColor: colors.ring,
                borderRadius: 10,
                padding: 12,
                backgroundColor: '#fff',
                color: colors.text,
              }}
            />
          </View>

          {/* Tip % chips + absolute tip input */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {([0.1, 0.15, 0.18, 0.2] as const).map(pct => {
              const active = tipPct === pct;
              return (
                <Pressable
                  key={pct}
                  onPress={() => { setTipPct(pct); setTipText(''); }}
                  android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? theme.accent : colors.ringStrong,
                    backgroundColor: active ? theme.accent : 'transparent',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : colors.text, fontWeight: active ? '800' : '600' }}>
                    {Math.round(pct * 100)}%
                  </Text>
                </Pressable>
              );
            })}

            <TextInput
              placeholder="Tip $"
              value={tipText}
              onChangeText={onChangeTip}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholderTextColor={`${colors.text}66`}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.ring,
                borderRadius: 10,
                padding: 12,
                backgroundColor: '#fff',
                color: colors.text,
              }}
            />
          </View>

          <Text style={{ color: colors.subtext }}>
            Amount will auto-fill from Subtotal + Tax + Tip.
          </Text>
        </View>
      )}

      {/* Who paid? (single-select) */}
      <Text style={{ fontWeight: '600', marginTop: 6, color: colors.text }}>Who paid?</Text>
      {participants.length === 0 ? (
        <Text style={{ color: colors.subtext }}>Add participants first.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {participants.map(p => {
            const active = paidById === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPaidById(p.id)}
                android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                style={{
                  borderWidth: 1,
                  borderColor: active ? theme.accent : colors.ringStrong,
                  backgroundColor: active ? theme.accent : 'transparent',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    color: active ? '#fff' : colors.text,
                    fontWeight: active ? '800' : '600',
                  }}
                >
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Split among (multi-select + Everyone) */}
      <Text style={{ fontWeight: '600', marginTop: 12, color: colors.text }}>Split among</Text>
      {participants.length === 0 ? (
        <Text style={{ color: colors.subtext }}>Add participants first.</Text>
      ) : (
        <>
          {/* Everyone toggle */}
          <Pressable
            onPress={setEveryone}
            android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: everyoneSelected ? theme.accent : colors.ringStrong,
              backgroundColor: everyoneSelected ? theme.accent : 'transparent',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              marginTop: 6,
            }}
          >
            <Text
              style={{
                color: everyoneSelected ? '#fff' : colors.text,
                fontWeight: everyoneSelected ? '800' : '600',
              }}
            >
              Everyone
            </Text>
          </Pressable>

          {/* Individual selection pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {participants.map(p => {
              const checked = splitAmong.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => togglePerson(p.id)}
                  android_ripple={{ color: 'rgba(2,6,23,0.06)' }}
                  style={{
                    borderWidth: 1,
                    borderColor: checked ? theme.accent : colors.ringStrong,
                    backgroundColor: checked ? theme.accent : 'transparent',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      color: checked ? '#fff' : colors.text,
                      fontWeight: checked ? '800' : '600',
                    }}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Submit */}
      <Pressable
        onPress={onAddExpense}
        disabled={!canSubmit}
        android_ripple={canSubmit ? { color: 'rgba(255,255,255,0.15)' } : undefined}
        style={{
          marginTop: 12,
          backgroundColor: canSubmit ? colors.primary : colors.primaryMuted,
          padding: 12,
          borderRadius: 10,
          alignItems: 'center',
          opacity: canSubmit ? 1 : 0.9,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>ADD EXPENSE</Text>
      </Pressable>
    </View>
  );
}