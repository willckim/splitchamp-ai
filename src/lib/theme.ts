export type ThemeName = 'pastel' | 'midnight' | 'mint' | 'cyber';

export type Theme = {
  name: ThemeName;
  bg: string;
  text: string;
  subtext: string;
  card: string;
  border: string;
  accent: string;
  statusBarStyle: 'light' | 'dark';
  radius: typeof radius;
  spacing: (n: number) => number;
  shadow: typeof shadow;
};

// static tokens (always the same across themes)
const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
};

const spacing = (n: number) => n * 4; // 4px scale

const shadow = {
  card: {
    shadowColor: 'rgba(15,23,42,0.08)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};

export const THEMES: Record<ThemeName, Theme> = {
  pastel: {
    name: 'pastel',
    bg: '#fdfcff',
    text: '#1a1a1a',
    subtext: '#64748B',
    card: '#ffffff',
    border: '#e9e4ff',
    accent: '#a78bfa',
    statusBarStyle: 'dark',
    radius,
    spacing,
    shadow,
  },
  midnight: {
    name: 'midnight',
    bg: '#0b0f19',
    text: '#e9eef6',
    subtext: '#94A3B8',
    card: '#101826',
    border: '#1a2233',
    accent: '#6ea8fe',
    statusBarStyle: 'light',
    radius,
    spacing,
    shadow,
  },
  mint: {
    name: 'mint',
    bg: '#f3fffb',
    text: '#0f1e14',
    subtext: '#4B5563',
    card: '#ffffff',
    border: '#d6f2e6',
    accent: '#22c55e',
    statusBarStyle: 'dark',
    radius,
    spacing,
    shadow,
  },
  cyber: {
    name: 'cyber',
    bg: '#050812',
    text: '#d7e5ff',
    subtext: '#94A3B8',
    card: '#0c1222',
    border: '#18223a',
    accent: '#00e5ff',
    statusBarStyle: 'light',
    radius,
    spacing,
    shadow,
  },
};
