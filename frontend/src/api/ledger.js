import api from './axios.js';

/* Customer ledger (Admin / Owner). Every change replies with the refreshed ledger for `fy`. */
export const getLedgerCustomers = () => api.get('/ledger/customers');
export const getLedger = (customerId, fy) => api.get(`/ledger/${customerId}`, { params: fy ? { fy } : {} });

const params = (fy) => ({ params: fy ? { fy } : {} });

/** type: 'loans' | 'deposits' */
export const addLedgerRecord = (customerId, type, data, fy) => api.post(`/ledger/${customerId}/${type}`, data, params(fy));
export const updateLedgerRecord = (customerId, type, id, data, fy) => api.put(`/ledger/${customerId}/${type}/${id}`, data, params(fy));
export const cancelLedgerRecord = (customerId, type, id, fy) => api.delete(`/ledger/${customerId}/${type}/${id}`, params(fy));

export const addLedgerRate = (customerId, data, fy) => api.post(`/ledger/${customerId}/terms`, data, params(fy));
export const deleteLedgerRate = (customerId, id, fy) => api.delete(`/ledger/${customerId}/terms/${id}`, params(fy));
export const setLedgerInterest = (customerId, data, fy) => api.put(`/ledger/${customerId}/overrides`, data, params(fy));

export const saveLedgerOpening = (customerId, data, fy) => api.put(`/ledger/${customerId}/opening`, data, params(fy));
export const deleteLedgerOpening = (customerId, fy) => api.delete(`/ledger/${customerId}/opening`, params(fy));

export const previewSettlement = (customerId, date) => api.get(`/ledger/${customerId}/settlement-preview`, { params: { date } });
export const createSettlement = (customerId, data, fy) => api.post(`/ledger/${customerId}/settlements`, data, params(fy));
export const cancelSettlement = (customerId, id, fy) => api.delete(`/ledger/${customerId}/settlements/${id}`, params(fy));
