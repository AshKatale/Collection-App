import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, PiggyBank, Percent, BookOpen, CheckCircle2, FileDown, Search, AlertTriangle } from 'lucide-react';
import * as ledgerApi from '../api/ledger.js';
import { downloadFile } from '../utils/download.js';
import { errorMessage, fyLabel } from '../utils/helpers.js';
import { SkeletonRows } from '../components/common/Loading.jsx';
import { toast, confirmDialog } from '../components/common/Toast.jsx';
import { RecordForm, RateForm, InterestForm, OpeningForm, SettleForm } from '../components/ledger/Forms.jsx';
import {
  Panel,
  RepaymentSection,
  LoanSection,
  DepositSection,
  SavingsSection,
  FinalSection,
  SettlementHistory,
  RateHistory,
} from '../components/ledger/Sections.jsx';
import { amt, finalText, formatDate, monthLabel } from '../components/ledger/format.jsx';

const nextDay = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const HISTORY_LABEL = {
  LOAN_ADDED: 'Loan given',
  LOAN_CHANGED: 'Loan corrected',
  LOAN_CANCELLED: 'Loan cancelled',
  FD_ADDED: 'Deposit added',
  FD_CHANGED: 'Deposit corrected',
  FD_CANCELLED: 'Deposit cancelled',
  RATE_SET: 'Rate set',
  RATE_REMOVED: 'Rate removed',
  INTEREST_TYPED: 'Interest entered',
  INTEREST_RESET: 'Interest reset to calculated',
  OPENING_SAVED: 'Opening balance saved',
  OPENING_REMOVED: 'Opening balance removed',
  SETTLED: 'Account settled',
  SETTLEMENT_CANCELLED: 'Settlement cancelled',
};
const historyDetail = (d) => {
  if (!d) return '';
  const amount = d.amount ?? d.after?.amount ?? d.finalAmount;
  const parts = [d.date && formatDate(d.date), d.month && monthLabel(d.month), d.from && `from ${monthLabel(d.from)}`];
  if (amount !== undefined && amount !== null) parts.push(amt(amount));
  if (d.before) parts.push(`(was ${amt(d.before.amount)})`);
  return parts.filter(Boolean).join(' · ');
};

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams();
  const customerId = searchParams.get('customer') || '';
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [fy, setFy] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [lang, setLang] = useState('en');
  const [downloading, setDownloading] = useState(false);
  const latest = useRef(0);

  const choose = useCallback(
    (id) => {
      setFy(null);
      setModal(null);
      setSearchParams(id ? { customer: id } : {}, { replace: true });
    },
    [setSearchParams]
  );

  useEffect(() => {
    ledgerApi
      .getLedgerCustomers()
      .then((res) => {
        const list = res.data?.data || [];
        setCustomers(list);
        if (list.length && !list.some((c) => c.id === customerId)) choose(list[0].id);
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load customers')));
    // load the list once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!customerId) return;
    const request = ++latest.current;
    setLoading(true);
    ledgerApi
      .getLedger(customerId, fy)
      .then((res) => request === latest.current && setData(res.data.data))
      .catch((err) => {
        if (request !== latest.current) return;
        setData(null);
        toast.error(errorMessage(err, 'Failed to load the ledger'));
      })
      .finally(() => request === latest.current && setLoading(false));
  }, [customerId, fy]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = customers.filter((c) => !q || String(c.accountNo).toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    const selected = customers.find((c) => c.id === customerId);
    return selected && !found.includes(selected) ? [selected, ...found] : found;
  }, [customers, search, customerId]);

  /** Run a change; the server answers with the refreshed ledger. */
  const run = async (request, message) => {
    setBusy(true);
    try {
      const res = await request;
      setData(res.data.data);
      setModal(null);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ready = data && data.customer.id === customerId;
  const year = data?.fy;
  const view = data?.view;
  const records = data?.records;
  const last = data?.lastSettlementDate;
  const isLocked = (record) => Boolean(last && record.date <= last);
  const monthLocked = (month) => Boolean(last && month <= last.slice(0, 7));
  const inYear = (r) => r.date >= `${year}-04-01` && r.date <= `${year + 1}-03-31`;
  const minDate = last ? nextDay(last) : records?.opening ? `${records.opening.month}-01` : undefined;
  const asOn = ready && year < data.availableFys.at(-1) ? `${year + 1}-03-31` : data?.today;

  const cancelRecord = async (type, r) => {
    const noun = type === 'loans' ? 'loan' : 'fixed deposit';
    const ok = await confirmDialog({
      title: `Cancel this ${noun}?`,
      message: `${formatDate(r.date)} · ${amt(r.amount)} will be removed from the ledger. The change history keeps a record.`,
      confirmLabel: `Cancel ${noun}`,
    });
    if (ok) run(ledgerApi.cancelLedgerRecord(customerId, type, r.id, year), 'Removed');
  };
  const removeRate = async (t) => {
    const ok = await confirmDialog({ title: 'Remove this rate?', message: 'Interest will be recalculated with the earlier rate.', confirmLabel: 'Remove' });
    if (ok) run(ledgerApi.deleteLedgerRate(customerId, t.id, year), 'Rate removed');
  };
  const undoSettlement = async (s) => {
    const ok = await confirmDialog({
      title: 'Cancel this settlement?',
      message: `Settlement of ${formatDate(s.date)} (${amt(Math.abs(s.finalAmount))}) will be cancelled and the balances come back.`,
      confirmLabel: 'Cancel settlement',
    });
    if (ok) run(ledgerApi.cancelSettlement(customerId, s.id, year), 'Settlement cancelled');
  };
  const removeOpening = async () => {
    const ok = await confirmDialog({ title: 'Remove the opening balance?', message: 'All app collections will be counted again.', confirmLabel: 'Remove' });
    if (ok) run(ledgerApi.deleteLedgerOpening(customerId, year), 'Opening balance removed');
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/ledger/${customerId}/pdf`, { fy: year, lang }, `Ledger_${lang}.pdf`);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    } finally {
      setDownloading(false);
    }
  };

  const warnings = [];
  if (ready) {
    const missing = (code) => [...new Set(data.warnings.filter((w) => w.code === code).map((w) => w.month))].map(monthLabel);
    if (missing('LOAN_RATE_MISSING').length) warnings.push(`No loan interest rate for ${missing('LOAN_RATE_MISSING').join(', ')}. Use “Interest rate”.`);
    if (missing('FD_RATE_MISSING').length) warnings.push(`No fixed deposit rate for ${missing('FD_RATE_MISSING').join(', ')}. No FD interest is added for these months.`);
    if (data.current.loanPrincipal < 0)
      warnings.push(
        `Loan repayments exceed the loans recorded by ${amt(-data.current.loanPrincipal)}. Add the earlier loan or an opening balance.`
      );
  }
  const archived = ready && !data.customer.isActive;
  const common = { isLocked, monthLocked, onInterest: (target) => setModal({ type: 'interest', target }) };

  return (
    <div className="space-y-4">
      <div className="page-head !items-stretch">
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Ledger</h1>
              <p className="text-sm text-gray-500 mt-1">Loans, fixed deposits, interest and settlement of one customer.</p>
            </div>
            {ready && (
              <div className={`rounded-lg px-4 py-2 text-right ${data.current.finalAmount < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <p className="text-xs font-semibold uppercase">Today · {finalText(data.current.finalAmount)}</p>
                <p className="text-xl font-bold tabular-nums">{amt(Math.abs(data.current.finalAmount))}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="lg-search">Search</label>
              <Search className="h-4 w-4 text-gray-400 absolute left-3 bottom-3" />
              <input id="lg-search" type="search" className="input-field text-sm !pl-9" placeholder="Name or account no." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="lg-customer">Customer ({matches.length})</label>
              <select id="lg-customer" className="input-field text-sm" value={customerId} onChange={(e) => choose(e.target.value)}>
                {matches.map((c) => (
                  <option key={c.id} value={c.id}>{c.accountNo} · {c.name}{c.isActive ? '' : ' (archived)'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase" htmlFor="lg-fy">Financial year</label>
              <select id="lg-fy" className="input-field text-sm" value={year ?? ''} onChange={(e) => setFy(Number(e.target.value))} disabled={!ready}>
                {(data?.availableFys || []).map((y) => (
                  <option key={y} value={y}>{fyLabel(y)}</option>
                ))}
              </select>
            </div>
          </div>

          {ready && (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary text-sm" disabled={archived} onClick={() => setModal({ type: 'record', record: null, list: 'loans' })}>
                <HandCoins className="h-4 w-4" /> Give loan
              </button>
              <button className="btn-outline text-sm" disabled={archived} onClick={() => setModal({ type: 'record', record: null, list: 'deposits' })}>
                <PiggyBank className="h-4 w-4" /> Add fixed deposit
              </button>
              <button className="btn-outline text-sm" onClick={() => setModal({ type: 'rate' })}>
                <Percent className="h-4 w-4" /> Interest rate
              </button>
              <button className="btn-outline text-sm" disabled={Boolean(last)} title={last ? 'Not available after a settlement' : undefined} onClick={() => setModal({ type: 'opening' })}>
                <BookOpen className="h-4 w-4" /> Opening balance
              </button>
              <button className="btn-primary text-sm" onClick={() => setModal({ type: 'settle' })}>
                <CheckCircle2 className="h-4 w-4" /> Settle
              </button>
              <span className="sm:ml-auto flex items-center gap-2">
                <select className="input-field text-sm !w-auto" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="PDF language">
                  <option value="en">English</option>
                  <option value="mr">मराठी</option>
                </select>
                <button className="btn-secondary text-sm" onClick={download} disabled={downloading}>
                  <FileDown className="h-4 w-4" /> {downloading ? 'Preparing…' : 'PDF'}
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {w}
        </div>
      ))}

      {!ready ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {loading || !customers.length ? <SkeletonRows rows={8} /> : <p className="text-center text-gray-400 py-8">Select a customer.</p>}
        </div>
      ) : (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {records.opening && (
            <p className="text-sm text-gray-500">Opening balance entered as on 01 {monthLabel(records.opening.month)}.</p>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <RepaymentSection view={view} />
            <LoanSection
              view={view}
              loans={records.loans.filter(inYear)}
              terms={records.terms}
              {...common}
              onEdit={(r) => setModal({ type: 'record', record: r, list: 'loans' })}
              onCancel={(r) => cancelRecord('loans', r)}
            />
            <DepositSection
              view={view}
              deposits={records.deposits}
              terms={records.terms}
              {...common}
              onEdit={(r) => setModal({ type: 'record', record: r, list: 'deposits' })}
              onCancel={(r) => cancelRecord('deposits', r)}
            />
            <SavingsSection view={view} {...common} />
          </div>

          <FinalSection view={view} asOn={asOn} />
          <SettlementHistory settlements={records.settlements} onCancel={undoSettlement} />
          <RateHistory terms={records.terms} deposits={records.deposits} isLocked={isLocked} onRemove={removeRate} />

          <Panel title="Change history">
            <details className="px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary-600">Show last {data.history.length} changes</summary>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {data.history.map((h) => (
                  <li key={h.id} className="py-1.5 flex flex-wrap justify-between gap-2">
                    <span><b>{HISTORY_LABEL[h.action] || h.action}</b> {historyDetail(h.details)}</span>
                    <span className="text-xs text-gray-500">{h.actorName} · {new Date(h.createdAt).toLocaleString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            </details>
          </Panel>
        </div>
      )}

      {ready && modal?.type === 'record' && (
        <RecordForm
          type={modal.list}
          record={modal.record}
          minDate={minDate}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(form) =>
            run(
              modal.record
                ? ledgerApi.updateLedgerRecord(customerId, modal.list, modal.record.id, form, year)
                : ledgerApi.addLedgerRecord(customerId, modal.list, form, year),
              'Saved'
            )
          }
        />
      )}
      {ready && modal?.type === 'rate' && (
        <RateForm
          deposits={records.deposits}
          hasOpeningFd={records.opening?.fdAmount > 0}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(form) => run(ledgerApi.addLedgerRate(customerId, form, year), 'Rate saved')}
        />
      )}
      {ready && modal?.type === 'interest' && (
        <InterestForm
          target={modal.target}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(amount) => {
            const { kind, targetId, month } = modal.target;
            run(ledgerApi.setLedgerInterest(customerId, { kind, targetId, month, amount }, year), 'Interest updated');
          }}
        />
      )}
      {ready && modal?.type === 'opening' && (
        <OpeningForm
          opening={records.opening}
          terms={records.terms}
          busy={busy}
          onClose={() => setModal(null)}
          onRemove={removeOpening}
          onSubmit={(form) => run(ledgerApi.saveLedgerOpening(customerId, form, year), 'Opening balance saved')}
        />
      )}
      {ready && modal?.type === 'settle' && (
        <SettleForm
          customerId={customerId}
          minDate={last ? nextDay(last) : undefined}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(form) => run(ledgerApi.createSettlement(customerId, form, year), 'Account settled')}
        />
      )}
    </div>
  );
}
