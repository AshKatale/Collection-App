import { useState, useEffect } from 'react';
import { Wallet, PiggyBank, TrendingDown, Percent } from 'lucide-react';
import { getCustomerReport } from '../../api/reports.js';
import { getCustomers } from '../../api/customers.js';
import { formatMoney, formatDate, todayISO, fyStart, TYPE_LABELS, TYPE_BADGE, errorMessage } from '../../utils/helpers.js';
import { SkeletonRows } from '../../components/common/Loading.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ExportButtons from '../../components/common/ExportButtons.jsx';
import { toast } from '../../components/common/Toast.jsx';

export default function CustomerReport() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  // Default period: this financial year, from 1 April
  const [from, setFrom] = useState(`${fyStart(new Date())}-04-01`);
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCustomers()
      .then((res) => {
        const list = res.data?.data || [];
        setCustomers(list);
        if (list.length) setCustomerId(list[0].id);
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load customers')));
  }, []);

  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    setLoading(true);
    getCustomerReport({ id: customerId, ...(from ? { from } : {}), ...(to ? { to } : {}) })
      .then((res) => !cancelled && setReport(res.data?.data || null))
      .catch((err) => {
        if (cancelled) return;
        setReport(null);
        toast.error(errorMessage(err, 'Failed to load the statement'));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [customerId, from, to]);

  const entries = report?.entries || [];
  const totals = report?.totals || { savings: 0, loan: 0, interest: 0, total: 0 };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head !items-stretch">
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Customer Statement</h1>
            <p className="text-sm text-gray-500 mt-1">All collections of one customer. Default period: this financial year.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="cr-customer">Customer</label>
              <select id="cr-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input-field text-sm">
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.accountNo} · {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="cr-from">From</label>
              <input id="cr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="cr-to">To</label>
              <input id="cr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field text-sm" />
            </div>
          </div>
        </div>
        <div className="lg:self-start">
          <ExportButtons
            params={{ report: 'customer', id: customerId, ...(from ? { from } : {}), ...(to ? { to } : {}) }}
            disabled={loading || !customerId || !report}
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <SkeletonRows rows={6} />
        </div>
      ) : !report ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
          Select a customer to view the statement.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total collected" value={formatMoney(totals.total)} icon={Wallet} />
            <StatCard label="Savings" value={formatMoney(totals.savings)} icon={PiggyBank} color="green" />
            <StatCard label="Loan repayment" value={formatMoney(totals.loan)} icon={TrendingDown} color="blue" />
            <StatCard label="Interest" value={formatMoney(totals.interest)} icon={Percent} color="yellow" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 px-4 sm:px-6 py-4 border-b border-gray-200">
              Transactions ({entries.length})
            </h2>
            {entries.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No collections in this period.</div>
            ) : (
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Collector</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-4 py-2.5 text-gray-800">{e.collectorName || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${TYPE_BADGE[e.type]}`}>
                            {TYPE_LABELS[e.type]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{formatMoney(e.amount)}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{e.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
