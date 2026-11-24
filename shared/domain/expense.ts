import {
  Expense,
  ExpenseCumulativePoint,
  ExpenseStatus,
  ExpenseSummary,
  InstallmentPlan,
  ISODate,
  Money,
  Part,
  PartSummary,
  Payment,
  PlanScheduleResult,
  Settings,
} from '../types';
import { addMonthsISO, todayISODate } from './date';
import { buildSchedule, computePlanDueKey } from './installment';
import { expand } from './recurrence';

export function getExpenseRelatedPayments(
  expenseParts: Part[],
  expensePlans: InstallmentPlan[],
  allPayments: Payment[]
): Payment[] {
  const partIds = new Set(expenseParts.map((p) => p.id));
  const planIds = new Set(expensePlans.map((pl) => pl.id));
  const chargeIds = new Set<string>();
  const planDueKeys = new Set<string>();

  for (const pl of expensePlans) {
    for (const ch of pl.charges || []) {
      chargeIds.add(ch.id);
    }
    const maxTerms = Math.max(1, pl.termCount || 1);
    for (let seq = 0; seq <= maxTerms; seq++) {
      planDueKeys.add(computePlanDueKey(pl.id, seq));
    }
  }

  return allPayments.filter((p) => {
    if (p.targetType === 'part' || p.targetType === 'recurring_occurrence') {
      return partIds.has(p.targetId);
    }
    if (p.targetType === 'plan_due') {
      return planDueKeys.has(p.targetId) || planIds.has(p.targetId);
    }
    if (p.targetType === 'plan_charge') {
      return chargeIds.has(p.targetId);
    }
    return false;
  });
}

