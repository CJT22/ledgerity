/**
 * Models: repositories that map SQLite rows to the shared domain types.
 * They contain no business rules; see ../services for those.
 */
import { DEFAULT_SETTINGS } from '../../../shared/defaults';
import {
  AppState,
  BalanceCheckpoint,
  Expense,
  InstallmentPlan,
  LinkedExclusion,
  OccurrenceOverride,
  Part,
  Payment,
  PlanCharge,
  Projection,
  ProjectionItem,
  Settings,
} from '../../../shared/types';
import { Db } from '../db/connection';
import { col, TableRepo } from './tableRepo';

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(): Settings {
    const rows = this.db.all<{ key: string; value_json: string }>('SELECT key, value_json FROM settings');
    const stored: Record<string, unknown> = {};
    for (const r of rows) stored[r.key] = JSON.parse(r.value_json);
    // Unknown keys are ignored; missing keys fall back to defaults (new settings need no migration)
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in stored) out[k] = stored[k];
    }
    return out as unknown as Settings;
  }

  set(patch: Partial<Settings>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      this.db.run(
        `INSERT INTO settings (key, value_json) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
        key,
        JSON.stringify(value)
      );
    }
  }

  deleteAll(): void {
    this.db.run('DELETE FROM settings');
  }
}

export class ExpensesRepo extends TableRepo<Expense> {
  constructor(db: Db) {
    super(db, 'expenses', [
      col('id', 'id'),
      col('name', 'name'),
      col('description', 'description'),
      col('icon', 'icon'),
      col('color', 'color'),
      col('archived', 'archived', 'bool'),
      col('notes', 'notes'),
    ]);
  }
}

export class PartsRepo extends TableRepo<Part> {
  constructor(db: Db) {
    super(db, 'parts', [
      col('id', 'id'),
      col('expenseId', 'expense_id'),
      col('name', 'name'),
      col('notes', 'notes'),
      col('kind', 'kind'),
      col('isPlanned', 'is_planned', 'bool'),
      col('price', 'price_minor', 'int'),
      col('paymentMode', 'payment_mode', 'text', 'null'),
      col('recurrence', 'recurrence_json', 'json'),
    ]);
  }
}

type PlanRow = Omit<InstallmentPlan, 'partAllocations' | 'charges'>;
type ChargeRow = PlanCharge & { planId: string };

/** Installment plans, including their part allocations and charges. */
export class PlansRepo {
  private readonly base: TableRepo<PlanRow>;
  private readonly charges: TableRepo<ChargeRow>;

  constructor(private readonly db: Db) {
    this.base = new TableRepo<PlanRow>(db, 'installment_plans', [
      col('id', 'id'),
      col('expenseId', 'expense_id'),
      col('name', 'name'),
      col('principal', 'principal_minor', 'int'),
      col('downPayment', 'down_payment_minor', 'int'),
      col('downPaymentDate', 'down_payment_date'),
      col('interestMode', 'interest_mode'),
      col('interestValue', 'interest_value', 'real'),
      col('installmentAmount', 'installment_amount_minor', 'int'),
      col('fees', 'fees_minor', 'int'),
      col('feesSpread', 'fees_spread'),
      col('termCount', 'term_count', 'int'),
      col('frequency', 'frequency'),
      col('firstDueDate', 'first_due_date'),
      col('weekendRule', 'weekend_rule'),
      col('notes', 'notes'),
    ]);
    this.charges = new TableRepo<ChargeRow>(db, 'plan_charges', [
      col('id', 'id'),
      col('planId', 'plan_id'),
      col('date', 'date'),
      col('amount', 'amount_minor', 'int'),
      col('reason', 'reason'),
    ]);
  }

  private hydrate(rows: PlanRow[]): InstallmentPlan[] {
    if (rows.length === 0) return [];
    const allocs = this.db.all<{ plan_id: string; part_id: string; allocated_minor: number }>(
      'SELECT plan_id, part_id, allocated_minor FROM plan_parts ORDER BY rowid'
    );
    const charges = this.charges.list();
    return rows.map((p) => ({
      ...p,
      partAllocations: allocs
        .filter((a) => a.plan_id === p.id)
        .map((a) => ({ partId: a.part_id, amount: Number(a.allocated_minor) })),
      charges: charges
        .filter((c) => c.planId === p.id)
        .map(({ planId: _planId, ...c }) => c),
    }));
  }

  list(): InstallmentPlan[] {
    return this.hydrate(this.base.list());
  }

  get(id: string): InstallmentPlan | undefined {
    const row = this.base.get(id);
    return row ? this.hydrate([row])[0] : undefined;
  }

  private writeChildren(plan: InstallmentPlan): void {
    this.db.run('DELETE FROM plan_parts WHERE plan_id = ?', plan.id);
    const seen = new Set<string>();
    for (const a of plan.partAllocations) {
      if (seen.has(a.partId)) continue; // one row per part
      seen.add(a.partId);
      this.db.run(
        'INSERT INTO plan_parts (plan_id, part_id, allocated_minor) VALUES (?, ?, ?)',
        plan.id,
        a.partId,
        Math.round(a.amount)
      );
    }
    const keep = new Set(plan.charges.map((c) => c.id));
    for (const existing of this.charges.list('plan_id = ?', plan.id)) {
      if (!keep.has(existing.id)) this.charges.delete(existing.id);
    }
    for (const c of plan.charges) this.charges.upsert({ ...c, planId: plan.id });
  }

  insert(plan: InstallmentPlan): void {
    const { partAllocations: _a, charges: _c, ...row } = plan;
    this.base.insert(row);
    this.writeChildren(plan);
  }

  update(plan: InstallmentPlan): boolean {
    const { partAllocations: _a, charges: _c, ...row } = plan;
    const ok = this.base.update(row);
    if (ok) this.writeChildren(plan);
    return ok;
  }

  delete(id: string): boolean {
    return this.base.delete(id); // allocations & charges cascade
  }

  deleteByExpense(expenseId: string): void {
    this.base.deleteWhere('expense_id = ?', expenseId);
  }

  deleteAll(): void {
    this.base.deleteAll();
  }
}

export class PaymentsRepo extends TableRepo<Payment> {
  constructor(db: Db) {
    super(db, 'payments', [
      col('id', 'id'),
      col('date', 'date'),
      col('amount', 'amount_minor', 'int'),
      col('note', 'note'),
      col('targetType', 'target_type'),
      col('targetId', 'target_id'),
      col('occurrenceDate', 'occurrence_date'),
    ]);
  }
}

type ProjectionRowBase = Omit<Projection, 'startSources'>;

/** Projections, including their start sources (kept in entry order). */
export class ProjectionsRepo {
  private readonly base: TableRepo<ProjectionRowBase>;

  constructor(private readonly db: Db) {
    this.base = new TableRepo<ProjectionRowBase>(db, 'projections', [
      col('id', 'id'),
      col('name', 'name'),
      col('startDate', 'start_date'),
      col('endDate', 'end_date'),
      col('parentProjectionId', 'parent_projection_id', 'text', 'null'),
      col('includeExpenseDues', 'include_expense_dues', 'bool'),
      col('startNote', 'start_note'),
      col('endNote', 'end_note'),
    ]);
  }

  private hydrate(rows: ProjectionRowBase[]): Projection[] {
    if (rows.length === 0) return [];
    const sources = this.db.all<{
      projection_id: string;
      label: string;
      amount_minor: number;
    }>('SELECT projection_id, label, amount_minor FROM projection_start_sources ORDER BY rowid');
    return rows.map((p) => ({
      ...p,
      startSources: sources
        .filter((s) => s.projection_id === p.id)
        .map((s) => ({ label: s.label, amount: Number(s.amount_minor) })),
    }));
  }

  list(): Projection[] {
    return this.hydrate(this.base.list());
  }

  get(id: string): Projection | undefined {
    const row = this.base.get(id);
    return row ? this.hydrate([row])[0] : undefined;
  }

  private writeSources(p: Projection): void {
    this.db.run('DELETE FROM projection_start_sources WHERE projection_id = ?', p.id);
    for (const s of p.startSources) {
      this.db.run(
        'INSERT INTO projection_start_sources (projection_id, label, amount_minor) VALUES (?, ?, ?)',
        p.id,
        s.label,
        Math.round(s.amount)
      );
    }
  }

  insert(p: Projection): void {
    const { startSources: _s, ...row } = p;
    this.base.insert(row);
    this.writeSources(p);
  }

  update(p: Projection): boolean {
    const { startSources: _s, ...row } = p;
    const ok = this.base.update(row);
    if (ok) this.writeSources(p);
    return ok;
  }

  delete(id: string): boolean {
    return this.base.delete(id); // children cascade; scenario parents are SET NULL
  }

  deleteAll(): void {
    this.base.deleteAll();
  }
}

export class ProjectionItemsRepo extends TableRepo<ProjectionItem> {
  constructor(db: Db) {
    super(db, 'projection_items', [
      col('id', 'id'),
      col('projectionId', 'projection_id'),
      col('type', 'type'),
      col('name', 'name'),
      col('amount', 'amount_minor', 'int'),
      col('note', 'note'),
      col('recurrence', 'recurrence_json', 'json'),
    ]);
  }
}

export class OverridesRepo extends TableRepo<OccurrenceOverride> {
  constructor(db: Db) {
    super(
      db,
      'occurrence_overrides',
      [
        col('itemId', 'item_id'),
        col('originalDate', 'original_date'),
        col('skipped', 'skipped', 'bool'),
        col('movedToDate', 'moved_to_date'),
        col('plannedAmount', 'planned_amount_minor', 'int'),
        col('note', 'note'),
      ],
      ['itemId', 'originalDate']
    );
  }
}

export class ExclusionsRepo extends TableRepo<LinkedExclusion> {
  constructor(db: Db) {
    super(
      db,
      'projection_exclusions',
      [
        col('projectionId', 'projection_id'),
        col('sourceType', 'source_type'),
        col('sourceId', 'source_id'),
        col('occurrenceDate', 'occurrence_date'),
      ],
      ['projectionId', 'sourceType', 'sourceId', 'occurrenceDate'],
      false
    );
  }
}

export class CheckpointsRepo extends TableRepo<BalanceCheckpoint> {
  constructor(db: Db) {
    super(db, 'balance_checkpoints', [
      col('id', 'id'),
      col('projectionId', 'projection_id'),
      col('date', 'date'),
      col('actualBalance', 'actual_balance_minor', 'int'),
      col('note', 'note'),
    ]);
  }
}

/** All repositories bound to one database. */
export class Models {
  readonly settings: SettingsRepo;
  readonly expenses: ExpensesRepo;
  readonly parts: PartsRepo;
  readonly plans: PlansRepo;
  readonly payments: PaymentsRepo;
  readonly projections: ProjectionsRepo;
  readonly items: ProjectionItemsRepo;
  readonly overrides: OverridesRepo;
  readonly exclusions: ExclusionsRepo;
  readonly checkpoints: CheckpointsRepo;

  constructor(readonly db: Db) {
    this.settings = new SettingsRepo(db);
    this.expenses = new ExpensesRepo(db);
    this.parts = new PartsRepo(db);
    this.plans = new PlansRepo(db);
    this.payments = new PaymentsRepo(db);
    this.projections = new ProjectionsRepo(db);
    this.items = new ProjectionItemsRepo(db);
    this.overrides = new OverridesRepo(db);
    this.exclusions = new ExclusionsRepo(db);
    this.checkpoints = new CheckpointsRepo(db);
  }

  /** Full snapshot, the shape the shared query layer works on. */
  loadState(): AppState {
    return {
      version: 3,
      settings: this.settings.get(),
      expenses: this.expenses.list(),
      parts: this.parts.list(),
      plans: this.plans.list(),
      payments: this.payments.list(),
      projections: this.projections.list(),
      projectionItems: this.items.list(),
      overrides: this.overrides.list(),
      exclusions: this.exclusions.list(),
      checkpoints: this.checkpoints.list(),
    };
  }

  /** Replaces ALL data with `state` in one transaction. */
  replaceState(state: AppState): void {
    this.db.transaction(() => {
      // Children first is not required (FK cascades), but clear everything explicitly
      this.payments.deleteAll();
      this.projections.deleteAll();
      this.expenses.deleteAll();
      this.settings.deleteAll();

      this.settings.set(state.settings);
      for (const e of state.expenses) this.expenses.insert(e);
      const expenseIds = new Set(state.expenses.map((e) => e.id));
      for (const p of state.parts) if (expenseIds.has(p.expenseId)) this.parts.insert(p);
      const partIds = new Set(state.parts.filter((p) => expenseIds.has(p.expenseId)).map((p) => p.id));
      for (const pl of state.plans) {
        if (!expenseIds.has(pl.expenseId)) continue;
        this.plans.insert({
          ...pl,
          partAllocations: pl.partAllocations.filter((a) => partIds.has(a.partId)),
        });
      }
      for (const pay of state.payments) this.payments.insert(pay);

      // Insert parents before their scenarios so the self-reference FK is satisfied
      const projIds = new Set(state.projections.map((p) => p.id));
      const inserted = new Set<string>();
      let pending = [...state.projections];
      while (pending.length) {
        const waiting = pending.filter(
          (p) => p.parentProjectionId && projIds.has(p.parentProjectionId) && !inserted.has(p.parentProjectionId)
        );
        const ready = pending.filter((p) => !waiting.includes(p));
        // A cycle in parent links leaves nothing ready: break it rather than fail the restore
        const batch = ready.length ? ready : waiting.map((p) => ({ ...p, parentProjectionId: null }));
        for (const p of batch) {
          const parentOk = p.parentProjectionId && projIds.has(p.parentProjectionId);
          this.projections.insert({ ...p, parentProjectionId: parentOk ? p.parentProjectionId : null });
          inserted.add(p.id);
        }
        pending = ready.length ? waiting : [];
      }

      const itemIds = new Set<string>();
      for (const it of state.projectionItems) {
        if (!projIds.has(it.projectionId)) continue;
        this.items.insert(it);
        itemIds.add(it.id);
      }
      for (const ov of state.overrides) if (itemIds.has(ov.itemId)) this.overrides.upsert(ov);
      for (const ex of state.exclusions) if (projIds.has(ex.projectionId)) this.exclusions.upsert(ex);
      for (const cp of state.checkpoints) if (projIds.has(cp.projectionId)) this.checkpoints.insert(cp);
    });
  }
}
