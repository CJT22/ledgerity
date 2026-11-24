import { z } from 'zod';
import { computePlanDueKey, getExpenseRelatedPayments } from '../../../shared/domain';
import { getExpenseDetail, listExpenseSummaries } from '../../../shared/queries';
import {
  Expense,
  ExpenseDetailPayload,
  ExpenseSummary,
  InstallmentPlan,
  Part,
  Payment,
  PlanCharge,
} from '../../../shared/types';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { applyPatch, uid, withId } from '../lib/util';
import {
  chargeCreateSchema,
  expenseCreateSchema,
  expensePatchSchema,
  partCreateSchema,
  partPatchSchema,
  paymentCreateSchema,
  paymentPatchSchema,
  planCreateSchema,
  planPatchSchema,
} from '../validation/schemas';
import { ServiceContext } from './context';

type Input<S extends z.ZodType> = z.output<S>;

export class ExpensesService {
  constructor(private readonly ctx: ServiceContext) {}

  private get m() {
    return this.ctx.models;
  }

  // ---- Expenses -----------------------------------------------------------

  list(): ExpenseSummary[] {
    return listExpenseSummaries(this.m.loadState(), this.ctx.today());
  }

  get(id: string): ExpenseDetailPayload {
    return getExpenseDetail(this.m.loadState(), id, this.ctx.today());
  }

  private requireExpense(id: string): Expense {
    const e = this.m.expenses.get(id);
    if (!e) throw new NotFoundError('Expense');
    return e;
  }

  create(data: Input<typeof expenseCreateSchema>): Expense {
    const expense = withId<Expense>(data, uid('exp'));
    this.m.expenses.insert(expense);
    return this.m.expenses.get(expense.id)!;
  }

  update(id: string, patch: Input<typeof expensePatchSchema>): Expense {
    const updated = applyPatch(this.requireExpense(id), patch);
    this.m.expenses.update(updated);
    return this.m.expenses.get(id)!;
  }

  /** Deletes the expense, its parts, plans, charges, and every payment made toward them. */
  delete(id: string): void {
    this.requireExpense(id);
    this.ctx.db.transaction(() => {
      const parts = this.m.parts.list('expense_id = ?', id);
      const plans = this.m.plans.list().filter((pl) => pl.expenseId === id);
      const payments = getExpenseRelatedPayments(parts, plans, this.m.payments.list());
      for (const p of payments) this.m.payments.delete(p.id);
      this.m.expenses.delete(id); // parts, plans, allocations, charges cascade
    });
  }

  // ---- Parts --------------------------------------------------------------

  private requirePart(id: string): Part {
    const p = this.m.parts.get(id);
    if (!p) throw new NotFoundError('Part');
    return p;
  }

  createPart(data: Input<typeof partCreateSchema>): Part {
    this.requireExpense(data.expenseId);
    const part = withId<Part>(data, uid('part'));
    this.m.parts.insert(part);
    return this.m.parts.get(part.id)!;
  }

  updatePart(id: string, patch: Input<typeof partPatchSchema>): Part {
    const updated = applyPatch(this.requirePart(id), patch);
    if (updated.kind === 'recurring' && !updated.recurrence) {
      throw new BadRequestError('Recurring parts need a recurrence rule');
    }
    this.m.parts.update(updated);
    return this.m.parts.get(id)!;
  }

  /** Deletes the part, its direct/recurring payments, and removes it from any installment plan. */
  deletePart(id: string): void {
    this.requirePart(id);
    this.ctx.db.transaction(() => {
      this.m.payments.deleteWhere(
        `target_type IN ('part', 'recurring_occurrence') AND target_id = ?`,
        id
      );
      this.m.parts.delete(id); // plan_parts rows cascade
    });
  }

  // ---- Installment plans --------------------------------------------------

  private requirePlan(id: string): InstallmentPlan {
    const pl = this.m.plans.get(id);
    if (!pl) throw new NotFoundError('Installment plan');
    return pl;
  }

  /** Ensures every allocated part exists and belongs to the plan's expense. */
  private checkAllocations(expenseId: string, allocations: { partId: string }[]): void {
    for (const a of allocations) {
      const part = this.m.parts.get(a.partId);
      if (!part) throw new BadRequestError(`Part ${a.partId} does not exist`);
      if (part.expenseId !== expenseId) {
        throw new BadRequestError(`Part "${part.name}" belongs to a different expense`);
      }
    }
  }

  /** Parts covered by a plan are committed purchases paid by installment. */
  private markCovered(allocations: { partId: string }[]): void {
    for (const a of allocations) {
      const part = this.m.parts.get(a.partId);
      if (part && (part.paymentMode !== 'installment' || part.isPlanned)) {
        this.m.parts.update({ ...part, paymentMode: 'installment', isPlanned: false });
      }
    }
  }

