import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Field, Sheet, toast } from '@/components/ui';
import { Select } from '@/components/select';
import { createCustomerApi, getCollectors, updateCustomerApi, ServerCustomer } from '@/api/endpoints';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { errorMessage } from '@/lib/format';
import { useSync } from '@/sync/engine';

type Props = { visible: boolean; onClose: () => void; onSaved: (c: ServerCustomer) => void; initial?: (Partial<ServerCustomer> & { id: string }) | null };

/** Create / edit a customer. Always online: a customer must exist on the server before entries can reference it. */
export function CustomerFormSheet({ visible, onClose, onSaved, initial }: Props) {
  const { user } = useAuth();
  const t = useT();
  const { online } = useSync();
  const manager = user?.role !== 'COLLECTOR';
  const [f, setF] = useState({ accountNo: '', name: '', phone: '', address: '', defaultSavings: '', defaultLoan: '', defaultInterest: '', collectorId: '' });
  const [collectors, setCollectors] = useState<{ id: string; name: string; email: string; isActive: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setF({
      accountNo: initial?.accountNo ?? '',
      name: initial?.name ?? '',
      phone: initial?.phone ?? '',
      address: initial?.address ?? '',
      defaultSavings: String(initial?.defaultSavings ?? initial?.defaultDailyAmount ?? ''),
      defaultLoan: String(initial?.defaultLoan ?? ''),
      defaultInterest: String(initial?.defaultInterest ?? ''),
      collectorId: initial?.assignments?.[0]?.collectorId ?? '',
    });
    if (manager && online) getCollectors().then(setCollectors).catch(() => undefined);
  }, [visible, initial, manager, online]);

  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!online) return toast.error(t('Adding or editing a customer needs an internet connection'));
    if (!f.accountNo.trim() || !f.name.trim()) return toast.error(t('Account number and name are required'));
    const out: Record<string, any> = { ...f, accountNo: f.accountNo.trim(), name: f.name.trim() };
    for (const k of ['defaultSavings', 'defaultLoan', 'defaultInterest'] as const) {
      const v = f[k].trim() === '' ? null : Number(f[k]);
      if (v !== null && !(v > 0)) return toast.error(t('Usual amounts must be greater than 0 (or left empty)'));
      out[k] = v;
    }
    if (!manager) delete out.collectorId;
    setBusy(true);
    try {
      const saved = initial ? await updateCustomerApi(initial.id, out) : await createCustomerApi(out);
      onSaved(saved);
    } catch (e) {
      toast.error(errorMessage(e, t('Failed to save customer')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? t('Edit customer') : t('Register new customer')}>
      {!online ? (
        <AppText size={13} color="warnText" style={{ backgroundColor: '#fef3c7', padding: 8, borderRadius: 8 }}>
          {t('You are offline. Customers can only be added or changed when you are online.')}
        </AppText>
      ) : null}
      <Field label={t('Account Number / Serial No *')} value={f.accountNo} onChangeText={set('accountNo')} autoCapitalize="characters" placeholder="e.g. 686" />
      <Field label={t('Customer Full Name *')} value={f.name} onChangeText={set('name')} placeholder="e.g. Ramesh Patil" />
      {manager && collectors.length > 0 ? (
        <Select
          label={t('Assign to Collector')}
          value={f.collectorId}
          onChange={set('collectorId')}
          options={[{ value: '', label: t('-- Not assigned --') }, ...collectors.filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.name} (${c.email})` }))]}
        />
      ) : null}
      <AppText size={13} weight="semibold" color="textMuted">
        {t('Usual daily amounts (₹)')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['defaultSavings', 'Savings'],
            ['defaultLoan', 'Loan'],
            ['defaultInterest', 'Interest'],
          ] as const
        ).map(([k, l]) => (
          <View key={k} style={{ flex: 1 }}>
            <Field label={t(l)} value={f[k]} onChangeText={set(k)} keyboardType="decimal-pad" placeholder="0" />
          </View>
        ))}
      </View>
      <Field label={t('Phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label={t('Address')} value={f.address} onChangeText={set('address')} multiline />
      <Button title={initial ? t('Save changes') : t('Add customer')} onPress={submit} loading={busy} />
    </Sheet>
  );
}
