// app/summary.tsx
import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import SummaryCard from '../src/components/SummaryCard';
import { useSplitStore } from '../src/store/useSplitStore';
import { useTheme } from '../src/providers/theme';
import { styles } from '../src/styles';

export default function SummaryScreen() {
  const { theme } = useTheme();
  const resetAll = useSplitStore(s => s.resetAll);
  const participants = useSplitStore(s => s.participants);
  const expenses = useSplitStore(s => s.expenses);
  const hasData = participants.length > 0 && expenses.length > 0;

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.bg }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>Summary</Text>

      <SummaryCard />

      <View style={{ marginTop: 16, gap: 10 }}>
        {!hasData && (
          <Text style={{ color: theme.text, opacity: 0.75 }}>
            Add people and expenses to generate a settlement summary.
          </Text>
        )}

        <View style={styles.navGrid}>
          <Link href="/capture" asChild>
            <Pressable style={[styles.navCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.navCardText, { color: theme.text }]}>New Scan</Text>
            </Pressable>
          </Link>

          <Pressable onPress={resetAll} style={[styles.navCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
            <Text style={[styles.navCardText, { color: theme.text }]}>Start Over</Text>
          </Pressable>

          <Link href="/manual" asChild>
            <Pressable style={[styles.navCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.navCardText, { color: theme.text }]}>Edit Manually</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
