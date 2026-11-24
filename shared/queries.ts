/**
 * Read-side queries over a full AppState snapshot.
 *
 * Both the real server (state loaded from SQLite) and the in-browser mock API use these,
 * so every screen is computed by exactly the same code regardless of where data lives.
 * Pure functions: no I/O, `today` is always passed in.
 */
import {
  addDaysISO,
  buildSchedule,
  checkAffordability,
  computePlanDueKey,
  expand,
  getExpenseRelatedPayments,
  getNextPaydayInfo,
  runProjection,
  summarizeExpense,
} from './domain';
import {
  AffordabilityResult,
  AppState,
  DashboardData,
  Expense,
  ExpenseDetailPayload,
  ExpenseSummary,
  ISODate,
  Money,
  ProjectionComparison,
  ProjectionResult,
  UpcomingDueItem,
} from './types';

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

function expensesContext(state: AppState) {
  return {
    expenses: state.expenses,
    parts: state.parts,
    plans: state.plans,
    payments: state.payments,
  };
}

export function listExpenseSummaries(state: AppState, today: ISODate): ExpenseSummary[] {
  return state.expenses.map((exp) =>
    summarizeExpense(exp, state.parts, state.plans, state.payments, state.settings, today)
  );
}

export function getExpenseDetail(state: AppState, id: string, today: ISODate): ExpenseDetailPayload {
  const expense = state.expenses.find((e) => e.id === id);
  if (!expense) throw new NotFoundError('Expense');
  const parts = state.parts.filter((p) => p.expenseId === id);
  const plans = state.plans.filter((pl) => pl.expenseId === id);
  const payments = getExpenseRelatedPayments(parts, plans, state.payments).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const summary = summarizeExpense(
    expense,
    state.parts,
    state.plans,
    state.payments,
    state.settings,
    today
  );
  return { expense, parts, plans, payments, summary };
}

export function runProjectionById(state: AppState, id: string, today: ISODate): ProjectionResult {
  const proj = state.projections.find((p) => p.id === id);
  if (!proj) throw new NotFoundError('Projection');
  return runProjection(
    proj,
    state.projectionItems,
    state.overrides,
    state.exclusions,
    state.checkpoints,
    expensesContext(state),
    state.settings,
    today
  );
}

export function checkAffordabilityForState(
  state: AppState,
  params: { projectionId: string; date: ISODate; amount: Money; label?: string },
  today: ISODate
): AffordabilityResult {
  const proj = state.projections.find((p) => p.id === params.projectionId);
  if (!proj) throw new NotFoundError('Projection');
  return checkAffordability(
    proj,
    state.projectionItems,
    state.overrides,
    state.exclusions,
    state.checkpoints,
    expensesContext(state),
    state.settings,
    params.date,
    params.amount,
    params.label,
    today
  );
}

export function compareProjections(
  state: AppState,
  ids: string[],
  today: ISODate
): ProjectionComparison {
  const results = ids
    .map((id) => {
      try {
        return runProjectionById(state, id, today);
      } catch {
        return null;
      }
    })
    .filter((r): r is ProjectionResult => r !== null);

  if (results.length === 0) {
    return { projections: [], baselineId: '', mergedTimeline: [], metrics: [] };
  }

  const baseline = results[0];
  const allDates = new Set<ISODate>();
  for (const r of results) {
    for (const pt of r.timeline) allDates.add(pt.date);
  }
  const sortedDates = [...allDates].sort();

  const lookupByProj = results.map((r) => {
    const map = new Map<ISODate, Money>();
    for (const pt of r.timeline) map.set(pt.date, pt.total);
    return { id: r.projection.id, map, start: r.summary.startTotal };
  });

  const mergedTimeline = sortedDates.map((date) => {
    const values: Record<string, Money> = {};
    for (const entry of lookupByProj) {
      if (entry.map.has(date)) {
        values[entry.id] = entry.map.get(date)!;
      } else {
        // Carry forward the nearest prior value (timeline entries are in date order)
        let nearest = entry.start;
        for (const [d, v] of entry.map.entries()) {
          if (d <= date) nearest = v;
          else break;
        }
        values[entry.id] = nearest;
      }
    }
    return { date, values };
  });

  const metrics = results.map((r) => ({
    projectionId: r.projection.id,
    name: r.projection.name,
    endBalance: r.summary.endBalance,
    endBalanceDiff: r.summary.endBalance - baseline.summary.endBalance,
    lowestBalance: r.summary.lowestBalance,
    lowestBalanceDate: r.summary.lowestBalanceDate,
    totalIn: r.summary.totalIn,
    totalOut: r.summary.totalOut,
  }));

  return { projections: results, baselineId: baseline.projection.id, mergedTimeline, metrics };
}

