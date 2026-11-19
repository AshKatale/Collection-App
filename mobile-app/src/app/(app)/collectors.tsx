import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Badge, Banner, Button, Card, Empty, Field, Icon, Loading, Screen, Sheet, toast, useDebounced } from '@/components/ui';
import { Select } from '@/components/select';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { assignCustomersApi, createCollectorApi, getCollectorCustomers, getCollectors, getCustomers, getUsers, updateCollectorApi } from '@/api/endpoints';
import { useApi } from '@/hooks/data';
import { byAccount, errorMessage } from '@/lib/format';
import { syncNow, useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

export default function Collectors() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const api = useApi('collectors_list', getCollectors, [online]);
  const [form, setForm] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [assign, setAssign] = useState<any | null>(null);

  const guard = () => {
    if (online) return true;
    toast.error(t('This needs an internet connection'));
    return false;
  };

  return (
    <Screen
      title={t('Collectors')}
      back
      onRefresh={api.reload}
      right={
        <Pressable onPress={() => (guard() ? setForm({ open: true, item: null }) : undefined)} hitSlop={10}>
          <Icon name="user-plus" size={22} color="#fff" />
        </Pressable>
      }
      banner={api.fromCache ? <Banner>{t('Offline: showing the last saved list')}</Banner> : undefined}
    >
      {api.loading && !api.data ? (
        <Loading rows={4} />
      ) : api.error ? (
        <Empty icon="wifi-off" title={api.error} />
      ) : (api.data ?? []).length === 0 ? (
        <Empty icon="briefcase" title={t('No collectors added yet.')} />
      ) : (
        (api.data ?? []).map((c: any) => (
          <Card key={c.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{c.name}</AppText>
                <AppText size={12} color="textMuted">
                  {c.email}
                  {c.phone ? ` · ${c.phone}` : ''}
                </AppText>
              </View>
              <Badge text={c.isActive ? t('Active') : t('Inactive')} bg={c.isActive ? theme.successSoft : theme.cardAlt} fg={c.isActive ? theme.success : theme.textMuted} />
            </View>
            <AppText size={12} color="textMuted">
              {c._count?.assignments ?? 0} {t('customers')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small variant="outline" icon="users" title={t('Assign customers')} onPress={() => (guard() ? setAssign(c) : undefined)} />
              <Button small variant="secondary" icon="edit-2" title={t('Edit')} onPress={() => (guard() ? setForm({ open: true, item: c }) : undefined)} />
            </View>
          </Card>
        ))
      )}

      <CollectorForm
        visible={form.open}
        item={form.item}
        isAdmin={user?.role === 'ADMIN'}
        onClose={() => setForm({ open: false, item: null })}
        onSaved={async () => {
          setForm({ open: false, item: null });
          toast.success(t('Collector saved'));
          await api.reload();
        }}
      />
      <AssignSheet
        collector={assign}
        onClose={() => setAssign(null)}
        onSaved={async () => {
          setAssign(null);
          toast.success(t('Assignments saved'));
          await api.reload();
          void syncNow({ quiet: true });
        }}
      />
    </Screen>
  );
}

function CollectorForm({ visible, item, isAdmin, onClose, onSaved }: { visible: boolean; item: any | null; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', ownerId: '', isActive: true });
  const [busy, setBusy] = useState(false);
  const owners = useApi('owners_list', () => getUsers({ role: 'OWNER' }), [], isAdmin && visible);
  useEffect(() => {
    if (visible) setF({ name: item?.name ?? '', email: item?.email ?? '', phone: item?.phone ?? '', password: '', ownerId: item?.ownerId ?? '', isActive: item?.isActive ?? true });
  }, [visible, item]);
  const set = (k: keyof typeof f) => (v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim()) return toast.error(t('Name and email are required'));
    if (!item && f.password.length < 6) return toast.error(t('Password must be at least 6 characters'));
    if (item && f.password && f.password.length < 6) return toast.error(t('Password must be at least 6 characters'));
    if (!item && isAdmin && !f.ownerId) return toast.error(t('Select an owner'));
    setBusy(true);
    try {
      const body: Record<string, any> = { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, isActive: f.isActive };
      if (f.password) body.password = f.password;
      if (item) await updateCollectorApi(item.id, body);
      else await createCollectorApi({ ...body, ownerId: f.ownerId || undefined });
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, t('Failed to save collector')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={item ? t('Edit collector') : t('Add new collector')}>
      <Field label={t('Name')} value={f.name} onChangeText={set('name')} />
      <Field label={t('Email')} value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
      <Field label={t('Phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label={item ? t('New password (leave empty to keep)') : t('Password')} value={f.password} onChangeText={set('password')} secureTextEntry autoCapitalize="none" />
      {isAdmin && !item ? <Select label={t('Owner')} value={f.ownerId} onChange={set('ownerId')} options={(owners.data ?? []).map((o: any) => ({ value: o.id, label: o.name }))} /> : null}
      {item ? (
        <Pressable onPress={() => set('isActive')(!f.isActive)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={f.isActive ? 'check-square' : 'square'} size={22} color="primary" />
          <AppText weight="semibold">{t('Active')}</AppText>
        </Pressable>
      ) : null}
      <Button title={t('Save')} onPress={submit} loading={busy} />
    </Sheet>
  );
}

function AssignSheet({ collector, onClose, onSaved }: { collector: any | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const theme = useTheme();
  const [all, setAll] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 150);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!collector) return;
    setLoading(true);
    Promise.all([getCustomers(), getCollectorCustomers(collector.id)])
      .then(([customers, assigned]) => {
        setAll(customers.filter((c) => c.ownerId === collector.ownerId).sort(byAccount));
        setPicked(new Set(assigned.map((c: any) => c.customerId || c.id)));
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [collector]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((c) => !n || String(c.accountNo).toLowerCase().includes(n) || c.name.toLowerCase().includes(n));
  }, [all, q]);

  if (!collector) return null;
  return (
    <Sheet visible onClose={onClose} title={`${t('Assign customers')} · ${collector.name}`}>
      <Field value={search} onChangeText={setSearch} placeholder={t('Search name or account no.')} />
      {loading ? (
        <Loading />
      ) : (
        shown.map((c) => {
          const on = picked.has(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (on) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                })
              }
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}
            >
              <Icon name={on ? 'check-square' : 'square'} size={22} color={on ? 'primary' : 'textFaint'} />
              <AppText style={{ flex: 1 }}>
                #{c.accountNo} · {c.name}
              </AppText>
            </Pressable>
          );
        })
      )}
      <AppText size={12} color="textMuted">
        {t('{a} of {b} customers selected', { a: picked.size, b: all.length })}
      </AppText>
      <Button
        title={t('Save assignments')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await assignCustomersApi(collector.id, [...picked], true);
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}
