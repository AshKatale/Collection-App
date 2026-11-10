import api from './axios.js';

export function getAccessRequests(params) {
  return api.get('/access', { params });
}

/** Collector: ask the owner for permission to work on other dates. { fromDate, toDate?, reason } */
export function requestAccess(data) {
  return api.post('/access', data);
}

/** Owner / Admin: give a collector access directly. { collectorId, fromDate, toDate?, reason? } */
export function grantAccess(data) {
  return api.post('/access/grant', data);
}

/** Owner / Admin: action = 'approve' | 'reject' | 'revoke' */
export function decideAccess(id, action) {
  return api.put(`/access/${id}`, { action });
}

export function withdrawAccess(id) {
  return api.delete(`/access/${id}`);
}
