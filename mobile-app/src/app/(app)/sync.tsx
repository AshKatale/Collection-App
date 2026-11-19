import React from 'react';
import { View } from 'react-native';
import { AppText, Badge, Banner, Button, Card, Empty, Icon, Screen, confirm, toast } from '@/components/ui';
import { openReauth } from '@/components/reauth';
import { useT } from '@/context/settings';
import { useLocal } from '@/hooks/data';
import { discardOp, outboxRows, OutboxRow, parsePayload, retryFailed } from '@/db/repo';
import { formatDateTime, formatDate, formatMoney } from '@/lib/format';
import { localDataChanged, refreshCounts, syncNow, useSync } from '@/sync/engine';
import { useTheme } from '@/theme';
import { TYPE_LABELS } from '@/lib/types';

const describe = (r: OutboxRow, t: (s: string) => string): string => {
  const p = parsePayload(r);
  if (p.kind === 'ENTRY_CREATE') {
    const total = p.items.reduce((s, i) => s + i.amount, 0);
    return `${t('New collection')} · ${formatDate(p.date)} · ${p.items.map((i) => t(TYPE_LABELS[i.type])).join(', ')} · ${formatMoney(total)}`;
  }
  if (p.kind === 'ENTRY_UPDATE') return `${t('Amount changed')}${p.changes.amount ? ` → ${formatMoney(p.changes.amount)}` : ''}`;
  return t('Entry deleted');
};

export default function SyncScreen() {
  const t = useT();
  const theme = useTheme();
  const s = useSync();
  const ops = useLocal(outboxRows, [s.pending, s.failed], [] as OutboxRow[]);

  const run = async () => {
    const out = await syncNow();
    if (out.ok) toast.success(out.pushed ? t('{n} changes synced', { n: out.pushed }) : t('Everything is up to date'));
    else if (out.offline) toast.info(t('No connection. Your data is safe and will sync later.'));
    else toast.error(out.message || t('Sync failed'));
  };

  const failed = ops.data.filter((o) => o.status === 'failed');
  const waiting = ops.data.filter((o) => o.status !== 'failed');

  return (
    <Screen title={t('Sync')} back onRefresh={run}>
      {s.sessionExpired ? (
        <Banner kind="error" onPress={openReauth}>
          {t('Session expired. Tap to sign in again. Your offline data is safe.')}
        </Banner>
      ) : null}

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.online ? theme.success : theme.warn }} />
          <AppText weight="bold" style={{ flex: 1 }}>
            {s.online ? t('Online') : t('Offline')}
          </AppText>
          <AppText size={12} color="textMuted">
            {s.lastSyncAt ? `${t('Last synced')}: ${formatDateTime(s.lastSyncAt)}` : t('Never synced')}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: theme.cardAlt, borderRadius: 10, padding: 10 }}>
            <AppText size={11} weight="bold" color="textMuted">
              {t('WAITING')}
            </AppText>
            <AppText size={24} weight="bold">
              {s.pending}
            </AppText>
          </View>
          <View style={{ flex: 1, backgroundColor: s.failed ? theme.dangerSoft : theme.cardAlt, borderRadius: 10, padding: 10 }}>
            <AppText size={11} weight="bold" color={s.failed ? 'danger' : 'textMuted'}>
              {t('FAILED')}
            </AppText>
            <AppText size={24} weight="bold" color={s.failed ? 'danger' : 'text'}>
              {s.failed}
            </AppText>
          </View>
        </View>
        {s.lastError ? (
          <AppText size={12} color="danger">
            {s.lastError}
          </AppText>
        ) : null}
        <Button title={s.syncing ? t('Syncing…') : t('Sync now')} icon="refresh-cw" onPress={run} loading={s.syncing} />
        {!s.online ? (
          <AppText size={12} color="textMuted" align="center">
            {t('You are offline. Entries are saved on this phone and will upload automatically when you reconnect.')}
          </AppText>
        ) : null}
      </Card>

      {failed.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText weight="bold" style={{ flex: 1 }} color="danger">
              {t('Needs attention')}
            </AppText>
            <Button
              small
              variant="outline"
              title={t('Retry all')}
              onPress={async () => {
                await retryFailed();
                await localDataChanged();
              }}
            />
          </View>
          {failed.map((o) => (
            <Card key={o.seq} style={{ gap: 6, borderColor: theme.danger }}>
              <AppText weight="semibold">{o.label}</AppText>
              <AppText size={12} color="textMuted">
                {describe(o, t)}
              </AppText>
              <AppText size={12} color="danger">
                {o.error}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Button
                  small
                  title={t('Retry')}
                  variant="outline"
                  onPress={async () => {
                    await retryFailed(o.seq);
                    await localDataChanged();
                  }}
                />
                <Button
                  small
                  title={t('Discard')}
                  variant="danger"
                  onPress={async () => {
                    const ok = await confirm({ title: t('Discard this change?'), message: t('It will be removed from this phone and never sent to the server.'), confirmLabel: t('Discard'), cancelLabel: t('Cancel'), destructive: true });
                    if (!ok) return;
                    await discardOp(o.seq);
                    await refreshCounts();
                    await localDataChanged();
                  }}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <AppText weight="bold">{t('Waiting to upload')}</AppText>
        {waiting.length === 0 ? (
          <Empty icon="check-circle" title={t('Nothing waiting')} text={t('All your changes are on the server.')} />
        ) : (
          waiting.map((o) => (
            <Card key={o.seq} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="upload-cloud" size={16} color="primary" />
                <AppText weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                  {o.label}
                </AppText>
                <Badge text={o.status === 'sending' ? t('Sending') : t('Queued')} bg={theme.blueSoft} fg={theme.blueText} />
              </View>
              <AppText size={12} color="textMuted">
                {describe(o, t)}
              </AppText>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
