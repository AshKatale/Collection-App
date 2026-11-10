import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, PiggyBank, TrendingDown, Percent, Plus, FileBarChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import StatCard from '../components/common/StatCard.jsx';
import { SkeletonRows } from '../components/common/Loading.jsx';
import { toast } from '../components/common/Toast.jsx';
import { formatMoney, formatDate, TYPE_LABELS, TYPE_BADGE, errorMessage } from '../utils/helpers.js';
import { getEntrySummary } from '../api/entries.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getEntrySummary()
      .then((res) => !cancelled && setSummary(res.data?.data || null))
      .catch((err) => !cancelled && toast.error(errorMessage(err, 'Failed to load the dashboard')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totals = summary?.totals || { savings: 0, loan: 0, interest: 0, total: 0 };
  const recent = summary?.recent || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {user?.role === 'ADMIN' && 'Administrator · all collections'}
            {user?.role === 'OWNER' && 'Owner · your organisation'}
            {user?.role === 'COLLECTOR' && 'Collector · your customers'}
            {summary?.date && ` · ${formatDate(summary.date)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/collect" className="btn-primary">
            <Plus className="h-4 w-4" /> New collection
          </Link>
          <Link to="/reports/daily" className="btn-secondary">
            <FileBarChart className="h-4 w-4" /> Today's report
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Today's total" value={loading ? '…' : formatMoney(totals.total)} icon={Wallet} subtitle={summary ? `${summary.count} entries` : undefined} />
        <StatCard label="Savings" value={loading ? '…' : formatMoney(totals.savings)} icon={PiggyBank} color="green" />
        <StatCard label="Loan repayment" value={loading ? '…' : formatMoney(totals.loan)} icon={TrendingDown} color="blue" />
        <StatCard label="Interest" value={loading ? '…' : formatMoney(totals.interest)} icon={Percent} color="yellow" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Latest collections today</h2>
          {summary && <span className="text-xs text-gray-500">{summary.count} recorded</span>}
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={4} />
          </div>
        ) : recent.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nothing collected yet today.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((e) => (
              <li key={e.id} className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    <span className="text-gray-400 font-mono mr-1.5">{e.customer?.accountNo}</span>
                    {e.customer?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded font-semibold mr-2 ${TYPE_BADGE[e.type]}`}>{TYPE_LABELS[e.type]}</span>
                    {e.collector?.name}
                  </p>
                </div>
                <span className="font-bold text-gray-900 tabular-nums">{formatMoney(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