export function buildDashboard(state: AppState, today: ISODate): DashboardData {
  // Baseline active projection: first one that is not a scenario, else the first one
  const activeProjMeta =
    state.projections.find((p) => !p.parentProjectionId) ?? state.projections[0] ?? null;
  const activeProjection = activeProjMeta ? runProjectionById(state, activeProjMeta.id, today) : null;

  // Balance as of today according to the baseline projection: its starting sources + only
  // CONFIRMED items (marked done / actually paid) + balance checkpoints. Past items not yet
  // confirmed are reported separately as "pending" instead of being assumed to have happened.
  let totalBalance: Money = activeProjection?.summary.startTotal ?? 0;
  let pendingConfirmationCount = 0;
  let pendingConfirmationNet = 0;
  for (const r of activeProjection?.rows ?? []) {
    if (r.effectiveDate > today) break; // rows are in date order
    if (r.type === 'adjustment') {
      totalBalance = r.plannedAmount; // checkpoint = actual balance on that date
      continue;
    }
    if (r.skipped || r.excluded) continue;
    if (r.status !== 'done') {
      pendingConfirmationCount++;
      if (r.type === 'add') pendingConfirmationNet += r.effectiveAmount;
      else if (r.type === 'minus') pendingConfirmationNet -= r.effectiveAmount;
      continue;
    }
    if (r.type === 'add') totalBalance += r.effectiveAmount;
    else if (r.type === 'minus') totalBalance -= r.effectiveAmount;
  }

  const { nextPayday, daysUntil, currentPeriod } = getNextPaydayInfo(
    today,
    state.settings.cutoffDays,
    state.settings.defaultWeekendRule
  );

  let moneyLeftThisCutoff = totalBalance;
  let currentCutoffLabel = 'Current cutoff';
  if (activeProjection && currentPeriod) {
    currentCutoffLabel = `${currentPeriod.startDate} – ${currentPeriod.endDate}`;
    const matchedGroup = activeProjection.cutoffGroups.find(
      (g) => today >= g.startDate && today <= g.endDate
    );
    if (matchedGroup) {
      moneyLeftThisCutoff = matchedGroup.endBalance;
      currentCutoffLabel = matchedGroup.label;
    }
  }

  // Overdue & upcoming (30-day) dues across all active expenses
  const thirtyDaysOut = addDaysISO(today, 30);
  const overdueDues: UpcomingDueItem[] = [];
  const upcomingDues30Days: UpcomingDueItem[] = [];

  const activeExpenses = state.expenses.filter((e) => !e.archived);
  for (const exp of activeExpenses) {
    const expParts = state.parts.filter((p) => p.expenseId === exp.id);
    const expPlans = state.plans.filter((pl) => pl.expenseId === exp.id);
    const expPayments = getExpenseRelatedPayments(expParts, expPlans, state.payments);

    for (const plan of expPlans) {
      const sched = buildSchedule(plan, expPayments, today);
      for (const due of sched.dues) {
        const rem = Math.max(0, due.amount - due.paid);
        if (rem <= 0) continue;
        const item: UpcomingDueItem = {
          id: `due_${plan.id}_${due.seq}`,
          dueDate: due.dueDate,
          amount: due.amount,
          paid: due.paid,
          remaining: rem,
          status: due.status,
          title:
            due.kind === 'down_payment'
              ? `${plan.name} (Down payment)`
              : `${plan.name} #${due.seq}/${plan.termCount}`,
          subtitle: exp.name,
          expenseId: exp.id,
          expenseName: exp.name,
          expenseIcon: exp.icon,
          targetType: 'plan_due',
          targetId: computePlanDueKey(plan.id, due.seq),
          occurrenceDate: due.dueDate,
        };
        if (due.dueDate < today) overdueDues.push(item);
        else if (due.dueDate <= thirtyDaysOut) upcomingDues30Days.push(item);
      }

      for (const ch of plan.charges) {
        const paid = expPayments
          .filter((p) => p.targetType === 'plan_charge' && p.targetId === ch.id)
          .reduce((s, p) => s + p.amount, 0);
        const rem = Math.max(0, ch.amount - paid);
        if (rem <= 0) continue;
        const item: UpcomingDueItem = {
          id: `chg_${ch.id}`,
          dueDate: ch.date,
          amount: ch.amount,
          paid,
          remaining: rem,
          status: ch.date < today ? 'overdue' : ch.date === today ? 'due_today' : 'upcoming',
          title: ch.reason,
          subtitle: `${exp.name} · ${plan.name}`,
          expenseId: exp.id,
          expenseName: exp.name,
          expenseIcon: exp.icon,
          targetType: 'plan_charge',
          targetId: ch.id,
        };
        if (ch.date < today) overdueDues.push(item);
        else if (ch.date <= thirtyDaysOut) upcomingDues30Days.push(item);
      }
    }

    for (const part of expParts) {
      if (part.isPlanned || part.kind !== 'recurring' || !part.recurrence) continue;
      const occs = expand(part.recurrence, addDaysISO(today, -60), thirtyDaysOut);
      for (const occ of occs) {
        const paid = expPayments
          .filter(
            (p) =>
              p.targetType === 'recurring_occurrence' &&
              p.targetId === part.id &&
              (p.occurrenceDate === occ.originalDate || p.occurrenceDate === occ.effectiveDate)
          )
          .reduce((s, p) => s + p.amount, 0);
        const rem = Math.max(0, part.price - paid);
        if (rem <= 0) continue;
        const item: UpcomingDueItem = {
          id: `rec_${part.id}_${occ.originalDate}`,
          dueDate: occ.effectiveDate,
          amount: part.price,
          paid,
          remaining: rem,
          status:
            occ.effectiveDate < today ? 'overdue' : occ.effectiveDate === today ? 'due_today' : 'upcoming',
          title: part.name,
          subtitle: `${exp.name} · Recurring`,
          expenseId: exp.id,
          expenseName: exp.name,
          expenseIcon: exp.icon,
          targetType: 'recurring_occurrence',
          targetId: part.id,
          occurrenceDate: occ.originalDate,
        };
        if (occ.effectiveDate < today) overdueDues.push(item);
        else if (occ.effectiveDate <= thirtyDaysOut) upcomingDues30Days.push(item);
      }
    }
  }

  overdueDues.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  upcomingDues30Days.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const totalOverdueAmount = overdueDues.reduce((s, d) => s + d.remaining, 0);
  const expenseSummaries = activeExpenses.map((e) =>
    summarizeExpense(e, state.parts, state.plans, state.payments, state.settings, today)
  );

  // Recent payments with readable labels
  const partById = new Map(state.parts.map((p) => [p.id, p]));
  const planById = new Map(state.plans.map((pl) => [pl.id, pl]));
  const expById = new Map(state.expenses.map((e) => [e.id, e]));

  const recentPayments = [...state.payments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map((p) => {
      let exp: Expense | undefined;
      let targetLabel = 'Payment';
      if (p.targetType === 'part' || p.targetType === 'recurring_occurrence') {
        const part = partById.get(p.targetId);
        if (part) {
          exp = expById.get(part.expenseId);
          targetLabel = part.name;
        }
      } else if (p.targetType === 'plan_due') {
        const [planId, seqStr] = p.targetId.split(':');
        const plan = planById.get(planId);
        if (plan) {
          exp = expById.get(plan.expenseId);
          targetLabel = seqStr === '0' ? `${plan.name} (Down payment)` : `${plan.name} #${seqStr}`;
        }
      } else if (p.targetType === 'plan_charge') {
        for (const pl of state.plans) {
          const ch = pl.charges.find((c) => c.id === p.targetId);
          if (ch) {
            exp = expById.get(pl.expenseId);
            targetLabel = ch.reason;
            break;
          }
        }
      }
      return { ...p, expenseId: exp?.id, expenseName: exp?.name, expenseIcon: exp?.icon, targetLabel };
    });

  const paydayDatesInRange = activeProjection
    ? activeProjection.rows
        .filter((r) => r.isPayday && !r.skipped && r.effectiveAmount > 0)
        .map((r) => r.effectiveDate)
    : [];

  return {
    today,
    totalBalance,
    daysUntilNextPayday: daysUntil,
    nextPaydayDate: nextPayday,
    moneyLeftThisCutoff,
    currentCutoffLabel,
    activeProjection,
    totalOverdueAmount,
    overdueCount: overdueDues.length,
    upcomingDues30Days,
    overdueDues,
    expenseSummaries,
    recentPayments,
    paydayDatesInRange,
    pendingConfirmationCount,
    pendingConfirmationNet,
  };
}

// ---------------------------------------------------------------------------
// CSV exports

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function escapeCsv(val: string | number | boolean | null | undefined): string {
  let s = val === null || val === undefined ? '' : String(val);
  // Spreadsheet formula injection guard: text starting with = + - @ (or tab/CR) would be
  // executed as a formula by Excel/Sheets. Plain numbers like "-123.45" are left alone.
  if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const csvLine = (cells: (string | number | boolean | null | undefined)[]) =>
  cells.map(escapeCsv).join(',');

const decimal = (cents: Money) => (cents / 100).toFixed(2);

export function buildExpensesCsv(state: AppState): string {
  const expMap = new Map(state.expenses.map((e) => [e.id, e]));
  const partMap = new Map(state.parts.map((p) => [p.id, p]));
  const planMap = new Map(state.plans.map((pl) => [pl.id, pl]));
  const chargeMap = new Map(
    state.plans.flatMap((pl) => pl.charges.map((ch) => [ch.id, { plan: pl, charge: ch }] as const))
  );

  const lines: string[] = [
    csvLine(['RecordType', 'Expense', 'Name/Target', 'Kind/Mode', 'Date', 'Amount', 'Note']),
  ];

  for (const part of state.parts) {
    const exp = expMap.get(part.expenseId);
    lines.push(
      csvLine([
        'Part',
        exp?.name ?? '',
        part.name,
        `${part.kind}${part.isPlanned ? ' (planned)' : ''}${part.paymentMode ? ` / ${part.paymentMode}` : ''}`,
        part.recurrence?.startDate ?? '',
        decimal(part.price),
        part.notes ?? '',
      ])
    );
  }

  for (const pay of state.payments) {
    // Resolve the payment target to a readable expense + label
    let expenseName = '';
    let target = `${pay.targetType}:${pay.targetId}`;
    if (pay.targetType === 'part' || pay.targetType === 'recurring_occurrence') {
      const part = partMap.get(pay.targetId);
      if (part) {
        expenseName = expMap.get(part.expenseId)?.name ?? '';
        target = pay.occurrenceDate ? `${part.name} (${pay.occurrenceDate})` : part.name;
      }
    } else if (pay.targetType === 'plan_due') {
      const [planId, seq] = pay.targetId.split(':');
      const plan = planMap.get(planId);
      if (plan) {
        expenseName = expMap.get(plan.expenseId)?.name ?? '';
        target = seq === '0' ? `${plan.name} (Down payment)` : `${plan.name} #${seq}`;
      }
    } else if (pay.targetType === 'plan_charge') {
      const hit = chargeMap.get(pay.targetId);
      if (hit) {
        expenseName = expMap.get(hit.plan.expenseId)?.name ?? '';
        target = `${hit.plan.name}: ${hit.charge.reason}`;
      }
    }
    lines.push(
      csvLine([
        'Payment',
        expenseName,
        target,
        pay.targetType,
        pay.date,
        decimal(pay.amount),
        pay.note ?? '',
      ])
    );
  }

  return lines.join('\n');
}

export function buildProjectionCsv(state: AppState, projectionId: string, today: ISODate): string {
  const result = runProjectionById(state, projectionId, today);
  const lines: string[] = [
    csvLine([
      'Date',
      'Name',
      'Type',
      'PlannedAmount',
      'ActualAmount',
      'EffectiveAmount',
      'Status',
      'Source',
      'RunningTotal',
      'Note',
    ]),
  ];

  for (const r of result.rows) {
    lines.push(
      csvLine([
        r.effectiveDate,
        r.name,
        r.type,
        decimal(r.plannedAmount),
        r.actualAmount !== undefined ? decimal(r.actualAmount) : '',
        decimal(r.effectiveAmount),
        r.skipped ? 'skipped' : r.excluded ? 'excluded' : r.status,
        r.isLinkedFromExpense ? 'Expenses' : r.source,
        decimal(r.runningTotal),
        r.note ?? '',
      ])
    );
  }
  return lines.join('\n');
}
