import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  UserPlus,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Lock,
  CloudOff,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getCustomers, createCustomer } from '../api/customers.js';
import { getEntries, createEntriesBatch, updateEntry, deleteEntry } from '../api/entries.js';
import { formatMoney, todayISO, addDays, formatDate, uuid, errorMessage, TYPE_LABELS, TYPE_BADGE } from '../utils/helpers.js';
import { enqueue, isNetworkError, pendingItems, subscribePending } from '../utils/offlineQueue.js';
import { SkeletonRows } from '../components/common/Loading.jsx';
import Modal from '../components/common/Modal.jsx';
import CustomerForm from '../components/forms/CustomerForm.jsx';
import RequestAccessModal from '../components/common/RequestAccessModal.jsx';
import { getAccessRequests } from '../api/access.js';
import { toast, confirmDialog } from '../components/common/Toast.jsx';

const TYPES = ['SAVINGS', 'LOAN', 'INTEREST'];
const CUSTOMER_CACHE = 'collect_customers_v1';

/** Customer's usual amount per type (old customers: the single legacy amount counts as Savings). */
const usualOf = (c) => ({
  SAVINGS: Number(c.defaultSavings ?? c.defaultDailyAmount) || 0,
  LOAN: Number(c.defaultLoan) || 0,
  INTEREST: Number(c.defaultInterest) || 0,
});

/** Monday collections are double the usual amount. date = 'YYYY-MM-DD' */
const isMonday = (date) => new Date(`${date}T00:00:00`).getDay() === 1;

const byAccount =(a, b) => String(a.accountNo).localeCompare(String(b.accountNo), undefined, { numeric: true, sensitivity: 'base' });

/** Last known customer list, so the route sheet still opens with no connection. */
const readCustomerFallback = (userId) => {
  try {
    const cached = JSON.parse(localStorage.getItem(CUSTOMER_CACHE));
    return cached?.userId === userId ? cached.list : [];
  } catch {
    return [];
  }
};
const writeCustomerFallback = (userId, list) => {
  try {
    localStorage.setItem(CUSTOMER_CACHE, JSON.stringify({ userId, list }));
  } catch {
    /* ignore */
  }
};

