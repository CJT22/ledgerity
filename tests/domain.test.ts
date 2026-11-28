import { describe, expect, it } from 'vitest';
import {
  adjustWeekend,
  allocateFinancingCost,
  buildSchedule,
  expand,
  getCutoffPeriods,
  normalizeRecurrence,
  runProjection,
  startTotalOf,
  summarizeExpense,
} from '@shared/domain';
import { createSeedState } from '@shared/seed';
import type {
  Expense,
  InstallmentPlan,
  Part,
  Payment,
  Projection,
  RecurrenceRule,
} from '@shared/types';

const rule = (r: Partial<RecurrenceRule>): RecurrenceRule => ({
  freq: 'once',
  interval: 1,
  startDate: '2026-01-01',
  weekendRule: 'none',
  ...r,
});

describe('weekend adjustment', () => {
  it('moves Saturday and Sunday to the Monday after (default rule)', () => {
    expect(adjustWeekend('2026-10-10', 'next_business_day')).toBe('2026-10-12'); // Sat → Mon
    expect(adjustWeekend('2026-10-25', 'next_business_day')).toBe('2026-10-26'); // Sun → Mon
    expect(adjustWeekend('2026-11-24', 'next_business_day')).toBe('2026-11-24'); // Tue unchanged
  });

  it('supports Friday before and no adjustment', () => {
    expect(adjustWeekend('2026-10-25', 'previous_business_day')).toBe('2026-10-23');
    expect(adjustWeekend('2026-10-25', 'none')).toBe('2026-10-25');
  });
});

