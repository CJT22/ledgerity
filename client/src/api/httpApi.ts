import {
  AffordabilityResult,
  AppState,
  BackupInfo,
  BalanceCheckpoint,
  DashboardData,
  Expense,
  ExpenseDetailPayload,
  ExpenseSummary,
  InstallmentPlan,
  ISODate,
  LinkedExclusion,
  Money,
  OccurrenceOverride,
  Part,
  Payment,
  PlanCharge,
  Projection,
  ProjectionComparison,
  ProjectionItem,
  ProjectionResult,
  Settings,
  SystemInfo,
} from '@shared/types';
import { ApiClient } from './client';
import { ApiError, SERVER_STATUS_EVENT, ServerStatusDetail } from './errors';

const BASE = '/api/v1';

let lastOnline = true;
function reportStatus(online: boolean) {
  if (online === lastOnline) return;
  lastOnline = online;
  window.dispatchEvent(
    new CustomEvent<ServerStatusDetail>(SERVER_STATUS_EVENT, { detail: { online } })
  );
}

/**
 * JSON body encoder. `undefined` becomes `null` so that clearing a field in a PATCH
 * (e.g. `{ notes: undefined }`) actually clears it on the server instead of being dropped.
 */
const encode = (body: unknown) => JSON.stringify(body, (_k, v) => (v === undefined ? null : v));

