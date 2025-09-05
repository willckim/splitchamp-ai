// app/manual.tsx
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router } from 'expo-router';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  PressableProps,
  PressableStateCallbackType,
  ViewStyle,
  StyleProp,
} from 'react-native';
import ParticipantForm from '../src/components/ParticipantForm';
import ExpenseForm from '../src/components/ExpenseForm';
import SummaryCard from '../src/components/SummaryCard';
import { useSplitStore } from '../src/store/useSplitStore';
import type { Participant, Expense } from '../src/types';
import { styles } from '../src/styles';
import { useTheme } from '../src/providers/theme';

export default function ManualEvenOnly() {
  const { theme } = useTheme();
  const hasHydrated = useSplitStore(s => s._hasHydrated);

  const participants = useSplitStore(s => s.participants);
  const expenses     = useSplitStore(s => s.expenses);

  const removeExpense     = useSplitStore(s => s.removeExpense);
  const removeParticipant = useSplitStore(s => s.removeParticipant);
  const resetAll          = useSplitStore(s => s.resetAll);
  const createCount       = useSplitStore(s => s.createParticipantsByCount);
  const upsertNames       = useSplitStore(s => s.upsertParticipantNames);
  const applyEqualSplit   = useSplitStore(s => s.applyEqualSplit);

  const hasPeople   = participants.length > 0;
  const hasExpenses = expenses.length > 0;

  // Intro (one-time)
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    (async () => {
      const seen = await AsyncStorage.getItem('seen_intro_manual_even');
      if (!seen) setShowIntro(true);
    })();
  }, []);
  const closeIntro = async () => {
    setShowIntro(false);
    await AsyncStorage.setItem('seen_intro_manual_even', 'true');
  };

  // Rename participants modal
  const [showRename, setShowRename] = useState(false);
  const [namesDraft, setNamesDraft] = useState<string[]>([]);
  const openRename = () => {
    setNamesDraft(participants.map(p => p.name || ''));
    setShowRename(true);
  };
  const saveRename = () => {
    const cleaned = namesDraft.map((n, i) => (n.trim().length ? n.trim() : `Person ${i + 1}`));
    upsertNames(cleaned);
    setShowRename(false);
  };

  if (!hasHydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={{ marginTop: 8, color: theme.text }}>Loading…</Text>
      </View>
    );
  }

  // Small section header
  const SectionHeader = ({
    title,
    right,
  }: { title: string; right?: React.ReactNode }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {right}
    </View>
  );

  // Primary action
  const onSplitEven = () => {
    if (!hasPeople) {
      Alert.alert('Add people', 'Add at least one participant.');
      return;
    }
    if (!hasExpenses) {
      Alert.alert('Add expenses', 'Add at least one expense to split.');
      return;
    }
    applyEqualSplit();
    router.replace('/summary');
  };

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.bg, paddingBottom: 140 },
        ]}
      >
        <View style={[styles.gap16, { backgroundColor: theme.bg }]}>
          {/* Title / Context */}
          <View
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
              Manual (Even Split)
            </Text>
            <Text style={{ color: theme.text, opacity: 0.8 }}>
              This page is for quick, equal splits. For per-person or itemized splits, use{' '}
              <Text style={{ fontWeight: '700' }}>Scan Receipt (AI)</Text>.
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <Pressable
                onPress={openRename}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.bg,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Rename people</Text>
              </Pressable>

              <Link href="/capture" asChild>
                <Pressable
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                  }}
                >
                  <Text style={{ color: theme.text }}>Scan Receipt (AI)</Text>
                </Pressable>
              </Link>
            </View>
          </View>

          {/* Quick add people buttons if none yet */}
          {!hasPeople && (
            <View
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: '700' }}>Add people fast</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[2,3,4].map(n => (
                  <Pressable
                    key={n}
                    onPress={() => createCount?.(n)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.bg,
                    }}
                  >
                    <Text style={{ color: theme.text }}>{n} people</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Forms */}
          <ParticipantForm />
          <ExpenseForm />

          {/* Participants */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <SectionHeader title="Participants" />
            {participants.length === 0 ? (
              <Text style={{ color: theme.text }}>None yet</Text>
            ) : (
              participants.map((p: Participant) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{ color: theme.text, fontSize: 16, flexShrink: 1, maxWidth: '60%' }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {p.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={openRename}
                      style={[styles.navCard, { paddingVertical: 8, minWidth: 96, alignItems: 'center' }]}
                    >
                      <Text style={{ color: theme.text }}>Rename</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeParticipant(p.id)}
                      style={[styles.dangerBtn, { paddingVertical: 8, minWidth: 96, alignItems: 'center' }]}
                    >
                      <Text style={styles.btnText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Expenses */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <SectionHeader title="Expenses" />
            {expenses.length === 0 ? (
              <Text style={{ color: theme.text }}>No expenses added yet.</Text>
            ) : (
              expenses.map((e: Expense) => (
                <View
                  key={e.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{ color: theme.text, flexShrink: 1, maxWidth: '60%' }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {e.description} — ${e.amount.toFixed(2)}
                  </Text>
                  <Pressable
                    onPress={() => removeExpense(e.id)}
                    style={[styles.dangerBtn, { paddingVertical: 8, minWidth: 96, alignItems: 'center' }]}
                  >
                    <Text style={styles.btnText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          {/* Summary */}
          <SummaryCard />

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={onSplitEven}
              style={{
                height: 52,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.accent,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Split Even & View Summary</Text>
            </Pressable>

            <Link href="/capture" asChild>
              <Pressable
                style={{
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.card,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Use AI to Split by Person</Text>
              </Pressable>
            </Link>
          </View>

          {/* Footer nav */}
          <View style={styles.navGrid}>
            <Link href="/summary" asChild>
              <NavCard label="Open Summary" />
            </Link>
            <Link href="/paywall" asChild>
              <NavCard label="Pro Features" />
            </Link>
            <Pressable onPress={resetAll} style={[styles.navCard, styles.dangerBg]}>
              <Text style={styles.navCardText}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Intro modal */}
      <Modal visible={showIntro} animationType="fade" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: '#00000080' }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Manual = Even Split</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• Add people & expenses</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• Tap “Split Even & View Summary”</Text>
            <Text style={[styles.modalText, { color: theme.text }]}>• For itemized/by-person: use Scan Receipt (AI)</Text>
            <Pressable onPress={closeIntro} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Rename participants */}
      <Modal transparent visible={showRename} animationType="slide" onRequestClose={() => setShowRename(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor: theme.card, padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderTopWidth:1, borderColor: theme.border }}>
            <Text style={{ fontSize:18, fontWeight:'700', marginBottom:12, color: theme.text }}>Rename participants</Text>
            {participants.map((p, i) => (
              <View key={p.id} style={{ marginBottom: 10 }}>
                <Text style={{ color: theme.text, marginBottom: 6 }}>Person {i + 1}</Text>
                <TextInput
                  value={namesDraft[i] ?? p.name}
                  onChangeText={(t) => {
                    const copy = [...namesDraft];
                    copy[i] = t;
                    setNamesDraft(copy);
                  }}
                  placeholder={`Person ${i + 1}`}
                  placeholderTextColor="#94a3b8"
                  style={{ borderWidth:1, borderColor:"#e2e8f0", borderRadius:10, padding:12, color: theme.text }}
                />
              </View>
            ))}
            <View style={{ flexDirection:'row', gap:12, marginTop:12 }}>
              <Pressable
                onPress={() => setShowRename(false)}
                style={{ flex:1, padding:14, borderRadius:12, alignItems:'center', borderWidth:1, borderColor: theme.border, backgroundColor: theme.bg }}
              >
                <Text style={{ color: theme.text, fontWeight:'700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveRename}
                style={{ flex:1, padding:14, borderRadius:12, alignItems:'center', backgroundColor: theme.accent }}
              >
                <Text style={{ color:'#fff', fontWeight:'700' }}>Save</Text>
              </Pressable>
            </View>
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
