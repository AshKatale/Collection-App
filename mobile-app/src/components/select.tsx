import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Field, Icon, Sheet } from '@/components/ui';
import { useT } from '@/context/settings';
import { radius, useTheme } from '@/theme';

export type Option = { value: string; label: string };

/** A dropdown that opens a searchable list in a bottom sheet. */
export function Select({ label, value, options, onChange, searchable }: { label?: string; value: string; options: Option[]; onChange: (v: string) => void; searchable?: boolean }) {
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => (q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options), [options, q]);

  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <AppText size={13} weight="semibold" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, backgroundColor: theme.input, paddingHorizontal: 12, minHeight: 46 }}
      >
        <AppText weight="medium" style={{ flex: 1 }} numberOfLines={1} color={current ? 'text' : 'textFaint'}>
          {current?.label ?? t('Select…')}
        </AppText>
        <Icon name="chevron-down" size={18} color="textMuted" />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {searchable || options.length > 8 ? <Field value={q} onChangeText={setQ} placeholder={t('Search…')} autoCapitalize="none" /> : null}
        {shown.map((o) => (
          <Pressable
            key={o.value || '__empty'}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
              setQ('');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
          >
            <AppText style={{ flex: 1 }} weight={o.value === value ? 'bold' : 'regular'}>
              {o.label}
            </AppText>
            {o.value === value ? <Icon name="check" size={18} color="primary" /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
