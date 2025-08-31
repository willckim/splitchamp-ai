// app/index.tsx
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

export default function Home() {
  const hasHydrated = useSplitStore(s => s._hasHydrated);

  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);
  const removeExpense = useSplitStore(s => s.removeExpense);
  const removeParticipant = useSplitStore(s => s.removeParticipant);
  const resetAll = useSplitStore(s => s.resetAll);

  // First-launch intro modal
  const [showIntro, setShowIntro] = useState(false);
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
      <View style={styles.loading}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading your data…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.gap16}>
          <ParticipantForm />
          <ExpenseForm />

          {/* Participants Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Participants</Text>
            {participants.length === 0 ? (
              <Text>None yet</Text>
            ) : (
              participants.map((p: Participant) => (
                <View key={p.id} style={styles.row}>
                  <Text>{p.name}</Text>
                  <Pressable onPress={() => removeParticipant(p.id)} style={styles.dangerBtn}>
                    <Text style={styles.btnText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Expenses Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expenses</Text>
            {expenses.length === 0 ? (
              <Text>No expenses added yet.</Text>
            ) : (
              expenses.map((e: Expense) => (
                <View key={e.id} style={styles.row}>
                  <Text>
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

            <Link href="/settings" asChild>
              <NavCard label="Settings" />
            </Link>
          </View>
        </View>
      </ScrollView>

      {/* Intro Modal */}
      <Modal visible={showIntro} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>👋 Welcome to SplitChamp AI</Text>
            <Text style={styles.modalText}>• Add participants</Text>
            <Text style={styles.modalText}>• Add expenses</Text>
            <Text style={styles.modalText}>• We auto-calc who owes who</Text>
            <Pressable onPress={closeIntro} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>Get Started</Text>
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
  const mergedStyle =
    typeof externalStyle === 'function'
      ? (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
          styles.navCard,
          externalStyle(state),
        ]
      : ([styles.navCard, externalStyle] as StyleProp<ViewStyle>);

  return (
    <Pressable
      {...props}
      style={mergedStyle}
      accessibilityRole="button"
    >
      <Text style={styles.navCardText}>{label}</Text>
    </Pressable>
  );
}
