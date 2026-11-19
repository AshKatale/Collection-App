import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Icon } from '@/components/ui';
import { useSync } from '@/sync/engine';
import { useT } from '@/context/settings';

/** Header chip: connection state + number of changes waiting to sync. Tap to open the Sync screen. */
export function SyncPill() {
  const s = useSync();
  const t = useT();
  const waiting = s.pending + s.failed;
  const label = s.syncing ? t('Syncing…') : !s.online ? t('Offline') : waiting > 0 ? t('{n} to sync', { n: waiting }) : t('Synced');
  const icon = s.syncing ? 'refresh-cw' : !s.online ? 'cloud-off' : waiting > 0 ? 'upload-cloud' : 'check-circle';
  const bg = s.failed > 0 ? '#dc2626' : !s.online ? '#d97706' : waiting > 0 ? '#2563eb' : 'rgba(255,255,255,0.22)';
  return (
    <Pressable onPress={() => router.push('/sync')} accessibilityLabel="Sync status" hitSlop={8}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
        <Icon name={icon as any} size={14} color="#fff" />
        <AppText size={12} weight="semibold" color="#fff">
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
