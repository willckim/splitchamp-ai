// app/summary.tsx
import { View, Text, Pressable, Modal } from 'react-native';
import { Link, router } from 'expo-router';
import SummaryCard from '../src/components/SummaryCard';
import { useSplitStore } from '../src/store/useSplitStore';
import { useTheme } from '../src/providers/theme';
import { styles } from '../src/styles';
import { useState } from 'react';

export default function SummaryScreen() {
  const { theme } = useTheme();
  const resetAll = useSplitStore(s => s.resetAll);
  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);
  const hasData = participants.length > 0 && expenses.length > 0;

  const discrepancy = useSplitStore(s => s.getItemizationDiscrepancy());
  const autoAssign = useSplitStore(s => s.autoAssignItemsByName);
  const equalSplit = useSplitStore(s => s.applyEqualSplit);
  const weightedSplit = useSplitStore(s => s.applyWeightedSplit);

  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.bg }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 8 }}>
        Summary
      </Text>

      {/* Anomaly / discrepancy banner */}
      {hasData && Math.abs(discrepancy) > 0 && (
        <View style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 10,
          padding: 10,
          marginBottom: 8
        }}>
          <Text style={{ color: theme.text }}>
            Heads up: receipt math is off by <Text style={{ fontWeight: '800' }}>
              ${Math.abs(discrepancy).toFixed(2)}
            </Text>. Try suggestions below.
          </Text>
        </View>
      )}

      <SummaryCard />

      <View style={{ marginTop: 12, gap: 10 }}>
        <View style={styles.navGrid}>
          <Pressable
            onPress={() => setShowSuggestions(true)}
            style={[
              styles.navCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }
            ]}
          >
            <Text style={[styles.navCardText, { color: theme.text }]}>AI Split Suggestions</Text>
          </Pressable>

          <Link href="/capture" asChild>
            <Pressable
              style={[
                styles.navCard,
                { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }
              ]}
            >
              <Text style={[styles.navCardText, { color: theme.text }]}>New Scan</Text>
            </Pressable>
          </Link>

          <Pressable
            onPress={() => {
              resetAll();
              router.replace('/capture');
            }}
            style={[
              styles.navCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }
            ]}
          >
            <Text style={[styles.navCardText, { color: theme.text }]}>Start Over</Text>
          </Pressable>

          <Link href="/manual" asChild>
            <Pressable
              style={[
                styles.navCard,
                { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }
              ]}
            >
              <Text style={[styles.navCardText, { color: theme.text }]}>Edit Manually</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Suggestions Modal */}
      <Modal transparent visible={showSuggestions} animationType="slide" onRequestClose={() => setShowSuggestions(false)}>
        <View style={{ flex:1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor: theme.card, padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderTopWidth:1, borderColor: theme.border }}>
            <Text style={{ fontSize:18, fontWeight:'700', marginBottom:12, color: theme.text }}>AI Split Suggestions</Text>

            <Pressable
              onPress={() => { autoAssign(); setShowSuggestions(false); }}
              style={{ padding:12, borderRadius:12, borderWidth:1, borderColor: theme.border, backgroundColor: theme.bg, marginBottom: 8 }}
            >
              <Text style={{ color: theme.text }}>Auto-assign items by names (match items to participants)</Text>
            </Pressable>

            <Pressable
              onPress={() => { equalSplit(); setShowSuggestions(false); }}
              style={{ padding:12, borderRadius:12, borderWidth:1, borderColor: theme.border, backgroundColor: theme.bg, marginBottom: 8 }}
            >
              <Text style={{ color: theme.text }}>Split everything equally</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                // Example preset: first person weight 2x, others 1x
                const n = participants.length;
                const weights = Array.from({ length: n }).map((_, i) => (i === 0 ? 2 : 1));
                weightedSplit(weights);
                setShowSuggestions(false);
              }}
              style={{ padding:12, borderRadius:12, borderWidth:1, borderColor: theme.border, backgroundColor: theme.bg }}
            >
              <Text style={{ color: theme.text }}>Weighted split (example: first person ×2)</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowSuggestions(false)}
              style={{ marginTop: 12, padding:12, borderRadius:12, alignItems:'center', backgroundColor: theme.accent }}
            >
              <Text style={{ color:'#fff', fontWeight:'700' }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
