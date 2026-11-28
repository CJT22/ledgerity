import {
  AffordabilityResult,
  BalanceCheckpoint,
  CutoffPeriodGroup,
  Expense,
  InstallmentPlan,
  ISODate,
  LinkedExclusion,
  Money,
  OccurrenceOverride,
  Part,
  Payment,
  Projection,
  ProjectionItem,
  ProjectionResult,
  ProjectionRow,
  ProjectionTimelinePoint,
  Settings,
} from '../types';
import { getCutoffPeriods } from './cutoff';
import { addDaysISO, formatDisplayDate, todayISODate } from './date';
import { getExpenseRelatedPayments } from './expense';
import { buildSchedule, computePlanDueKey } from './installment';
import { expand } from './recurrence';

export interface ExpensesContext {
  expenses: Expense[];
  parts: Part[];
  plans: InstallmentPlan[];
  payments: Payment[];
}

/** How far back to look for unpaid recurring occurrences to carry into a projection. */
const RECURRING_OVERDUE_LOOKBACK_DAYS = 366;
/** Safety cap on the daily timeline (about 10 years). */
const MAX_TIMELINE_DAYS = 3700;

const TYPE_SORT_ORDER: Record<ProjectionRow['type'], number> = {
  add: 0,
  minus: 1,
  adjustment: 2,
};

/** Starting balance of a projection: the sum of its start sources. */
export function startTotalOf(projection: Pick<Projection, 'startSources'>): Money {
  return projection.startSources.reduce((s, src) => s + src.amount, 0);
}

