/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

/**
 * Tiny global toast + confirm-dialog system (no provider needed):
 *   toast.success('Saved'), toast.error('Failed'), toast.info('...')
 *   if (!(await confirmDialog({ title, message, confirmLabel, danger }))) return;
 * Render <Toaster /> once at the app root.
 */

const toastListeners = new Set();
const confirmListeners = new Set();
let nextId = 1;

const emitToast = (type, message) => {
  const item = { id: nextId++, type, message: String(message) };
  toastListeners.forEach((fn) => fn(item));
};

export const toast = {
  success: (m) => emitToast('success', m),
  error: (m) => emitToast('error', m),
  info: (m) => emitToast('info', m),
};

/** Promise-based replacement for window.confirm(). Accepts a string or an options object. */
export function confirmDialog(options) {
  const opts = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    confirmListeners.forEach((fn) => fn({ ...opts, resolve }));
  });
}

const STYLES = {
  success: { icon: CheckCircle2, cls: 'bg-emerald-600 text-white' },
  error: { icon: AlertCircle, cls: 'bg-red-600 text-white' },
  info: { icon: Info, cls: 'bg-slate-700 text-white' },
};

export function Toaster() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    const onToast = (item) => {
      setToasts((t) => [...t.slice(-3), item]);
      setTimeout(() => dismiss(item.id), item.type === 'error' ? 6000 : 3500);
    };
    const onConfirm = (d) => setDialog(d);
    toastListeners.add(onToast);
    confirmListeners.add(onConfirm);
    return () => {
      toastListeners.delete(onToast);
      confirmListeners.delete(onConfirm);
    };
  }, [dismiss]);

  const answer = (value) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        dialog.resolve(false);
        setDialog(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  return (
    <>
      <div
        className="fixed z-[100] bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm space-y-2 pointer-events-none sm:left-auto sm:right-4 sm:translate-x-0 sm:bottom-4"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = STYLES[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${cls}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0 mt-px" />
              <span className="flex-1 break-words">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-80 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => answer(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900">{dialog.title || 'Are you sure?'}</h3>
            {dialog.message && <p className="mt-2 text-sm text-gray-600">{dialog.message}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => answer(false)}>
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button
                autoFocus
                className={dialog.danger === false ? 'btn-primary' : 'btn-danger'}
                onClick={() => answer(true)}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
