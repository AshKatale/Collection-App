import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText, Banner, Card, Empty, Loading, Screen } from '@/components/ui';
import { Select } from '@/components/select';
import { DateField } from '@/components/date-field';
import { ExportButtons } from '@/components/export-buttons';
import { useT } from '@/context/settings';
import { useApi, useLocal } from '@/hooks/data';
import { getCustomerReport } from '@/api/endpoints';
import { listCustomers, LocalCustomer } from '@/db/repo';
import { addDays, formatDate, formatMoney, formatNum, round2 } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { useTheme } from '@/theme';

type Day = { date: string; savings: number; loan: number; interest: number; total: number };
const DATE_W = 88;

/** entries (one per type) -> one row per date with Savings / Loan / Interest / Total */
function groupByDay(entries: any[]): Day[] {
  const map = new Map<string, Day>();
  for (const e of entries) {
    const row = map.get(e.date) ?? { date: e.date, savings: 0, loan: 0, interest: 0, total: 0 };
    const k = String(e.type).toLowerCase() as 'savings' | 'loan' | 'interest';
    row[k] = round2(row[k] + Number(e.amount));
    row.total = round2(row.total + Number(e.amount));
    map.set(e.date, row);
  }
  return [...map.values()];
}

export default function CustomerReport() {
  const t = useT();
  const theme = useTheme();
  const customers = useLocal(listCustomers, [], [] as LocalCustomer[]);
  const [id, setId] = useState('');
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const api = useApi(`customer_${id}_${from}_${to}`, () => getCustomerReport({ id, from, to }), [id, from, to], !!id);
  const d = api.data;
  // One row per date (server sends `days`; an older server / cached copy only has `entries`)
  const days: Day[] = d ? d.days ?? groupByDay(d.entries ?? []) : [];

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
          {days.length === 0 ? (
            <Empty icon="inbox" title={t('No transactions in this period')} />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primarySoft, paddingVertical: 8, paddingHorizontal: 12 }}>
                <AppText size={11} weight="bold" color="primarySoftText" style={{ width: DATE_W }}>
                  {t('Date').toUpperCase()}
                </AppText>
                {(['Savings', 'Loan', 'Interest', 'Total'] as const).map((k) => (
                  <AppText key={k} size={11} weight="bold" color="primarySoftText" align="right" numberOfLines={1} style={{ flex: 1 }}>
                    {t(k).toUpperCase()}
                  </AppText>
                ))}
              </View>
              {days.map((x, i) => (
                <View key={x.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                  <AppText size={12} weight="semibold" style={{ width: DATE_W }}>
                    {formatDate(x.date)}
                  </AppText>
                  <AppText size={12} align="right" tabular color={x.savings ? 'text' : 'textFaint'} style={{ flex: 1 }}>
                    {formatNum(x.savings) || '-'}
                  </AppText>
                  <AppText size={12} align="right" tabular color={x.loan ? 'text' : 'textFaint'} style={{ flex: 1 }}>
                    {formatNum(x.loan) || '-'}
                  </AppText>
                  <AppText size={12} align="right" tabular color={x.interest ? 'text' : 'textFaint'} style={{ flex: 1 }}>
                    {formatNum(x.interest) || '-'}
                  </AppText>
                  <AppText size={12} weight="bold" align="right" tabular style={{ flex: 1 }}>
                    {formatNum(x.total) || '0'}
                  </AppText>
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.cardAlt, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                <AppText size={12} weight="bold" style={{ width: DATE_W }}>
                  {t('Total')}
                </AppText>
                {[d.totals.savings, d.totals.loan, d.totals.interest, d.totals.total].map((v: number, i: number) => (
                  <AppText key={i} size={12} weight="bold" align="right" tabular color={i === 3 ? 'primary' : 'text'} style={{ flex: 1 }}>
                    {formatNum(v) || '0'}
                  </AppText>
                ))}
              </View>
            </Card>
          )}
          <ExportButtons params={{ report: 'customer', id, from, to }} />
        </>
      ) : null}
    </Screen>
  );
}
