// app/settings.tsx
import { View, Text, Pressable, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';
import Constants from 'expo-constants';
import { useTheme } from '../src/providers/theme';        // ⬅️ add
import type { ThemeName } from '../src/lib/theme';        // ⬅️ add

const Row = ({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) => (
  <Pressable
    onPress={onPress}
    testID={testID}
    style={({ pressed }) => ({
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: pressed ? '#f2f2f2' : 'white',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#e6e6e6',
      marginTop: 8,
    })}
  >
    <Text style={{ fontSize: 16, fontWeight: '600' }}>{title}</Text>
  </Pressable>
);

const ThemeChip = ({
  label,
  value,
  current,
  onSelect,
  accent,
}: {
  label: string;
  value: ThemeName;
  current: ThemeName;
  onSelect: (v: ThemeName) => void;
  accent: string;
}) => {
  const selected = current === value;
  return (
    <Pressable
      onPress={() => onSelect(value)}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? accent : '#e6e6e6',
        backgroundColor: selected ? `${accent}22` : 'white',
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
};

export default function Settings() {
  const router = useRouter();
  const { theme, name, setThemeName } = useTheme();       // ⬅️ add

  const version =
    Constants.expoConfig?.version ??
    (Constants.manifest2 as any)?.extra?.version ??
    '1.0.0';

  const supportEmail =
    (Constants.expoConfig as any)?.extra?.supportEmail ??
    'williamckim11@gmail.com';

  const supportSubject = 'SplitChamp AI — Support';

  async function contactSupport() {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: [supportEmail],
          subject: supportSubject,
          body:
            `Hi team,\n\n` +
            `Issue/Question:\n\n` +
            `Device: ${Constants.deviceName ?? 'Unknown'}\n` +
            `App version: ${version}\n`,
        });
      } else {
        const mailto = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(supportSubject)}`;
        await Linking.openURL(mailto);
      }
    } catch (e) {
      Alert.alert('Could not open email', String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: theme.bg }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 6, color: theme.text }}>Settings</Text>

      {/* Theme picker */}
      <View style={{ padding: 12, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 10, color: theme.text }}>Theme</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <ThemeChip label="🩷 Pastel"   value="pastel"   current={name} onSelect={setThemeName} accent={theme.accent} />
          <ThemeChip label="🌌 Midnight" value="midnight" current={name} onSelect={setThemeName} accent={theme.accent} />
          <ThemeChip label="🌿 Mint"     value="mint"     current={name} onSelect={setThemeName} accent={theme.accent} />
          <ThemeChip label="🧬 Cyber"    value="cyber"    current={name} onSelect={setThemeName} accent={theme.accent} />
        </View>
      </View>

      <Row title="Privacy Policy" onPress={() => router.push('/legal/privacy')} testID="privacy" />
      <Row title="Terms of Use"   onPress={() => router.push('/legal/terms')}   testID="terms" />
      <Row title="Contact Support" onPress={contactSupport} testID="support" />

      <Text style={{ marginTop: 18, color: '#666' }}>Version {version}</Text>
    </View>
  );
}
