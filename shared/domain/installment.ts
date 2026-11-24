import {
  DueStatus,
  InstallmentPlan,
  ISODate,
  Money,
  Payment,
  PlanDue,
  PlanScheduleResult,
  RecurrenceRule,
} from '../types';
import { adjustWeekend, todayISODate } from './date';
import { expand } from './recurrence';

export function computePlanDueKey(planId: string, seq: number): string {
  return `${planId}:${seq}`;
}

export function getPlanDueStatus(
  amount: Money,
  paid: Money,
  dueDate: ISODate,
  today: ISODate
): DueStatus {
  if (paid >= amount && amount > 0) return 'paid';
  if (amount === 0 && paid >= 0) return 'paid';
  if (dueDate < today) return 'overdue';
  if (paid > 0) return 'partial';
  if (dueDate === today) return 'due_today';
  return 'upcoming';
}

/** Semi-monthly dues follow the first due date: e.g. first due on the 5th → 5th & 20th. */
export function semiMonthlyDays(firstDueDate: ISODate): number[] {
  const day = Number(firstDueDate.slice(8, 10)) || 1;
  const other = day <= 15 ? day + 15 : day - 15;
  return [Math.min(day, other), Math.max(day, other)];
}

export function generatePlanDueDates(plan: InstallmentPlan): ISODate[] {
  const count = Math.max(1, plan.termCount || 1);
  const ruleFreq: RecurrenceRule['freq'] =
    plan.frequency === 'monthly'
      ? 'monthly'
      : plan.frequency === 'semi_monthly'
        ? 'semi_monthly'
        : plan.frequency === 'biweekly'
          ? 'biweekly'
          : 'weekly';

  const rule: RecurrenceRule = {
    freq: ruleFreq,
    interval: 1,
    startDate: plan.firstDueDate,
    count,
    weekendRule: plan.weekendRule,
    ...(ruleFreq === 'semi_monthly' ? { byMonthDays: semiMonthlyDays(plan.firstDueDate) } : {}),
  };

  // Expand far enough to guarantee `count` occurrences
  const farTo = '2099-12-31';
  const occurrences = expand(rule, '1900-01-01', farTo);
  return occurrences.slice(0, count).map((o) => o.effectiveDate);
}

export function allocateFinancingCost(
  plan: InstallmentPlan,
  totalFinancingCost: Money
): Record<string, Money> {
  const result: Record<string, Money> = {};
  const allocations = plan.partAllocations || [];
  if (allocations.length === 0) return result;

  const totalAllocated = allocations.reduce((sum, a) => sum + Math.max(0, a.amount), 0);
  if (totalAllocated <= 0) {
    const equalShare = Math.floor(totalFinancingCost / allocations.length);
    let rem = totalFinancingCost - equalShare * allocations.length;
    allocations.forEach((a) => {
      result[a.partId] = (result[a.partId] ?? 0) + equalShare + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    });
    return result;
  }

  let assigned = 0;
  allocations.forEach((a, idx) => {
    if (idx === allocations.length - 1) {
      result[a.partId] = (result[a.partId] ?? 0) + (totalFinancingCost - assigned);
    } else {
      const share = Math.round((Math.max(0, a.amount) / totalAllocated) * totalFinancingCost);
      result[a.partId] = (result[a.partId] ?? 0) + share;
      assigned += share;
    }
  });
  return result;
}

