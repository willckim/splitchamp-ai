export type ThemeName = 'pastel' | 'midnight' | 'mint' | 'cyber';

export type Theme = {
  name: ThemeName;
  bg: string;
  text: string;
  card: string;
  border: string;
  accent: string;
  statusBarStyle: 'light' | 'dark';
};

export const THEMES: Record<ThemeName, Theme> = {
  pastel: {
    name: 'pastel',
    bg: '#fdfcff',
    text: '#1a1a1a',
    card: '#ffffff',
    border: '#e9e4ff',
    accent: '#a78bfa',
    statusBarStyle: 'dark',
  },
  midnight: {
    name: 'midnight',
    bg: '#0b0f19',
    text: '#e9eef6',
    card: '#101826',
    border: '#1a2233',
    accent: '#6ea8fe',
    statusBarStyle: 'light',
  },
  mint: {
    name: 'mint',
    bg: '#f3fffb',
    text: '#0f1e14',
    card: '#ffffff',
    border: '#d6f2e6',
    accent: '#22c55e',
    statusBarStyle: 'dark',
  },
  cyber: {
    name: 'cyber',
    bg: '#050812',
    text: '#d7e5ff',
    card: '#0c1222',
    border: '#18223a',
    accent: '#00e5ff',
    statusBarStyle: 'light',
  },
};
