import { View, Text, Button, Linking } from 'react-native';
export default function Settings() {
  return (
    <View style={{ flex:1, padding:16, gap:12 }}>
      <Text style={{ fontSize:22, fontWeight:'700' }}>Settings</Text>
      <Button title="Privacy Policy" onPress={() => Linking.openURL('https://yourdomain.com/privacy')} />
      <Button title="Terms of Use"   onPress={() => Linking.openURL('https://yourdomain.com/terms')} />
      <Button title="Contact Support" onPress={() => Linking.openURL('mailto:support@yourdomain.com')} />
      <Text style={{ marginTop:16, color:'#666' }}>Version 1.0.0</Text>
    </View>
  );
}
