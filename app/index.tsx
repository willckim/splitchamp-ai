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
import { useTheme } from '../src/providers/theme';
import { apiBase, hasApi } from '../src/lib/ai';

type Health = {
  ok: boolean;
  model?: string;
  azure_receipt?: boolean;
  azure_read?: boolean;
  azure_configured?: boolean;
};

export default function Home() {
  const { theme } = useTheme();
  const hasHydrated = useSplitStore(s => s._hasHydrated);

  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);
  const removeExpense = useSplitStore(s => s.removeExpense);
  const removeParticipant = useSplitStore(s => s.removeParticipant);
  const resetAll = useSplitStore(s => s.resetAll);

  const [showIntro, setShowIntro] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Intro once
  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem('seen_intro');
      if (!seen) setShowIntro(true);
    })();
  }, []);

  // Load backend /health
  const loadHealth = async () => {
    if (!hasApi) {
      setHealth(null);
      return;
    }
    try {
      setHealthLoading(true);
      const res = await fetch(`${apiBase}/health`, { method: 'GET' });
      const data = (await res.json()) as Health;
      setHealth(data);
    } catch {
      setHealth({ ok: false });
    } finally {
      setHealthLoading(false);
    }
  };
  useEffect(() => {
    loadHealth();
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

  // Small helper for the status chip
  const StatusChip = () => {
    if (!hasApi) {
      return (
        <View
          style={{
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: '#FEF3C7',
            borderWidth: 1,
            borderColor: '#F59E0B',
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ color: '#78350F', fontWeight: '700' }}>
            API not configured — set EXPO_PUBLIC_API_BASE in app.json
          </Text>
        </View>
      );
    }

    const ok = !!health?.ok;
    const azureOn = !!(health?.azure_configured && (health?.azure_receipt || health?.azure_read));
    const bg = ok ? '#DCFCE7' : '#FEE2E2';
    const border = ok ? '#16A34A' : '#DC2626';
    const textColor = ok ? '#065F46' : '#7F1D1D';

    return (
      <Pressable onPress={loadHealth} android_ripple={{ color: 'rgba(2,6,23,0.06)' }}>
        <View
          style={{
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: border,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          {healthLoading ? (
            <ActivityIndicator size="small" color={border} />
          ) : (
            <>
              <Text style={{ color: textColor, fontWeight: '800' }}>
                AI: {health?.model ?? '—'}
              </Text>
              <Text style={{ color: textColor }}>•</Text>
              <Text style={{ color: textColor, fontWeight: '700' }}>
                Azure: {azureOn ? 'on' : 'off'}
              </Text>
              <Text style={{ color: textColor }}> (tap to refresh)</Text>
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.gap16, { backgroundColor: theme.bg }]}>
          {/* Backend status chip */}
          <StatusChip />

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
