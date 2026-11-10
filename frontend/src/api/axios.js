import axios from 'axios';

const api = axios.create({
  // Same-origin '/api' by default (Nginx or the Vite proxy forwards it to the backend).
  // Set VITE_API_URL=https://api.your-domain.com/api when the API lives on another origin.
  baseURL: (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, ''),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Only redirect if not already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
