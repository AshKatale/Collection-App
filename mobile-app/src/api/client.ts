import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { DEFAULT_API_URL, REQUEST_TIMEOUT_MS } from '@/lib/config';

const http = axios.create({
  baseURL: DEFAULT_API_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setApiBaseUrl = (url: string) => {
  http.defaults.baseURL = url.trim().replace(/\/+$/, '');
};
export const getApiBaseUrl = () => String(http.defaults.baseURL || '');
export const setAuthToken = (t: string | null) => {
  token = t;
};
export const getAuthToken = () => token;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

http.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = error.config as (AxiosRequestConfig & { __retried?: boolean }) | undefined;
    // Safe reads are retried once on timeout / network error (the first try wakes a sleeping database)
    if (cfg && !error.response && (cfg.method || 'get').toLowerCase() === 'get' && !cfg.__retried) {
      cfg.__retried = true;
      return http(cfg);
    }
    const isLogin = String(cfg?.url || '').includes('/auth/login');
    if (error.response?.status === 401 && !isLogin) onUnauthorized?.();
    return Promise.reject(error);
  }
);

/** Unwraps the `{ success, data }` envelope used by the backend. */
export async function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  const res = await http.get(url, { params });
  return (res.data?.data ?? res.data) as T;
}
export async function getRaw<T = any>(url: string, params?: Record<string, any>) {
  const res = await http.get(url, { params });
  return res.data as T;
}
export async function post<T = any>(url: string, body?: any, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.post(url, body, config);
  return (res.data?.data ?? res.data) as T;
}
export async function put<T = any>(url: string, body?: any): Promise<T> {
  const res = await http.put(url, body);
  return (res.data?.data ?? res.data) as T;
}
export async function del<T = any>(url: string): Promise<T> {
  const res = await http.delete(url);
  return (res.data?.data ?? res.data) as T;
}
export { http };
