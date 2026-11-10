import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMonthlyReport } from '../../api/reports.js';
import { formatNum, MONTHS, yearOptions, errorMessage } from '../../utils/helpers.js';
import { SkeletonRows } from '../../components/common/Loading.jsx';
import ExportButtons from '../../components/common/ExportButtons.jsx';
import DayEntriesModal from '../../components/common/DayEntriesModal.jsx';
import { toast } from '../../components/common/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const TYPE_TABS = [
  ['', 'All types'],
  ['SAVINGS', 'Savings'],
  ['LOAN', 'Loan'],
  ['INTEREST', 'Interest'],
];

const pad = (n) => String(n).padStart(2, '0');

export default function MonthlyReport() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'OWNER';
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [type, setType] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { customer, date }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMonthlyReport({ month, year, ...(type ? { type } : {}) });
      setData(res.data?.data || null);
    } catch (err) {
      setData(null);
      toast.error(errorMessage(err, 'Failed to load the monthly report'));
    } finally {
      setLoading(false);
    }
  }, [month, year, type]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => Array.from({ length: data?.totalDays || 0 }, (_, i) => i + 1), [data]);
  const isSunday = (d) => new Date(year, month - 1, d).getDay() === 0;
  const today = new Date();
  const isTodayCol = (d) => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Monthly Collection Sheet</h1>
          <p className="text-sm text-gray-500 mt-1">
            Customer × day ledger, same layout as the Excel sheet.
            {canEdit && ' Click any cell to view or correct that day’s entries.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input-field !w-auto" aria-label="Month">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input-field !w-auto" aria-label="Year">
            {yearOptions().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="sm:ml-auto">
            <ExportButtons params={{ report: 'monthly', month, year, ...(type ? { type } : {}) }} disabled={loading || !data} />
          </div>
        </div>
      </div>

      {/* Type tabs (the Excel keeps one block per type) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {TYPE_TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={type === value}
            onClick={() => setType(value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap border transition-colors ${
              type === value
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 sm:p-4">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No customers or collections for {MONTHS[month - 1]} {year}.</div>
        ) : (
          <div className="overflow-auto max-h-[75vh] relative">
            <table className="text-xs text-left border-collapse w-full">
              <thead className="sticky top-0 z-30">
                <tr className="bg-primary-500 text-white">
                  <th className="px-2 py-2.5 sticky left-0 z-40 bg-primary-500 text-center w-10">Sr</th>
                  <th className="px-3 py-2.5 sticky left-10 z-40 bg-primary-500 min-w-[180px]">Customer Name</th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className={`px-1 py-2.5 text-center min-w-[44px] border-l border-white/20 ${
                        isSunday(d) ? 'bg-orange-700' : ''
                      } ${isTodayCol(d) ? 'underline decoration-2 underline-offset-4' : ''}`}
                    >
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right min-w-[90px] border-l border-white/20">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, idx) => (
                  <tr key={row.customerId} className="group border-b border-gray-100 hover:bg-primary-50">
                    <td className="px-2 py-1.5 sticky left-0 z-20 bg-white group-hover:bg-primary-50 text-center text-gray-500">{row.sr}</td>
                    <td className="px-3 py-1.5 sticky left-10 z-20 bg-white group-hover:bg-primary-50 font-medium text-gray-900 whitespace-nowrap">
                      <span className="text-gray-400 font-mono mr-1.5">{row.accountNo}</span>
                      {row.customerName}
                    </td>
                    {days.map((d) => {
                      const v = row.dayTotals[d];
                      const date = `${year}-${pad(month)}-${pad(d)}`;
                      const sunday = isSunday(d);
                      return (
                        <td
                          key={d}
                          onClick={canEdit ? () => setEditing({ customer: { id: row.customerId, name: row.customerName, accountNo: row.accountNo }, date }) : undefined}
                          className={`px-1 py-1.5 text-right tabular-nums border-l border-gray-100 whitespace-nowrap ${
                            sunday ? 'bg-orange-50/60' : idx % 2 ? 'bg-gray-50/50' : ''
                          } ${canEdit ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-primary-500' : ''} ${v ? 'text-gray-800' : 'text-gray-300'}`}
                          title={canEdit ? `Edit ${date}` : undefined}
                        >
                          {v ? formatNum(v) : '·'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-bold text-gray-900 bg-gray-50 border-l border-gray-200 tabular-nums whitespace-nowrap">
                      {formatNum(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30">
                <tr className="bg-primary-50 font-bold text-primary-900 border-t-2 border-primary-500">
                  <td className="px-2 py-2.5 sticky left-0 z-40 bg-primary-50 text-center">Σ</td>
                  <td className="px-3 py-2.5 sticky left-10 z-40 bg-primary-50 uppercase tracking-wide">Total</td>
                  {days.map((d) => (
                    <td key={d} className="px-1 py-2.5 text-right tabular-nums border-l border-primary-200 whitespace-nowrap">
                      {formatNum(data.grandTotals[d])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right tabular-nums bg-primary-100 whitespace-nowrap">{formatNum(data.grandTotals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <DayEntriesModal
          customer={editing.customer}
          date={editing.date}
          defaultType={type || 'SAVINGS'}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