export function buildSchedule(
  plan: InstallmentPlan,
  payments: Payment[] = [],
  today: ISODate = todayISODate()
): PlanScheduleResult {
  const termCount = Math.max(1, plan.termCount || 1);
  const principal = Math.max(0, plan.principal);
  const downPayment = Math.min(principal, Math.max(0, plan.downPayment || 0));
  const remainingPrincipal = Math.max(0, principal - downPayment);

  let totalInterest = 0;
  if (plan.interestMode === 'fixed_amount') {
    totalInterest = Math.max(0, Math.round(plan.interestValue || 0));
  } else if (plan.interestMode === 'add_on_rate') {
    // interestValue is monthly % (e.g. 0.5 means 0.5%)
    totalInterest = Math.round(remainingPrincipal * ((plan.interestValue || 0) / 100) * termCount);
  } else if (plan.interestMode === 'from_installment_amount') {
    const inst = Math.max(0, Math.round(plan.installmentAmount || 0));
    totalInterest = Math.max(0, inst * termCount - remainingPrincipal);
  }

  const totalFees = Math.max(0, Math.round(plan.fees || 0));
  const totalCharges = (plan.charges || []).reduce((s, c) => s + Math.max(0, c.amount), 0);

  const financedTotal = remainingPrincipal + totalInterest;
  const basePerInstallment = Math.floor(financedTotal / termCount);
  const baseRemainder = financedTotal - basePerInstallment * termCount;

  const feePerInstallment = plan.feesSpread === 'all_dues' ? Math.floor(totalFees / termCount) : 0;
  const feeRemainder =
    plan.feesSpread === 'all_dues' ? totalFees - feePerInstallment * termCount : 0;

  const dueDates = generatePlanDueDates(plan);
  const dues: PlanDue[] = [];

  const getPaidForDue = (seq: number, dueDate: ISODate): Money => {
    const key = computePlanDueKey(plan.id, seq);
    return payments
      .filter(
        (p) =>
          p.targetType === 'plan_due' &&
          (p.targetId === key || (p.targetId === plan.id && p.occurrenceDate === dueDate))
      )
      .reduce((s, p) => s + p.amount, 0);
  };

  if (downPayment > 0) {
    const dpDateRaw = plan.downPaymentDate || plan.firstDueDate;
    const dpDate = adjustWeekend(dpDateRaw, plan.weekendRule);
    const paid = getPaidForDue(0, dpDate);
    dues.push({
      planId: plan.id,
      seq: 0,
      dueDate: dpDate,
      amount: downPayment,
      kind: 'down_payment',
      paid,
      status: getPlanDueStatus(downPayment, paid, dpDate, today),
    });
  }

  for (let i = 0; i < termCount; i++) {
    const seq = i + 1;
    const isFirst = i === 0;
    const isLast = i === termCount - 1;
    let amount = basePerInstallment;
    if (isLast) amount += baseRemainder;
    if (plan.feesSpread === 'first_due' && isFirst) {
      amount += totalFees;
    } else if (plan.feesSpread === 'all_dues') {
      amount += feePerInstallment;
      if (isLast) amount += feeRemainder;
    }
    const dueDate = dueDates[i] ?? plan.firstDueDate;
    const paid = getPaidForDue(seq, dueDate);
    dues.push({
      planId: plan.id,
      seq,
      dueDate,
      amount,
      kind: 'installment',
      paid,
      status: getPlanDueStatus(amount, paid, dueDate, today),
    });
  }

  const chargesPaid = (plan.charges || []).reduce((sum, ch) => {
    const pSum = payments
      .filter((p) => p.targetType === 'plan_charge' && p.targetId === ch.id)
      .reduce((s, p) => s + p.amount, 0);
    return sum + Math.min(ch.amount, pSum);
  }, 0);

  const duesTotal = dues.reduce((s, d) => s + d.amount, 0);
  const duesPaid = dues.reduce((s, d) => s + Math.min(d.amount, d.paid), 0);

  const totalPayable = duesTotal + totalCharges;
  const totalPaid = duesPaid + chargesPaid;
  const totalRemaining = Math.max(0, totalPayable - totalPaid);

  const installmentDues = dues.filter((d) => d.kind === 'installment');
  const paidCount = installmentDues.filter((d) => d.status === 'paid').length;
  const overdueCount = dues.filter((d) => d.status === 'overdue').length;
  const nextDue = dues.find((d) => d.status !== 'paid') ?? null;

  const regularInstallmentAmount =
    plan.interestMode === 'from_installment_amount' && plan.installmentAmount
      ? plan.installmentAmount + (plan.feesSpread === 'all_dues' ? feePerInstallment : 0)
      : basePerInstallment + (plan.feesSpread === 'all_dues' ? feePerInstallment : 0);

  const partFinancingShares = allocateFinancingCost(
    plan,
    totalInterest + totalFees + totalCharges
  );

  return {
    plan,
    dues,
    remainingPrincipal,
    totalInterest,
    totalFees,
    totalCharges,
    totalPayable,
    totalPaid,
    totalRemaining,
    regularInstallmentAmount,
    paidCount,
    overdueCount,
    nextDue,
    partFinancingShares,
  };
}
