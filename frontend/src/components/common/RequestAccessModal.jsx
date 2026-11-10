import { useState } from 'react';
import Modal from './Modal.jsx';
import { toast } from './Toast.jsx';
import { requestAccess } from '../../api/access.js';
import { errorMessage } from '../../utils/helpers.js';

/** Collector asks the owner for permission to add/change entries of another date (or date range). */
export default function RequestAccessModal({ initialDate, onClose, onSent }) {
  const [fromDate, setFromDate] = useState(initialDate);
  const [toDate, setToDate] = useState(initialDate);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return toast.error('Please give a reason for your owner');
    setBusy(true);
    try {
      await requestAccess({ fromDate, toDate, reason: reason.trim() });
      toast.success('Request sent to your owner');
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send the request'));
    } finally {
      setBusy(false);
    }
  };

  const lbl = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <Modal isOpen onClose={onClose} title="Ask owner for permission">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-500">
          You can only add or change today’s entries. Your owner has to approve any other date before you can work on it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl} htmlFor="ra-from">From date</label>
            <input
              id="ra-from"
              type="date"
              className="input-field"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (toDate < e.target.value) setToDate(e.target.value);
              }}
              required
            />
          </div>
          <div>
            <label className={lbl} htmlFor="ra-to">To date</label>
            <input id="ra-to" type="date" className="input-field" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className={lbl} htmlFor="ra-reason">Reason</label>
          <textarea
            id="ra-reason"
            rows={3}
            className="input-field"
            placeholder="e.g. Forgot to enter Sunday’s collection"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
          />
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  );
}