describe('recurrence expansion', () => {
  it('semi-monthly 10th & 25th, keeping the original date as the key', () => {
    const occ = expand(
      rule({ freq: 'semi_monthly', byMonthDays: [10, 25], startDate: '2026-10-01', weekendRule: 'next_business_day' }),
      '2026-10-01',
      '2026-11-30'
    );
    expect(occ).toEqual([
      { originalDate: '2026-10-10', effectiveDate: '2026-10-12' },
      { originalDate: '2026-10-25', effectiveDate: '2026-10-26' },
      { originalDate: '2026-11-10', effectiveDate: '2026-11-10' },
      { originalDate: '2026-11-25', effectiveDate: '2026-11-25' },
    ]);
  });

  it('clamps day 31 / last day to short months', () => {
    const occ = expand(
      rule({ freq: 'monthly', byMonthDays: [31], startDate: '2027-01-01' }),
      '2027-01-01',
      '2027-03-31'
    );
    expect(occ.map((o) => o.originalDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('respects count and end date', () => {
    expect(expand(rule({ freq: 'weekly', count: 3 }), '2026-01-01', '2026-12-31')).toHaveLength(3);
    expect(
      expand(rule({ freq: 'monthly', endDate: '2026-03-15' }), '2026-01-01', '2026-12-31').map(
        (o) => o.originalDate
      )
    ).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('custom: produces exactly the picked dates, sorted and de-duplicated, within the window', () => {
    const r = rule({
      freq: 'custom',
      startDate: '2026-11-03',
      dates: ['2026-12-19', '2026-11-03', '2026-11-28', '2026-11-28', '2027-02-01'],
    });
    expect(expand(r, '2026-11-01', '2026-12-31').map((o) => o.originalDate)).toEqual([
      '2026-11-03',
      '2026-11-28',
      '2026-12-19',
    ]);
  });

  it('legacy biweekly normalizes to weekly × 2 with identical dates', () => {
    const legacy = rule({ freq: 'biweekly', startDate: '2026-11-06' });
    const norm = normalizeRecurrence(legacy);
    expect(norm.freq).toBe('weekly');
    expect(norm.interval).toBe(2);
    expect(expand(norm, '2026-11-01', '2027-03-01')).toEqual(expand(legacy, '2026-11-01', '2027-03-01'));
  });
});

describe('cutoff periods', () => {
  it('starts each period on the actual (weekend-adjusted) payday', () => {
    // 2026-10-10 is a Saturday → paid Monday the 12th; 2026-10-25 is a Sunday → Monday the 26th
    const periods = getCutoffPeriods('2026-10-12', '2026-11-09', [10, 25], 'next_business_day');
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ['2026-10-12', '2026-10-25'],
      ['2026-10-26', '2026-11-09'],
    ]);
  });
});

const basePlan = (p: Partial<InstallmentPlan>): InstallmentPlan => ({
  id: 'plan',
  expenseId: 'exp',
  name: 'Plan',
  partAllocations: [],
  principal: 0,
  downPayment: 0,
  interestMode: 'none',
  interestValue: 0,
  fees: 0,
  feesSpread: 'first_due',
  termCount: 12,
  frequency: 'monthly',
  firstDueDate: '2026-01-15',
  weekendRule: 'none',
  charges: [],
  ...p,
});

describe('installment schedule', () => {
  it('add-on rate: interest and fees are included in the total and dues sum exactly', () => {
    const plan = basePlan({
      principal: 6_300_000, // ₱63,000 (GPU + CPU)
      interestMode: 'add_on_rate',
      interestValue: 0.5,
      fees: 100_000,
      feesSpread: 'all_dues',
      partAllocations: [
        { partId: 'gpu', amount: 4_500_000 },
        { partId: 'cpu', amount: 1_800_000 },
      ],
    });
    const s = buildSchedule(plan, [], '2026-01-01');
    expect(s.totalInterest).toBe(378_000); // 63,000 × 0.5% × 12 = ₱3,780
    expect(s.totalFees).toBe(100_000);
    expect(s.totalPayable).toBe(6_300_000 + 378_000 + 100_000);
    expect(s.dues.reduce((sum, d) => sum + d.amount, 0)).toBe(s.totalPayable);
    // Rounding remainder lands on the last due only
    const amounts = new Set(s.dues.slice(0, -1).map((d) => d.amount));
    expect(amounts.size).toBe(1);
  });

  it('from installment amount: derives interest from the monthly payment, after down payment', () => {
    const plan = basePlan({
      principal: 85_000_000,
      downPayment: 17_000_000,
      downPaymentDate: '2026-01-01',
      interestMode: 'from_installment_amount',
      installmentAmount: 2_350_000,
      termCount: 36,
    });
    const s = buildSchedule(plan, [], '2026-01-01');
    expect(s.totalInterest).toBe(2_350_000 * 36 - (85_000_000 - 17_000_000)); // ₱166,000
    expect(s.dues[0]).toMatchObject({ kind: 'down_payment', amount: 17_000_000, seq: 0 });
    expect(s.dues.filter((d) => d.kind === 'installment')).toHaveLength(36);
  });

  it('tracks paid / overdue status from payments', () => {
    const plan = basePlan({ principal: 1_200_000, termCount: 3 });
    const pays: Payment[] = [
      { id: 'p1', date: '2026-01-15', amount: 400_000, targetType: 'plan_due', targetId: 'plan:1' },
    ];
    const s = buildSchedule(plan, pays, '2026-03-01');
    expect(s.dues.map((d) => d.status)).toEqual(['paid', 'overdue', 'upcoming']);
    expect(s.totalPaid).toBe(400_000);
    expect(s.totalRemaining).toBe(800_000);
  });

  it('allocates financing cost across grouped parts proportionally, summing exactly', () => {
    const shares = allocateFinancingCost(
      basePlan({
        partAllocations: [
          { partId: 'a', amount: 1 },
          { partId: 'b', amount: 1 },
          { partId: 'c', amount: 1 },
        ],
      }),
      100
    );
    expect(shares.a + shares.b + shares.c).toBe(100);
  });
});

describe('expense summary', () => {
  it('paid so far equals the sum of the expense payments, and planned is kept separate', () => {
    const state = createSeedState('2026-11-24');
    for (const exp of state.expenses) {
      const s = summarizeExpense(exp, state.parts, state.plans, state.payments, state.settings, '2026-11-24');
      const ids = new Set(s.partSummaries.map((p) => p.part.id));
      expect(s.trueTotal).toBe(s.paidSoFar + s.remainingCommitted);
      expect(s.plannedEstimated).toBe(
        state.parts.filter((p) => ids.has(p.id) && p.isPlanned).reduce((sum, p) => sum + p.price, 0)
      );
    }
    const pc = summarizeExpense(
      state.expenses.find((e) => e.id === 'exp_pc')!,
      state.parts,
      state.plans,
      state.payments,
      state.settings,
      '2026-11-24'
    );
    expect(pc.costOfFinancing).toBe(378_000 + 100_000 + 50_000); // interest + fee + late fee
  });
});

describe('projection engine', () => {
  const exp: Expense = { id: 'e', name: 'Car', icon: '🚗', color: '#000', archived: false };
  const part: Part = {
    id: 'unit',
    expenseId: 'e',
    name: 'Unit',
    kind: 'one_time',
    isPlanned: false,
    price: 300_000,
    paymentMode: 'installment',
  };
  const plan = basePlan({
    id: 'pl',
    expenseId: 'e',
    principal: 300_000,
    termCount: 3,
    firstDueDate: '2026-11-15',
    partAllocations: [{ partId: 'unit', amount: 300_000 }],
  });
  const proj: Projection = {
    id: 'pr',
    name: 'P',
    startDate: '2026-12-01',
    endDate: '2027-01-31',
    includeExpenseDues: true,
    startSources: [{ label: 'Starting balance', amount: 1_000_000 }],
  };
  const settings = { cutoffDays: [10, 25], defaultWeekendRule: 'next_business_day' as const };

  const run = (payments: Payment[], today = '2026-12-01') =>
    runProjection(proj, [], [], [], [], { expenses: [exp], parts: [part], plans: [plan], payments }, settings, today);

  it('carries an unpaid overdue due into the projection start instead of dropping it', () => {
    // Due #1 (Nov 15) is before the projection and unpaid → must still be deducted
    const r = run([]);
    const carried = r.rows.find((x) => x.linkedSourceId === 'pl:1')!;
    expect(carried.effectiveDate).toBe('2026-12-01');
    expect(carried.name).toContain('overdue');
    expect(r.summary.endBalance).toBe(1_000_000 - 300_000);
  });

  it('does not deduct a due again when it was paid before the projection started', () => {
    // Due #2 (Dec 15) paid early on Nov 30: already reflected in the start balance
    const r = run([
      { id: 'a', date: '2026-11-15', amount: 100_000, targetType: 'plan_due', targetId: 'pl:1' },
      { id: 'b', date: '2026-11-30', amount: 100_000, targetType: 'plan_due', targetId: 'pl:2' },
    ]);
    const early = r.rows.find((x) => x.linkedSourceId === 'pl:2')!;
    expect(early.effectiveAmount).toBe(0);
    expect(early.skipped).toBe(true);
    expect(r.summary.endBalance).toBe(1_000_000 - 100_000); // only due #3
  });

  it('honours exclusions keyed by the original due date', () => {
    const r = runProjection(
      proj,
      [],
      [],
      [{ projectionId: 'pr', sourceType: 'plan_due', sourceId: 'pl:3', occurrenceDate: '2027-01-15' }],
      [],
      { expenses: [exp], parts: [part], plans: [plan], payments: [] },
      settings,
      '2026-12-01'
    );
    expect(r.rows.find((x) => x.linkedSourceId === 'pl:3')!.excluded).toBe(true);
    expect(r.summary.endBalance).toBe(1_000_000 - 200_000);
  });

  it('applies balance checkpoints as adjustments', () => {
    const r = runProjection(
      { ...proj, includeExpenseDues: false },
      [],
      [],
      [],
      [{ id: 'cp', projectionId: 'pr', date: '2026-12-10', actualBalance: 900_000 }],
      { expenses: [], parts: [], plans: [], payments: [] },
      settings,
      '2026-12-01'
    );
    const adj = r.rows.find((x) => x.type === 'adjustment')!;
    expect(adj.effectiveAmount).toBe(-100_000);
    expect(r.summary.endBalance).toBe(900_000);
  });

  it('starts from the sum of all start sources', () => {
    const multi: Projection = {
      ...proj,
      includeExpenseDues: false,
      startSources: [
        { label: 'Bank', amount: 700_000 },
        { label: 'Cash', amount: 250_000 },
        { label: 'E-wallet', amount: 50_000 },
      ],
    };
    expect(startTotalOf(multi)).toBe(1_000_000);
    const r = runProjection(
      multi,
      [
        {
          id: 'rent',
          projectionId: 'pr',
          type: 'minus',
          name: 'Rent',
          amount: 300_000,
          recurrence: { freq: 'once', interval: 1, startDate: '2026-12-05', weekendRule: 'none' },
        },
      ],
      [],
      [],
      [],
      { expenses: [], parts: [], plans: [], payments: [] },
      settings,
      '2026-12-01'
    );
    expect(r.summary.startTotal).toBe(1_000_000);
    expect(r.timeline[0].total).toBe(1_000_000);
    expect(r.summary.endBalance).toBe(700_000);
  });
});