export function runProjection(
  projection: Projection,
  items: ProjectionItem[],
  overrides: OccurrenceOverride[],
  exclusions: LinkedExclusion[],
  checkpoints: BalanceCheckpoint[],
  expensesContext: ExpensesContext,
  settings: Pick<Settings, 'cutoffDays' | 'defaultWeekendRule'>,
  today: ISODate = todayISODate()
): ProjectionResult {
  const projItems = items.filter((it) => it.projectionId === projection.id);
  const projExclusions = exclusions.filter((ex) => ex.projectionId === projection.id);
  const projCheckpoints = checkpoints.filter((cp) => cp.projectionId === projection.id);

  const projItemIds = new Set(projItems.map((it) => it.id));
  const projOverrides = overrides.filter((ov) => projItemIds.has(ov.itemId));
  const overrideMap = new Map<string, OccurrenceOverride>();
  for (const ov of projOverrides) {
    overrideMap.set(`${ov.itemId}::${ov.originalDate}`, ov);
  }

  const exclusionSet = new Set<string>();
  for (const ex of projExclusions) {
    exclusionSet.add(`${ex.sourceType}::${ex.sourceId}::${ex.occurrenceDate}`);
  }

  const startTotal = startTotalOf(projection);

  const rawRows: Omit<ProjectionRow, 'runningTotal'>[] = [];

  // 1. Expand ProjectionItems
  const expandFrom = addDaysISO(projection.startDate, -40);
  const expandTo = addDaysISO(projection.endDate, 40);

  for (const item of projItems) {
    const occs = expand(item.recurrence, expandFrom, expandTo);
    const isPaydayItem =
      item.type === 'add' &&
      (item.name.toLowerCase().includes('salary') ||
        item.name.toLowerCase().includes('payday') ||
        item.recurrence.freq === 'semi_monthly');

    for (const occ of occs) {
      const ov = overrideMap.get(`${item.id}::${occ.originalDate}`);
      const skipped = Boolean(ov?.skipped);
      const plannedAmount = ov?.plannedAmount ?? item.amount;
      const effectiveDate = ov?.movedToDate ? ov.movedToDate : occ.effectiveDate;
      const edited =
        skipped ||
        (ov?.movedToDate !== undefined && ov.movedToDate !== occ.effectiveDate) ||
        (ov?.plannedAmount !== undefined && ov.plannedAmount !== item.amount);

      if (effectiveDate < projection.startDate || effectiveDate > projection.endDate) {
        continue;
      }

      const effectiveAmount = skipped ? 0 : plannedAmount;

      rawRows.push({
        rowKey: `item::${item.id}::${occ.originalDate}`,
        source: 'item',
        itemId: item.id,
        originalDate: occ.originalDate,
        effectiveDate,
        type: item.type,
        name: item.name,
        plannedAmount,
        effectiveAmount,
        skipped,
        excluded: false,
        edited,
        isLinkedFromExpense: false,
        note: ov?.note ?? item.note,
        isPayday: isPaydayItem,
      });
    }
  }

  // 2. Include Expense Dues if enabled
  if (projection.includeExpenseDues) {
    const activeExpenses = expensesContext.expenses.filter((e) => !e.archived);

    for (const exp of activeExpenses) {
      const expParts = expensesContext.parts.filter((p) => p.expenseId === exp.id);
      const expPlans = expensesContext.plans.filter((pl) => pl.expenseId === exp.id);
      const expPayments = getExpenseRelatedPayments(
        expParts,
        expPlans,
        expensesContext.payments
      );

      // Shared placement rules for every linked due (plan dues, charges, recurring occurrences):
      //  - Paid: shown on the last payment date. If that payment happened before the projection
      //    started, it is already reflected in the start balance, so it is shown but not deducted.
      //  - Unpaid & due inside the range: deducted on its due date (remaining amount only).
      //  - Unpaid & overdue before the range: carried over to the projection start date, so the
      //    projection does not silently ignore money still owed.
      const pushLinked = (args: {
        rowKey: string;
        source: ProjectionRow['source'];
        sourceType: NonNullable<ProjectionRow['linkedSourceType']>;
        sourceId: string;
        /** Stable occurrence key (pre-weekend-shift date) used for exclusions. Defaults to dueDate. */
        keyDate?: ISODate;
        /** Scheduled (weekend-adjusted) due date. */
        dueDate: ISODate;
        amount: Money;
        paid: Money;
        payments: Payment[];
        name: string;
      }) => {
        const isPaid = args.paid >= args.amount && args.amount > 0;
        const lastPayDate =
          args.payments.length > 0 ? args.payments.map((p) => p.date).sort().slice(-1)[0] : undefined;
        const remaining = Math.max(0, args.amount - args.paid);
        const inRange = (d: ISODate) => d >= projection.startDate && d <= projection.endDate;

        let effectiveDate: ISODate;
        let alreadyInStartBalance = false;
        let carriedOver = false;
        if (isPaid) {
          const payDate = lastPayDate ?? args.dueDate;
          if (inRange(payDate)) {
            effectiveDate = payDate;
          } else if (payDate < projection.startDate && inRange(args.dueDate)) {
            effectiveDate = args.dueDate;
            alreadyInStartBalance = true;
          } else {
            return;
          }
        } else if (inRange(args.dueDate)) {
          effectiveDate = args.dueDate;
        } else if (args.dueDate < projection.startDate && remaining > 0) {
          effectiveDate = projection.startDate;
          carriedOver = true;
        } else {
          return;
        }

        const keyDate = args.keyDate ?? args.dueDate;
        const excluded = exclusionSet.has(`${args.sourceType}::${args.sourceId}::${keyDate}`);
        const effectiveAmount =
          excluded || alreadyInStartBalance ? 0 : isPaid ? args.paid : remaining;

        let note: string | undefined;
        if (alreadyInStartBalance && lastPayDate) {
          note = `Paid ${formatDisplayDate(lastPayDate)}, before this projection started (already in start balance)`;
        } else if (carriedOver) {
          note = `Overdue since ${formatDisplayDate(args.dueDate)}, carried over`;
        } else if (args.paid > 0 && !isPaid) {
          note = `Partially paid: ${(args.paid / 100).toFixed(2)}`;
        }

        rawRows.push({
          rowKey: args.rowKey,
          source: args.source,
          originalDate: keyDate,
          effectiveDate,
          type: 'minus',
          name: carriedOver ? `${args.name} · overdue` : args.name,
          plannedAmount: args.amount,
          effectiveAmount,
          skipped: alreadyInStartBalance,
          excluded,
          paid: isPaid,
          isLinkedFromExpense: true,
          linkedExpenseId: exp.id,
          linkedExpenseName: exp.name,
          linkedSourceType: args.sourceType,
          linkedSourceId: args.sourceId,
          note,
        });
      };

      // 2a. Plan dues & charges
      for (const plan of expPlans) {
        const sched = buildSchedule(plan, expPayments, today);

        for (const due of sched.dues) {
          const dueKey = computePlanDueKey(plan.id, due.seq);
          pushLinked({
            rowKey: `plan_due::${dueKey}::${due.dueDate}`,
            source: 'linked_plan_due',
            sourceType: 'plan_due',
            sourceId: dueKey,
            dueDate: due.dueDate,
            amount: due.amount,
            paid: due.paid,
            payments: expPayments.filter(
              (p) =>
                p.targetType === 'plan_due' &&
                (p.targetId === dueKey || (p.targetId === plan.id && p.occurrenceDate === due.dueDate))
            ),
            name:
              due.kind === 'down_payment'
                ? `${exp.name} — ${plan.name} (Down payment)`
                : `${exp.name} — ${plan.name} (${due.seq}/${plan.termCount})`,
          });
        }

        for (const ch of plan.charges || []) {
          const chPayments = expPayments.filter(
            (p) => p.targetType === 'plan_charge' && p.targetId === ch.id
          );
          pushLinked({
            rowKey: `plan_charge::${ch.id}::${ch.date}`,
            source: 'linked_plan_charge',
            sourceType: 'plan_charge',
            sourceId: ch.id,
            dueDate: ch.date,
            amount: ch.amount,
            paid: chPayments.reduce((s, p) => s + p.amount, 0),
            payments: chPayments,
            name: `${exp.name} — ${ch.reason}`,
          });
        }
      }

      // 2b. Recurring parts (non-planned). Look back so overdue occurrences can carry over.
      for (const part of expParts) {
        if (part.isPlanned || part.kind !== 'recurring' || !part.recurrence) continue;
        const occs = expand(
          part.recurrence,
          addDaysISO(projection.startDate, -RECURRING_OVERDUE_LOOKBACK_DAYS),
          projection.endDate
        );

        for (const occ of occs) {
          const occPayments = expPayments.filter(
            (p) =>
              p.targetType === 'recurring_occurrence' &&
              p.targetId === part.id &&
              (p.occurrenceDate === occ.originalDate || p.occurrenceDate === occ.effectiveDate)
          );
          pushLinked({
            rowKey: `recurring_part::${part.id}::${occ.originalDate}`,
            source: 'linked_recurring_part',
            sourceType: 'recurring_part',
            sourceId: part.id,
            keyDate: occ.originalDate,
            dueDate: occ.effectiveDate,
            amount: part.price,
            paid: occPayments.reduce((s, p) => s + p.amount, 0),
            payments: occPayments,
            name: `${exp.name} — ${part.name}`,
          });
        }
      }
    }
  }

  // 3. Add Checkpoints inside range
  for (const cp of projCheckpoints) {
    if (cp.date < projection.startDate || cp.date > projection.endDate) continue;
    rawRows.push({
      rowKey: `checkpoint::${cp.id}`,
      source: 'checkpoint',
      originalDate: cp.date,
      effectiveDate: cp.date,
      type: 'adjustment',
      name: `Balance checkpoint${cp.note ? ` (${cp.note})` : ''}`,
      plannedAmount: cp.actualBalance,
      effectiveAmount: 0, // filled during running pass
      skipped: false,
      excluded: false,
      isLinkedFromExpense: false,
      checkpointId: cp.id,
      note: cp.note,
    });
  }

  // 4. Sort chronologically, then add -> minus -> adjustment
  rawRows.sort((a, b) => {
    const dCmp = a.effectiveDate.localeCompare(b.effectiveDate);
    if (dCmp !== 0) return dCmp;
    const tCmp = TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
    if (tCmp !== 0) return tCmp;
    return a.name.localeCompare(b.name);
  });

  // 5. Compute running balances
  let running = startTotal;
  let totalIn = 0;
  let totalOut = 0;
  let lowestBalance = startTotal;
  let lowestBalanceDate = projection.startDate;

  const checkpointLookup = new Map<string, BalanceCheckpoint>();
  for (const cp of projCheckpoints) checkpointLookup.set(cp.id, cp);

  const rows: ProjectionRow[] = rawRows.map((r) => {
    let effAmt = r.effectiveAmount;

    if (r.type === 'adjustment' && r.checkpointId) {
      const cp = checkpointLookup.get(r.checkpointId);
      if (cp) {
        const diff = cp.actualBalance - running;
        running = cp.actualBalance;
        effAmt = diff;
        if (diff > 0) totalIn += diff;
        if (diff < 0) totalOut += Math.abs(diff);
      }
    } else if (!r.skipped && !r.excluded) {
      if (r.type === 'add') {
        running += effAmt;
        totalIn += effAmt;
      } else if (r.type === 'minus') {
        running -= effAmt;
        totalOut += effAmt;
      }
    }

    const runningTotal = running;
    if (runningTotal < lowestBalance) {
      lowestBalance = runningTotal;
      lowestBalanceDate = r.effectiveDate;
    }

    return {
      ...r,
      effectiveAmount: effAmt,
      runningTotal,
    };
  });

  const endBalance =
    rows.length > 0 ? rows[rows.length - 1].runningTotal : startTotal;

  // 6. Cutoff Period Grouping
  const baseCutoffs = getCutoffPeriods(
    projection.startDate,
    projection.endDate,
    settings.cutoffDays,
    settings.defaultWeekendRule
  );

  const cutoffGroups: CutoffPeriodGroup[] = [];
  if (baseCutoffs.length === 0) {
    cutoffGroups.push({
      id: `${projection.startDate}_${projection.endDate}`,
      label: `${formatDisplayDate(projection.startDate, 'MMM d')} – ${formatDisplayDate(projection.endDate, 'MMM d, yyyy')}`,
      startDate: projection.startDate,
      endDate: projection.endDate,
      paydayDate: projection.startDate,
      startBalance: startTotal,
      endBalance,
      totalIn,
      totalOut,
      rows,
    });
  } else {
    let prevEndBal = startTotal;
    for (const c of baseCutoffs) {
      const clampedStart = c.startDate < projection.startDate ? projection.startDate : c.startDate;
      const clampedEnd = c.endDate > projection.endDate ? projection.endDate : c.endDate;
      if (clampedStart > clampedEnd) continue;

      const periodRows = rows.filter(
        (r) => r.effectiveDate >= clampedStart && r.effectiveDate <= clampedEnd
      );
      let pIn = 0;
      let pOut = 0;
      for (const r of periodRows) {
        if (r.skipped || r.excluded) continue;
        if (r.type === 'add') pIn += r.effectiveAmount;
        else if (r.type === 'minus') pOut += r.effectiveAmount;
        else if (r.type === 'adjustment') {
          if (r.effectiveAmount > 0) pIn += r.effectiveAmount;
          else pOut += Math.abs(r.effectiveAmount);
        }
      }
      const pEndBal =
        periodRows.length > 0 ? periodRows[periodRows.length - 1].runningTotal : prevEndBal;
      cutoffGroups.push({
        id: c.id,
        label: `${formatDisplayDate(clampedStart, 'MMM d')} – ${formatDisplayDate(clampedEnd, 'MMM d, yyyy')}`,
        startDate: clampedStart,
        endDate: clampedEnd,
        paydayDate: c.paydayDate,
        startBalance: prevEndBal,
        endBalance: pEndBal,
        totalIn: pIn,
        totalOut: pOut,
        rows: periodRows,
      });
      prevEndBal = pEndBal;
    }
  }

  // 7. Build Timeline (daily or key-date series across range for smooth area/line chart)
  const rowsByDate = new Map<ISODate, ProjectionRow[]>();
  for (const r of rows) {
    const arr = rowsByDate.get(r.effectiveDate) ?? [];
    arr.push(r);
    rowsByDate.set(r.effectiveDate, arr);
  }

  const timeline: ProjectionTimelinePoint[] = [];
  let cursor = projection.startDate;
  let curBal = startTotal;
  let guard = 0;
  // Determine threshold for "big minus" marker (e.g. >= 10% of startTotal or >= 10000_00 cents)
  const bigMinusThreshold = Math.max(1000000, Math.round(startTotal * 0.15));

  while (cursor <= projection.endDate && guard < MAX_TIMELINE_DAYS) {
    guard++;
    const dayRows = rowsByDate.get(cursor) ?? [];
    let hasPayday = false;
    let hasBigMinus = false;
    let bigMinusLabel: string | undefined;

    if (dayRows.length > 0) {
      curBal = dayRows[dayRows.length - 1].runningTotal;
      for (const r of dayRows) {
        if (r.isPayday && !r.skipped && r.effectiveAmount > 0) hasPayday = true;
        if (
          r.type === 'minus' &&
          !r.skipped &&
          !r.excluded &&
          r.effectiveAmount >= bigMinusThreshold
        ) {
          hasBigMinus = true;
          bigMinusLabel = r.name;
        }
      }
    }

    const cutoffIdx = Math.max(
      0,
      cutoffGroups.findIndex((g) => cursor >= g.startDate && cursor <= g.endDate)
    );
    timeline.push({
      date: cursor,
      total: curBal,
      cutoffBandIndex: cutoffIdx,
      hasPayday,
      hasBigMinus,
      bigMinusLabel,
    });

    cursor = addDaysISO(cursor, 1);
  }

  return {
    projection,
    items: projItems,
    overrides: projOverrides,
    exclusions: projExclusions,
    checkpoints: projCheckpoints,
    rows,
    cutoffGroups,
    timeline,
    summary: {
      startTotal,
      endBalance,
      lowestBalance,
      lowestBalanceDate,
      totalIn,
      totalOut,
    },
  };
}

