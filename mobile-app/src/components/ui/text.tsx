import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useTheme, Palette } from '@/theme';

export const FONT = {
  regular: 'NotoSansDevanagari_400Regular',
  medium: 'NotoSansDevanagari_500Medium',
  semibold: 'NotoSansDevanagari_600SemiBold',
  bold: 'NotoSansDevanagari_700Bold',
} as const;
export type Weight = keyof typeof FONT;

export type AppTextProps = TextProps & {
  weight?: Weight;
  size?: number;
  color?: keyof Palette | (string & {});
  align?: TextStyle['textAlign'];
  mono?: boolean;
  tabular?: boolean;
};

/** Every piece of text uses Noto Sans Devanagari, so Marathi and English look the same on all phones. */
export function AppText({ weight = 'regular', size = 15, color = 'text', align, mono, tabular, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const resolved = (theme as any)[color] ?? color;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: FONT[weight],
          fontSize: size,
          color: resolved,
          textAlign: align,
          // Devanagari needs more line height than the font's default metrics, or the matras get clipped
          lineHeight: Math.round(size * 1.5),
        },
        mono && { fontVariant: ['tabular-nums'] },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
