import api from './axios.js';

export function getEntries(params) {
  return api.get('/entries', { params });
}

export function getEntrySummary(params) {
  return api.get('/entries/summary', { params });
}

export function getEntry(id) {
  return api.get(`/entries/${id}`);
}

export function getEntryHistory(id) {
  return api.get(`/entries/${id}/history`);
}

export function createEntry(data) {
  return api.post('/entries', data);
}

/** One customer, several types, saved atomically. data: { date, customerId, items: [{type, amount, clientId}] } */
export function createEntriesBatch(data) {
  return api.post('/entries/batch', data);
}

export function updateEntry(id, data) {
  return api.put(`/entries/${id}`, data);
}

export function deleteEntry(id) {
  return api.delete(`/entries/${id}`);
}
