import { formatDate, MONTHS } from '../../utils/helpers.js';

/** Ledger figures are exact: always two decimals. */
export const amt = (n) => {
  const v = Number(n || 0);
  const text = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}₹${text}`;
};
/** Interest pending; a negative value means the customer has paid in advance. */
export const pendingText = (n) => (n < 0 ? `${amt(-n)} advance` : amt(n));
export const cell = (n) => (n ? amt(n) : <span className="text-gray-300">-</span>);

export const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(0, 4)}`;

export const rateText = (item) => {
  if (!item) return '';
  if (item.source === 'manual') return 'entered by you';
  if (!item.rate) return '';
  return item.rate.mode === 'PERCENT' ? `${item.rate.value}% a month` : `${amt(item.rate.value)} a month`;
};

export const termText = (t) =>
  t.mode === 'PERCENT'
    ? `${t.value}% a month${t.kind === 'SAVINGS' ? ` on ${t.base === 'MONTH' ? "that month's collection" : 'total collection'}` : ''}`
    : `${amt(t.value)} a month`;

export const finalText = (n) => (n > 0 ? 'Pay to customer' : n < 0 ? 'Customer has to pay' : 'Nothing due');

export const KIND_LABEL = { LOAN: 'Loan', FD: 'Fixed deposit', SAVINGS: 'Daily collection' };
export { formatDate };
