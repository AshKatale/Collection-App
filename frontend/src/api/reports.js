import api from './axios.js';

export function getDailyReport(params) {
  return api.get('/reports/daily', { params });
}

export function getMonthlyReport(params) {
  return api.get('/reports/monthly', { params });
}

export function getYearlyReport(params) {
  return api.get('/reports/yearly', { params });
}

export function getCustomerReport(params) {
  return api.get('/reports/customer', { params });
}

export function getDashboardStats() {
  return api.get('/admin/dashboard');
}
