import React from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppText, Banner, Card, Empty, Loading, Screen, Badge } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { useApi } from '@/hooks/data';
import { getEntrySummary } from '@/api/endpoints';
import { formatMoney } from '@/lib/format';
import { TYPE_LABELS, typeColors } from '@/lib/types';
import { useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

export default function Dashboard() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const manager = user?.role !== 'COLLECTOR';
  const api = useApi('dashboard_summary', () => getEntrySummary(), [online], manager);
  if (!manager) return <Redirect href="/collect" />;
  const d = api.data;

  const tile = (label: string, v: number, color: string) => (
    <View style={{ width: '48.5%', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 12 }}>
      <AppText size={11} weight="bold" color="textMuted">
        {label.toUpperCase()}
      </AppText>
      <AppText size={22} weight="bold" color={color} tabular>
        {formatMoney(v)}
      </AppText>
    </View>
  );

  return (
    <Screen title={t('Dashboard')} subtitle={user?.name} right={<SyncPill />} onRefresh={api.reload} banner={api.fromCache ? <Banner>{t('Offline: showing the last saved numbers')}</Banner> : undefined}>
      {api.loading && !d ? (
        <Loading rows={4} />
      ) : api.error ? (
        <Empty icon="wifi-off" title={api.error} />
      ) : d ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
            {tile(t("Today's total"), d.totals.total, 'primary')}
            {tile(t('Savings'), d.totals.savings, 'success')}
            {tile(t('Loan repayment'), d.totals.loan, 'blueText')}
            {tile(t('Interest'), d.totals.interest, 'warnText')}
          </View>
          <AppText size={12} color="textMuted">
            {d.count} {t('entries today')}
          </AppText>
          <AppText weight="bold">{t('Latest entries')}</AppText>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {d.recent.length === 0 ? (
              <Empty icon="inbox" title={t('No collections yet today')} />
            ) : (
              d.recent.map((e: any, i: number) => {
                const col = typeColors(theme, e.type);
                return (
                  <View key={e.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText weight="semibold" numberOfLines={1}>
                        {e.customer?.name}
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Badge text={t(TYPE_LABELS[e.type as keyof typeof TYPE_LABELS])} bg={col.bg} fg={col.fg} />
                        <AppText size={11} color="textMuted">
                          {e.collector?.name}
                        </AppText>
                      </View>
                    </View>
                    <AppText weight="bold" tabular>
                      {formatMoney(e.amount)}
                    </AppText>
                  </View>
                );
              })
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
