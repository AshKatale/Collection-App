import { get, post, put, del, getRaw } from './client';
import { SYNC_TIMEOUT_MS } from '@/lib/config';

export type Role = 'ADMIN' | 'OWNER' | 'COLLECTOR';
export type EntryType = 'SAVINGS' | 'LOAN' | 'INTEREST';

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  ownerId: string | null;
  isActive?: boolean;
};

export type ServerCustomer = {
  id: string;
  accountNo: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  defaultSavings?: number | null;
  defaultLoan?: number | null;
  defaultInterest?: number | null;
  defaultDailyAmount?: number | null;
  ownerId: string;
  isActive: boolean;
  assignments?: { collectorId: string }[];
};

export type ServerEntry = {
  id: string;
  clientId: string | null;
  date: string;
  collectorId: string;
  customerId: string;
  type: EntryType;
  amount: number;
  notes: string | null;
  ownerId: string;
  customer?: { id: string; name: string; accountNo: string };
  collector?: { id: string; name?: string };
};

export type SyncOp =
  | { opId: string; kind: 'ENTRY_CREATE'; date: string; customerId: string; items: { type: EntryType; amount: number; clientId: string; notes?: string | null }[] }
  | { opId: string; kind: 'ENTRY_UPDATE'; entryId?: string; clientId?: string; changes: { amount?: number; type?: EntryType; notes?: string | null } }
  | { opId: string; kind: 'ENTRY_DELETE'; entryId?: string; clientId?: string };

export type SyncResult = {
  opId: string;
  status: 'OK' | 'DUPLICATE' | 'REJECTED' | 'RETRY';
  code?: string;
  message?: string;
  entries?: ServerEntry[];
  entry?: ServerEntry;
};

export type PullData = {
  serverTime: string;
  today: string;
  timezone: string;
  window: { from: string; to: string };
  /** true: `entries` is the complete list for the window. false: only entries changed since `since`. (older servers omit it = full) */
  full?: boolean;
  /** Fingerprint of the customer list + assignments; send it back with `since` on the next pull. */
  sig?: string;
  /** Entries deleted on the server since `since` (incremental pulls only). */
  deletedIds?: string[];
  customers: ServerCustomer[];
  entries: ServerEntry[];
  grants: { from: string; to: string }[];
  requests: { id: string; fromDate: string; toDate: string; reason: string | null }[];
};

/* auth */
export const loginApi = (email: string, password: string) =>
  post<{ token: string; user: User }>('/auth/login', { email, password, client: 'mobile' });
export const refreshApi = () => post<{ token: string; user: User }>('/auth/refresh');
export const meApi = () => get<User>('/auth/me');
export const changePasswordApi = (currentPassword: string, newPassword: string) =>
  put('/auth/change-password', { currentPassword, newPassword });

/* sync (mobile only) */
// Sync requests get a longer timeout than normal calls: a batch can touch the database many times
export const pushApi = (ops: SyncOp[]) => post<{ results: SyncResult[]; today: string }>('/sync/push', { ops }, { timeout: SYNC_TIMEOUT_MS });
export const pullApi = (days: number, since?: string, sig?: string) =>
  get<PullData>('/sync/pull', { days, ...(since && sig ? { since, sig } : {}) }, { timeout: SYNC_TIMEOUT_MS });

/* customers */
export const getCustomers = () => get<ServerCustomer[]>('/customers');
export const createCustomerApi = (data: Record<string, any>) => post<ServerCustomer>('/customers', data);
export const updateCustomerApi = (id: string, data: Record<string, any>) => put<ServerCustomer>(`/customers/${id}`, data);
export const deleteCustomerApi = (id: string) => del(`/customers/${id}`);

/* collectors */
export const getCollectors = () => get<any[]>('/collectors');
export const createCollectorApi = (data: Record<string, any>) => post('/collectors', data);
export const updateCollectorApi = (id: string, data: Record<string, any>) => put(`/collectors/${id}`, data);

/* entries (online screens) */
export const getEntriesApi = (params: Record<string, any>) => getRaw<any>('/entries', params);
export const getEntrySummary = (params?: Record<string, any>) => get<any>('/entries/summary', params);
export const createEntryApi = (data: Record<string, any>) => post('/entries', data);
export const updateEntryApi = (id: string, data: Record<string, any>) => put(`/entries/${id}`, data);
export const deleteEntryApi = (id: string) => del(`/entries/${id}`);
export const getEntryHistory = (id: string) => get<any[]>(`/entries/${id}/history`);

export const getCollectorCustomers = (id: string) => get<any[]>(`/collectors/${id}/customers`);
export const assignCustomersApi = (id: string, customerIds: string[], replace = true) => post(`/collectors/${id}/assign`, { customerIds, replace });

/* access / permissions */
export const getAccess = (params?: Record<string, any>) => get<any[]>('/access', params);
export const requestAccessApi = (data: Record<string, any>) => post('/access', data);
export const grantAccessApi = (data: Record<string, any>) => post('/access/grant', data);
export const decideAccessApi = (id: string, action: 'approve' | 'reject' | 'revoke') => put(`/access/${id}`, { action });
export const withdrawAccessApi = (id: string) => del(`/access/${id}`);

/* admin */
export const getUsers = (params?: Record<string, any>) => get<any[]>('/admin/users', params);
export const updateUserApi = (id: string, data: Record<string, any>) => put(`/admin/users/${id}`, data);
export const deleteUserApi = (id: string) => del(`/admin/users/${id}`);
export const registerApi = (data: Record<string, any>) => post('/auth/register', data);
export const getAdminDashboard = () => get<any>('/admin/dashboard');

/* reports */
export const getDailyReport = (p: Record<string, any>) => get<any>('/reports/daily', p);
export const getMonthlyReport = (p: Record<string, any>) => get<any>('/reports/monthly', p);
export const getYearlyReport = (p: Record<string, any>) => get<any>('/reports/yearly', p);
export const getCustomerReport = (p: Record<string, any>) => get<any>('/reports/customer', p);
