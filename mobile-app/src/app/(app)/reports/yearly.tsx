import React, { useState } from 'react';
import { AppText, Banner, Empty, Loading, Screen, Segmented } from '@/components/ui';
import { Select } from '@/components/select';
import { Matrix } from '@/components/matrix';
import { ExportButtons } from '@/components/export-buttons';
import { useT } from '@/context/settings';
import { useApi } from '@/hooks/data';
import { getYearlyReport } from '@/api/endpoints';
import { fyLabel } from '@/lib/format';
import { todayISO } from '@/lib/today';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function YearlyReport() {
  const t = useT();
  const now = todayISO();
  const startNow = Number(now.slice(5, 7)) < 4 ? Number(now.slice(0, 4)) - 1 : Number(now.slice(0, 4));
  const [fy, setFy] = useState(startNow);
  const [type, setType] = useState('');
  const api = useApi(`yearly_${fy}_${type}`, () => getYearlyReport({ fy, type: type || undefined }), [fy, type]);
  const d = api.data;
  const years = Array.from({ length: startNow - 2024 + 2 }, (_, i) => 2024 + i);

  return (
    <Screen title={t('Yearly report')} back onRefresh={api.reload} banner={api.fromCache ? <Banner>{t('Offline: showing the last saved copy')}</Banner> : undefined}>
      <Select label={t('Financial year')} value={String(fy)} onChange={(v) => setFy(Number(v))} options={years.map((y) => ({ value: String(y), label: `FY ${fyLabel(y)}` }))} />
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
            columns={d.months.map((m: any) => MON[m.month - 1])}
            rows={d.rows.map((r: any) => ({
              key: r.customerId,
              sr: r.sr,
              title: r.customerName,
              sub: `#${r.accountNo}`,
              cells: d.months.map((m: any) => Number(r.monthTotals?.[m.month] ?? 0)),
              total: r.total,
            }))}
            footer={d.months.map((m: any) => Number(d.grandTotals?.[m.month] ?? 0))}
            footerTotal={d.grandTotals?.total ?? 0}
            footerLabel={t('Monthly total')}
          />
          <AppText size={11} color="textMuted">
            {t('Swipe sideways to see all months.')}
          </AppText>
        </>
      ) : (
        <Empty icon="inbox" title={t('No collections this year')} />
      )}
      <ExportButtons params={{ report: 'yearly', fy, type: type || undefined }} />
    </Screen>
  );
}
