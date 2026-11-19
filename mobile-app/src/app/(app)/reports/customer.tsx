import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText, Banner, Card, Empty, Loading, Screen, Badge } from '@/components/ui';
import { Select } from '@/components/select';
import { DateField } from '@/components/date-field';
import { ExportButtons } from '@/components/export-buttons';
import { useT } from '@/context/settings';
import { useApi, useLocal } from '@/hooks/data';
import { getCustomerReport } from '@/api/endpoints';
import { listCustomers, LocalCustomer } from '@/db/repo';
import { addDays, formatDate, formatMoney } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { TYPE_LABELS, typeColors } from '@/lib/types';
import { useTheme } from '@/theme';

export default function CustomerReport() {
  const t = useT();
  const theme = useTheme();
  const customers = useLocal(listCustomers, [], [] as LocalCustomer[]);
  const [id, setId] = useState('');
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const api = useApi(`customer_${id}_${from}_${to}`, () => getCustomerReport({ id, from, to }), [id, from, to], !!id);
  const d = api.data;

  return (
    <Screen title={t('Customer statement')} back onRefresh={api.reload} banner={api.fromCache ? <Banner>{t('Offline: showing the last saved copy')}</Banner> : undefined}>
      <Select searchable label={t('Customer')} value={id} onChange={setId} options={customers.data.map((c) => ({ value: c.id, label: `#${c.accountNo} · ${c.name}` }))} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <DateField label={t('From date')} value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label={t('To date')} value={to} onChange={setTo} min={from} />
        </View>
      </View>
      {!id ? (
        <Empty icon="user" title={t('Select a customer')} />
      ) : api.loading && !d ? (
        <Loading />
      ) : api.error ? (
        <Empty icon="wifi-off" title={api.error} />
      ) : d ? (
        <>
          <Card style={{ gap: 4 }}>
            <AppText weight="bold" size={16}>
              {d.customer.name}
            </AppText>
            <AppText size={12} color="textMuted">
              #{d.customer.accountNo}
              {d.customer.phone ? ` · ${d.customer.phone}` : ''}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              {(['savings', 'loan', 'interest', 'total'] as const).map((k) => (
                <View key={k} style={{ minWidth: '45%', flex: 1 }}>
                  <AppText size={11} color="textMuted" weight="bold">
                    {t(k === 'total' ? 'Total' : k === 'loan' ? 'Loan repayment' : k === 'savings' ? 'Savings' : 'Interest').toUpperCase()}
                  </AppText>
                  <AppText weight="bold" tabular color={k === 'total' ? 'primary' : 'text'}>
                    {formatMoney(d.totals[k])}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>
          {d.entries.length === 0 ? (
            <Empty icon="inbox" title={t('No transactions in this period')} />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {d.entries.map((e: any, i: number) => {
                const col = typeColors(theme, e.type);
                return (
                  <View key={e.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText weight="semibold">{formatDate(e.date)}</AppText>
                      <Badge text={t(TYPE_LABELS[e.type as keyof typeof TYPE_LABELS])} bg={col.bg} fg={col.fg} />
                    </View>
                    <AppText weight="bold" tabular>
                      {formatMoney(e.amount)}
                    </AppText>
                  </View>
                );
              })}
            </Card>
          )}
          <ExportButtons params={{ report: 'customer', id, from, to }} />
        </>
      ) : null}
    </Screen>
  );
}
