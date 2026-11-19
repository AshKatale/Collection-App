import React, { useEffect, useState } from 'react';
import { AppText, Button, Field, Sheet, toast } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { requestAccessApi } from '@/api/endpoints';
import { useT } from '@/context/settings';
import { errorMessage, addDays } from '@/lib/format';
import { useSync } from '@/sync/engine';

/** Collector asks the owner for permission to work on another date (needs a connection). */
export function RequestAccessSheet({ visible, initialDate, onClose, onSent }: { visible: boolean; initialDate: string; onClose: () => void; onSent?: () => void }) {
  const t = useT();
  const { online } = useSync();
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setFrom(initialDate);
      setTo(initialDate);
      setReason('');
    }
  }, [visible, initialDate]);

  const submit = async () => {
    if (!online) return toast.error(t('This needs an internet connection'));
    if (!reason.trim()) return toast.error(t('Please give a reason'));
    if (to < from) return toast.error(t('To date cannot be before From date'));
    setBusy(true);
    try {
      await requestAccessApi({ fromDate: from, toDate: to, reason: reason.trim() });
      toast.success(t('Request sent to your owner'));
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t('Failed to send request')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('Ask owner for permission')}>
      <AppText size={13} color="textMuted">
        {t('Collectors can only add or change today’s entries. Your owner can allow other dates.')}
      </AppText>
      <DateField label={t('From date')} value={from} onChange={(v) => (setFrom(v), v > to && setTo(v))} />
      <DateField label={t('To date')} value={to} onChange={setTo} min={from} max={addDays(from, 30)} />
      <Field label={t('Reason')} value={reason} onChangeText={setReason} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} placeholder={t('Why do you need this date?')} />
      <Button title={t('Send request')} icon="send" onPress={submit} loading={busy} />
    </Sheet>
  );
}
