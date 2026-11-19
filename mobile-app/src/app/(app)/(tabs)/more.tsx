import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Card, Icon, Screen, confirm, FeatherName } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { getAccess } from '@/api/endpoints';
import { useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

type Item = { label: string; icon: FeatherName; href: string; roles: string[]; badge?: number };

export default function More() {
  const { user, logout } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { pending, failed, online } = useSync();
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    if (!online || user?.role === 'COLLECTOR') return;
    getAccess({ status: 'PENDING' }).then((r) => setRequests(r.length)).catch(() => undefined);
  }, [online, user?.role]);

  const all: Item[] = [
    { label: t('Sync'), icon: 'refresh-cw', href: '/sync', roles: ['ADMIN', 'OWNER', 'COLLECTOR'], badge: pending + failed },
    { label: t('Customers'), icon: 'users', href: '/customers', roles: ['OWNER', 'ADMIN'] },
    { label: t('Collectors'), icon: 'briefcase', href: '/collectors', roles: ['OWNER', 'ADMIN'] },
    { label: t('Permissions'), icon: 'key', href: '/permissions', roles: ['ADMIN', 'OWNER', 'COLLECTOR'], badge: requests },
    { label: t('Users'), icon: 'shield', href: '/users', roles: ['ADMIN'] },
    { label: t('Settings'), icon: 'settings', href: '/settings', roles: ['ADMIN', 'OWNER', 'COLLECTOR'] },
  ];
  const items = all.filter((i) => i.roles.includes(user?.role ?? ''));

  return (
    <Screen title={t('More')} right={<SyncPill />}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="bold" size={18} color="#fff">
            {(user?.name || '?').trim().charAt(0).toUpperCase()}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{user?.name}</AppText>
          <AppText size={12} color="textMuted">
            {user?.email}
          </AppText>
        </View>
        <View style={{ backgroundColor: theme.primarySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <AppText size={11} weight="bold" color="primarySoftText">
            {t(user?.role === 'ADMIN' ? 'Admin' : user?.role === 'OWNER' ? 'Owner' : 'Collector')}
          </AppText>
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((it, i) => (
          <Pressable
            key={it.href}
            onPress={() => router.push(it.href as any)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border, backgroundColor: pressed ? theme.cardAlt : 'transparent' })}
          >
            <Icon name={it.icon} size={20} color="primary" />
            <AppText weight="semibold" style={{ flex: 1 }}>
              {it.label}
            </AppText>
            {it.badge ? (
              <View style={{ backgroundColor: theme.danger, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' }}>
                <AppText size={11} weight="bold" color="#fff">
                  {it.badge}
                </AppText>
              </View>
            ) : null}
            <Icon name="chevron-right" size={18} color="textFaint" />
          </Pressable>
        ))}
      </Card>

      <Pressable
        onPress={async () => {
          const unsent = pending + failed;
          const ok = await confirm({
            title: t('Log out?'),
            message: unsent ? t('{n} changes have not been synced yet. They stay on this phone and upload after you log in again.', { n: unsent }) : undefined,
            confirmLabel: t('Log out'),
            cancelLabel: t('Cancel'),
            destructive: true,
          });
          if (ok) await logout();
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, justifyContent: 'center' }}
      >
        <Icon name="log-out" size={18} color="danger" />
        <AppText weight="bold" color="danger">
          {t('Log out')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
