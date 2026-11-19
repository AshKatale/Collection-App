import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText, Badge, Banner, Button, Card, Empty, Field, Loading, Screen, Sheet, confirm, toast } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { Select } from '@/components/select';
import { RequestAccessSheet } from '@/components/request-access';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { useApi } from '@/hooks/data';
import { decideAccessApi, getAccess, getCollectors, grantAccessApi, withdrawAccessApi } from '@/api/endpoints';
import { addDays, errorMessage, formatDate } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { syncNow, useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

const range = (r: any) => (r.fromDate === r.toDate ? formatDate(r.fromDate) : `${formatDate(r.fromDate)} → ${formatDate(r.toDate)}`);

export default function Permissions() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const isCollector = user?.role === 'COLLECTOR';
  const rows = useApi('access_all', () => getAccess(), [online]);
  const collectors = useApi('collectors_list', getCollectors, [], !isCollector);
  const [requestOpen, setRequestOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState({ collectorId: '', fromDate: addDays(todayISO(), -1), toDate: addDays(todayISO(), -1), reason: '' });
  const [busy, setBusy] = useState(false);

  const style = (s: string) =>
    s === 'PENDING' ? { bg: theme.warnSoft, fg: theme.warnText } : s === 'APPROVED' ? { bg: theme.successSoft, fg: theme.success } : s === 'REJECTED' ? { bg: theme.dangerSoft, fg: theme.danger } : { bg: theme.cardAlt, fg: theme.textMuted };

  const needOnline = () => {
    if (online) return true;
    toast.error(t('This needs an internet connection'));
    return false;
  };

  const decide = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    if (!needOnline()) return;
    try {
      await decideAccessApi(id, action);
      toast.success(t('Updated'));
      await rows.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const withdraw = async (id: string) => {
    if (!needOnline()) return;
    if (!(await confirm({ title: t('Withdraw this request?'), confirmLabel: t('Withdraw'), cancelLabel: t('Cancel'), destructive: true }))) return;
    try {
      await withdrawAccessApi(id);
      await rows.reload();
      void syncNow({ quiet: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const submitGrant = async () => {
    if (!needOnline()) return;
    if (!grant.collectorId) return toast.error(t('Select a collector'));
    setBusy(true);
    try {
      await grantAccessApi(grant);
      toast.success(t('Access granted'));
      setGrantOpen(false);
      await rows.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const list = rows.data ?? [];
  const pending = list.filter((r) => r.status === 'PENDING');
  const rest = list.filter((r) => r.status !== 'PENDING');

  const renderRow = (r: any) => {
    const c = style(r.status);
    return (
      <Card key={r.id} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText weight="bold" style={{ flex: 1 }}>
            {range(r)}
          </AppText>
          <Badge text={t(r.status.charAt(0) + r.status.slice(1).toLowerCase())} bg={c.bg} fg={c.fg} />
        </View>
        {!isCollector ? <AppText size={13} color="textMuted">{r.collectorName}</AppText> : null}
        {r.reason ? <AppText size={13}>{r.reason}</AppText> : null}
        {r.decidedByName ? (
          <AppText size={11} color="textFaint">
            {t('Decided by')} {r.decidedByName}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          {isCollector && r.status === 'PENDING' ? <Button small variant="outline" title={t('Withdraw')} onPress={() => withdraw(r.id)} /> : null}
          {!isCollector && r.status === 'PENDING' ? (
            <>
              <Button small title={t('Approve')} icon="check" onPress={() => decide(r.id, 'approve')} />
              <Button small variant="danger" title={t('Reject')} icon="x" onPress={() => decide(r.id, 'reject')} />
            </>
          ) : null}
          {!isCollector && r.status === 'APPROVED' ? <Button small variant="outline" title={t('Revoke')} onPress={() => decide(r.id, 'revoke')} /> : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen title={t('Permissions')} back onRefresh={rows.reload} banner={rows.fromCache ? <Banner>{t('Offline: showing the last saved list')}</Banner> : undefined}>
      <AppText size={13} color="textMuted">
        {t('Collectors can only add or change today’s entries. Anything else needs the owner’s OK.')}
      </AppText>
      {isCollector ? (
        <Button title={t('Request permission')} icon="send" onPress={() => (needOnline() ? setRequestOpen(true) : undefined)} />
      ) : (
        <Button title={t('Grant access')} icon="shield" onPress={() => (needOnline() ? setGrantOpen(true) : undefined)} />
      )}

      {rows.loading && !rows.data ? (
        <Loading />
      ) : rows.error ? (
        <Empty icon="wifi-off" title={rows.error} />
      ) : list.length === 0 ? (
        <Empty icon="key" title={t('No requests yet')} />
      ) : (
        <>
          {pending.length ? <AppText weight="bold">{t('Pending')}</AppText> : null}
          {pending.map(renderRow)}
          {rest.length ? <AppText weight="bold">{t('History')}</AppText> : null}
          {rest.map(renderRow)}
        </>
      )}

      <RequestAccessSheet visible={requestOpen} initialDate={addDays(todayISO(), -1)} onClose={() => setRequestOpen(false)} onSent={() => (rows.reload(), syncNow({ quiet: true }))} />

      <Sheet visible={grantOpen} onClose={() => setGrantOpen(false)} title={t('Grant access')}>
        <Select
          label={t('Collector')}
          value={grant.collectorId}
          onChange={(v) => setGrant((g) => ({ ...g, collectorId: v }))}
          options={(collectors.data ?? []).filter((c: any) => c.isActive).map((c: any) => ({ value: c.id, label: c.name }))}
        />
        <DateField label={t('From date')} value={grant.fromDate} onChange={(v) => setGrant((g) => ({ ...g, fromDate: v, toDate: v > g.toDate ? v : g.toDate }))} />
        <DateField label={t('To date')} value={grant.toDate} min={grant.fromDate} onChange={(v) => setGrant((g) => ({ ...g, toDate: v }))} />
        <Field label={t('Reason')} value={grant.reason} onChangeText={(v) => setGrant((g) => ({ ...g, reason: v }))} />
        <Button title={t('Grant access')} onPress={submitGrant} loading={busy} />
      </Sheet>
    </Screen>
  );
}
