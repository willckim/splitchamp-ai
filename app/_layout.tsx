import { Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: 'SplitChamp AI',
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text>Settings</Text>
            </Pressable>
          </Link>
        ),
      }}
    />
  );
}
