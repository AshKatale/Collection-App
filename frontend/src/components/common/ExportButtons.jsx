import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { downloadReport } from '../../utils/download.js';
import { toast } from './Toast.jsx';
import { errorMessage } from '../../utils/helpers.js';

/**
 * Excel + PDF download buttons. `params` are the report query params
 * (e.g. { report: 'monthly', month: 11, year: 2026 }). Files are built by the
 * server in the same ledger layout as the on-screen report.
 */
export default function ExportButtons({ params, disabled = false }) {
  const [busy, setBusy] = useState(null);

  const run = async (format) => {
    setBusy(format);
    try {
      await downloadReport(params, format);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 no-print">
      <button onClick={() => run('xlsx')} disabled={disabled || busy !== null} className="btn-secondary text-sm">
        {busy === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Excel
      </button>
      <button onClick={() => run('pdf')} disabled={disabled || busy !== null} className="btn-primary text-sm">
        {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        PDF
      </button>
    </div>
  );
}