  createPlan(data: Input<typeof planCreateSchema>): InstallmentPlan {
    this.requireExpense(data.expenseId);
    this.checkAllocations(data.expenseId, data.partAllocations);
    const plan: InstallmentPlan = { ...withId<InstallmentPlan>(data, uid('plan')), charges: [] };
    this.ctx.db.transaction(() => {
      this.m.plans.insert(plan);
      this.markCovered(plan.partAllocations);
    });
    return this.m.plans.get(plan.id)!;
  }

  updatePlan(id: string, patch: Input<typeof planPatchSchema>): InstallmentPlan {
    const existing = this.requirePlan(id);
    const updated = applyPatch(existing, patch);
    if (patch.partAllocations) this.checkAllocations(existing.expenseId, patch.partAllocations);
    this.ctx.db.transaction(() => {
      this.m.plans.update(updated);
      if (patch.partAllocations) this.markCovered(patch.partAllocations);
    });
    return this.m.plans.get(id)!;
  }

  /** Deletes the plan, its charges, and all payments made toward its dues and charges. */
  deletePlan(id: string): void {
    const plan = this.requirePlan(id);
    this.ctx.db.transaction(() => {
      this.m.payments.deleteWhere(
        `target_type = 'plan_due' AND (target_id = ? OR target_id LIKE ? ESCAPE '\\')`,
        id,
        `${id.replace(/[\\%_]/g, (c) => `\\${c}`)}:%`
      );
      for (const ch of plan.charges) {
        this.m.payments.deleteWhere(`target_type = 'plan_charge' AND target_id = ?`, ch.id);
      }
      this.m.plans.delete(id);
    });
  }

  addCharge(planId: string, data: Input<typeof chargeCreateSchema>): InstallmentPlan {
    const plan = this.requirePlan(planId);
    const charge: PlanCharge = { ...data, id: uid('chg') };
    this.m.plans.update({ ...plan, charges: [...plan.charges, charge] });
    return this.m.plans.get(planId)!;
  }

  deleteCharge(planId: string, chargeId: string): InstallmentPlan {
    const plan = this.requirePlan(planId);
    if (!plan.charges.some((c) => c.id === chargeId)) throw new NotFoundError('Charge');
    this.ctx.db.transaction(() => {
      this.m.payments.deleteWhere(`target_type = 'plan_charge' AND target_id = ?`, chargeId);
      this.m.plans.update({ ...plan, charges: plan.charges.filter((c) => c.id !== chargeId) });
    });
    return this.m.plans.get(planId)!;
  }

  // ---- Payments -----------------------------------------------------------

  /** A payment must point at something that exists, or it would silently count nowhere. */
  private checkTarget(p: Pick<Payment, 'targetType' | 'targetId'>): void {
    switch (p.targetType) {
      case 'part':
      case 'recurring_occurrence': {
        const part = this.m.parts.get(p.targetId);
        if (!part) throw new BadRequestError('Payment target part does not exist');
        if (p.targetType === 'recurring_occurrence' && part.kind !== 'recurring') {
          throw new BadRequestError('Payment target is not a recurring part');
        }
        return;
      }
      case 'plan_due': {
        const [planId, seqStr] = p.targetId.split(':');
        const plan = this.m.plans.get(planId);
        if (!plan) throw new BadRequestError('Payment target plan does not exist');
        if (seqStr !== undefined) {
          const seq = Number(seqStr);
          if (!Number.isInteger(seq) || seq < 0 || seq > plan.termCount) {
            throw new BadRequestError('Payment target installment does not exist');
          }
          if (computePlanDueKey(planId, seq) !== p.targetId) {
            throw new BadRequestError('Malformed installment reference');
          }
        }
        return;
      }
      case 'plan_charge': {
        const found = this.m.plans.list().some((pl) => pl.charges.some((c) => c.id === p.targetId));
        if (!found) throw new BadRequestError('Payment target charge does not exist');
        return;
      }
    }
  }

  logPayment(data: Input<typeof paymentCreateSchema>): Payment {
    this.checkTarget(data);
    const payment = withId<Payment>(data, uid('pay'));
    this.m.payments.insert(payment);
    return this.m.payments.get(payment.id)!;
  }

  updatePayment(id: string, patch: Input<typeof paymentPatchSchema>): Payment {
    const existing = this.m.payments.get(id);
    if (!existing) throw new NotFoundError('Payment');
    const updated = applyPatch(existing, patch);
    if (patch.targetType !== undefined || patch.targetId !== undefined) this.checkTarget(updated);
    this.m.payments.update(updated);
    return this.m.payments.get(id)!;
  }

  deletePayment(id: string): void {
    if (!this.m.payments.delete(id)) throw new NotFoundError('Payment');
  }
}
