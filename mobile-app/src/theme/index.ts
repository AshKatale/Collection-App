import { useColorScheme } from 'react-native';
import { useSettings } from '@/context/settings';

/** Same green brand palette as the web app (tailwind `primary`). */
export const primary = {
  50: '#eef7f4',
  100: '#d5ebe4',
  200: '#aed7ca',
  300: '#7fbfac',
  400: '#53a38c',
  500: '#1f6f5c',
  600: '#1a5d4d',
  700: '#154b3f',
  800: '#103a31',
};

export type Palette = {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primarySoftText: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  warnText: string;
  success: string;
  successSoft: string;
  blueSoft: string;
  blueText: string;
  input: string;
  overlay: string;
  header: string;
  isDark: boolean;
};

const light: Palette = {
  bg: '#f9fafb',
  card: '#ffffff',
  cardAlt: '#f3f4f6',
  border: '#e5e7eb',
  text: '#1f2937',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  primary: primary[500],
  primaryDark: primary[600],
  primarySoft: primary[50],
  primarySoftText: primary[700],
  onPrimary: '#ffffff',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  warn: '#d97706',
  warnSoft: '#fffbeb',
  warnText: '#92400e',
  success: '#10b981',
  successSoft: '#ecfdf5',
  blueSoft: '#eff6ff',
  blueText: '#1d4ed8',
  input: '#ffffff',
  overlay: 'rgba(0,0,0,0.45)',
  header: primary[500],
  isDark: false,
};

const dark: Palette = {
  bg: '#12171d',
  card: '#1b222b',
  cardAlt: '#222b36',
  border: '#2c3743',
  text: '#e8edf3',
  textMuted: '#9aa7b5',
  textFaint: '#6b7a8a',
  primary: '#3a9b82',
  primaryDark: '#2f8a72',
  primarySoft: '#183a32',
  primarySoftText: '#8fd6c0',
  onPrimary: '#ffffff',
  danger: '#f87171',
  dangerSoft: '#3a1d1d',
  warn: '#fbbf24',
  warnSoft: '#3a2f14',
  warnText: '#fcd34d',
  success: '#34d399',
  successSoft: '#13332a',
  blueSoft: '#172a45',
  blueText: '#93c5fd',
  input: '#151b22',
  overlay: 'rgba(0,0,0,0.65)',
  header: '#12171d',
  isDark: true,
};

export function useTheme(): Palette {
  const system = useColorScheme();
  const { settings } = useSettings();
  const mode = settings.theme === 'system' ? system : settings.theme;
  return mode === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;
