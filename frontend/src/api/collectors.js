import api from './axios.js';

export function getCollectors(params) {
  return api.get('/collectors', { params });
}

export function getCollector(id) {
  return api.get(`/collectors/${id}`);
}

export function createCollector(data) {
  return api.post('/collectors', data);
}

export function updateCollector(id, data) {
  return api.put(`/collectors/${id}`, data);
}

export function deleteCollector(id) {
  return api.delete(`/collectors/${id}`);
}

export function assignCustomers(collectorId, customerIds) {
  return api.post(`/collectors/${collectorId}/assign`, { customerIds });
}

export function unassignCustomer(collectorId, customerId) {
  return api.post(`/collectors/${collectorId}/unassign`, { customerIds: [customerId] });
}

export function getCollectorCustomers(collectorId) {
  return api.get(`/collectors/${collectorId}/customers`);
}
