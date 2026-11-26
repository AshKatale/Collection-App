import api from '../api/axios.js';

/** Pull "file.xlsx" out of a Content-Disposition header. */
function filenameFrom(res, fallback) {
  const header = res.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : fallback;
}

/**
 * Download a server-generated file. Files are built on the server so Excel/PDF always match
 * what the API reports (Marathi names, Indian number format, etc.).
 */
export async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });

  const blob = res.data;
  // An error comes back as JSON inside a blob – surface its message
  if (blob.type && blob.type.includes('application/json')) {
    const body = JSON.parse(await blob.text());
    throw new Error(body.message || 'Export failed');
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filenameFrom(res, fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
}

/** Download a report (xlsx | pdf). */
export function downloadReport(params, format) {
  return downloadFile('/reports/export', { ...params, format }, `report.${format}`);
}
