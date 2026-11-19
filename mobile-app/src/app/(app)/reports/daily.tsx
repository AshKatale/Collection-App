import React, { useState } from 'react';
import { View } from 'react-native';
import { AppText, Banner, Card, Empty, Loading, Screen } from '@/components/ui';
import { DateStepper } from '@/components/date-field';
import { ExportButtons } from '@/components/export-buttons';
import { useT } from '@/context/settings';
import { useApi, useLocal } from '@/hooks/data';
import { getDailyReport } from '@/api/endpoints';
import { entriesForDate } from '@/db/repo';
import { formatMoney, round2 } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { useTheme } from '@/theme';

type Row = { key: string; accountNo: string; name: string; savings: number; loan: number; interest: number; total: number };

export default function DailyReport() {
  const t = useT();
  const theme = useTheme();
  const [date, setDate] = useState(todayISO());
  const api = useApi(`daily_${date}`, () => getDailyReport({ date }), [date]);
  // Offline: build the same report from what is stored on this phone
  const local = useLocal(() => entriesForDate(date), [date], []);

  let rows: Row[] = [];
  let totals = { savings: 0, loan: 0, interest: 0, total: 0 };
  let collectors: { collectorId: string; collectorName: string; total: number }[] = [];
  let source: 'server' | 'device' = 'server';

  if (api.data && !api.fromCache) {
    rows = api.data.rows.map((r: any) => ({ key: r.customerId, accountNo: r.accountNo, name: r.customerName, savings: r.savings, loan: r.loan, interest: r.interest, total: r.total }));
    totals = api.data.grandTotals;
    collectors = api.data.collectors ?? [];
  } else if (!api.loading) {
    source = 'device';
    const map = new Map<string, Row>();
    for (const e of local.data) {
      const r = map.get(e.customerId) ?? { key: e.customerId, accountNo: e.accountNo ?? '', name: e.customerName ?? '', savings: 0, loan: 0, interest: 0, total: 0 };
      const k = e.type.toLowerCase() as 'savings' | 'loan' | 'interest';
      r[k] = round2(r[k] + e.amount);
      r.total = round2(r.total + e.amount);
      map.set(e.customerId, r);
    }
    rows = [...map.values()].sort((a, b) => a.accountNo.localeCompare(b.accountNo, undefined, { numeric: true }));
    rows.forEach((r) => {
      totals.savings = round2(totals.savings + r.savings);
      totals.loan = round2(totals.loan + r.loan);
      totals.interest = round2(totals.interest + r.interest);
      totals.total = round2(totals.total + r.total);
    });
  }

  const tile = (label: string, v: number, color: string) => (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 10 }}>
      <AppText size={11} weight="bold" color="textMuted">
        {label.toUpperCase()}
      </AppText>
      <AppText size={18} weight="bold" color={color} tabular>
        {formatMoney(v)}
      </AppText>
    </View>
  );

  return (
    <Screen title={t('Daily report')} back onRefresh={api.reload} banner={source === 'device' ? <Banner kind="info">{t('Showing data stored on this phone')}</Banner> : undefined}>
      <DateStepper value={date} onChange={setDate} />
      {api.loading && !api.data && local.data.length === 0 ? (
        <Loading />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tile(t('Total'), totals.total, 'primary')}
            {tile(t('Savings'), totals.savings, 'success')}
            {tile(t('Loan repayment'), totals.loan, 'blueText')}
            {tile(t('Interest'), totals.interest, 'warnText')}
          </View>

          {collectors.length > 1 ? (
            <Card style={{ gap: 6 }}>
              <AppText weight="bold">{t('By collector')}</AppText>
              {collectors.map((c) => (
                <View key={c.collectorId} style={{ flexDirection: 'row' }}>
                  <AppText style={{ flex: 1 }}>{c.collectorName}</AppText>
                  <AppText weight="bold" tabular>
                    {formatMoney(c.total)}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <Empty icon="inbox" title={t('No collections on this date')} />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {rows.map((r, i) => (
                <View key={r.key} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border, flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold" numberOfLines={1}>
                      {r.name}
                    </AppText>
                    <AppText size={11} color="textMuted">
                      #{r.accountNo} · {[r.savings && `S ${formatMoney(r.savings)}`, r.loan && `L ${formatMoney(r.loan)}`, r.interest && `I ${formatMoney(r.interest)}`].filter(Boolean).join('  ')}
                    </AppText>
                  </View>
                  <AppText weight="bold" tabular>
                    {formatMoney(r.total)}
                  </AppText>
                </View>
              ))}
            </Card>
          )}
          <ExportButtons params={{ report: 'daily', date }} />
        </>
      )}
    </Screen>
  );
}
