// app/manual.tsx
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  PressableProps,
  PressableStateCallbackType,
  ViewStyle,
  StyleProp,
  Modal,
} from 'react-native';
import ParticipantForm from '../src/components/ParticipantForm';
import ExpenseForm from '../src/components/ExpenseForm';
import SummaryCard from '../src/components/SummaryCard';
import { useSplitStore } from '../src/store/useSplitStore';
import type { Participant, Expense } from '../src/types';
import { styles } from '../src/styles';
import { useTheme } from '../src/providers/theme';

export default function Home() {
  const { theme } = useTheme();
  const hasHydrated = useSplitStore(s => s._hasHydrated);

  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);
  const removeExpense = useSplitStore(s => s.removeExpense);
  const removeParticipant = useSplitStore(s => s.removeParticipant);
  const resetAll = useSplitStore(s => s.resetAll);

  const [showIntro, setShowIntro] = useState(false);

  // Intro once
  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem('seen_intro');
      if (!seen) setShowIntro(true);
    })();
  }, []);

  const closeIntro = async () => {
    setShowIntro(false);
    await AsyncStorage.setItem('seen_intro', 'true');
  };

  if (!hasHydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={{ marginTop: 8, color: theme.text }}>Loading your data…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.gap16, { backgroundColor: theme.bg }]}>

          {/* Participant + Expense forms */}
          <ParticipantForm />
          <ExpenseForm />

          {/* Participants Section */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Participants</Text>
            {participants.length === 0 ? (
              <Text style={{ color: theme.text }}>None yet</Text>
            ) : (
              participants.map((p: Participant) => (
                <View key={p.id} style={styles.row}>
                  <Text style={{ color: theme.text }}>{p.name}</Text>
                  <Pressable onPress={() => removeParticipant(p.id)} style={styles.dangerBtn}>
                    <Text style={styles.btnText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Expenses Section */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Expenses</Text>
            {expenses.length === 0 ? (
              <Text style={{ color: theme.text }}>No expenses added yet.</Text>
            ) : (
              expenses.map((e: Expense) => (
                <View key={e.id} style={styles.row}>
                  <Text style={{ color: theme.text }}>
                    {e.description} — ${e.amount.toFixed(2)}
                  </Text>
                  <Pressable onPress={() => removeExpense(e.id)} style={styles.dangerBtn}>
                    <Text style={styles.btnText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Summary (auto-updates) */}
          <SummaryCard />

          {/* Navigation Buttons */}
          <View style={styles.navGrid}>
            <Link href="/summary" asChild>
              <NavCard label="Open Summary" />
            </Link>

            <Link href="/paywall" asChild>
              <NavCard label="Pro Features" />
            </Link>

            <Link href="/capture" asChild>
              <NavCard label="Scan Receipt (AI)" />
            </Link>

            <Pressable onPress={resetAll} style={[styles.navCard, styles.dangerBg]}>
              <Text style={styles.navCardText}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Intro Modal */}
      <Modal visible={showIntro} animationType="fade" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: '#00000080' }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>👋 Welcome to SplitChamp AI</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• Add participants</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• Add expenses</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• We auto-calc who owes who</Text>
            <Pressable onPress={closeIntro} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Get Started</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Small helper to keep nav cards consistent */
function NavCard(
  {
    label,
    style: externalStyle,
    ...props
  }: { label: string; style?: PressableProps['style'] } & Omit<PressableProps, 'style'>
) {
  const { theme } = useTheme();
  const mergedStyle =
    typeof externalStyle === 'function'
      ? (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
          { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 12 },
          externalStyle(state),
        ]
      : ([
          { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 12 },
          externalStyle,
        ] as StyleProp<ViewStyle>);

  return (
    <Pressable {...props} style={mergedStyle} accessibilityRole="button">
      <Text style={{ color: theme.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
