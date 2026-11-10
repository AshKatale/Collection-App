import { useState, useEffect } from 'react';
import { todayISO } from '../../utils/helpers.js';
import { toast } from '../common/Toast.jsx';

export default function EntryForm({ initialData = null, customers = [], collectors = [], onSubmit, onCancel, loading = false }) {
  const [formData, setFormData] = useState({
    date: todayISO(),
    customerId: '',
    collectorId: '',
    type: 'SAVINGS',
    amount: '',
    notes: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        date: initialData.date ? initialData.date.slice(0, 10) : todayISO(),
        customerId: initialData.customerId || '',
        collectorId: initialData.collectorId || '',
        type: initialData.type || 'SAVINGS',
        amount: initialData.amount ?? '',
        notes: initialData.notes || '',
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.customerId || !(Number(formData.amount) > 0)) {
      toast.error('Select a customer and enter an amount greater than 0');
      return;
    }
    const { collectorId, ...rest } = formData;
    onSubmit({
      ...rest,
      ...(collectorId ? { collectorId } : {}),
      amount: Number(formData.amount),
    });
  };

  const label = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={label} htmlFor="ef-date">Date</label>
        <input id="ef-date" type="date" name="date" value={formData.date} onChange={handleChange} className="input-field" required />
      </div>

      <div>
        <label className={label} htmlFor="ef-customer">Customer</label>
        <select id="ef-customer" name="customerId" value={formData.customerId} onChange={handleChange} className="input-field" required>
          <option value="">-- Select customer --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.accountNo} · {c.name}</option>
          ))}
        </select>
      </div>

      {collectors.length > 0 && (
        <div>
          <label className={label} htmlFor="ef-collector">Collector</label>
          <select id="ef-collector" name="collectorId" value={formData.collectorId} onChange={handleChange} className="input-field">
            <option value="">(unchanged / me)</option>
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="ef-type">Type</label>
          <select id="ef-type" name="type" value={formData.type} onChange={handleChange} className="input-field" required>
            <option value="SAVINGS">Savings</option>
            <option value="LOAN">Loan repayment</option>
            <option value="INTEREST">Interest</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="ef-amount">Amount (₹)</label>
          <input
            id="ef-amount"
            type="number"
            inputMode="decimal"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            placeholder="e.g. 500"
            min="0.01"
            step="any"
            className="input-field"
            required
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="ef-notes">Notes (optional)</label>
        <input id="ef-notes" type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes" className="input-field" maxLength={300} />
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>Cancel</button>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving…' : initialData ? 'Update entry' : 'Create entry'}
        </button>
      </div>
    </form>
  );
}