export function checkAffordability(
  projection: Projection,
  items: ProjectionItem[],
  overrides: OccurrenceOverride[],
  exclusions: LinkedExclusion[],
  checkpoints: BalanceCheckpoint[],
  expensesContext: ExpensesContext,
  settings: Pick<Settings, 'cutoffDays' | 'defaultWeekendRule'>,
  date: ISODate,
  amount: Money,
  label = 'Hypothetical purchase',
  today: ISODate = todayISODate()
): AffordabilityResult {
  const baseline = runProjection(
    projection,
    items,
    overrides,
    exclusions,
    checkpoints,
    expensesContext,
    settings,
    today
  );

  // Find baseline balance on `date`
  const basePointOnDate =
    baseline.timeline.find((pt) => pt.date === date) ??
    baseline.timeline.filter((pt) => pt.date <= date).slice(-1)[0];
  const balanceBeforeOnDate = basePointOnDate
    ? basePointOnDate.total
    : baseline.summary.startTotal;

  const syntheticItem: ProjectionItem = {
    id: '__affordability_probe__',
    projectionId: projection.id,
    type: 'minus',
    name: label,
    amount,
    recurrence: {
      freq: 'once',
      interval: 1,
      startDate: date,
      weekendRule: 'none',
    },
  };

  const withPurchase = runProjection(
    projection,
    [...items, syntheticItem],
    overrides,
    exclusions,
    checkpoints,
    expensesContext,
    settings,
    today
  );

  const afterPointOnDate =
    withPurchase.timeline.find((pt) => pt.date === date) ??
    withPurchase.timeline.filter((pt) => pt.date <= date).slice(-1)[0];
  const balanceAfterOnDate = afterPointOnDate
    ? afterPointOnDate.total
    : balanceBeforeOnDate - amount;

  const pointsAfter = withPurchase.timeline.filter((pt) => pt.date >= date);
  let lowestBalanceAfter = balanceAfterOnDate;
  let lowestBalanceAfterDate = date;
  let firstNegativeDate: ISODate | null = null;

  for (const pt of pointsAfter) {
    if (pt.total < lowestBalanceAfter) {
      lowestBalanceAfter = pt.total;
      lowestBalanceAfterDate = pt.date;
    }
    if (pt.total < 0 && !firstNegativeDate) {
      firstNegativeDate = pt.date;
    }
  }

  const goesNegative = lowestBalanceAfter < 0;
  // Tight if lowest drops below 10% of start balance or below 5,000 PHP (500000 cents)
  const tightBuffer = Math.max(500000, Math.round(baseline.summary.startTotal * 0.1));
  const verdict: AffordabilityResult['verdict'] = goesNegative
    ? 'negative'
    : lowestBalanceAfter < tightBuffer
      ? 'tight'
      : 'comfortable';

  return {
    date,
    amount,
    balanceBeforeOnDate,
    balanceAfterOnDate,
    lowestBalanceAfter,
    lowestBalanceAfterDate,
    endBalance: withPurchase.summary.endBalance,
    goesNegative,
    firstNegativeDate,
    verdict,
  };
}
