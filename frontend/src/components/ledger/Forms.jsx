import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import { previewSettlement } from '../../api/ledger.js';
import { todayISO, errorMessage } from '../../utils/helpers.js';
import { amt, finalText, formatDate, KIND_LABEL, monthLabel, rateText } from './format.jsx';

const Label = ({ text, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-600 uppercase mb-1">{text}</span>
    {children}
  </label>
);

const MoneyInput = (props) => <input type="number" inputMode="decimal" min="0" step="0.01" className="input-field" {...props} />;

const Buttons = ({ onClose, busy, label, children }) => (
  <div className="flex flex-wrap justify-end gap-2 pt-2">
    {children}
    <button type="button" className="btn-secondary text-sm" onClick={onClose}>Cancel</button>
    <button type="submit" className="btn-primary text-sm" disabled={busy}>{busy ? 'Saving…' : label}</button>
  </div>
);

/** Rate (% per month) or a fixed amount per month. */
function RateFields({ value, onChange, optional = false }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Label text="Interest type">
        <select className="input-field" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value })}>
          {optional && <option value="">Set later</option>}
          <option value="PERCENT">Rate (% per month)</option>
          <option value="AMOUNT">Amount (₹ per month)</option>
        </select>
      </Label>
      {value.mode ? (
        <Label text={value.mode === 'PERCENT' ? 'Rate %' : 'Amount ₹'}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={value.mode === 'PERCENT' ? '0.0001' : '0.01'}
            className="input-field"
            required
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        </Label>
      ) : null}
    </div>
  );
}

/** Give a loan / add a fixed deposit, or correct one. */
export function RecordForm({ type, record, minDate, busy, onClose, onSubmit }) {
  const loan = type === 'loans';
  const [date, setDate] = useState(record?.date || todayISO());
  const [amount, setAmount] = useState(record?.amount ?? '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [rate, setRate] = useState({ mode: loan ? 'PERCENT' : '', value: '' });
  const noun = loan ? 'loan' : 'fixed deposit';

  return (
    <Modal isOpen onClose={onClose} title={record ? `Correct ${noun}` : loan ? 'Give loan' : 'Add fixed deposit'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ date, amount, notes, ...(!record && rate.mode ? rate : {}) });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Label text="Date">
            <input type="date" className="input-field" required value={date} min={minDate} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Label>
          <Label text="Amount ₹">
            <MoneyInput required value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Label>
        </div>
        {!record && <RateFields value={rate} onChange={setRate} optional={!loan} />}
        <Label text="Notes (optional)">
          <input className="input-field" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Label>
        {!record && (
          <p className="text-xs text-gray-500">
            {loan
              ? 'The full month’s interest is charged in the month of the loan. If a loan is already running, this amount is added to it and these interest terms apply to the whole balance.'
              : 'Interest is calculated every month on the deposit amount, including the full month of the deposit.'}
          </p>
        )}
        <Buttons onClose={onClose} busy={busy} label={record ? 'Save changes' : loan ? 'Give loan' : 'Add deposit'} />
      </form>
    </Modal>
  );
}

/** Change a rate from a chosen month onwards. */
export function RateForm({ deposits, hasOpeningFd, busy, onClose, onSubmit }) {
  const targets = [
    ...(hasOpeningFd ? [{ id: 'OPENING', label: 'Opening deposit' }] : []),
    ...deposits.map((d) => ({ id: d.id, label: `${formatDate(d.date)} · ${amt(d.amount)}` })),
  ];
  const [kind, setKind] = useState('LOAN');
  const [targetId, setTargetId] = useState(targets[0]?.id || '');
  const [fromMonth, setFromMonth] = useState(todayISO().slice(0, 7));
  const [rate, setRate] = useState({ mode: 'PERCENT', value: '' });
  const [base, setBase] = useState('BALANCE');

  return (
    <Modal isOpen onClose={onClose} title="Set interest rate">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ kind, targetId: kind === 'FD' ? targetId : '', fromMonth, ...rate, base });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Label text="Interest on">
            <select className="input-field" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Label>
          <Label text="From month">
            <input type="month" className="input-field" required value={fromMonth} max={todayISO().slice(0, 7)} onChange={(e) => setFromMonth(e.target.value)} />
          </Label>
        </div>
        {kind === 'FD' &&
          (targets.length ? (
            <Label text="Deposit">
              <select className="input-field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Label>
          ) : (
            <p className="text-sm text-amber-700">Add a fixed deposit first.</p>
          ))}
        <RateFields value={rate} onChange={setRate} />
        {kind === 'SAVINGS' && rate.mode === 'PERCENT' && (
          <Label text="Rate applies on">
            <select className="input-field" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="BALANCE">Total collected so far</option>
              <option value="MONTH">Only that month’s collection</option>
            </select>
          </Label>
        )}
        <p className="text-xs text-gray-500">
          Applies from the chosen month until a later change. A loan given in a later month with its own rate takes over from that month.
        </p>
        <Buttons onClose={onClose} busy={busy || (kind === 'FD' && !targets.length)} label="Save rate" />
      </form>
    </Modal>
  );
}

