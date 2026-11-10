import { useState, useEffect } from 'react';
import api from '../../api/axios.js';

export default function Settings() {
  const [stats, setStats] = useState(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState({ text: '', type: '' });
  const [passLoading, setPassLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get('/admin/dashboard');
      setStats(res.data?.data || null);
    } catch (err) {
      console.error('Failed to load settings stats:', err);
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPassMsg({ text: '', type: '' });

    if (newPassword !== confirmPassword) {
      setPassMsg({ text: 'New passwords do not match', type: 'error' });
      return;
    }
    if (newPassword.length < 6) {
      setPassMsg({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }

    setPassLoading(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPassMsg({ text: 'Password changed successfully', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassMsg({
        text: err.response?.data?.message || 'Failed to change password',
        type: 'error',
      });
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Application & Account Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          System diagnostics, database status, and account security
        </p>
      </div>

      {/* System Diagnostics */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-gray-900">
          System Overview
        </h2>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-2xl font-bold text-primary-700">{stats.totalUsers}</div>
              <div className="text-xs text-gray-500 uppercase mt-1">Total Users</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-2xl font-bold text-blue-700">{stats.totalOwners}</div>
              <div className="text-xs text-gray-500 uppercase mt-1">Owners</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-2xl font-bold text-emerald-700">{stats.totalCollectors}</div>
              <div className="text-xs text-gray-500 uppercase mt-1">Collectors</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-2xl font-bold text-amber-700">{stats.totalCustomers}</div>
              <div className="text-xs text-gray-500 uppercase mt-1">Customers</div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-400 pt-2 border-t flex flex-col sm:flex-row justify-between gap-2">
          <span>Backend: Node.js Express • PostgreSQL Neon</span>
          <span>Financial Year Cycle: April 1 to March 31</span>
        </div>
      </div>

      {/* Security: Change Password */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-gray-900">
          Change Account Password
        </h2>

        {passMsg.text && (
          <div
            className={`p-3 rounded-lg text-sm ${
              passMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {passMsg.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={passLoading}
            className="btn-primary text-sm"
          >
            {passLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
