// app/paywall.tsx
import { View, Text, Pressable, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as MailComposer from 'expo-mail-composer';
import Constants from 'expo-constants';
import { useTheme } from '../src/providers/theme';

export default function Paywall() {
  const { theme } = useTheme();

  const supportEmail =
    (Constants.expoConfig as any)?.extra?.supportEmail ?? 'williamckim11@gmail.com';
  const waitlistUrl =
    (Constants.expoConfig as any)?.extra?.waitlistUrl ?? '';

  async function joinWaitlist() {
    try {
      if (waitlistUrl) {
        await WebBrowser.openBrowserAsync(waitlistUrl, {
          controlsColor: theme.accent,
          dismissButtonStyle: 'close',
          enableBarCollapsing: true,
        });
        return;
      }
      // Fallback: email you if URL is missing
      const subject = 'SplitChamp Pro Waitlist';
      const body =
        `Hi SplitChamp team,\n\nPlease add me to the Pro waitlist.\n\n` +
        `Device: ${Constants.deviceName ?? 'Unknown'}\n` +
        `App version: ${Constants.expoConfig?.version ?? '1.0.0'}`;

      const isAvailable = await MailComposer.isAvailableAsync();
      if (isAvailable) {
        await MailComposer.composeAsync({ recipients: [supportEmail], subject, body });
      } else {
        await WebBrowser.openBrowserAsync(
          `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        );
      }
    } catch (e) {
      Alert.alert('Unable to open waitlist', String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', backgroundColor: theme.bg }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>Go Pro (Soon)</Text>
      <Text style={{ color: theme.text }}>
        Receipt OCR, history, exports, and group links will live here.
      </Text>

      <Pressable
        onPress={joinWaitlist}
        style={{
          backgroundColor: theme.accent,
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Join Waitlist</Text>
      </Pressable>
    </View>
  );
}
