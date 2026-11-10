import { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../api/customers.js';
import { getCollectors } from '../api/collectors.js';
import CustomerForm from '../components/forms/CustomerForm.jsx';
import Modal from '../components/common/Modal.jsx';
import Loading from '../components/common/Loading.jsx';
import { Plus } from 'lucide-react';
import { formatMoney } from '../utils/helpers.js';
import { toast, confirmDialog } from '../components/common/Toast.jsx';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [custRes, colRes] = await Promise.all([
        getCustomers(),
        getCollectors().catch(() => ({ data: [] })),
      ]);
      const list = custRes.data?.data || custRes.data || [];
      const colList = colRes.data?.data || colRes.data || [];
      setCustomers(list);
      setCollectors(colList);
    } catch (err) {
      console.error('Failed to load customers data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, formData);
      } else {
        await createCustomer(formData);
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving customer:', err);
      toast.error(err.response?.data?.message || 'Error saving customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!(await confirmDialog(`Are you sure you want to delete customer "${name}"?`))) return;
    try {
      await deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      loadData();
    } catch (err) {
      console.error('Error deleting customer:', err);
      toast.error(err.response?.data?.message || 'Failed to delete customer');
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.accountNo.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  );

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Customer Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account holders and customers ({customers.length} total)
          </p>
        </div>
        <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Customer
        </button>
      </div>

      {/* Filter and Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex justify-between items-center">
          <input
            type="text"
            placeholder="Search by account no, name, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field max-w-sm"
          />
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            No customers found matching "{search}".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase border-b">
                <tr>
                  <th className="px-4 py-3">Account No</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3 text-right">Usual daily</th>
                  <th className="px-4 py-3">Collector</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-primary-700">
                      {c.accountNo}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {(() => {
                        const s = Number(c.defaultSavings ?? c.defaultDailyAmount) || 0;
                        const l = Number(c.defaultLoan) || 0;
                        const i = Number(c.defaultInterest) || 0;
                        return s + l + i > 0 ? (
                          <span title={`Savings ${s} · Loan ${l} · Interest ${i}`}>{formatMoney(s + l + i)}</span>
                        ) : (
                          '-'
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {collectors.find((col) => col.id === c.assignments?.[0]?.collectorId)?.name || (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.address || '-'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="text-primary-600 hover:text-primary-800 font-medium text-xs px-2 py-1 rounded bg-primary-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1 rounded bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}
      >
        <CustomerForm
          initialData={editingCustomer}
          collectors={collectors}
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
          loading={saving}
        />
      </Modal>
    </div>
  );
}