const enc = encodeURIComponent;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  responseType: 'json' | 'text' = 'json'
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Accept: responseType === 'json' ? 'application/json' : '*/*',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Ledgerity-Client': '1' } : {}),
      },
      body: body !== undefined ? encode(body) : undefined,
    });
  } catch {
    reportStatus(false);
    throw new ApiError("Can't reach the Ledgerity server. Is it still running?", 0);
  }
  reportStatus(true);

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let issues: ApiError['issues'];
    try {
      const data = await res.json();
      if (data?.error) message = String(data.error);
      issues = data?.issues;
    } catch {
      // non-JSON error body
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      // Vite dev proxy answers like this when the API process is down
      reportStatus(false);
      throw new ApiError("Can't reach the Ledgerity server. Is it still running?", 0);
    }
    throw new ApiError(message, res.status, issues);
  }
  if (res.status === 204) return undefined as T;
  if (responseType === 'text') {
    const text = await res.text();
    return text.replace(/^﻿/, '') as T;
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const del = (path: string) => request<void>('DELETE', path);

/** Talks to the local Node/SQLite server. Mirrors the REST routes in server/src/routes. */
class HttpApiClient implements ApiClient {
  readonly isPersistent = true;

  getDashboard = () => get<DashboardData>('/dashboard');

  getSettings = () => get<Settings>('/settings');
  updateSettings = (p: Partial<Settings>) => patch<Settings>('/settings', p);


  getExpenses = () => get<ExpenseSummary[]>('/expenses');
  getExpense = (id: string) => get<ExpenseDetailPayload>(`/expenses/${enc(id)}`);
  createExpense = (data: Omit<Expense, 'id'>) => post<Expense>('/expenses', data);
  updateExpense = (id: string, p: Partial<Expense>) => patch<Expense>(`/expenses/${enc(id)}`, p);
  deleteExpense = (id: string) => del(`/expenses/${enc(id)}`);

  createPart = (data: Omit<Part, 'id'>) => post<Part>('/parts', data);
  updatePart = (id: string, p: Partial<Part>) => patch<Part>(`/parts/${enc(id)}`, p);
  deletePart = (id: string) => del(`/parts/${enc(id)}`);

  createInstallmentPlan = (data: Omit<InstallmentPlan, 'id' | 'charges'>) =>
    post<InstallmentPlan>('/plans', data);
  updateInstallmentPlan = (id: string, p: Partial<InstallmentPlan>) =>
    patch<InstallmentPlan>(`/plans/${enc(id)}`, stripReadOnly(p));
  deleteInstallmentPlan = (id: string) => del(`/plans/${enc(id)}`);
  addPlanCharge = (planId: string, charge: Omit<PlanCharge, 'id'>) =>
    post<InstallmentPlan>(`/plans/${enc(planId)}/charges`, charge);
  deletePlanCharge = (planId: string, chargeId: string) =>
    request<InstallmentPlan>('DELETE', `/plans/${enc(planId)}/charges/${enc(chargeId)}`);

  logPayment = (data: Omit<Payment, 'id'>) => post<Payment>('/payments', data);
  updatePayment = (id: string, p: Partial<Payment>) => patch<Payment>(`/payments/${enc(id)}`, p);
  deletePayment = (id: string) => del(`/payments/${enc(id)}`);

  getProjections = () => get<ProjectionResult[]>('/projections');
  getProjection = (id: string) => get<Projection>(`/projections/${enc(id)}`);
  runProjection = (id: string) => get<ProjectionResult>(`/projections/${enc(id)}/run`);
  createProjection = (data: Omit<Projection, 'id'>) => post<Projection>('/projections', data);
  updateProjection = (id: string, p: Partial<Projection>) =>
    patch<Projection>(`/projections/${enc(id)}`, stripReadOnly(p));
  deleteProjection = (id: string) => del(`/projections/${enc(id)}`);
  duplicateProjection = (id: string, newName?: string) =>
    post<Projection>(`/projections/${enc(id)}/duplicate`, { name: newName });
  compareProjections = (ids: string[]) =>
    get<ProjectionComparison>(`/projections/compare?ids=${ids.map(enc).join(',')}`);

  checkAffordability = (params: {
    projectionId: string;
    date: ISODate;
    amount: Money;
    label?: string;
  }) => post<AffordabilityResult>('/affordability', params);

  createProjectionItem = (data: Omit<ProjectionItem, 'id'>) =>
    post<ProjectionItem>('/projection-items', data);
  updateProjectionItem = (id: string, p: Partial<ProjectionItem>) =>
    patch<ProjectionItem>(`/projection-items/${enc(id)}`, stripReadOnly(p));
  deleteProjectionItem = (id: string) => del(`/projection-items/${enc(id)}`);

  upsertOverride = (o: OccurrenceOverride) => put<OccurrenceOverride>('/overrides', o);
  deleteOverride = (itemId: string, originalDate: ISODate) =>
    del(`/overrides/${enc(itemId)}/${enc(originalDate)}`);

  toggleExclusion = async (e: LinkedExclusion) =>
    (await post<{ excluded: boolean }>('/exclusions/toggle', e)).excluded;

  createCheckpoint = (data: Omit<BalanceCheckpoint, 'id'>) =>
    post<BalanceCheckpoint>('/checkpoints', data);
  deleteCheckpoint = (id: string) => del(`/checkpoints/${enc(id)}`);

  exportBackup = () => request<string>('GET', '/export/backup.json', undefined, 'text');
  importBackup = (json: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return Promise.reject(new ApiError('That file is not valid JSON.', 400));
    }
    return post<AppState>('/import/backup.json', parsed);
  };
  exportExpensesCsv = () => request<string>('GET', '/export/expenses.csv', undefined, 'text');
  exportProjectionCsv = (id: string) =>
    request<string>('GET', `/export/projections/${enc(id)}/csv`, undefined, 'text');
  resetDemoData = () => post<AppState>('/system/reset-demo');
  clearAllData = () => post<AppState>('/system/clear');

  listBackups = () => get<BackupInfo[]>('/backups');
  createBackup = () => post<BackupInfo>('/backups');
  restoreBackup = (fileName: string) => post<void>(`/backups/${enc(fileName)}/restore`);
  backupDownloadUrl = (fileName: string) => `${BASE}/backups/${enc(fileName)}/download`;
  getSystemInfo = () => get<SystemInfo>('/system/info');
}

/** Pages sometimes pass whole objects as patches; drop fields the server owns. */
function stripReadOnly<T extends object>(p: T): T {
  const { id: _id, ...rest } = p as T & { id?: unknown };
  return rest as T;
}

export const httpApi: ApiClient = new HttpApiClient();
