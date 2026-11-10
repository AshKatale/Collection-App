import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, FilterX } from 'lucide-react';
import { getEntries, createEntry, updateEntry, deleteEntry } from '../api/entries.js';
import { getCustomers } from '../api/customers.js';
import { getCollectors } from '../api/collectors.js';
import EntryForm from '../components/forms/EntryForm.jsx';
import Modal from '../components/common/Modal.jsx';
import { SkeletonRows } from '../components/common/Loading.jsx';
import { toast, confirmDialog } from '../components/common/Toast.jsx';
import { formatMoney, formatDate, TYPE_LABELS, TYPE_BADGE, errorMessage } from '../utils/helpers.js';

const PAGE_SIZE = 50;
const emptyFilters = { from: '', to: '', collectorId: '', customerId: '', type: '' };

export default function Entries() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);

  const [editingEntry, setEditingEntry] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getCustomers(), getCollectors()])
      .then(([c, col]) => {
        setCustomers(c.data?.data || []);
        setCollectors(col.data?.data || []);
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load filters')));
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
      const res = await getEntries(params);
      setEntries(res.data?.data || []);
      setTotal(res.data?.total || 0);
      setTotalAmount(res.data?.totalAmount || 0);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load entries'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const openCreate = () => {
    setEditingEntry(null);
    setFormOpen(true);
  };
  const openEdit = (entry) => {
    setEditingEntry(entry);
    setFormOpen(true);
  };

  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, formData);
        toast.success('Entry updated');
      } else {
        await createEntry(formData);
        toast.success('Entry added');
      }
      setFormOpen(false);
      loadEntries();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save entry'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    const ok = await confirmDialog({
      title: 'Delete this entry?',
      message: `${entry.customer?.name} · ${TYPE_LABELS[entry.type]} ${formatMoney(entry.amount)} on ${formatDate(entry.date)}. The change stays in the audit history.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteEntry(entry.id);
      toast.success('Entry deleted');
      loadEntries();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete entry'));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1 uppercase';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">All Collection Entries</h1>
          <p className="text-sm text-gray-500 mt-1">View, correct or add collections. Every change is logged.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-primary-50 border border-primary-200 px-4 py-2 rounded-lg text-right">
            <div className="text-xs text-primary-700 font-semibold uppercase">Total ({total} entries)</div>
            <div className="text-lg font-bold text-primary-900 tabular-nums">{formatMoney(totalAmount)}</div>
          </div>
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add entry
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className={lbl} htmlFor="f-from">From</label>
            <input id="f-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="input-field text-sm" />
          </div>
          <div>
            <label className={lbl} htmlFor="f-to">To</label>
            <input id="f-to" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="input-field text-sm" />
          </div>
          <div>
            <label className={lbl} htmlFor="f-col">Collector</label>
            <select id="f-col" value={filters.collectorId} onChange={(e) => setFilter('collectorId', e.target.value)} className="input-field text-sm">
              <option value="">All</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl} htmlFor="f-cust">Customer</label>
            <select id="f-cust" value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)} className="input-field text-sm">
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.accountNo} · {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl} htmlFor="f-type">Type</label>
            <select id="f-type" value={filters.type} onChange={(e) => setFilter('type', e.target.value)} className="input-field text-sm">
              <option value="">All</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters && (
          <button className="mt-3 text-sm text-primary-600 font-semibold inline-flex items-center gap-1" onClick={() => { setFilters(emptyFilters); setPage(1); }}>
            <FilterX className="h-4 w-4" /> Clear filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-14 text-gray-400">No entries match these filters.</div>
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="sm:hidden divide-y divide-gray-100">
              {entries.map((e) => (
                <li key={e.id} className="p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        <span className="text-gray-400 font-mono mr-1.5">{e.customer?.accountNo}</span>{e.customer?.name}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(e.date)} · {e.collector?.name}</p>
                    </div>
                    <p className="font-bold text-gray-900 tabular-nums">{formatMoney(e.amount)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${TYPE_BADGE[e.type]}`}>{TYPE_LABELS[e.type]}</span>
                    <span className="flex gap-1">
                      <button className="btn-secondary !py-1 !px-2.5 text-xs" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button className="btn-secondary !py-1 !px-2.5 text-xs text-red-600" onClick={() => handleDelete(e)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                    </span>
                  </div>
                  {e.notes && <p className="text-xs text-gray-500">{e.notes}</p>}
                </li>
              ))}
            </ul>

            {/* Larger screens: table */}
            <div className="hidden sm:block overflow-auto max-h-[70vh]">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Collector</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-600 font-medium whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">
                        <span className="text-gray-400 font-mono mr-1.5">{e.customer?.accountNo}</span>{e.customer?.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{e.collector?.name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${TYPE_BADGE[e.type]}`}>{TYPE_LABELS[e.type]}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{formatMoney(e.amount)}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[200px] truncate">{e.notes || '-'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(e)} className="p-1.5 text-gray-500 hover:text-primary-600" aria-label="Edit entry"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(e)} className="p-1.5 text-gray-500 hover:text-red-600" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
                <span className="text-gray-500">Page {page} of {pages}</span>
                <span className="flex gap-2">
                  <button className="btn-secondary !py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Prev</button>
                  <button className="btn-secondary !py-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" /></button>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingEntry ? 'Edit collection entry' : 'Add collection entry'}>
        <EntryForm
          initialData={editingEntry}
          customers={customers}
          collectors={collectors}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
          loading={saving}
        />
      </Modal>
    </div>
  );
}