/** Type one month's interest, or go back to the calculated amount. */
export function InterestForm({ target, busy, onClose, onSubmit }) {
  const { kind, month, item, label } = target;
  const [amount, setAmount] = useState(item.interest ?? 0);
  return (
    <Modal isOpen onClose={onClose} title={`${label || KIND_LABEL[kind]} interest · ${monthLabel(month)}`} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(amount);
        }}
      >
        <p className="text-sm text-gray-500">
          Now: <b>{amt(item.interest)}</b> {rateText(item) && `(${rateText(item)})`}
        </p>
        <Label text="Interest for this month ₹">
          <MoneyInput required value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Label>
        {kind === 'SAVINGS' && (
          <p className="text-xs text-gray-500">To credit a whole year’s interest at once, enter it in the month you give it.</p>
        )}
        <Buttons onClose={onClose} busy={busy} label="Save">
          {item.source === 'manual' && (
            <button type="button" className="btn-outline text-sm mr-auto" disabled={busy} onClick={() => onSubmit(null)}>
              Use calculated
            </button>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

const OPENING_FIELDS = [
  ['loanPrincipal', 'Loan remaining'],
  ['pendingInterest', 'Loan interest pending'],
  ['fdAmount', 'Fixed deposit'],
  ['fdInterest', 'FD interest earned'],
  ['savings', 'Daily collection total'],
  ['savingsInterest', 'Daily collection interest'],
];

/** Balances carried over from the paper book. */
export function OpeningForm({ opening, terms, busy, onClose, onSubmit, onRemove }) {
  const saved = (kind) => {
    const t = terms.find((x) => x.sourceId === 'OPENING' && x.kind === kind);
    return t ? { mode: t.mode, value: t.value } : { mode: '', value: '' };
  };
  const [month, setMonth] = useState(opening?.month || todayISO().slice(0, 7));
  const [values, setValues] = useState(() => Object.fromEntries(OPENING_FIELDS.map(([k]) => [k, opening?.[k] || ''])));
  const [loanRate, setLoanRate] = useState(() => saved('LOAN'));
  const [fdRate, setFdRate] = useState(() => saved('FD'));

  return (
    <Modal isOpen onClose={onClose} title="Opening balance" size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ month, ...values, loanRate, fdRate });
        }}
      >
        <p className="text-sm text-gray-500">
          Balances from the paper book as on the 1st of this month. Collections recorded in the app before this month are ignored by the ledger.
        </p>
        <Label text="As on the 1st of">
          <input type="month" className="input-field" required value={month} max={todayISO().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
        </Label>
        <div className="grid grid-cols-2 gap-3">
          {OPENING_FIELDS.map(([k, l]) => (
            <Label key={k} text={`${l} ₹`}>
              <MoneyInput value={values[k]} placeholder="0" onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
            </Label>
          ))}
        </div>
        {Number(values.loanPrincipal) > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Interest on the remaining loan</p>
            <RateFields value={loanRate} onChange={setLoanRate} optional />
          </div>
        )}
        {Number(values.fdAmount) > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Interest on the opening deposit</p>
            <RateFields value={fdRate} onChange={setFdRate} optional />
          </div>
        )}
        <Buttons onClose={onClose} busy={busy} label="Save opening balance">
          {opening && (
            <button type="button" className="btn-danger text-sm mr-auto" disabled={busy} onClick={onRemove}>Remove</button>
          )}
        </Buttons>
      </form>
    </Modal>
  );
}

const BreakdownRow = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-3 px-3 py-1.5 ${strong ? 'bg-primary-50 font-bold text-primary-700' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums">{amt(value)}</span>
  </div>
);

export function Breakdown({ values }) {
  const rows = [
    ['Fixed deposit', values.fd],
    ['Fixed deposit interest', values.fdInterest],
    ['Daily collection', values.savings],
    ['Daily collection interest', values.savingsInterest],
  ];
  const deposits = values.deposits ?? rows.reduce((s, [, v]) => s + Math.round(v * 100), 0) / 100;
  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
      {rows.map(([l, v]) => (
        <BreakdownRow key={l} label={l} value={v} />
      ))}
      <BreakdownRow label="Total" value={deposits} strong />
      <BreakdownRow label="− Loan remaining" value={values.loanPrincipal} />
      <BreakdownRow label="− Loan interest pending" value={values.pendingInterest} />
    </div>
  );
}

/** Settle the account on a date: shows exactly what will be paid or received. */
export function SettleForm({ customerId, minDate, busy, onClose, onSubmit }) {
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError('');
    previewSettlement(customerId, date)
      .then((res) => !cancelled && setPreview(res.data.data))
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not calculate')));
    return () => {
      cancelled = true;
    };
  }, [customerId, date, attempt]);

  const blocked = !preview || preview.isEmpty || preview.missingLoanRate.length > 0;
  return (
    <Modal isOpen onClose={onClose} title="Settle account">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await onSubmit({ date, notes, expectedFinal: preview.finalAmount });
          if (!ok) setAttempt((n) => n + 1); // show fresh figures
        }}
      >
        <Label text="Settlement date">
          <input type="date" className="input-field" required value={date} min={minDate} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!preview && !error && <p className="text-sm text-gray-500">Calculating…</p>}
        {preview && (
          <>
            <Breakdown values={{ ...preview.snapshot, deposits: preview.deposits }} />
            <div className={`rounded-lg px-3 py-3 flex justify-between items-center font-bold ${preview.finalAmount < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <span>{finalText(preview.finalAmount)}</span>
              <span className="text-xl tabular-nums">{amt(Math.abs(preview.finalAmount))}</span>
            </div>
            {preview.isEmpty && <p className="text-sm text-amber-700">There is nothing to settle on this date.</p>}
            {preview.missingLoanRate.length > 0 && (
              <p className="text-sm text-amber-700">Set the loan interest rate first (missing for {preview.missingLoanRate.map(monthLabel).join(', ')}).</p>
            )}
          </>
        )}
        <Label text="Notes (optional)">
          <input className="input-field" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid in cash" />
        </Label>
        <p className="text-xs text-gray-500">
          Settling confirms this amount was paid or received. All balances up to this date become zero and a new account starts after it.
        </p>
        <Buttons onClose={onClose} busy={busy || blocked} label={busy ? 'Saving…' : 'Confirm settlement'} />
      </form>
    </Modal>
  );
}
