import api from './axios.js';

export function login(email, password) {
  return api.post('/auth/login', { email, password });
}

export function register(data) {
  return api.post('/auth/register', data);
}

export function getMe() {
  return api.get('/auth/me');
}

export function changePassword(data) {
  return api.put('/auth/change-password', data);
}
