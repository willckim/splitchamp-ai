// app/index.tsx
import { Link } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { useMemo } from 'react';
import { makeStyles } from '../src/styles';
import { useTheme } from '../src/providers/theme';

export default function Index() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={[styles.screen, styles.landingWrap]}>
      {/* Brand / hero card */}
      <View
        style={[
          styles.brandCard,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <View
          style={[
            styles.logoCircle,
            { borderColor: theme.accent, backgroundColor: theme.bg },
          ]}
        >
          <Text style={styles.logoEmoji}>🧾</Text>
        </View>

        <Text style={[styles.brandTitle, { color: theme.text }]}>
          SplitChamp AI
        </Text>
        <Text style={[styles.brandTag, { color: theme.text, opacity: 0.7 }]}>
          Split receipts in seconds
        </Text>

        <Text style={[styles.brandHint, { color: theme.text, opacity: 0.9 }]}>
          📸 Use AI for almost all receipts. Tip Helper is available when you just need
          to quickly calculate tax & tip.
        </Text>
      </View>

      {/* Scan Receipt (AI) button */}
      <Link href="/capture" asChild>
        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderRadius: 12,
            backgroundColor: theme.accent,
            marginTop: 12,
          }}
        >
          <Text style={{ fontSize: 18 }}>📷</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
            Scan Receipt (AI)
          </Text>
        </Pressable>
      </Link>

      {/* Tip Helper button (theme-safe colors, same layout) */}
      <Link href="/tip-helper" asChild>
        <Pressable
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderRadius: 12,
            backgroundColor: theme.card,     // was theme.text (too bright in dark themes)
            borderWidth: 1,
            borderColor: theme.border,
            marginTop: 12,
          }}
        >
          <Text style={{ fontSize: 18 }}>💡</Text>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
            Tip Helper
          </Text>
        </Pressable>
      </Link>

      <Text style={styles.footerText}>
        Privacy-first · Runs locally with optional cloud assist for OCR
      </Text>
    </View>
  );
}
