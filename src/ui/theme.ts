// src/ui/theme.ts
export const colors = {
  bg: '#F6F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  subtext: '#64748B',
  primary: '#2563EB',
  primaryMuted: '#94A3B8',
  danger: '#EF4444',
  ring: '#E5E7EB',
  ringStrong: '#CBD5E1',
  pillOn: '#2563EB',
  pillOff: '#E5E7EB',
  shadow: 'rgba(15,23,42,0.08)',
};

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
};

export const spacing = (n: number) => n * 4; // 4px scale

export const shadow = {
  // subtle iOS/Android friendly card shadow
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};
