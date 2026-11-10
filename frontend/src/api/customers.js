import api from './axios.js';

export function getCustomers(params) {
  return api.get('/customers', { params });
}

export function getCustomer(id) {
  return api.get(`/customers/${id}`);
}

export function createCustomer(data) {
  return api.post('/customers', data);
}

export function updateCustomer(id, data) {
  return api.put(`/customers/${id}`, data);
}

export function deleteCustomer(id) {
  return api.delete(`/customers/${id}`);
}

export function getMyCustomers() {
  return api.get('/customers/my');
}
