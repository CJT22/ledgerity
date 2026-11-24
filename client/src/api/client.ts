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

export interface ApiClient {
  getDashboard(): Promise<DashboardData>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;


  getExpenses(): Promise<ExpenseSummary[]>;
  getExpense(id: string): Promise<ExpenseDetailPayload>;
  createExpense(data: Omit<Expense, 'id'>): Promise<Expense>;
  updateExpense(id: string, patch: Partial<Expense>): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  createPart(data: Omit<Part, 'id'>): Promise<Part>;
  updatePart(id: string, patch: Partial<Part>): Promise<Part>;
  deletePart(id: string): Promise<void>;

  createInstallmentPlan(data: Omit<InstallmentPlan, 'id' | 'charges'>): Promise<InstallmentPlan>;
  updateInstallmentPlan(id: string, patch: Partial<InstallmentPlan>): Promise<InstallmentPlan>;
  deleteInstallmentPlan(id: string): Promise<void>;
  addPlanCharge(planId: string, charge: Omit<PlanCharge, 'id'>): Promise<InstallmentPlan>;
  deletePlanCharge(planId: string, chargeId: string): Promise<InstallmentPlan>;

  logPayment(data: Omit<Payment, 'id'>): Promise<Payment>;
  updatePayment(id: string, patch: Partial<Payment>): Promise<Payment>;
  deletePayment(id: string): Promise<void>;

  getProjections(): Promise<ProjectionResult[]>;
  getProjection(id: string): Promise<Projection>;
  runProjection(id: string): Promise<ProjectionResult>;
  createProjection(data: Omit<Projection, 'id'>): Promise<Projection>;
  updateProjection(id: string, patch: Partial<Projection>): Promise<Projection>;
  deleteProjection(id: string): Promise<void>;
  duplicateProjection(id: string, newName?: string): Promise<Projection>;
  compareProjections(ids: string[]): Promise<ProjectionComparison>;

  checkAffordability(params: {
    projectionId: string;
    date: ISODate;
    amount: Money;
    label?: string;
  }): Promise<AffordabilityResult>;

  createProjectionItem(data: Omit<ProjectionItem, 'id'>): Promise<ProjectionItem>;
  updateProjectionItem(id: string, patch: Partial<ProjectionItem>): Promise<ProjectionItem>;
  deleteProjectionItem(id: string): Promise<void>;

  upsertOverride(override: OccurrenceOverride): Promise<OccurrenceOverride>;
  deleteOverride(itemId: string, originalDate: ISODate): Promise<void>;

  toggleExclusion(exclusion: LinkedExclusion): Promise<boolean>;

  createCheckpoint(data: Omit<BalanceCheckpoint, 'id'>): Promise<BalanceCheckpoint>;
  deleteCheckpoint(id: string): Promise<void>;

  exportBackup(): Promise<string>;
  importBackup(jsonString: string): Promise<AppState>;
  exportExpensesCsv(): Promise<string>;
  exportProjectionCsv(projectionId: string): Promise<string>;
  resetDemoData(): Promise<AppState>;
  /** Erase everything, keeping display preferences. */
  clearAllData(): Promise<AppState>;

  /** True when backed by the real server (SQLite); false for the in-browser demo. */
  readonly isPersistent: boolean;
  listBackups(): Promise<BackupInfo[]>;
  createBackup(): Promise<BackupInfo>;
  restoreBackup(fileName: string): Promise<void>;
  backupDownloadUrl(fileName: string): string | null;
  getSystemInfo(): Promise<SystemInfo | null>;
}
