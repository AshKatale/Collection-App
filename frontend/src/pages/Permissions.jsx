import { useState, useEffect, useCallback } from 'react';
import { Check, X, Ban, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getAccessRequests, decideAccess, grantAccess, withdrawAccess } from '../api/access.js';
import { getCollectors } from '../api/collectors.js';
import RequestAccessModal from '../components/common/RequestAccessModal.jsx';
import { SkeletonRows } from '../components/common/Loading.jsx';
import { toast, confirmDialog } from '../components/common/Toast.jsx';
import { formatDate, todayISO, addDays, errorMessage } from '../utils/helpers.js';

const STATUS_STYLE = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  REVOKED: 'bg-gray-100 text-gray-600',
};

const range = (r) => (r.fromDate === r.toDate ? formatDate(r.fromDate) : `${formatDate(r.fromDate)} → ${formatDate(r.toDate)}`);

/**
 * Collectors can only add/change today's entries. Anything else needs the owner's OK.
 * Collector view: send + track requests.  Owner/Admin view: approve, reject, grant, revoke.
 */
export default function Permissions() {
  const { user } = useAuth();
  const isCollector = user?.role === 'COLLECTOR';
  const [rows, setRows] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [grant, setGrant] = useState({ collectorId: '', fromDate: addDays(todayISO(), -1), toDate: addDays(todayISO(), -1), reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getAccessRequests();
      setRows(res.data?.data || []);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load permissions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!isCollector) {
      getCollectors()
        .then((res) => setCollectors(res.data?.data || []))
        .catch(() => {});
    }
  }, [load, isCollector]);

  const act = async (id, action, confirmText) => {
    if (confirmText && !(await confirmDialog({ title: confirmText, confirmLabel: 'Yes' }))) return;
    try {
      await decideAccess(id, action);
      toast.success(action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Permission revoked');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed'));
    }
  };

  const withdraw = async (id) => {
    try {
      await withdrawAccess(id);
      toast.success('Request withdrawn');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed'));
    }
  };

  const submitGrant = async (e) => {
    e.preventDefault();
    if (!grant.collectorId) return toast.error('Choose a collector');
    setBusy(true);
    try {
      await grantAccess(grant);
      toast.success('Permission granted');
      setGrant((g) => ({ ...g, reason: '' }));
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to grant'));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((r) => r.status === 'PENDING');
  const active = rows.filter((r) => r.status === 'APPROVED');
  const history = rows.filter((r) => r.status === 'REJECTED' || r.status === 'REVOKED');
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1 uppercase';

  const Badge = ({ status }) => <span className={`px-2 py-0.5 text-xs font-semibold rounded ${STATUS_STYLE[status]}`}>{status}</span>;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div className="page-head">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Date permissions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isCollector
              ? 'You can add or change today’s entries. For any other date your owner must approve first.'
              : 'Collectors can only work on today. Approve their requests, or grant a date yourself.'}
          </p>
        </div>
        {isCollector && (
          <button className="btn-primary" onClick={() => setRequestOpen(true)}>
            <Send className="h-4 w-4" /> Request permission
          </button>
        )}
      </div>

      {!isCollector && (
        <form onSubmit={submitGrant} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-500" /> Grant access directly</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className={lbl} htmlFor="g-col">Collector</label>
              <select id="g-col" className="input-field" value={grant.collectorId} onChange={(e) => setGrant({ ...grant, collectorId: e.target.value })}>
                <option value="">Select…</option>
                {collectors.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="g-from">From</label>
              <input id="g-from" type="date" className="input-field" value={grant.fromDate} onChange={(e) => setGrant({ ...grant, fromDate: e.target.value, toDate: grant.toDate < e.target.value ? e.target.value : grant.toDate })} />
            </div>
            <div>
              <label className={lbl} htmlFor="g-to">To</label>
              <input id="g-to" type="date" className="input-field" min={grant.fromDate} value={grant.toDate} onChange={(e) => setGrant({ ...grant, toDate: e.target.value })} />
            </div>
          </div>
          <input className="input-field" placeholder="Reason (optional)" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} maxLength={300} aria-label="Reason" />
          <button className="btn-primary" disabled={busy}>Grant access</button>
        </form>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4"><SkeletonRows rows={4} /></div>
      ) : (
        <>
          <Section title={`Pending requests (${pending.length})`} empty="No pending requests." items={pending}>
            {(r) => (
              <Row key={r.id} r={r} isCollector={isCollector}>
                {isCollector ? (
                  <button className="btn-secondary !py-1 text-xs" onClick={() => withdraw(r.id)}>Withdraw</button>
                ) : (
                  <>
                    <button className="btn-primary !py-1 text-xs" onClick={() => act(r.id, 'approve')}><Check className="h-3.5 w-3.5" /> Approve</button>
                    <button className="btn-secondary !py-1 text-xs" onClick={() => act(r.id, 'reject')}><X className="h-3.5 w-3.5" /> Reject</button>
                  </>
                )}
              </Row>
            )}
          </Section>

          <Section title={`Active permissions (${active.length})`} empty="Nothing active." items={active}>
            {(r) => (
              <Row key={r.id} r={r} isCollector={isCollector}>
                <Badge status={r.status} />
                {!isCollector && (
                  <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => act(r.id, 'revoke', 'Revoke this permission?')}>
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </button>
                )}
              </Row>
            )}
          </Section>

          {history.length > 0 && (
            <Section title="History" items={history}>
              {(r) => (
                <Row key={r.id} r={r} isCollector={isCollector}>
                  <Badge status={r.status} />
                </Row>
              )}
            </Section>
          )}
        </>
      )}

      {requestOpen && (
        <RequestAccessModal initialDate={addDays(todayISO(), -1)} onClose={() => setRequestOpen(false)} onSent={load} />
      )}
    </div>
  );
}

function Section({ title, items, empty, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <h2 className="font-semibold text-gray-900 px-4 sm:px-5 py-3 border-b border-gray-200">{title}</h2>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">{items.map((r) => children(r))}</ul>
      )}
    </div>
  );
}

function Row({ r, isCollector, children }) {
  return (
    <li className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">
          {!isCollector && <span className="mr-2">{r.collectorName}</span>}
          <span className="text-gray-600">{range(r)}</span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {r.reason || '—'}
          {r.decidedByName && <> · by {r.decidedByName}</>}
        </p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  );
}
