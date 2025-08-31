import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as MailComposer from 'expo-mail-composer';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

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
    })}
  >
    <Text style={{ fontSize: 16, fontWeight: '600' }}>{title}</Text>
  </Pressable>
);

export default function Settings() {
  const router = useRouter();
  const version =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.version ??
    '1.0.0';

  async function contactSupport() {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (isAvailable) {
        await MailComposer.composeAsync({
          recipients: ['support@yourapp.com'],
          subject: 'SplitChamp AI — Support',
          body:
            `Hi team,\n\n` +
            `Issue/Question:\n\n` +
            `Device: ${Constants.deviceName ?? 'Unknown'}\n` +
            `App version: ${version}\n`,
        });
      } else {
        // graceful fallback to a browser-based email composer
        await WebBrowser.openBrowserAsync(
          `mailto:support@yourapp.com?subject=${encodeURIComponent('SplitChamp AI — Support')}`
        );
      }
    } catch (e) {
      Alert.alert('Could not open email', String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: '#fafafa' }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 6 }}>Settings</Text>

      <Row title="Privacy Policy" onPress={() => router.push('/legal/privacy')} testID="privacy" />
      <Row title="Terms of Use"   onPress={() => router.push('/legal/terms')}   testID="terms" />
      <Row title="Contact Support" onPress={contactSupport} testID="support" />

      <Text style={{ marginTop: 18, color: '#666' }}>Version {version}</Text>
    </View>
  );
}
