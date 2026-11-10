import { useState, useEffect } from 'react';
import { getYearlyReport } from '../../api/reports.js';
import { formatNum, fyStart, fyLabel, yearOptions, errorMessage } from '../../utils/helpers.js';
import { SkeletonRows } from '../../components/common/Loading.jsx';
import ExportButtons from '../../components/common/ExportButtons.jsx';
import { toast } from '../../components/common/Toast.jsx';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_TABS = [
  ['', 'All types'],
  ['SAVINGS', 'Savings'],
  ['LOAN', 'Loan'],
  ['INTEREST', 'Interest'],
];

export default function YearlyReport() {
  const [fy, setFy] = useState(fyStart(new Date()));
  const [type, setType] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getYearlyReport({ fy, ...(type ? { type } : {}) })
      .then((res) => !cancelled && setData(res.data?.data || null))
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        toast.error(errorMessage(err, 'Failed to load the yearly report'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fy, type]);

  const fyChoices = yearOptions(2024);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Yearly Collection Sheet</h1>
          <p className="text-sm text-gray-500 mt-1">Customer × month for the financial year (April – March).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="input-field !w-auto" aria-label="Financial year">
            {fyChoices.map((y) => (
              <option key={y} value={y}>FY {fyLabel(y)}</option>
            ))}
          </select>
          <div className="sm:ml-auto">
            <ExportButtons params={{ report: 'yearly', fy, ...(type ? { type } : {}) }} disabled={loading || !data} />
          </div>
        </div>
      </div>

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
          <div className="text-center py-16 text-gray-400">No customers or collections for FY {fyLabel(fy)}.</div>
        ) : (
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-30">
                <tr className="bg-primary-500 text-white">
                  <th className="px-2 py-2.5 sticky left-0 z-40 bg-primary-500 text-center w-10">Sr</th>
                  <th className="px-3 py-2.5 sticky left-10 z-40 bg-primary-500 text-left min-w-[180px]">Customer Name</th>
                  {data.months.map((m) => (
                    <th key={m.month} className="px-2 py-2.5 text-right min-w-[84px] border-l border-white/20 whitespace-nowrap">
                      {MONTH_SHORT[m.month - 1]} {String(m.year).slice(-2)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right min-w-[100px] border-l border-white/20">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, idx) => (
                  <tr key={row.customerId} className="group border-b border-gray-100 hover:bg-primary-50">
                    <td className="px-2 py-2 sticky left-0 z-20 bg-white group-hover:bg-primary-50 text-center text-gray-500">{row.sr}</td>
                    <td className="px-3 py-2 sticky left-10 z-20 bg-white group-hover:bg-primary-50 font-medium text-gray-900 whitespace-nowrap">
                      <span className="text-gray-400 font-mono mr-1.5">{row.accountNo}</span>
                      {row.customerName}
                    </td>
                    {data.months.map((m) => (
                      <td
                        key={m.month}
                        className={`px-2 py-2 text-right tabular-nums border-l border-gray-100 ${idx % 2 ? 'bg-gray-50/50' : ''} ${
                          row.monthTotals[m.month] ? 'text-gray-800' : 'text-gray-300'
                        }`}
                      >
                        {row.monthTotals[m.month] ? formatNum(row.monthTotals[m.month]) : '·'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold text-gray-900 bg-gray-50 border-l border-gray-200 tabular-nums">
                      {formatNum(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-30">
                <tr className="bg-primary-50 font-bold text-primary-900 border-t-2 border-primary-500">
                  <td className="px-2 py-3 sticky left-0 z-40 bg-primary-50 text-center">Σ</td>
                  <td className="px-3 py-3 sticky left-10 z-40 bg-primary-50 uppercase tracking-wide">Total</td>
                  {data.months.map((m) => (
                    <td key={m.month} className="px-2 py-3 text-right tabular-nums border-l border-primary-200">
                      {formatNum(data.grandTotals[m.month])}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums bg-primary-100">{formatNum(data.grandTotals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
