import { useState, useEffect } from 'react';
import {
  getCollectors,
  createCollector,
  updateCollector,
  getCollectorCustomers,
  assignCustomers
} from '../api/collectors.js';
import { getCustomers } from '../api/customers.js';
import CollectorForm from '../components/forms/CollectorForm.jsx';
import Modal from '../components/common/Modal.jsx';
import Loading from '../components/common/Loading.jsx';
import { toast } from '../components/common/Toast.jsx';
import { Plus, Users } from 'lucide-react';

export default function Collectors() {
  const [collectors, setCollectors] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit collector modal
  const [collectorModalOpen, setCollectorModalOpen] = useState(false);
  const [editingCollector, setEditingCollector] = useState(null);
  const [savingCollector, setSavingCollector] = useState(false);

  // Assignment modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState(null);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState(new Set());
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [colRes, custRes] = await Promise.all([
        getCollectors(),
        getCustomers(),
      ]);
      setCollectors(colRes.data?.data || colRes.data || []);
      setAllCustomers(custRes.data?.data || custRes.data || []);
    } catch (err) {
      console.error('Failed to load collectors data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenAdd = () => {
    setEditingCollector(null);
    setCollectorModalOpen(true);
  };

  const handleOpenEdit = (c) => {
    setEditingCollector(c);
    setCollectorModalOpen(true);
  };

  const handleSubmitCollector = async (formData) => {
    setSavingCollector(true);
    try {
      if (editingCollector) {
        await updateCollector(editingCollector.id, formData);
      } else {
        await createCollector(formData);
      }
      setCollectorModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving collector:', err);
      toast.error(err.response?.data?.message || 'Failed to save collector');
    } finally {
      setSavingCollector(false);
    }
  };

  const handleOpenAssign = async (collector) => {
    setSelectedCollector(collector);
    try {
      const res = await getCollectorCustomers(collector.id);
      const assigned = res.data?.data || res.data || [];
      const ids = new Set(assigned.map((c) => c.customerId || c.id));
      setAssignedCustomerIds(ids);
      setAssignModalOpen(true);
    } catch (err) {
      console.error('Failed to load collector assignments:', err);
      toast.error('Could not fetch collector assignments');
    }
  };

  const toggleCustomerAssignment = (customerId) => {
    setAssignedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const handleSaveAssignments = async () => {
    if (!selectedCollector) return;
    setSavingAssignment(true);
    try {
      await assignCustomers(selectedCollector.id, Array.from(assignedCustomerIds), true);
      setAssignModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to update assignments:', err);
      toast.error(err.response?.data?.message || 'Failed to save assignments');
    } finally {
      setSavingAssignment(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Collector Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage collectors working under your organization and assign their customer list
          </p>
        </div>
        <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add New Collector
        </button>
      </div>

      {/* Collectors List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {collectors.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            No collectors added yet. Click "Add New Collector" above to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase border-b">
                <tr>
                  <th className="px-4 py-3">Collector Name</th>
                  <th className="px-4 py-3">Email (Login)</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-center">Assigned Customers</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {collectors.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.email}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.phone || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2.5 py-1 text-xs font-bold rounded-full bg-primary-100 text-primary-800">
                        {c._count?.assignments ?? 0} customers
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenAssign(c)}
                        className="text-primary-600 hover:text-primary-800 font-semibold text-xs px-2.5 py-1 rounded bg-primary-50 border border-primary-200"
                      >
                        <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> Assign Customers</span>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="text-gray-600 hover:text-gray-900 font-medium text-xs px-2 py-1 rounded bg-gray-100"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Collector Modal */}
      <Modal
        isOpen={collectorModalOpen}
        onClose={() => setCollectorModalOpen(false)}
        title={editingCollector ? 'Edit Collector' : 'Add New Collector'}
      >
        <CollectorForm
          initialData={editingCollector}
          onSubmit={handleSubmitCollector}
          onCancel={() => setCollectorModalOpen(false)}
          loading={savingCollector}
        />
      </Modal>

      {/* Customer Assignment Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Assign Customers to ${selectedCollector?.name || 'Collector'}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Select the customers that this collector is authorized to collect daily payments from:
          </p>

          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-2 divide-y divide-gray-100">
            {allCustomers.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">
                No customers found. Create customers first.
              </div>
            ) : (
              allCustomers.map((cust) => {
                const isChecked = assignedCustomerIds.has(cust.id);
                return (
                  <label
                    key={cust.id}
                    className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 rounded cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCustomerAssignment(cust.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                    />
                    <div>
                      <span className="font-semibold text-primary-700">
                        {cust.accountNo}
                      </span>
                      <span className="text-gray-700 ml-2">
                        {cust.name}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-xs text-gray-500 font-medium">
              {assignedCustomerIds.size} of {allCustomers.length} customers selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={savingAssignment}
                className="btn-primary text-sm"
              >
                {savingAssignment ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
