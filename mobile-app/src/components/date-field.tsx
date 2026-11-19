import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { AppText, Icon, Sheet, Button } from '@/components/ui';
import { addDays, formatDate, isoOf } from '@/lib/format';
import { radius, useTheme } from '@/theme';
import { useT } from '@/context/settings';

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

/** A tappable date that opens the native date picker. Values are YYYY-MM-DD strings. */
export function DateField({ value, onChange, label, min, max }: { value: string; onChange: (iso: string) => void; label?: string; min?: string; max?: string }) {
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(toDate(value));

  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'date',
        minimumDate: min ? toDate(min) : undefined,
        maximumDate: max ? toDate(max) : undefined,
        onChange: (e, d) => {
          if (e.type === 'set' && d) onChange(isoOf(d));
        },
      });
    } else {
      setTemp(toDate(value));
      setOpen(true);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <AppText size={13} weight="semibold" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <Pressable
        onPress={show}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, backgroundColor: theme.input, paddingHorizontal: 12, minHeight: 46 }}
      >
        <Icon name="calendar" size={18} color="textMuted" />
        <AppText weight="medium" style={{ flex: 1 }}>
          {formatDate(value)}
        </AppText>
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label || t('Select date')}>
          <DateTimePicker
            value={temp}
            mode="date"
            display="inline"
            minimumDate={min ? toDate(min) : undefined}
            maximumDate={max ? toDate(max) : undefined}
            onChange={(_, d) => d && setTemp(d)}
            themeVariant={theme.isDark ? 'dark' : 'light'}
          />
          <Button
            title={t('Done')}
            onPress={() => {
              onChange(isoOf(temp));
              setOpen(false);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

/** ‹ date › stepper used on the Collect and Daily-report screens. */
export function DateStepper({ value, onChange, max }: { value: string; onChange: (iso: string) => void; max?: string }) {
  const theme = useTheme();
  const btn = { padding: 10, borderRadius: radius.lg, backgroundColor: theme.cardAlt } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      <Pressable style={[btn, { marginBottom: 1 }]} onPress={() => onChange(addDays(value, -1))} accessibilityLabel="Previous day">
        <Icon name="chevron-left" size={22} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <DateField value={value} onChange={onChange} max={max} />
      </View>
      <Pressable style={[btn, { marginBottom: 1 }]} onPress={() => onChange(addDays(value, 1))} accessibilityLabel="Next day">
        <Icon name="chevron-right" size={22} />
      </Pressable>
    </View>
  );
}
