import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, Theme, ThemeName } from '../lib/theme';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

const THEME_KEY = 'split_theme';

type ThemeContextValue = {
  theme: Theme;
  name: ThemeName;
  setThemeName: (t: ThemeName) => void;
  loading: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>('pastel');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved && (saved in THEMES)) setName(saved as ThemeName);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setThemeName = async (t: ThemeName) => {
    setName(t);
    await AsyncStorage.setItem(THEME_KEY, t);
  };

  const theme = useMemo(() => THEMES[name], [name]);

  return (
    <ThemeContext.Provider value={{ theme, name, setThemeName, loading }}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar style={theme.statusBarStyle} />
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