export default function Collect() {
  const { user } = useAuth();
  const isCollector = user?.role === 'COLLECTOR';
  const today = todayISO();

  const [date, setDate] = useState(today);
  const [customers, setCustomers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | pending | done
  const [active, setActive] = useState(null); // customer whose sheet is open
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(pendingItems());
  const [dateWritable, setDateWritable] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  // Collectors may add / change today's entries, or a date their owner approved.
  // The server tells us which (dateWritable); everything else is view-only for them.
  const canWrite = !isCollector || dateWritable;

  const loadCustomers = useCallback(async () => {
    try {
      const res = await getCustomers();
      const list = (res.data?.data || []).slice().sort(byAccount);
      setCustomers(list);
      writeCustomerFallback(user.id, list);
    } catch (err) {
      if (isNetworkError(err)) {
        setCustomers(readCustomerFallback(user.id));
        toast.info('Offline: showing your last known customer list');
      } else {
        toast.error(errorMessage(err, 'Failed to load customers'));
      }
    }
  }, [user.id]);

  const loadEntries = useCallback(async () => {
    try {
      const res = await getEntries({ date, limit: 500 });
      setEntries(res.data?.data || []);
      setDateWritable(res.data?.dateWritable !== false);
    } catch (err) {
      if (!isNetworkError(err)) toast.error(errorMessage(err, 'Failed to load entries'));
    }
  }, [date]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const loadMyRequests = useCallback(() => {
    if (!isCollector) return;
    getAccessRequests({ status: 'PENDING' })
      .then((res) => setMyRequests(res.data?.data || []))
      .catch(() => {});
  }, [isCollector]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadEntries().finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loadEntries]);

  // When queued items get synced, refresh the list
  useEffect(
    () =>
      subscribePending(() => {
        setPending(pendingItems());
        loadEntries();
      }),
    [loadEntries]
  );

  // customerId -> { SAVINGS: n, LOAN: n, INTEREST: n, rows: [...], pending: bool }
  const perCustomer = useMemo(() => {
    const map = new Map();
    const slot = (id) => {
      if (!map.has(id)) map.set(id, { SAVINGS: 0, LOAN: 0, INTEREST: 0, rows: [], pending: false });
      return map.get(id);
    };
    entries.forEach((e) => {
      const s = slot(e.customerId);
      s[e.type] += e.amount;
      s.rows.push(e);
    });
    pending
      .filter((p) => p.payload.date === date)
      .forEach((p) => {
        const s = slot(p.payload.customerId);
        s.pending = true;
        p.payload.items.forEach((i) => (s[i.type] += Number(i.amount)));
      });
    return map;
  }, [entries, pending, date]);

  const totalOf = (s) => (s ? s.SAVINGS + s.LOAN + s.INTEREST : 0);
  const dayTotal = useMemo(() => [...perCustomer.values()].reduce((sum, s) => sum + totalOf(s), 0), [perCustomer]);
  const doneCount = customers.filter((c) => totalOf(perCustomer.get(c.id)) > 0).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const done = totalOf(perCustomer.get(c.id)) > 0;
      if (filter === 'pending' && done) return false;
      if (filter === 'done' && !done) return false;
      return !q || String(c.accountNo).toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    });
  }, [customers, perCustomer, search, filter]);

  /** Save new amounts for one customer: one atomic request, offline-safe. */
  const saveCollection = async (customer, amounts) => {
    const items = TYPES.filter((t) => Number(amounts[t]) > 0).map((t) => ({
      type: t,
      amount: Number(amounts[t]),
      clientId: uuid(), // makes a retry / offline replay idempotent
    }));
    if (!items.length) return false;

    const payload = { date, customerId: customer.id, items };
    try {
      await createEntriesBatch(payload);
      toast.success(`Saved ${formatMoney(items.reduce((s, i) => s + i.amount, 0))} for ${customer.name}`);
      await loadEntries();
      return true;
    } catch (err) {
      if (isNetworkError(err)) {
        enqueue(payload, `${customer.accountNo} · ${customer.name}`);
        toast.info('No connection – saved on this device. It will sync automatically.');
        return true;
      }
      toast.error(errorMessage(err, 'Failed to save'));
      return false;
    }
  };

  const changeAmount = async (entry, amount) => {
    try {
      await updateEntry(entry.id, { amount });
      toast.success('Amount updated');
      await loadEntries();
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update'));
      return false;
    }
  };

  const removeEntry = async (entry) => {
    const ok = await confirmDialog({
      title: 'Delete this entry?',
      message: `${TYPE_LABELS[entry.type]} ${formatMoney(entry.amount)} will be removed.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteEntry(entry.id);
      toast.success('Entry deleted');
      await loadEntries();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete'));
    }
  };

  const handleAddCustomer = async (formData) => {
    setAdding(true);
    try {
      const res = await createCustomer(formData);
      const created = res.data?.data;
      await loadCustomers();
      setAddOpen(false);
      toast.success(`Customer "${created?.name}" added`);
      if (created) setActive(created);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add customer'));
    } finally {
      setAdding(false);
    }
  };

  const activeData = active ? perCustomer.get(active.id) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header: date + totals */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Collect</h1>
            <p className="text-xs text-gray-500 truncate">
              {user?.name} · {customers.length} customers
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-outline text-sm !py-1.5">
            <UserPlus className="h-4 w-4" /> Add customer
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button className="btn-secondary !px-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input-field text-center font-medium"
            aria-label="Collection date"
          />
          <button className="btn-secondary !px-2" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {!canWrite && (
          <div className="flex items-start gap-2 text-sm rounded-lg bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p>
                View only. You can see entries of other days, but you can only add or change <b>today’s</b> entries
                unless your owner gives you permission for this date.
              </p>
              {myRequests.some((r) => r.fromDate <= date && r.toDate >= date) ? (
                <p className="font-semibold">Permission requested. Waiting for your owner.</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button className="inline-flex items-center gap-1.5 font-semibold underline" onClick={() => setRequestOpen(true)}>
                  <Send className="h-3.5 w-3.5" /> Ask owner for permission
                </button>
                <button className="underline font-semibold" onClick={() => setDate(today)}>Go to today</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-primary-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-primary-700">{formatDate(date)} total</p>
            <p className="text-xl font-bold text-primary-700 tabular-nums">{formatMoney(dayTotal)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase text-gray-500">Customers collected</p>
            <p className="text-xl font-bold text-gray-800 tabular-nums">
              {doneCount}<span className="text-sm font-medium text-gray-500"> / {customers.length}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="sticky top-14 z-20 -mx-3 px-3 sm:mx-0 sm:px-0 py-2 bg-gray-50 space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or account no."
            className="input-field !pl-9"
            aria-label="Search customers"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            ['all', `All (${customers.length})`],
            ['pending', `Pending (${customers.length - doneCount})`],
            ['done', `Collected (${doneCount})`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                filter === key ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Route sheet */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={7} />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12 px-4 text-gray-500 text-sm space-y-3">
            <p className="font-semibold text-gray-800">No customers are assigned to you yet.</p>
            <p>You can only collect from customers assigned to you. Ask your owner to assign some, or register one yourself.</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary mx-auto">
              <UserPlus className="h-4 w-4" /> Add customer
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No customers match.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((c) => {
              const s = perCustomer.get(c.id);
              const total = totalOf(s);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActive(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {total > 0 ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle className="h-6 w-6 text-gray-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        <span className="font-mono">#{c.accountNo}</span>
                        {(() => {
                          const u = usualOf(c);
                          const sum = u.SAVINGS + u.LOAN + u.INTEREST;
                          return sum > 0 ? <> · usual {formatMoney(sum * (isMonday(date) ? 2 : 1))}</> : null;
                        })()}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {total > 0 ? (
                        <>
                          <p className="font-bold text-gray-900 tabular-nums">{formatMoney(total)}</p>
                          <p className="text-[11px] text-gray-500 flex items-center justify-end gap-1">
                            {s.pending && <CloudOff className="h-3 w-3 text-amber-600" />}
                            {TYPES.filter((t) => s[t] > 0).map((t) => t[0]).join(' · ')}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-primary-600">{canWrite ? 'Collect' : '—'}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {active && (
        <CustomerSheet
          key={active.id}
          customer={active}
          date={date}
          canWrite={canWrite}
          rows={activeData?.rows || []}
          onClose={() => setActive(null)}
          onSave={saveCollection}
          onChangeAmount={changeAmount}
          onRemove={removeEntry}
        />
      )}

      {requestOpen && (
        <RequestAccessModal initialDate={date} onClose={() => setRequestOpen(false)} onSent={loadMyRequests} />
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Register new customer">
        <CustomerForm onSubmit={handleAddCustomer} onCancel={() => setAddOpen(false)} loading={adding} />
      </Modal>
    </div>
  );
}

/** Bottom sheet for one customer: what was collected + add more. */
function CustomerSheet({ customer, date, canWrite, rows, onClose, onSave, onChangeAmount, onRemove }) {
  // Pre-fill with the customer's usual amounts (x2 on Monday), editable.
  // Not when something is already recorded for the day, so a second save can't double-count.
  const [amounts, setAmounts] = useState(() => {
    const empty = { SAVINGS: '', LOAN: '', INTEREST: '' };
    if (rows.length > 0) return empty;
    const factor = isMonday(date) ? 2 : 1;
    const usual = usualOf(customer);
    TYPES.forEach((t) => {
      if (usual[t] > 0) empty[t] = String(Math.round(usual[t] * factor * 100) / 100);
    });
    return empty;
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const factor = isMonday(date) ? 2 : 1;
  const hasAny = TYPES.some((t) => Number(amounts[t]) > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!hasAny) return toast.error('Enter at least one amount');
    setSaving(true);
    const ok = await onSave(customer, amounts);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={`${customer.accountNo} · ${customer.name}`}>
      <p className="text-xs text-gray-500 -mt-1 mb-3">{formatDate(date)}</p>

      {rows.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Already recorded</p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {rows.map((en) => (
              <li key={en.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${TYPE_BADGE[en.type]}`}>{TYPE_LABELS[en.type]}</span>
                {editingId === en.id ? (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="input-field !w-24 !py-1 text-right"
                      aria-label="New amount"
                    />
                    <button
                      className="p-1.5 text-emerald-600"
                      aria-label="Save amount"
                      onClick={async () => {
                        if (!(Number(editValue) > 0)) return toast.error('Enter an amount greater than 0');
                        if (await onChangeAmount(en, Number(editValue))) setEditingId(null);
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-gray-500" aria-label="Cancel" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <b className="tabular-nums">{formatMoney(en.amount)}</b>
                    {en.canEdit ? (
                      <>
                        <button
                          className="p-1.5 text-gray-500 hover:text-primary-600"
                          aria-label="Edit amount"
                          onClick={() => {
                            setEditingId(en.id);
                            setEditValue(String(en.amount));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="p-1.5 text-gray-500 hover:text-red-600" aria-label="Delete entry" onClick={() => onRemove(en)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <Lock className="h-4 w-4 text-gray-300 ml-1" aria-label="Locked" />
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canWrite ? (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs font-semibold uppercase text-gray-500">{rows.length ? 'Add more' : 'Record collection'}</p>
          {TYPES.map((t) => (
            <div key={t}>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor={`amt-${t}`}>
                {TYPE_LABELS[t]} (₹)
              </label>
              <input
                id={`amt-${t}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amounts[t]}
                onChange={(e) => setAmounts((a) => ({ ...a, [t]: e.target.value }))}
                placeholder="0"
                className="input-field text-lg font-bold"
              />
              {usualOf(customer)[t] > 0 ? (
                <button
                  type="button"
                  onClick={() => setAmounts((a) => ({ ...a, [t]: String(usualOf(customer)[t] * factor) }))}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-600"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Use usual {formatMoney(usualOf(customer)[t] * factor)}
                  {factor === 2 ? ' (Monday ×2)' : ''}
                </button>
              ) : null}
            </div>
          ))}
          <button type="submit" disabled={saving || !hasAny} className="btn-primary w-full !py-3 text-base">
            {saving ? 'Saving…' : 'Save collection'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Lock className="h-4 w-4" /> Entries of other days can’t be changed by collectors.
        </p>
      )}
    </Modal>
  );
}
