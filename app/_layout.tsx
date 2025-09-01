import { Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import { ThemeProvider, useTheme } from '../src/providers/theme';

function HeaderRight() {
  const { theme } = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ color: theme.accent }}>Settings</Text>
      </Pressable>
    </Link>
  );
}

function LayoutStack() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: 'SplitChamp AI',
        headerStyle: { backgroundColor: theme.card },
        headerTitleStyle: { color: theme.text },
        headerRight: () => <HeaderRight />,
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LayoutStack />
    </ThemeProvider>
  );
}
