import { Fragment } from 'react';
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { amt, cell, finalText, formatDate, monthLabel, pendingText, rateText, termText, KIND_LABEL } from './format.jsx';
import { Breakdown } from './Forms.jsx';

export const Panel = ({ title, hint, action, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-w-0">
    <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
      <div>
        <h2 className="font-bold text-gray-900">{title}</h2>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      {action}
    </header>
    {children}
  </section>
);

const Table = ({ head, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="table-header">
          {head.map((h, i) => (
            <th key={h} className={`px-3 py-2 whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">{children}</tbody>
    </table>
  </div>
);
const Td = ({ children, left, strong, className = '' }) => (
  <td className={`px-3 py-2 align-top tabular-nums ${left ? 'text-left whitespace-nowrap' : 'text-right'} ${strong ? 'font-bold' : ''} ${className}`}>{children}</td>
);
const EmptyRow = ({ span }) => (
  <tr>
    <td colSpan={span} className="px-3 py-8 text-center text-gray-400">No records in this financial year.</td>
  </tr>
);
const SettledRow = ({ settlement, span }) => (
  <tr className="bg-emerald-50">
    <td colSpan={span} className="px-3 py-1.5 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
      Settled on {formatDate(settlement.date)} · balances restart after this date
      {settlement.changedAfterwards && (
        <span className="block text-amber-700">
          Records of the settled period changed afterwards. Difference carried forward: {amt(settlement.carried.finalAmount)}
        </span>
      )}
    </td>
  </tr>
);

/** An interest amount that can be typed over (unless its month is settled). */
function Interest({ value, source, locked, onEdit }) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <span className={source === 'manual' ? 'text-blue-700 font-semibold' : ''} title={source === 'manual' ? 'Entered by you' : undefined}>
        {cell(value)}
        {source === 'manual' && '*'}
      </span>
      {!locked && (
        <button type="button" className="p-1 text-gray-400 hover:text-primary-600" onClick={onEdit} aria-label="Edit interest">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function RecordList({ records, locked, onEdit, onCancel, describe }) {
  if (!records.length) return null;
  return (
    <ul className="divide-y divide-gray-100 border-b border-gray-200">
      {records.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
          <div className="min-w-0">
            <span className="font-semibold">{formatDate(r.date)}</span> · <b className="tabular-nums">{amt(r.amount)}</b>
            <span className="text-xs text-gray-500"> {describe(r)}{r.notes ? ` · ${r.notes}` : ''}</span>
          </div>
          {!locked(r) && (
            <div className="flex">
              <button type="button" className="p-1.5 text-gray-400 hover:text-primary-600" onClick={() => onEdit(r)} aria-label="Correct">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => onCancel(r)} aria-label="Cancel record">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RepaymentSection({ view }) {
  const { months, totals } = view;
  return (
    <Panel title="Loan repayment" hint="From daily Loan and Interest collections">
      <Table head={['Month', 'Repaid', 'Interest received']}>
        {months.length === 0 && <EmptyRow span={3} />}
        {months.map((m) => (
          <Fragment key={m.month}>
            <tr className={m.loan.missed ? 'bg-red-50' : ''}>
              <Td left>{monthLabel(m.month)}</Td>
              <Td>{m.loan.missed ? <span className="text-xs font-bold text-red-700">MISSED</span> : cell(m.loan.repaid)}</Td>
              <Td>
                {cell(m.loan.received)}
                {m.loan.receipts.map((r) => (
                  <div key={r.date} className="text-[11px] text-gray-500">{formatDate(r.date)}: {amt(r.amount)}</div>
                ))}
              </Td>
            </tr>
            {m.settlements.map((s) => (
              <SettledRow key={s.id} settlement={s} span={3} />
            ))}
          </Fragment>
        ))}
        <tr className="bg-gray-50">
          <Td left strong>Total</Td>
          <Td strong>{amt(totals.repaid)}</Td>
          <Td strong>{amt(totals.received)}</Td>
        </tr>
      </Table>
    </Panel>
  );
}

export function LoanSection({ view, loans, terms, isLocked, monthLocked, onInterest, onEdit, onCancel }) {
  const { months, totals, broughtForward: bf, shownClosing: closing } = view;
  const describe = (r) => {
    const t = terms.find((x) => x.sourceId === r.id);
    return t ? `· ${termText(t)}` : '';
  };
  return (
    <Panel title="Loan given and monthly interest" hint="Interest is charged on the balance at the start of the month plus new loans">
      <RecordList records={loans} locked={isLocked} onEdit={onEdit} onCancel={onCancel} describe={describe} />
      <Table head={['Month', 'Interest on', 'Interest', 'Loan left', 'Int. pending']}>
        <tr className="text-gray-500">
          <Td left>Brought forward</Td>
          <Td />
          <Td />
          <Td>{amt(bf.loanPrincipal)}</Td>
          <Td>{pendingText(bf.pendingInterest)}</Td>
        </tr>
        {months.length === 0 && <EmptyRow span={5} />}
        {months.map((m) => (
          <Fragment key={m.month}>
            <tr>
              <Td left>
                {monthLabel(m.month)}
                {m.loan.given > 0 && <div className="text-[11px] text-primary-600 font-semibold">+ loan {amt(m.loan.given)}</div>}
              </Td>
              <Td>{cell(m.loan.base)}</Td>
              <Td>
                <Interest value={m.loan.interest} source={m.loan.source} locked={monthLocked(m.month)} onEdit={() => onInterest({ kind: 'LOAN', targetId: '', month: m.month, item: m.loan })} />
                <div className="text-[11px] text-gray-500">{rateText(m.loan)}</div>
              </Td>
              <Td>{amt(m.loan.closing)}</Td>
              <Td>{pendingText(m.loan.pending)}</Td>
            </tr>
            {m.settlements.map((s) => (
              <SettledRow key={s.id} settlement={s} span={5} />
            ))}
          </Fragment>
        ))}
        <tr className="bg-gray-50">
          <Td left strong>Total</Td>
          <Td strong>{totals.loanGiven > 0 ? `Given ${amt(totals.loanGiven)}` : ''}</Td>
          <Td strong>{amt(totals.loanInterest)}</Td>
          <Td strong>{amt(closing.loanPrincipal)}</Td>
          <Td strong>{pendingText(closing.pendingInterest)}</Td>
        </tr>
      </Table>
    </Panel>
  );
}

export function DepositSection({ view, deposits, terms, isLocked, monthLocked, onInterest, onEdit, onCancel }) {
  const { months, totals, broughtForward: bf, shownClosing: closing } = view;
  const nameOf = (id) => {
    if (id === 'OPENING') return 'Opening deposit';
    const d = deposits.find((x) => x.id === id);
    return d ? `FD ${formatDate(d.date)}` : 'FD';
  };
  const describe = (r) => {
    const latest = terms.filter((t) => t.kind === 'FD' && t.targetId === r.id).at(-1);
    return latest ? `· ${termText(latest)}` : '· no rate yet';
  };
  return (
    <Panel title="Fixed deposit" hint="Monthly interest on each deposit">
      <RecordList records={deposits} locked={isLocked} onEdit={onEdit} onCancel={onCancel} describe={describe} />
      <Table head={['Month', 'Deposit', 'Interest', 'Interest total']}>
        <tr className="text-gray-500">
          <Td left>Brought forward</Td>
          <Td>{amt(bf.fd)}</Td>
          <Td />
          <Td>{amt(bf.fdInterest)}</Td>
        </tr>
        {months.map((m) => (
          <tr key={m.month}>
            <Td left>{monthLabel(m.month)}</Td>
            <Td>{cell(m.fd.closing)}</Td>
            <Td>
              {m.fd.items.length === 0 && cell(0)}
              {m.fd.items.map((item) => (
                <div key={item.id}>
                  <Interest value={item.interest} source={item.source} locked={monthLocked(m.month)} onEdit={() => onInterest({ kind: 'FD', targetId: item.id, month: m.month, item, label: nameOf(item.id) })} />
                  <div className="text-[11px] text-gray-500">
                    {m.fd.items.length > 1 ? `${nameOf(item.id)} ` : ''}{rateText(item) || 'no rate'}
                  </div>
                </div>
              ))}
            </Td>
            <Td>{amt(m.fd.totalInterest)}</Td>
          </tr>
        ))}
        <tr className="bg-gray-50">
          <Td left strong>Total</Td>
          <Td strong>{amt(closing.fd)}</Td>
          <Td strong>{amt(totals.fdInterest)}</Td>
          <Td strong>{amt(closing.fdInterest)}</Td>
        </tr>
      </Table>
    </Panel>
  );
}

export function SavingsSection({ view, monthLocked, onInterest }) {
  const { months, totals, broughtForward: bf, shownClosing: closing } = view;
  return (
    <Panel title="Daily collection" hint="Savings collections, with the interest you set">
      <Table head={['Month', 'Collected', 'Total', 'Interest', 'Interest total']}>
        <tr className="text-gray-500">
          <Td left>Brought forward</Td>
          <Td />
          <Td>{amt(bf.savings)}</Td>
          <Td />
          <Td>{amt(bf.savingsInterest)}</Td>
        </tr>
        {months.map((m) => (
          <tr key={m.month}>
            <Td left>{monthLabel(m.month)}</Td>
            <Td>{cell(m.savings.collected)}</Td>
            <Td>{amt(m.savings.closing)}</Td>
            <Td>
              <Interest value={m.savings.interest} source={m.savings.source} locked={monthLocked(m.month)} onEdit={() => onInterest({ kind: 'SAVINGS', targetId: '', month: m.month, item: m.savings })} />
              <div className="text-[11px] text-gray-500">{rateText(m.savings)}</div>
            </Td>
            <Td>{amt(m.savings.totalInterest)}</Td>
          </tr>
        ))}
        <tr className="bg-gray-50">
          <Td left strong>Total</Td>
          <Td strong>{amt(totals.savingsCollected)}</Td>
          <Td strong>{amt(closing.savings)}</Td>
          <Td strong>{amt(totals.savingsInterest)}</Td>
          <Td strong>{amt(closing.savingsInterest)}</Td>
        </tr>
      </Table>
    </Panel>
  );
}

export function FinalSection({ view, asOn }) {
  const { settled } = view;
  // After a settlement with nothing since, repeat what was settled
  const values = settled ? settled.settled : view.closing;
  const final = values.finalAmount;
  const verdict = settled ? (final < 0 ? 'Received from customer' : 'Paid to customer') : finalText(final);
  return (
    <Panel title="Final calculation" hint={settled ? `Account settled on ${formatDate(settled.date)}` : `As on ${formatDate(asOn)}`}>
      <div className="p-4 space-y-3">
        <Breakdown values={values} />
        <div className={`rounded-lg px-4 py-4 flex flex-wrap justify-between items-center gap-2 font-bold ${final < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <span className="uppercase text-sm">{verdict}</span>
          <span className="text-2xl tabular-nums">{amt(Math.abs(final))}</span>
        </div>
      </div>
    </Panel>
  );
}

export function SettlementHistory({ settlements, onCancel }) {
  const latestActive = settlements.filter((s) => !s.cancelledAt).at(-1);
  return (
    <Panel title="Settlement history">
      <Table head={['Date', 'Amount', 'Details', 'Settled by', '']}>
        {settlements.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-gray-400">This account has not been settled yet.</td>
          </tr>
        )}
        {[...settlements].reverse().map((s) => (
          <tr key={s.id} className={s.cancelledAt ? 'text-gray-400' : ''}>
            <Td left strong>{formatDate(s.date)}</Td>
            <Td>
              <span className={s.cancelledAt ? 'line-through' : 'font-bold'}>{amt(Math.abs(s.finalAmount))}</span>
              <div className="text-[11px] text-gray-500">{s.finalAmount < 0 ? 'Received from customer' : 'Paid to customer'}</div>
            </Td>
            <Td>
              <details className="inline-block text-left">
                <summary className="cursor-pointer text-primary-600 text-xs font-semibold text-right">View</summary>
                <div className="mt-2 min-w-[16rem]">
                  <Breakdown values={s.snapshot} />
                  {s.notes && <p className="text-xs text-gray-500 mt-1">{s.notes}</p>}
                </div>
              </details>
            </Td>
            <Td>
              {s.createdByName}
              {s.cancelledAt && <div className="text-[11px] text-red-600">Cancelled by {s.cancelledByName}</div>}
            </Td>
            <Td>
              {latestActive?.id === s.id && (
                <button type="button" className="text-xs font-semibold text-red-600 underline" onClick={() => onCancel(s)}>
                  Cancel settlement
                </button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

export function RateHistory({ terms, deposits, isLocked, onRemove }) {
  const sourceText = (t) => {
    if (!t.sourceId) return 'Rate change';
    if (t.sourceId === 'OPENING') return 'Opening balance';
    return t.kind === 'LOAN' ? 'With loan' : 'With deposit';
  };
  const target = (t) => {
    if (t.kind !== 'FD') return '';
    const d = deposits.find((x) => x.id === t.targetId);
    return d ? ` (${formatDate(d.date)})` : ' (opening)';
  };
  return (
    <Panel title="Interest rate history">
      <Table head={['From', 'Interest on', 'Rate', 'Source', '']}>
        {terms.length === 0 && (
          <tr>
            <td colSpan={5} className="px-3 py-6 text-center text-gray-400">No rates set yet.</td>
          </tr>
        )}
        {terms.map((t) => (
          <tr key={t.id}>
            <Td left>{monthLabel(t.date)}</Td>
            <Td>{KIND_LABEL[t.kind]}{target(t)}</Td>
            <Td>{termText(t)}</Td>
            <Td>{sourceText(t)}</Td>
            <Td>
              {!t.sourceId && !isLocked(t) && (
                <button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => onRemove(t)} aria-label="Remove rate">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
