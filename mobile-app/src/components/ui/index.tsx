import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppText, FONT } from './text';
import { radius, useTheme } from '@/theme';

export { AppText } from './text';
export { toast, Toaster } from './toast';
export { confirm } from './confirm';
export type FeatherName = keyof typeof Feather.glyphMap;

export const Icon = ({ name, size = 20, color = 'text' }: { name: FeatherName; size?: number; color?: string }) => {
  const theme = useTheme();
  return <Feather name={name} size={size} color={(theme as any)[color] ?? color} />;
};

/* ───────── Card ───────── */
export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const base: ViewStyle = { backgroundColor: theme.card, borderRadius: radius.xl, borderWidth: 1, borderColor: theme.border, padding: 16 };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[base, style]}>{children}</View>;
}

/* ───────── Button ───────── */
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  full,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: FeatherName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const map = {
    primary: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
    secondary: { bg: theme.cardAlt, fg: theme.text, border: theme.cardAlt },
    outline: { bg: 'transparent', fg: theme.primary, border: theme.primary },
    danger: { bg: theme.danger, fg: '#fff', border: theme.danger },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: map.bg,
          borderColor: map.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : undefined,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={map.fg} /> : icon ? <Feather name={icon} size={small ? 15 : 18} color={map.fg} /> : null}
      <AppText weight="semibold" size={small ? 13 : 15} color={map.fg}>
        {title}
      </AppText>
    </Pressable>
  );
}

/* ───────── Inputs ───────── */
export function Field({
  label,
  error,
  hint,
  right,
  style,
  ...rest
}: TextInputProps & { label?: string; error?: string | null; hint?: string; right?: React.ReactNode }) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <AppText size={13} weight="semibold" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          placeholderTextColor={theme.textFaint}
          {...rest}
          onFocus={(e) => {
            setFocus(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            rest.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              fontFamily: FONT.medium,
              fontSize: 16,
              color: theme.text,
              backgroundColor: theme.input,
              borderWidth: focus ? 2 : 1,
              borderColor: error ? theme.danger : focus ? theme.primary : theme.border,
              borderRadius: radius.lg,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'ios' ? 12 : 9,
              minHeight: 46,
            },
            style,
          ]}
        />
        {right ? <View style={{ position: 'absolute', right: 8 }}>{right}</View> : null}
      </View>
      {error ? (
        <AppText size={12} color="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText size={12} color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/* ───────── Badge / chips ───────── */
export function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1, alignSelf: 'flex-start' }}>
      <AppText size={11} weight="semibold" color={fg}>
        {text}
      </AppText>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (k: T) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              borderRadius: radius.lg,
              borderWidth: 1,
              backgroundColor: on ? theme.primary : theme.card,
              borderColor: on ? theme.primary : theme.border,
            }}
          >
            <AppText size={13} weight="semibold" color={on ? theme.onPrimary : theme.textMuted} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────── Screen scaffolding ───────── */
export function ScreenHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: theme.header, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {back ? (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} accessibilityLabel="Back" style={{ padding: 4 }}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, paddingLeft: back ? 0 : 4 }}>
        <AppText size={19} weight="bold" color="#ffffff" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={12} color="rgba(255,255,255,0.8)" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({
  title,
  subtitle,
  back,
  right,
  children,
  scroll = true,
  onRefresh,
  refreshing,
  banner,
  padded = true,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  banner?: React.ReactNode;
  padded?: boolean;
}) {
  const theme = useTheme();
  const [pulling, setPulling] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader title={title} subtitle={subtitle} back={back} right={right} />
      {banner}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: padded ? 14 : 0, paddingBottom: 40, gap: 12 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing || pulling}
                onRefresh={async () => {
                  setPulling(true);
                  try {
                    await onRefresh();
                  } finally {
                    setPulling(false);
                  }
                }}
                tintColor={theme.primary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
}

/* ───────── Bottom sheet ───────── */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: theme.overlay }} onPress={() => (Keyboard.dismiss(), onClose())} />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '88%',
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <AppText size={17} weight="bold" style={{ flex: 1 }} numberOfLines={2}>
              {title}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Feather name="x" size={22} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ───────── states ───────── */
export function Banner({ kind = 'warn', children, onPress }: { kind?: 'warn' | 'info' | 'error'; children: React.ReactNode; onPress?: () => void }) {
  const theme = useTheme();
  const c = kind === 'warn' ? { bg: theme.warnSoft, fg: theme.warnText, ic: 'wifi-off' } : kind === 'error' ? { bg: theme.dangerSoft, fg: theme.danger, ic: 'alert-triangle' } : { bg: theme.blueSoft, fg: theme.blueText, ic: 'info' };
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Feather name={c.ic as any} size={16} color={c.fg} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <AppText size={13} weight="medium" color={c.fg}>{children}</AppText> : children}</View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: FeatherName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20, gap: 8 }}>
      <Icon name={icon} size={36} color="textFaint" />
      <AppText weight="semibold" align="center">
        {title}
      </AppText>
      {text ? (
        <AppText size={13} color="textMuted" align="center">
          {text}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ rows = 0 }: { rows?: number }) {
  const theme = useTheme();
  if (rows > 0) {
    return (
      <View style={{ gap: 12, padding: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={{ height: 52, borderRadius: 10, backgroundColor: theme.cardAlt, opacity: 0.7 }} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ padding: 30, alignItems: 'center' }}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

/** Debounce a changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
