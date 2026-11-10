import api from '../api/axios.js';

/** Pull "file.xlsx" out of a Content-Disposition header. */
function filenameFrom(res, fallback) {
  const header = res.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : fallback;
}

/**
 * Download a server-generated report (xlsx | pdf).
 * Reports are built on the server so Excel/PDF always match what the API reports
 * (Marathi names, Indian number format, etc.).
 */
export async function downloadReport(params, format) {
  const res = await api.get('/reports/export', {
    params: { ...params, format },
    responseType: 'blob',
  });

  const blob = res.data;
  // An error comes back as JSON inside a blob – surface its message
  if (blob.type && blob.type.includes('application/json')) {
    const body = JSON.parse(await blob.text());
    throw new Error(body.message || 'Export failed');
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFrom(res, `report.${format}`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