export function summarizeExpense(
  expense: Expense,
  parts: Part[],
  plans: InstallmentPlan[],
  payments: Payment[],
  settings: Pick<Settings, 'upcomingHorizonMonths'>,
  today: ISODate = todayISODate()
): ExpenseSummary {
  const expenseParts = parts.filter((p) => p.expenseId === expense.id);
  const expensePlans = plans.filter((pl) => pl.expenseId === expense.id);
  const relatedPayments = getExpenseRelatedPayments(expenseParts, expensePlans, payments);

  const planSchedules: PlanScheduleResult[] = expensePlans.map((pl) =>
    buildSchedule(pl, relatedPayments, today)
  );

  // Build map of how much each part receives in paid, remaining, and financing share from plans
  const partPlanShares: Record<
    string,
    { allocatedPrincipal: Money; financingShare: Money; paidAllocated: Money; remainingAllocated: Money }
  > = {};

  for (const sched of planSchedules) {
    const allocs = sched.plan.partAllocations || [];
    const totalAlloc = allocs.reduce((s, a) => s + Math.max(0, a.amount), 0);
    for (const alloc of allocs) {
      const ratio =
        totalAlloc > 0
          ? Math.max(0, alloc.amount) / totalAlloc
          : 1 / Math.max(1, allocs.length);
      const financingShare = sched.partFinancingShares[alloc.partId] ?? 0;
      const paidShare = Math.round(sched.totalPaid * ratio);
      const remShare = Math.round(sched.totalRemaining * ratio);
      const cur = partPlanShares[alloc.partId] ?? {
        allocatedPrincipal: 0,
        financingShare: 0,
        paidAllocated: 0,
        remainingAllocated: 0,
      };
      cur.allocatedPrincipal += alloc.amount;
      cur.financingShare += financingShare;
      cur.paidAllocated += paidShare;
      cur.remainingAllocated += remShare;
      partPlanShares[alloc.partId] = cur;
    }
  }

  const horizonEnd = addMonthsISO(today, Math.max(1, settings.upcomingHorizonMonths || 12));
  const dueCandidates: { date: ISODate; amount: Money; label: string }[] = [];
  let overdueCount = 0;

  // Plan dues & charges contribute to overdue & upcoming due candidates
  for (const sched of planSchedules) {
    overdueCount += sched.overdueCount;
    if (sched.nextDue) {
      dueCandidates.push({
        date: sched.nextDue.dueDate,
        amount: Math.max(0, sched.nextDue.amount - sched.nextDue.paid),
        label:
          sched.nextDue.kind === 'down_payment'
            ? `${sched.plan.name} (Down payment)`
            : `${sched.plan.name} (#${sched.nextDue.seq}/${sched.plan.termCount})`,
      });
    }
    for (const ch of sched.plan.charges || []) {
      const chPaid = relatedPayments
        .filter((p) => p.targetType === 'plan_charge' && p.targetId === ch.id)
        .reduce((s, p) => s + p.amount, 0);
      const chRem = Math.max(0, ch.amount - chPaid);
      if (chRem > 0) {
        if (ch.date < today) overdueCount++;
        dueCandidates.push({
          date: ch.date,
          amount: chRem,
          label: `${sched.plan.name}: ${ch.reason}`,
        });
      }
    }
  }

  const coveredPartIds = new Set<string>();
  for (const pl of expensePlans) {
    for (const a of pl.partAllocations || []) {
      coveredPartIds.add(a.partId);
    }
  }

  let directPartRemaining = 0;
  let recurringRemaining = 0;
  let plannedEstimated = 0;

  const partSummaries: PartSummary[] = expenseParts.map((part) => {
    if (part.isPlanned) {
      plannedEstimated += part.price;
      return {
        part,
        paid: 0,
        remaining: 0,
        plannedAmount: part.price,
        shareOfInterest: 0,
        totalCost: part.price,
        nextDueDate: null,
        nextDueAmount: 0,
        overdueCount: 0,
        upcomingOccurrencesCount: 0,
      };
    }

    if (part.kind === 'recurring' && part.recurrence) {
      const recEnd =
        part.recurrence.endDate && part.recurrence.endDate < horizonEnd
          ? part.recurrence.endDate
          : horizonEnd;
      const occurrences = expand(part.recurrence, part.recurrence.startDate, recEnd);
      const occPayments = relatedPayments.filter(
        (p) => p.targetType === 'recurring_occurrence' && p.targetId === part.id
      );

      let paidTotal = 0;
      let remTotal = 0;
      let partOverdue = 0;
      let nextDate: ISODate | null = null;
      let nextAmt = 0;
      let upcomingCount = 0;

      // Also include any payments without occurrenceDate
      const unmatchedPaid = occPayments
        .filter((p) => !p.occurrenceDate)
        .reduce((s, p) => s + p.amount, 0);
      paidTotal += unmatchedPaid;

      for (const occ of occurrences) {
        const occPaid = occPayments
          .filter(
            (p) =>
              p.occurrenceDate === occ.originalDate || p.occurrenceDate === occ.effectiveDate
          )
          .reduce((s, p) => s + p.amount, 0);
        paidTotal += occPaid;
        const occRem = Math.max(0, part.price - occPaid);
        if (occRem > 0) {
          remTotal += occRem;
          if (occ.effectiveDate < today) {
            partOverdue++;
          } else {
            upcomingCount++;
          }
          if (!nextDate) {
            nextDate = occ.effectiveDate;
            nextAmt = occRem;
          }
        }
      }

      overdueCount += partOverdue;
      recurringRemaining += remTotal;
      if (nextDate && nextAmt > 0) {
        dueCandidates.push({ date: nextDate, amount: nextAmt, label: part.name });
      }

      return {
        part,
        paid: paidTotal,
        remaining: remTotal,
        plannedAmount: 0,
        shareOfInterest: 0,
        totalCost: paidTotal + remTotal,
        nextDueDate: nextDate,
        nextDueAmount: nextAmt,
        overdueCount: partOverdue,
        upcomingOccurrencesCount: upcomingCount,
      };
    }

    // One-time part
    const isCoveredByPlan = coveredPartIds.has(part.id);
    if (isCoveredByPlan) {
      const share = partPlanShares[part.id] ?? {
        allocatedPrincipal: part.price,
        financingShare: 0,
        paidAllocated: 0,
        remainingAllocated: part.price,
      };
      const directPaid = relatedPayments
        .filter((p) => p.targetType === 'part' && p.targetId === part.id)
        .reduce((s, p) => s + p.amount, 0);
      const paid = share.paidAllocated + directPaid;
      const remaining = Math.max(0, share.remainingAllocated - directPaid);
      return {
        part,
        paid,
        remaining,
        plannedAmount: 0,
        shareOfInterest: share.financingShare,
        totalCost: part.price + share.financingShare,
        nextDueDate: null,
        nextDueAmount: 0,
        overdueCount: 0,
        upcomingOccurrencesCount: 0,
      };
    }

    // Direct one-time (full or flexible)
    const directPaid = relatedPayments
      .filter((p) => p.targetType === 'part' && p.targetId === part.id)
      .reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, part.price - directPaid);
    directPartRemaining += remaining;

    return {
      part,
      paid: directPaid,
      remaining,
      plannedAmount: 0,
      shareOfInterest: 0,
      totalCost: Math.max(part.price, directPaid),
      nextDueDate: null,
      nextDueAmount: 0,
      overdueCount: 0,
      upcomingOccurrencesCount: 0,
    };
  });

  const paidSoFar = relatedPayments.reduce((s, p) => s + p.amount, 0);
  const plansRemaining = planSchedules.reduce((s, sc) => s + sc.totalRemaining, 0);
  const remainingCommitted = directPartRemaining + plansRemaining + recurringRemaining;
  const trueTotal = paidSoFar + remainingCommitted;
  const costOfFinancing = planSchedules.reduce(
    (s, sc) => s + sc.totalInterest + sc.totalFees + sc.totalCharges,
    0
  );
  // Unpaid share of financing: unpaid charges in full, plus the interest/fee portion of unpaid
  // installments (each installment carries interest + fees in the same proportion).
  const financingRemaining = planSchedules.reduce((sum, sc) => {
    const installments = sc.dues.filter((d) => d.kind === 'installment');
    const instTotal = installments.reduce((s, d) => s + d.amount, 0);
    const instUnpaid = installments.reduce((s, d) => s + Math.max(0, d.amount - d.paid), 0);
    const financed = sc.totalInterest + sc.totalFees;
    const unpaidCharges = sc.plan.charges.reduce((s, ch) => {
      const paid = relatedPayments
        .filter((p) => p.targetType === 'plan_charge' && p.targetId === ch.id)
        .reduce((x, p) => x + p.amount, 0);
      return s + Math.max(0, ch.amount - paid);
    }, 0);
    const share = instTotal > 0 ? Math.round((instUnpaid * financed) / instTotal) : 0;
    return sum + share + unpaidCharges;
  }, 0);

  dueCandidates.sort((a, b) => a.date.localeCompare(b.date));
  const nextDue = dueCandidates[0] ?? null;

  let status: ExpenseStatus = 'active';
  const hasCommittedParts = expenseParts.some((p) => !p.isPlanned);
  if (!hasCommittedParts && plannedEstimated > 0 && paidSoFar === 0) {
    status = 'planned';
  } else if (remainingCommitted === 0 && paidSoFar > 0 && overdueCount === 0) {
    status = 'fully_paid';
  } else if (remainingCommitted === 0 && plannedEstimated > 0 && paidSoFar === 0) {
    status = 'planned';
  }

  // Build cumulative series: past payments + future committed dues
  const paidByDate = new Map<ISODate, Money>();
  for (const p of relatedPayments) {
    paidByDate.set(p.date, (paidByDate.get(p.date) ?? 0) + p.amount);
  }
  const futureByDate = new Map<ISODate, Money>();
  for (const sched of planSchedules) {
    for (const d of sched.dues) {
      const rem = Math.max(0, d.amount - d.paid);
      if (rem > 0 && d.dueDate >= today) {
        futureByDate.set(d.dueDate, (futureByDate.get(d.dueDate) ?? 0) + rem);
      }
    }
  }
  for (const part of expenseParts) {
    if (!part.isPlanned && part.kind === 'recurring' && part.recurrence) {
      const recEnd =
        part.recurrence.endDate && part.recurrence.endDate < horizonEnd
          ? part.recurrence.endDate
          : horizonEnd;
      const occs = expand(part.recurrence, today, recEnd);
      for (const occ of occs) {
        const paid = relatedPayments
          .filter(
            (p) =>
              p.targetType === 'recurring_occurrence' &&
              p.targetId === part.id &&
              (p.occurrenceDate === occ.originalDate || p.occurrenceDate === occ.effectiveDate)
          )
          .reduce((s, p) => s + p.amount, 0);
        const rem = Math.max(0, part.price - paid);
        if (rem > 0) {
          futureByDate.set(occ.effectiveDate, (futureByDate.get(occ.effectiveDate) ?? 0) + rem);
        }
      }
    }
  }

  const cumulativeSeries: ExpenseCumulativePoint[] = [];
  const sortedPaidDates = [...paidByDate.keys()].sort();
  let running = 0;
  for (const dt of sortedPaidDates) {
    running += paidByDate.get(dt) ?? 0;
    cumulativeSeries.push({
      date: dt,
      paidCumulative: running,
      projectedCumulative: dt === today ? running : null,
      label: dt,
    });
  }
  if (!paidByDate.has(today)) {
    cumulativeSeries.push({
      date: today,
      paidCumulative: running,
      projectedCumulative: running,
      label: today,
    });
  } else {
    const idx = cumulativeSeries.findIndex((pt) => pt.date === today);
    if (idx >= 0) cumulativeSeries[idx].projectedCumulative = cumulativeSeries[idx].paidCumulative;
  }

  const sortedFutureDates = [...futureByDate.keys()].filter((d) => d > today).sort();
  let projRunning = running;
  for (const dt of sortedFutureDates) {
    projRunning += futureByDate.get(dt) ?? 0;
    cumulativeSeries.push({
      date: dt,
      paidCumulative: null,
      projectedCumulative: projRunning,
      label: dt,
    });
  }
  cumulativeSeries.sort((a, b) => a.date.localeCompare(b.date));

  return {
    expense,
    status,
    paidSoFar,
    remainingCommitted,
    plannedEstimated,
    trueTotal,
    costOfFinancing,
    financingRemaining,
    nextDueDate: nextDue ? nextDue.date : null,
    nextDueAmount: nextDue ? nextDue.amount : 0,
    nextDueLabel: nextDue ? nextDue.label : null,
    overdueCount,
    partSummaries,
    planSchedules,
    cumulativeSeries,
  };
}
