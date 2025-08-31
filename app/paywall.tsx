import { View, Text, Button, Linking } from 'react-native';

export default function Paywall() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '800' }}>Go Pro (Soon)</Text>
      <Text>Receipt OCR, history, exports, and group links will live here.</Text>
      <Button title="Join Waitlist" onPress={() => Linking.openURL('https://example.com/splitchamp-pro')} />
    </View>
  );
}
