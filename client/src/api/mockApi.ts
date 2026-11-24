import { computePlanDueKey, todayISODate } from '@shared/domain';
import { createEmptyState } from '@shared/defaults';
import {
  buildDashboard,
  buildExpensesCsv,
  buildProjectionCsv,
  checkAffordabilityForState,
  compareProjections,
  getExpenseDetail,
  listExpenseSummaries,
  runProjectionById,
} from '@shared/queries';
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
import { createSeedState } from '@shared/seed';

const STORAGE_KEY = 'ledgerity_state_v1';
const DELAY_MS = 140;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

/**
 * In-browser demo backend (localStorage). Used by `npm run dev:mock` so the UI can be
 * explored without the server. Reads go through the same shared queries as the server.
 */
class MockApiClient implements ApiClient {
  readonly isPersistent = false;
  private state: AppState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): AppState {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        // Version 1 (with accounts) is not compatible: re-seed instead
        if (parsed && parsed.settings && parsed.version === 2) {
          return {
            ...parsed,
            settings: {
              ...parsed.settings,
              lanAccess: parsed.settings.lanAccess ?? false,
              setupComplete: parsed.settings.setupComplete ?? true,
            },
          };
        }
      }
    } catch {
      // ignore corrupted storage and re-seed
    }
    const seed = createSeedState();
    this.saveState(seed);
    return seed;
  }

  private saveState(state: AppState): void {
    this.state = state;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }

  private async delay(): Promise<void> {
    await sleep(DELAY_MS);
  }

  async getSettings(): Promise<Settings> {
    await this.delay();
    return deepClone(this.state.settings);
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    await this.delay();
    const updated = { ...this.state.settings, ...patch };
    this.saveState({ ...this.state, settings: updated });
    return deepClone(updated);
  }

  async getExpenses(): Promise<ExpenseSummary[]> {
    await this.delay();
    return deepClone(listExpenseSummaries(this.state, todayISODate()));
  }

  async getExpense(id: string): Promise<ExpenseDetailPayload> {
    await this.delay();
    return deepClone(getExpenseDetail(this.state, id, todayISODate()));
  }

  async createExpense(data: Omit<Expense, 'id'>): Promise<Expense> {
    await this.delay();
    const created: Expense = { ...data, id: uid('exp') };
    this.saveState({
      ...this.state,
      expenses: [...this.state.expenses, created],
    });
    return deepClone(created);
  }

  async updateExpense(id: string, patch: Partial<Expense>): Promise<Expense> {
    await this.delay();
    let updated: Expense | null = null;
    const expenses = this.state.expenses.map((e) => {
      if (e.id === id) {
        updated = { ...e, ...patch, id };
        return updated;
      }
      return e;
    });
    if (!updated) throw new Error('Expense not found');
    this.saveState({ ...this.state, expenses });
    return deepClone(updated);
  }

  async deleteExpense(id: string): Promise<void> {
    await this.delay();
    const partsToDelete = new Set(
      this.state.parts.filter((p) => p.expenseId === id).map((p) => p.id)
    );
    const plansToDelete = this.state.plans.filter((pl) => pl.expenseId === id);
    const planIds = new Set(plansToDelete.map((pl) => pl.id));
    const chargeIds = new Set<string>();
    const dueKeys = new Set<string>();
    for (const pl of plansToDelete) {
      for (const ch of pl.charges) chargeIds.add(ch.id);
      for (let seq = 0; seq <= pl.termCount; seq++) {
        dueKeys.add(computePlanDueKey(pl.id, seq));
      }
    }

    const payments = this.state.payments.filter((p) => {
      if (p.targetType === 'part' || p.targetType === 'recurring_occurrence') {
        return !partsToDelete.has(p.targetId);
      }
      if (p.targetType === 'plan_due') {
        return !dueKeys.has(p.targetId) && !planIds.has(p.targetId);
      }
      if (p.targetType === 'plan_charge') {
        return !chargeIds.has(p.targetId);
      }
      return true;
    });

    this.saveState({
      ...this.state,
      expenses: this.state.expenses.filter((e) => e.id !== id),
      parts: this.state.parts.filter((p) => p.expenseId !== id),
      plans: this.state.plans.filter((pl) => pl.expenseId !== id),
      payments,
    });
  }

  async createPart(data: Omit<Part, 'id'>): Promise<Part> {
    await this.delay();
    const part: Part = { ...data, id: uid('part') };
    this.saveState({
      ...this.state,
      parts: [...this.state.parts, part],
    });
    return deepClone(part);
  }

  async updatePart(id: string, patch: Partial<Part>): Promise<Part> {
    await this.delay();
    let updated: Part | null = null;
    const parts = this.state.parts.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...patch, id };
        return updated;
      }
      return p;
    });
    if (!updated) throw new Error('Part not found');
    this.saveState({ ...this.state, parts });
    return deepClone(updated);
  }

  async deletePart(id: string): Promise<void> {
    await this.delay();
    const plans = this.state.plans.map((pl) => ({
      ...pl,
      partAllocations: pl.partAllocations.filter((a) => a.partId !== id),
    }));
    const payments = this.state.payments.filter(
      (p) => !((p.targetType === 'part' || p.targetType === 'recurring_occurrence') && p.targetId === id)
    );
    this.saveState({
      ...this.state,
      parts: this.state.parts.filter((p) => p.id !== id),
      plans,
      payments,
    });
  }

  async createInstallmentPlan(
    data: Omit<InstallmentPlan, 'id' | 'charges'>
  ): Promise<InstallmentPlan> {
    await this.delay();
    const created: InstallmentPlan = { ...data, id: uid('plan'), charges: [] };
    // Mark covered parts as paymentMode = 'installment' and not planned
    const coveredIds = new Set(created.partAllocations.map((a) => a.partId));
    const parts = this.state.parts.map((p) =>
      coveredIds.has(p.id) ? { ...p, paymentMode: 'installment' as const, isPlanned: false } : p
    );
    this.saveState({
      ...this.state,
      parts,
      plans: [...this.state.plans, created],
    });
    return deepClone(created);
  }

  async updateInstallmentPlan(
    id: string,
    patch: Partial<InstallmentPlan>
  ): Promise<InstallmentPlan> {
    await this.delay();
    let updated: InstallmentPlan | null = null;
    const plans = this.state.plans.map((pl) => {
      if (pl.id === id) {
        updated = { ...pl, ...patch, id };
        return updated;
      }
      return pl;
    });
    if (!updated) throw new Error('Installment plan not found');
    this.saveState({ ...this.state, plans });
    return deepClone(updated);
  }

  async deleteInstallmentPlan(id: string): Promise<void> {
    await this.delay();
    const plan = this.state.plans.find((pl) => pl.id === id);
    const dueKeys = new Set<string>();
    const chargeIds = new Set<string>();
    if (plan) {
      for (let seq = 0; seq <= plan.termCount; seq++) dueKeys.add(computePlanDueKey(plan.id, seq));
      for (const ch of plan.charges) chargeIds.add(ch.id);
    }
    this.saveState({
      ...this.state,
      plans: this.state.plans.filter((pl) => pl.id !== id),
      payments: this.state.payments.filter(
        (p) =>
          !(p.targetType === 'plan_due' && (dueKeys.has(p.targetId) || p.targetId === id)) &&
          !(p.targetType === 'plan_charge' && chargeIds.has(p.targetId))
      ),
    });
  }

  async addPlanCharge(planId: string, charge: Omit<PlanCharge, 'id'>): Promise<InstallmentPlan> {
    await this.delay();
    const newCharge: PlanCharge = { ...charge, id: uid('chg') };
    let updated: InstallmentPlan | null = null;
    const plans = this.state.plans.map((pl) => {
      if (pl.id === planId) {
        updated = { ...pl, charges: [...pl.charges, newCharge] };
        return updated;
      }
      return pl;
    });
    if (!updated) throw new Error('Plan not found');
    this.saveState({ ...this.state, plans });
    return deepClone(updated);
  }

  async deletePlanCharge(planId: string, chargeId: string): Promise<InstallmentPlan> {
    await this.delay();
    let updated: InstallmentPlan | null = null;
    const plans = this.state.plans.map((pl) => {
      if (pl.id === planId) {
        updated = { ...pl, charges: pl.charges.filter((c) => c.id !== chargeId) };
        return updated;
      }
      return pl;
    });
    if (!updated) throw new Error('Plan not found');
    this.saveState({
      ...this.state,
      plans,
      payments: this.state.payments.filter(
        (p) => !(p.targetType === 'plan_charge' && p.targetId === chargeId)
      ),
    });
    return deepClone(updated);
  }

  async logPayment(data: Omit<Payment, 'id'>): Promise<Payment> {
    await this.delay();
    const created: Payment = { ...data, id: uid('pay') };
    this.saveState({
      ...this.state,
      payments: [...this.state.payments, created],
    });
    return deepClone(created);
  }

  async updatePayment(id: string, patch: Partial<Payment>): Promise<Payment> {
    await this.delay();
    let updated: Payment | null = null;
    const payments = this.state.payments.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...patch, id };
        return updated;
      }
      return p;
    });
    if (!updated) throw new Error('Payment not found');
    this.saveState({ ...this.state, payments });
    return deepClone(updated);
  }

  async deletePayment(id: string): Promise<void> {
    await this.delay();
    this.saveState({
      ...this.state,
      payments: this.state.payments.filter((p) => p.id !== id),
    });
  }

  private runProjectionSync(id: string): ProjectionResult {
    return runProjectionById(this.state, id, todayISODate());
  }

  async getProjections(): Promise<ProjectionResult[]> {
    await this.delay();
    return this.state.projections.map((p) => deepClone(this.runProjectionSync(p.id)));
  }

  async getProjection(id: string): Promise<Projection> {
    await this.delay();
    const proj = this.state.projections.find((p) => p.id === id);
    if (!proj) throw new Error('Projection not found');
    return deepClone(proj);
  }

  async runProjection(id: string): Promise<ProjectionResult> {
    await this.delay();
    return deepClone(this.runProjectionSync(id));
  }

  async createProjection(data: Omit<Projection, 'id'>): Promise<Projection> {
    await this.delay();
    const created: Projection = { ...data, id: uid('proj') };
    this.saveState({
      ...this.state,
      projections: [...this.state.projections, created],
    });
    return deepClone(created);
  }

  async updateProjection(id: string, patch: Partial<Projection>): Promise<Projection> {
    await this.delay();
    let updated: Projection | null = null;
    const projections = this.state.projections.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...patch, id };
        return updated;
      }
      return p;
    });
    if (!updated) throw new Error('Projection not found');
    this.saveState({ ...this.state, projections });
    return deepClone(updated);
  }

  async deleteProjection(id: string): Promise<void> {
    await this.delay();
    const itemIds = new Set(
      this.state.projectionItems.filter((it) => it.projectionId === id).map((it) => it.id)
    );
    this.saveState({
      ...this.state,
      projections: this.state.projections
        .filter((p) => p.id !== id)
        .map((p) => (p.parentProjectionId === id ? { ...p, parentProjectionId: null } : p)),
      projectionItems: this.state.projectionItems.filter((it) => it.projectionId !== id),
      overrides: this.state.overrides.filter((ov) => !itemIds.has(ov.itemId)),
      exclusions: this.state.exclusions.filter((ex) => ex.projectionId !== id),
      checkpoints: this.state.checkpoints.filter((cp) => cp.projectionId !== id),
    });
  }

  async duplicateProjection(id: string, newName?: string): Promise<Projection> {
    await this.delay();
    const src = this.state.projections.find((p) => p.id === id);
    if (!src) throw new Error('Projection not found');

    const newProjId = uid('proj');
    const duplicated: Projection = {
      ...deepClone(src),
      id: newProjId,
      name: newName?.trim() || `${src.name} (Scenario)`,
      parentProjectionId: src.id,
    };

    const itemMap = new Map<string, string>();
    const newItems: ProjectionItem[] = this.state.projectionItems
      .filter((it) => it.projectionId === id)
      .map((it) => {
        const newItemId = uid('item');
        itemMap.set(it.id, newItemId);
        return {
          ...deepClone(it),
          id: newItemId,
          projectionId: newProjId,
        };
      });

    const newOverrides: OccurrenceOverride[] = this.state.overrides
      .filter((ov) => itemMap.has(ov.itemId))
      .map((ov) => ({
        ...deepClone(ov),
        itemId: itemMap.get(ov.itemId)!,
      }));

    const newExclusions: LinkedExclusion[] = this.state.exclusions
      .filter((ex) => ex.projectionId === id)
      .map((ex) => ({
        ...deepClone(ex),
        projectionId: newProjId,
      }));

    const newCheckpoints: BalanceCheckpoint[] = this.state.checkpoints
      .filter((cp) => cp.projectionId === id)
      .map((cp) => ({
        ...deepClone(cp),
        id: uid('cp'),
        projectionId: newProjId,
      }));

    this.saveState({
      ...this.state,
      projections: [...this.state.projections, duplicated],
      projectionItems: [...this.state.projectionItems, ...newItems],
      overrides: [...this.state.overrides, ...newOverrides],
      exclusions: [...this.state.exclusions, ...newExclusions],
      checkpoints: [...this.state.checkpoints, ...newCheckpoints],
    });

    return deepClone(duplicated);
  }

  async compareProjections(ids: string[]): Promise<ProjectionComparison> {
    await this.delay();
    return deepClone(compareProjections(this.state, ids, todayISODate()));
  }

  async checkAffordability(params: {
    projectionId: string;
    date: ISODate;
    amount: Money;
    label?: string;
  }): Promise<AffordabilityResult> {
    await this.delay();
    return checkAffordabilityForState(this.state, params, todayISODate());
  }

  async createProjectionItem(data: Omit<ProjectionItem, 'id'>): Promise<ProjectionItem> {
    await this.delay();
    const created: ProjectionItem = { ...data, id: uid('item') };
    this.saveState({
      ...this.state,
      projectionItems: [...this.state.projectionItems, created],
    });
    return deepClone(created);
  }

  async updateProjectionItem(
    id: string,
    patch: Partial<ProjectionItem>
  ): Promise<ProjectionItem> {
    await this.delay();
    let updated: ProjectionItem | null = null;
    const projectionItems = this.state.projectionItems.map((it) => {
      if (it.id === id) {
        updated = { ...it, ...patch, id };
        return updated;
      }
      return it;
    });
    if (!updated) throw new Error('Projection item not found');
    this.saveState({ ...this.state, projectionItems });
    return deepClone(updated);
  }

  async deleteProjectionItem(id: string): Promise<void> {
    await this.delay();
    this.saveState({
      ...this.state,
      projectionItems: this.state.projectionItems.filter((it) => it.id !== id),
      overrides: this.state.overrides.filter((ov) => ov.itemId !== id),
    });
  }

  async upsertOverride(override: OccurrenceOverride): Promise<OccurrenceOverride> {
    await this.delay();
    const idx = this.state.overrides.findIndex(
      (o) => o.itemId === override.itemId && o.originalDate === override.originalDate
    );
    const overrides = [...this.state.overrides];
    if (idx >= 0) {
      overrides[idx] = override;
    } else {
      overrides.push(override);
    }
    this.saveState({ ...this.state, overrides });
    return deepClone(override);
  }

  async deleteOverride(itemId: string, originalDate: ISODate): Promise<void> {
    await this.delay();
    this.saveState({
      ...this.state,
      overrides: this.state.overrides.filter(
        (o) => !(o.itemId === itemId && o.originalDate === originalDate)
      ),
    });
  }

  async toggleExclusion(exclusion: LinkedExclusion): Promise<boolean> {
    await this.delay();
    const exists = this.state.exclusions.some(
      (e) =>
        e.projectionId === exclusion.projectionId &&
        e.sourceType === exclusion.sourceType &&
        e.sourceId === exclusion.sourceId &&
        e.occurrenceDate === exclusion.occurrenceDate
    );
    if (exists) {
      this.saveState({
        ...this.state,
        exclusions: this.state.exclusions.filter(
          (e) =>
            !(
              e.projectionId === exclusion.projectionId &&
              e.sourceType === exclusion.sourceType &&
              e.sourceId === exclusion.sourceId &&
              e.occurrenceDate === exclusion.occurrenceDate
            )
        ),
      });
      return false;
    }
    this.saveState({
      ...this.state,
      exclusions: [...this.state.exclusions, exclusion],
    });
    return true;
  }

  async createCheckpoint(data: Omit<BalanceCheckpoint, 'id'>): Promise<BalanceCheckpoint> {
    await this.delay();
    const created: BalanceCheckpoint = { ...data, id: uid('cp') };
    this.saveState({
      ...this.state,
      checkpoints: [...this.state.checkpoints, created],
    });
    return deepClone(created);
  }

  async deleteCheckpoint(id: string): Promise<void> {
    await this.delay();
    this.saveState({
      ...this.state,
      checkpoints: this.state.checkpoints.filter((cp) => cp.id !== id),
    });
  }

  async getDashboard(): Promise<DashboardData> {
    await this.delay();
    return deepClone(buildDashboard(this.state, todayISODate()));
  }

  async exportBackup(): Promise<string> {
    await this.delay();
    return JSON.stringify(this.state, null, 2);
  }

  async importBackup(jsonString: string): Promise<AppState> {
    await this.delay();
    const parsed = JSON.parse(jsonString) as AppState;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.settings ||
      !Array.isArray(parsed.expenses) ||
      !Array.isArray(parsed.projections) ||
      parsed.projections.some((p) => !Array.isArray(p.startSources))
    ) {
      throw new Error('Invalid Ledgerity backup file.');
    }
    this.saveState(parsed);
    return deepClone(parsed);
  }

  async exportExpensesCsv(): Promise<string> {
    await this.delay();
    return buildExpensesCsv(this.state);
  }

  async exportProjectionCsv(projectionId: string): Promise<string> {
    await this.delay();
    return buildProjectionCsv(this.state, projectionId, todayISODate());
  }

  async resetDemoData(): Promise<AppState> {
    await this.delay();
    const fresh = createSeedState();
    this.saveState(fresh);
    return deepClone(fresh);
  }

  async clearAllData(): Promise<AppState> {
    await this.delay();
    const { settings } = this.state;
    const fresh = createEmptyState({
      currencyCode: settings.currencyCode,
      locale: settings.locale,
      dateFormat: settings.dateFormat,
      theme: settings.theme,
      cutoffDays: settings.cutoffDays,
      defaultWeekendRule: settings.defaultWeekendRule,
      upcomingHorizonMonths: settings.upcomingHorizonMonths,
    });
    this.saveState(fresh);
    return deepClone(fresh);
  }

  // Backups of the SQLite file only exist with the real server
  async listBackups(): Promise<BackupInfo[]> {
    return [];
  }

  async createBackup(): Promise<BackupInfo> {
    throw new Error('Backups need the Ledgerity server (demo mode stores data in this browser only).');
  }

  async restoreBackup(_fileName: string): Promise<void> {
    throw new Error('Backups need the Ledgerity server.');
  }

  backupDownloadUrl(_fileName: string): string | null {
    return null;
  }

  async getSystemInfo(): Promise<SystemInfo | null> {
    return null;
  }
}

export const mockApi: ApiClient = new MockApiClient();
