import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Badge, Banner, Button, Card, Empty, Field, Icon, Loading, Screen, Segmented, Sheet, confirm, toast } from '@/components/ui';
import { Select } from '@/components/select';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { deleteUserApi, getUsers, registerApi, updateUserApi } from '@/api/endpoints';
import { useApi } from '@/hooks/data';
import { errorMessage } from '@/lib/format';
import { useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

const ROLES = ['ADMIN', 'OWNER', 'COLLECTOR'];

export default function Users() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const [role, setRole] = useState('');
  const api = useApi(`users_${role}`, () => getUsers(role ? { role } : undefined), [role, online]);
  const owners = useApi('owners_list', () => getUsers({ role: 'OWNER' }), [online]);
  const [form, setForm] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });

  const guard = () => {
    if (online) return true;
    toast.error(t('This needs an internet connection'));
    return false;
  };

  const deactivate = async (u: any) => {
    if (!guard()) return;
    if (!(await confirm({ title: t('Deactivate {name}?', { name: u.name }), confirmLabel: t('Deactivate'), cancelLabel: t('Cancel'), destructive: true }))) return;
    try {
      await deleteUserApi(u.id);
      toast.success(t('User deactivated'));
      await api.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Screen
      title={t('Users')}
      back
      onRefresh={api.reload}
      right={
        <Pressable onPress={() => (guard() ? setForm({ open: true, item: null }) : undefined)} hitSlop={10}>
          <Icon name="user-plus" size={22} color="#fff" />
        </Pressable>
      }
      banner={api.fromCache ? <Banner>{t('Offline: showing the last saved list')}</Banner> : undefined}
    >
      <Segmented value={role} onChange={setRole} options={[{ key: '', label: t('All') }, { key: 'ADMIN', label: t('Admin') }, { key: 'OWNER', label: t('Owner') }, { key: 'COLLECTOR', label: t('Collector') }]} />
      {api.loading && !api.data ? (
        <Loading rows={5} />
      ) : api.error ? (
        <Empty icon="wifi-off" title={api.error} />
      ) : (
        (api.data ?? []).map((u: any) => (
          <Card key={u.id} style={{ gap: 6, opacity: u.isActive ? 1 : 0.6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold">{u.name}</AppText>
                <AppText size={12} color="textMuted">
                  {u.email}
                </AppText>
                {u.owner ? (
                  <AppText size={12} color="textMuted">
                    {t('Owner')}: {u.owner.name}
                  </AppText>
                ) : null}
              </View>
              <Badge text={t(u.role === 'ADMIN' ? 'Admin' : u.role === 'OWNER' ? 'Owner' : 'Collector')} bg={theme.primarySoft} fg={theme.primarySoftText} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small variant="secondary" icon="edit-2" title={t('Edit')} onPress={() => (guard() ? setForm({ open: true, item: u }) : undefined)} />
              {u.isActive && u.id !== user?.id ? <Button small variant="outline" icon="user-x" title={t('Deactivate')} onPress={() => deactivate(u)} /> : null}
            </View>
          </Card>
        ))
      )}
      <UserForm
        visible={form.open}
        item={form.item}
        owners={owners.data ?? []}
        onClose={() => setForm({ open: false, item: null })}
        onSaved={async () => {
          setForm({ open: false, item: null });
          toast.success(t('User saved'));
          await api.reload();
        }}
      />
    </Screen>
  );
}

function UserForm({ visible, item, owners, onClose, onSaved }: { visible: boolean; item: any | null; owners: any[]; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', role: 'COLLECTOR', ownerId: '', isActive: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setF({ name: item?.name ?? '', email: item?.email ?? '', phone: item?.phone ?? '', password: '', role: item?.role ?? 'COLLECTOR', ownerId: item?.ownerId ?? '', isActive: item?.isActive ?? true });
  }, [visible, item]);
  const set = (k: keyof typeof f) => (v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim()) return toast.error(t('Name and email are required'));
    if (!item && f.password.length < 6) return toast.error(t('Password must be at least 6 characters'));
    if (f.role === 'COLLECTOR' && !f.ownerId) return toast.error(t('Select an owner'));
    setBusy(true);
    try {
      if (item) {
        await updateUserApi(item.id, { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, role: f.role, isActive: f.isActive, ownerId: f.role === 'COLLECTOR' ? f.ownerId : null });
      } else {
        await registerApi({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, password: f.password, role: f.role, ownerId: f.role === 'COLLECTOR' ? f.ownerId : undefined });
      }
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, t('Failed to save user')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={item ? t('Edit user') : t('Add user')}>
      <Field label={t('Name')} value={f.name} onChangeText={set('name')} />
      <Field label={t('Email')} value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
      <Field label={t('Phone')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {!item ? <Field label={t('Password')} value={f.password} onChangeText={set('password')} secureTextEntry autoCapitalize="none" /> : null}
      <Select label={t('Role')} value={f.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r, label: t(r === 'ADMIN' ? 'Admin' : r === 'OWNER' ? 'Owner' : 'Collector') }))} />
      {f.role === 'COLLECTOR' ? <Select label={t('Owner')} value={f.ownerId} onChange={set('ownerId')} options={owners.filter((o) => o.isActive).map((o) => ({ value: o.id, label: o.name }))} /> : null}
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
