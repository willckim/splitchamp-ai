// app/summary.tsx
import { View, Text, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import SummaryCard from '@/components/SummaryCard';
import { useSplitStore } from '@/store/useSplitStore';
import { useTheme } from '@/providers/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SummaryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const resetAll     = useSplitStore(s => s.resetAll);
  const participants = useSplitStore(s => s.participants);
  const expenses     = useSplitStore(s => s.expenses);
  const hasData      = participants.length > 0 && expenses.length > 0;

  const discrepancy  = useSplitStore(s => s.getItemizationDiscrepancy());

  const onStartOver = () => {
    resetAll();
    router.replace('/capture');
  };

  const BTN_H = 52;
  const radius = 14;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginBottom: 12 }}>Summary</Text>

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
              <Text style={{ fontWeight: '800' }}>${Math.abs(discrepancy).toFixed(2)}</Text>. Tap{' '}
              <Text style={{ fontWeight: '800' }}>Edit Manually</Text> to adjust items, tax, or tip.
            </Text>
          </View>
        )}

        <SummaryCard />

        {/* Actions */}
        <View style={{ marginTop: 16, gap: 10 }}>
          {/* Primary */}
          {hasData ? (
            <Link href="/split/assign" asChild>
              <Pressable
                style={{
                  height: BTN_H,
                  borderRadius: radius,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.accent,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Edit Manually</Text>
              </Pressable>
            </Link>
          ) : (
            <Pressable
              disabled
              style={{
                height: BTN_H,
                borderRadius: radius,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#6b7280',
                opacity: 0.6,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Edit Manually</Text>
            </Pressable>
          )}
        </View>

        {/* Quiet footer link */}
        <Pressable onPress={onStartOver} style={{ paddingVertical: 16, alignItems: 'center' }} hitSlop={8}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700' }}>Start Over</Text>
        </Pressable>
      </View>
    </View>
  );
}
