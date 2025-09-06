// app/summary.tsx
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import SummaryCard from '@/components/SummaryCard';
import { useSplitStore } from '@/store/useSplitStore';
import { useTheme } from '@/providers/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SummaryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const participants = useSplitStore(s => s.participants);
  const expenses     = useSplitStore(s => s.expenses);
  const hasData      = participants.length > 0 && expenses.length > 0;

  const discrepancy  = useSplitStore(s => s.getItemizationDiscrepancy());

  const onFinish = () => {
    router.replace('/'); // go back to home (index.tsx)
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 6, flex: 1 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '800',
            color: theme.text,
            marginBottom: 12,
          }}
        >
          Summary
        </Text>

        {hasData && Math.abs(discrepancy) > 0 && (
          <View
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: theme.text }}>
              Heads up: receipt math is off by{' '}
              <Text style={{ fontWeight: '800' }}>${Math.abs(discrepancy).toFixed(2)}</Text>.
              Review items, tax, or tip if needed.
            </Text>
          </View>
        )}

        <SummaryCard />

        {/* Finish button */}
        <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 24 }}>
          <Pressable
            onPress={onFinish}
            style={{
              height: 48,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.accent,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Finish</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
