import React, { useState } from 'react';
import { AppText, Banner, Empty, Loading, Screen, Segmented } from '@/components/ui';
import { Select } from '@/components/select';
import { Matrix } from '@/components/matrix';
import { ExportButtons } from '@/components/export-buttons';
import { useT } from '@/context/settings';
import { useApi } from '@/hooks/data';
import { getMonthlyReport } from '@/api/endpoints';
import { MONTHS, yearOptions } from '@/lib/format';
import { todayISO } from '@/lib/today';

export default function MonthlyReport() {
  const t = useT();
  const now = todayISO();
  const [month, setMonth] = useState(Number(now.slice(5, 7)));
  const [year, setYear] = useState(Number(now.slice(0, 4)));
  const [type, setType] = useState('');
  const api = useApi(`monthly_${year}_${month}_${type}`, () => getMonthlyReport({ month, year, type: type || undefined }), [month, year, type]);
  const d = api.data;

  return (
    <Screen title={t('Monthly sheet')} back onRefresh={api.reload} banner={api.fromCache ? <Banner>{t('Offline: showing the last saved copy')}</Banner> : undefined}>
      <Select label={t('Month')} value={String(month)} onChange={(v) => setMonth(Number(v))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
      <Select label={t('Year')} value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions().map((y) => ({ value: String(y), label: String(y) }))} />
      <Segmented
        value={type}
        onChange={setType}
        options={[{ key: '', label: t('All') }, { key: 'SAVINGS', label: t('Savings') }, { key: 'LOAN', label: t('Loan') }, { key: 'INTEREST', label: t('Interest') }]}
      />
      {api.loading && !d ? (
        <Loading />
      ) : api.error ? (
        <Empty icon="wifi-off" title={api.error} />
      ) : d && d.rows.length ? (
        <>
          <Matrix
            columns={Array.from({ length: d.totalDays }, (_, i) => String(i + 1))}
            rows={d.rows.map((r: any) => ({
              key: r.customerId,
              sr: r.sr,
              title: r.customerName,
              sub: `#${r.accountNo}`,
              cells: Array.from({ length: d.totalDays }, (_, i) => Number(r.dayTotals?.[i + 1] ?? 0)),
              total: r.total,
            }))}
            footer={Array.from({ length: d.totalDays }, (_, i) => Number(d.grandTotals?.[i + 1] ?? 0))}
            footerTotal={d.grandTotals?.total ?? 0}
            footerLabel={t('Daily total')}
          />
          <AppText size={11} color="textMuted">
            {t('Swipe sideways to see all days.')}
          </AppText>
        </>
      ) : (
        <Empty icon="inbox" title={t('No collections this month')} />
      )}
      <ExportButtons params={{ report: 'monthly', month, year, type: type || undefined }} />
    </Screen>
  );
}
