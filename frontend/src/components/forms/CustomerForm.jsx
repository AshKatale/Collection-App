import { useState, useEffect } from 'react';
import { toast } from '../common/Toast.jsx';

export default function CustomerForm({
  initialData = null,
  collectors = [],
  onSubmit,
  onCancel,
  loading = false,
}) {
  const [formData, setFormData] = useState({
    accountNo: '',
    name: '',
    phone: '',
    address: '',
    defaultDailyAmount: '',
    collectorId: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        accountNo: initialData.accountNo || '',
        name: initialData.name || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        defaultDailyAmount: initialData.defaultDailyAmount ?? '',
        collectorId: initialData.assignments?.[0]?.collectorId || '',
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.accountNo.trim() || !formData.name.trim()) {
      toast.error('Account number and name are required');
      return;
    }
    const amount = formData.defaultDailyAmount === '' ? null : Number(formData.defaultDailyAmount);
    if (amount !== null && !(amount > 0)) {
      toast.error('Usual daily amount must be greater than 0');
      return;
    }
    onSubmit({ ...formData, defaultDailyAmount: amount });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Account Number / Serial No *
        </label>
        <input
          type="text"
          name="accountNo"
          value={formData.accountNo}
          onChange={handleChange}
          placeholder="e.g. 686 or ACC-001"
          className="input-field"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Customer Full Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g. Ramesh Patil"
          className="input-field"
          required
        />
      </div>

      {collectors.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assign to Collector
          </label>
          <select
            name="collectorId"
            value={formData.collectorId}
            onChange={handleChange}
            className="input-field"
          >
            <option value="">-- Not assigned --</option>
            {collectors.filter((c) => c.isActive).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Usual daily amount (₹)
        </label>
        <input
          type="number"
          inputMode="decimal"
          name="defaultDailyAmount"
          value={formData.defaultDailyAmount}
          onChange={handleChange}
          min="0"
          step="any"
          placeholder="e.g. 2000 (one-tap in the Collect screen)"
          className="input-field"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phone Number
        </label>
        <input
          type="tel"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          placeholder="e.g. 9876543210"
          className="input-field"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address / Location
        </label>
        <textarea
          name="address"
          value={formData.address}
          onChange={handleChange}
          rows="2"
          placeholder="e.g. Shop #12, Market yard"
          className="input-field"
        />
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : initialData ? 'Update Customer' : 'Add Customer'}
        </button>
      </div>
    </form>
  );
}
