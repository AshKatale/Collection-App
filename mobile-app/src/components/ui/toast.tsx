import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppText } from './text';
import { useTheme } from '@/theme';

type Kind = 'success' | 'error' | 'info';
type Item = { id: number; kind: Kind; text: string };

let push: ((kind: Kind, text: string) => void) | null = null;
export const toast = {
  success: (t: string) => push?.('success', t),
  error: (t: string) => push?.('error', t),
  info: (t: string) => push?.('info', t),
};

export function Toaster() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const id = useRef(0);

  useEffect(() => {
    push = (kind, text) => {
      const n = ++id.current;
      setItems((prev) => [...prev.slice(-2), { id: n, kind, text }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== n)), kind === 'error' ? 5000 : 3000);
    };
    return () => {
      push = null;
    };
  }, []);

  const color = (k: Kind) => (k === 'success' ? theme.success : k === 'error' ? theme.danger : theme.primary);
  const icon = (k: Kind) => (k === 'success' ? 'check-circle' : k === 'error' ? 'alert-circle' : 'info');

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-start', paddingTop: insets.top + 8, paddingHorizontal: 12 }]}>
      {items.map((i) => (
        <Pressable
          key={i.id}
          onPress={() => setItems((p) => p.filter((x) => x.id !== i.id))}
          style={[styles.toast, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: color(i.kind) }]}
        >
          <Feather name={icon(i.kind) as any} size={18} color={color(i.kind)} />
          <AppText size={14} weight="medium" style={{ flex: 1 }}>
            {i.text}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
