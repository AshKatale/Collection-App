import { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, Check, X, Plus, History } from 'lucide-react';
import Modal from './Modal.jsx';
import { SkeletonRows } from './Loading.jsx';
import { toast, confirmDialog } from './Toast.jsx';
import { getEntries, createEntry, updateEntry, deleteEntry, getEntryHistory } from '../../api/entries.js';
import { getCollectors } from '../../api/collectors.js';
import { formatMoney, formatDate, TYPE_LABELS, TYPE_BADGE, errorMessage } from '../../utils/helpers.js';

/**
 * Edit everything recorded for one customer on one day (Admin / Owner).
 * Used from the monthly matrix: click a cell, fix amounts, add a missing entry
 * or delete a wrong one. Every change is written to the audit log.
 */
export default function DayEntriesModal({ customer, date, defaultType = 'SAVINGS', onClose, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [newType, setNewType] = useState(defaultType);
  const [newAmount, setNewAmount] = useState('');
  const [newCollector, setNewCollector] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEntries({ customerId: customer.id, date, limit: 100 });
      setEntries(res.data?.data || []);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load entries'));
    } finally {
      setLoading(false);
    }
  }, [customer.id, date]);

  useEffect(() => {
    load();
    getCollectors()
      .then((res) => setCollectors(res.data?.data || []))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!newCollector && entries[0]?.collectorId) setNewCollector(entries[0].collectorId);
  }, [entries, newCollector]);

  const changed = () => {
    onChanged?.();
    return load();
  };

  const saveEdit = async (id) => {
    const amount = Number(editAmount);
    if (!(amount > 0)) return toast.error('Enter an amount greater than 0');
    setBusy(true);
    try {
      await updateEntry(id, { amount });
      setEditingId(null);
      toast.success('Entry updated');
      await changed();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    const ok = await confirmDialog({
      title: 'Delete this entry?',
      message: `${TYPE_LABELS[entry.type]} ${formatMoney(entry.amount)} for ${customer.name}. The change is kept in the audit history.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteEntry(entry.id);
      toast.success('Entry deleted');
      await changed();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete'));
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const amount = Number(newAmount);
    if (!(amount > 0)) return toast.error('Enter an amount greater than 0');
    setBusy(true);
    try {
      await createEntry({
        date,
        customerId: customer.id,
        type: newType,
        amount,
        ...(newCollector ? { collectorId: newCollector } : {}),
      });
      setNewAmount('');
      toast.success('Entry added');
      await changed();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add entry'));
    } finally {
      setBusy(false);
    }
  };

  const showHistory = async (id) => {
    if (historyFor === id) return setHistoryFor(null);
    setHistoryFor(id);
    try {
      const res = await getEntryHistory(id);
      setHistory(res.data?.data || []);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load history'));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${customer.accountNo} · ${customer.name} — ${formatDate(date)}`} size="md">
      {loading ? (
        <SkeletonRows rows={3} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">Nothing recorded for this day yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((en) => (
            <li key={en.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${TYPE_BADGE[en.type]}`}>
                    {TYPE_LABELS[en.type]}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">{en.collector?.name}</span>
                </div>

                {editingId === en.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      autoFocus
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(en.id)}
                      className="input-field !w-28 !py-1 text-right"
                    />
                    <button className="p-1.5 text-emerald-600" onClick={() => saveEdit(en.id)} disabled={busy} aria-label="Save">
                      <Check className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-gray-500" onClick={() => setEditingId(null)} aria-label="Cancel">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-900 mr-1">{formatMoney(en.amount)}</span>
                    <button
                      className="p-1.5 text-gray-500 hover:text-primary-600"
                      onClick={() => {
                        setEditingId(en.id);
                        setEditAmount(String(en.amount));
                      }}
                      aria-label="Edit amount"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-gray-500 hover:text-red-600" onClick={() => remove(en)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-gray-500 hover:text-primary-600" onClick={() => showHistory(en.id)} aria-label="History">
                      <History className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {historyFor === en.id && (
                <ul className="mt-2 ml-1 space-y-1 text-xs text-gray-500 border-l-2 border-gray-200 pl-3">
                  {history.map((h) => (
                    <li key={h.id}>
                      <b className="text-gray-700">{h.action}</b> by {h.actorName} ·{' '}
                      {new Date(h.createdAt).toLocaleString('en-IN')}
                      {h.action === 'UPDATE' && h.before && h.after && h.before.amount !== h.after.amount && (
                        <> · {formatMoney(h.before.amount)} → {formatMoney(h.after.amount)}</>
                      )}
                      {h.action === 'CREATE' && h.after && <> · {formatMoney(h.after.amount)}</>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 pt-4 border-t border-gray-200 space-y-3">
        <p className="text-xs font-semibold uppercase text-gray-500">Add an entry for this day</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className="input-field" aria-label="Type">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="Amount ₹"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="input-field"
            aria-label="Amount"
          />
        </div>
        <select value={newCollector} onChange={(e) => setNewCollector(e.target.value)} className="input-field" aria-label="Collector">
          <option value="">Collector: (me)</option>
          {collectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          <Plus className="h-4 w-4" /> Add entry
        </button>
      </form>
    </Modal>
  );
}
