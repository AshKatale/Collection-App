import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { getDailyReport } from '../../api/reports.js';
import { formatNum, formatMoney, formatDate, todayISO, addDays, errorMessage } from '../../utils/helpers.js';
import { SkeletonRows } from '../../components/common/Loading.jsx';
import ExportButtons from '../../components/common/ExportButtons.jsx';
import { toast } from '../../components/common/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Daily report in the ledger layout of the Excel sheet:
 * one row per customer (Sr | Account | Name) with Savings / Loan / Interest / Total,
 * a Total row, and a collector-wise summary underneath.
 */
export default function DailyReport() {
  const { user } = useAuth();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyCollected, setOnlyCollected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDailyReport({ date })
      .then((res) => {
        if (!cancelled) setData(res.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          toast.error(errorMessage(err, 'Failed to load the daily report'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    return onlyCollected ? all.filter((r) => r.total > 0) : all;
  }, [data, onlyCollected]);

  const totals = data?.grandTotals || { savings: 0, loan: 0, interest: 0, total: 0 };
  const collectedCount = (data?.rows || []).filter((r) => r.total > 0).length;
  const isToday = date === today;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isToday ? "Today's Report" : 'Daily Report'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatDate(date)} · ledger format (same as the Excel sheet)
            {user?.role === 'COLLECTOR' && ' · your customers only'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-1">
            <button className="btn-secondary !px-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="input-field !w-auto"
              aria-label="Report date"
            />
            <button
              className="btn-secondary !px-2"
              onClick={() => setDate(addDays(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          {!isToday && (
            <button className="btn-outline text-sm" onClick={() => setDate(today)}>
              <CalendarCheck className="h-4 w-4" /> Today
            </button>
          )}
          <div className="sm:ml-auto">
            <ExportButtons params={{ report: 'daily', date }} disabled={loading || !data} />
          </div>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Savings', totals.savings, 'text-emerald-600'],
          ['Loan repayment', totals.loan, 'text-blue-600'],
          ['Interest', totals.interest, 'text-amber-600'],
          ['Total collected', totals.total, 'text-primary-600'],
        ].map(([label, value, color]) => (
          <div key={label} className="card !p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${color}`}>{formatMoney(value)}</p>
          </div>
        ))}
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">
            Customer-wise collection
            <span className="ml-2 text-xs font-normal text-gray-500">
              {collectedCount} of {data?.rows?.length || 0} customers collected
            </span>
          </h2>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyCollected}
              onChange={(e) => setOnlyCollected(e.target.checked)}
              className="h-4 w-4 accent-primary-500"
            />
            Only customers with a collection
          </label>
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            {data ? 'No customers to show for this date.' : 'Could not load this report.'}
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-primary-500 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-center w-12">Sr</th>
                  <th className="px-3 py-2.5 text-left w-24">Account</th>
                  <th className="px-3 py-2.5 text-left">Customer Name</th>
                  <th className="px-3 py-2.5 text-right">Savings</th>
                  <th className="px-3 py-2.5 text-right">Loan</th>
                  <th className="px-3 py-2.5 text-right">Interest</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.customerId} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''} ${r.total ? '' : 'text-gray-400'}`}>
                    <td className="px-3 py-2 text-center text-gray-500">{onlyCollected ? i + 1 : r.sr}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.accountNo}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.customerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.savings)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.loan)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.interest)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{formatNum(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-primary-50 font-bold text-primary-800 border-t-2 border-primary-500">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(totals.savings)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(totals.loan)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(totals.interest)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNum(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Collector-wise summary */}
      {!loading && data?.collectors?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <h2 className="font-semibold text-gray-800 px-4 py-3 border-b border-gray-200">Collector-wise</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5 text-left">Collector</th>
                  <th className="px-3 py-2.5 text-right">Savings</th>
                  <th className="px-3 py-2.5 text-right">Loan</th>
                  <th className="px-3 py-2.5 text-right">Interest</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.collectors.map((c) => (
                  <tr key={c.collectorId} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{c.collectorName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(c.savings)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(c.loan)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNum(c.interest)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatNum(c.total)}</td>
                  </tr>
                ))}
                <tr className="bg-primary-50 font-bold text-primary-800 border-t-2 border-primary-500">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNum(totals.savings)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNum(totals.loan)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNum(totals.interest)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNum(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
