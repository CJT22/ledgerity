import {
  addDaysISO,
  addMonthsISO,
  adjustWeekend,
  buildSchedule,
  computePlanDueKey,
  expand,
  getNextPaydayInfo,
  todayISODate,
} from './domain';
import {
  AppState,
  Expense,
  InstallmentPlan,
  OccurrenceOverride,
  Part,
  Payment,
  Projection,
  ProjectionItem,
  Settings,
} from './types';

export function createSeedState(today = todayISODate()): AppState {
  const settings: Settings = {
    currencyCode: 'PHP',
    locale: 'en-PH',
    dateFormat: 'MMM d, yyyy',
    theme: 'system',
    cutoffDays: [10, 25],
    defaultWeekendRule: 'next_business_day',
    upcomingHorizonMonths: 12,
    lanAccess: false,
    setupComplete: true,
  };

  // Expenses
  const expenses: Expense[] = [
    {
      id: 'exp_pc',
      name: 'Gaming PC',
      description: 'Custom workstation & gaming build with peripherals and Game Pass',
      icon: '🖥️',
      color: '#0ea5e9',
      archived: false,
      notes: 'GPU and CPU bundled under one 12-month store installment plan.',
    },
    {
      id: 'exp_car',
      name: 'Car',
      description: 'Daily vehicle financing, annual insurance, registration, and dashcam',
      icon: '🚗',
      color: '#f59e0b',
      archived: false,
      notes: 'Auto loan 36 months at ₱23,500/mo.',
    },
    {
      id: 'exp_console',
      name: 'Console',
      description: 'Living room console setup wishlist',
      icon: '🎮',
      color: '#8b5cf6',
      archived: false,
      notes: 'Planned purchase once savings buffer stays healthy.',
    },
    {
      id: 'exp_loan',
      name: 'Loan from Sam',
      description: 'Personal zero-interest loan with flexible repayments',
      icon: '🤝',
      color: '#10b981',
      archived: false,
      notes: 'Pay back whenever extra cash is available.',
    },
    {
      id: 'exp_old_laptop',
      name: 'Old Laptop',
      description: 'Previous work laptop (fully paid off)',
      icon: '💻',
      color: '#64748b',
      archived: true,
      notes: 'Completed all payments last year.',
    },
  ];

  // Helper dates relative to today
  const fourMonthsAgo = addMonthsISO(today, -4);
  const sixMonthsAgo = addMonthsISO(today, -6);
  const nineMonthsAgo = addMonthsISO(today, -9);
  const elevenMonthsAgo = addMonthsISO(today, -11);
  const fifteenMonthsAgo = addMonthsISO(today, -15);
  const tenMonthsAgoPlus5 = addDaysISO(addMonthsISO(today, -10), -5);

  // Parts
  const parts: Part[] = [
    // Gaming PC
    {
      id: 'part_gpu',
      expenseId: 'exp_pc',
      name: 'GPU (RTX 4070 Super)',
      kind: 'one_time',
      isPlanned: false,
      price: 4500000,
      paymentMode: 'installment',
    },
    {
      id: 'part_cpu',
      expenseId: 'exp_pc',
      name: 'CPU (Ryzen 7 7800X3D)',
      kind: 'one_time',
      isPlanned: false,
      price: 1800000,
      paymentMode: 'installment',
    },
    {
      id: 'part_case',
      expenseId: 'exp_pc',
      name: 'PC Case (Airflow Mid-Tower)',
      kind: 'one_time',
      isPlanned: false,
      price: 450000,
      paymentMode: 'full',
    },
    {
      id: 'part_mobo',
      expenseId: 'exp_pc',
      name: 'Motherboard (B650)',
      kind: 'one_time',
      isPlanned: false,
      price: 1200000,
      paymentMode: 'full',
    },
    {
      id: 'part_monitor',
      expenseId: 'exp_pc',
      name: '27" 1440p IPS Monitor',
      kind: 'one_time',
      isPlanned: true,
      price: 1500000,
      paymentMode: 'full',
    },
    {
      id: 'part_gamepass',
      expenseId: 'exp_pc',
      name: 'Game Subscription',
      kind: 'recurring',
      isPlanned: false,
      price: 49900,
      paymentMode: null,
      recurrence: {
        freq: 'monthly',
        interval: 1,
        startDate: addDaysISO(sixMonthsAgo, 5),
        weekendRule: 'none',
      },
    },

    // Car
    {
      id: 'part_car_unit',
      expenseId: 'exp_car',
      name: 'Vehicle Unit',
      kind: 'one_time',
      isPlanned: false,
      price: 85000000,
      paymentMode: 'installment',
    },
    {
      id: 'part_car_insurance',
      expenseId: 'exp_car',
      name: 'Comprehensive Insurance',
      kind: 'recurring',
      isPlanned: false,
      price: 3500000,
      paymentMode: null,
      recurrence: {
        freq: 'yearly',
        interval: 1,
        startDate: nineMonthsAgo, // Next renewal = 3 months from today!
        weekendRule: 'next_business_day',
      },
    },
    {
      id: 'part_car_reg',
      expenseId: 'exp_car',
      name: 'LTO Registration',
      kind: 'recurring',
      isPlanned: false,
      price: 250000,
      paymentMode: null,
      recurrence: {
        freq: 'yearly',
        interval: 1,
        startDate: addDaysISO(nineMonthsAgo, 18),
        weekendRule: 'next_business_day',
      },
    },
    {
      id: 'part_car_dashcam',
      expenseId: 'exp_car',
      name: 'Dual-Channel Dashcam',
      kind: 'one_time',
      isPlanned: false,
      price: 650000,
      paymentMode: 'full',
    },

    // Console (Planned)
    {
      id: 'part_console_unit',
      expenseId: 'exp_console',
      name: 'Console Standard Edition',
      kind: 'one_time',
      isPlanned: true,
      price: 3200000,
      paymentMode: 'full',
    },
    {
      id: 'part_console_ctrl',
      expenseId: 'exp_console',
      name: 'Extra Wireless Controller',
      kind: 'one_time',
      isPlanned: true,
      price: 400000,
      paymentMode: 'full',
    },

    // Loan from Sam
    {
      id: 'part_sam_loan',
      expenseId: 'exp_loan',
      name: 'Principal Balance',
      kind: 'one_time',
      isPlanned: false,
      price: 2000000,
      paymentMode: 'flexible',
    },

    // Old Laptop (archived)
    {
      id: 'part_old_laptop',
      expenseId: 'exp_old_laptop',
      name: 'Ultrabook 14"',
      kind: 'one_time',
      isPlanned: false,
      price: 4200000,
      paymentMode: 'full',
    },
  ];

  // Installment Plans
  const pcPlanFirstDue = addDaysISO(fourMonthsAgo, 3);
  const carPlanFirstDue = tenMonthsAgoPlus5; // 10 months + 5 days ago -> 11th due was ~5 days ago!

  const plans: InstallmentPlan[] = [
    {
      id: 'plan_pc',
      expenseId: 'exp_pc',
      name: 'GPU + CPU 12-Month Store Plan',
      partAllocations: [
        { partId: 'part_gpu', amount: 4500000 },
        { partId: 'part_cpu', amount: 1800000 },
      ],
      principal: 6300000,
      downPayment: 0,
      interestMode: 'add_on_rate',
      interestValue: 0.5, // 0.5% monthly add-on
      fees: 100000, // ₱1,000 processing fee spread across all dues
      feesSpread: 'all_dues',
      termCount: 12,
      frequency: 'monthly',
      firstDueDate: pcPlanFirstDue,
      weekendRule: 'next_business_day',
      notes: '0.5%/mo add-on rate; ₱1,000 processing fee spread across 12 dues.',
      charges: [
        {
          id: 'chg_pc_late1',
          date: addMonthsISO(pcPlanFirstDue, 2),
          amount: 50000, // ₱500 late fee
          reason: 'Late payment fee (Month 3)',
        },
      ],
    },
    {
      id: 'plan_car',
      expenseId: 'exp_car',
      name: 'Auto Loan 36 Months',
      partAllocations: [{ partId: 'part_car_unit', amount: 85000000 }],
      principal: 85000000,
      downPayment: 17000000, // ₱170,000 down payment
      downPaymentDate: addDaysISO(carPlanFirstDue, -30),
      interestMode: 'from_installment_amount',
      interestValue: 0,
      installmentAmount: 2350000, // ₱23,500 / month
      fees: 0,
      feesSpread: 'first_due',
      termCount: 36,
      frequency: 'monthly',
      firstDueDate: carPlanFirstDue,
      weekendRule: 'next_business_day',
      notes: 'Fixed monthly amortization of ₱23,500 after ₱170,000 down payment.',
      charges: [],
    },
  ];

  // Build initial schedules to generate exact paid payments
  const payments: Payment[] = [];
  let paySeq = 1;
  const nextPayId = () => `pay_seed_${paySeq++}`;

  // Gaming PC: Case & Motherboard paid in full
  payments.push({
    id: nextPayId(),
    date: addDaysISO(fourMonthsAgo, -2),
    amount: 450000,
    note: 'Paid at checkout',
    targetType: 'part',
    targetId: 'part_case',
  });
  payments.push({
    id: nextPayId(),
    date: addDaysISO(fourMonthsAgo, -2),
    amount: 1200000,
    note: 'Bank transfer to PC store',
    targetType: 'part',
    targetId: 'part_mobo',
  });

  // Gaming PC: 4 installments paid on plan_pc
  const pcSchedule = buildSchedule(plans[0], [], today);
  for (let i = 0; i < 4; i++) {
    const due = pcSchedule.dues[i];
    if (due) {
      payments.push({
        id: nextPayId(),
        date: due.dueDate,
        amount: due.amount,
        note: `Installment #${due.seq}`,
        targetType: 'plan_due',
        targetId: computePlanDueKey(plans[0].id, due.seq),
        occurrenceDate: due.dueDate,
      });
    }
  }
  // Also pay the ₱500 late charge so only upcoming dues remain or keep late fee paid/unpaid? Let's keep late fee paid so PC has clean upcoming, or unpaid? Wait: "1 has a ₱500 late fee" — leaving it paid or unpaid works; let's mark it paid on month 3 or unpaid? Let's pay it alongside month 3 so it's in the financing history without falsely inflating PC overdue if user looks at Car as the overdue one, OR leave it unpaid? Wait: "Car: 10 months paid and one installment overdue." Having PC late fee paid or unpaid: let's pay the late fee with Month 3 so Car clearly stands out as the overdue item, and PC still shows ₱500 in Cost of Financing!
  payments.push({
    id: nextPayId(),
    date: addDaysISO(addMonthsISO(pcPlanFirstDue, 2), 2),
    amount: 50000,
    note: 'Settled late fee',
    targetType: 'plan_charge',
    targetId: 'chg_pc_late1',
  });

  // Gaming PC: Game subscription 6 months paid
  const gamePart = parts.find((p) => p.id === 'part_gamepass')!;
  const gameOccs = expand(gamePart.recurrence!, gamePart.recurrence!.startDate, today);
  gameOccs.slice(0, 6).forEach((occ) => {
    payments.push({
      id: nextPayId(),
      date: occ.effectiveDate,
      amount: gamePart.price,
      note: 'Auto-debit monthly subscription',
      targetType: 'recurring_occurrence',
      targetId: gamePart.id,
      occurrenceDate: occ.originalDate,
    });
  });

  // Car: Down payment paid + 10 monthly installments paid (11th is ~5 days ago -> OVERDUE!)
  const carSchedule = buildSchedule(plans[1], [], today);
  // seq 0 is down_payment, seq 1..10 are first 10 installments
  for (let i = 0; i <= 10; i++) {
    const due = carSchedule.dues[i];
    if (due) {
      payments.push({
        id: nextPayId(),
        date: due.dueDate,
        amount: due.amount,
        note: due.kind === 'down_payment' ? 'Dealer down payment' : `Monthly amortization #${due.seq}`,
        targetType: 'plan_due',
        targetId: computePlanDueKey(plans[1].id, due.seq),
        occurrenceDate: due.dueDate,
      });
    }
  }

  // Car: Insurance 1 paid, Registration 1 paid, Dashcam paid
  const insPart = parts.find((p) => p.id === 'part_car_insurance')!;
  const insOccs = expand(insPart.recurrence!, insPart.recurrence!.startDate, today);
  if (insOccs[0]) {
    payments.push({
      id: nextPayId(),
      date: insOccs[0].effectiveDate,
      amount: insPart.price,
      note: 'Annual comprehensive policy',
      targetType: 'recurring_occurrence',
      targetId: insPart.id,
      occurrenceDate: insOccs[0].originalDate,
    });
  }
  const regPart = parts.find((p) => p.id === 'part_car_reg')!;
  const regOccs = expand(regPart.recurrence!, regPart.recurrence!.startDate, today);
  if (regOccs[0]) {
    payments.push({
      id: nextPayId(),
      date: regOccs[0].effectiveDate,
      amount: regPart.price,
      note: 'LTO annual renewal',
      targetType: 'recurring_occurrence',
      targetId: regPart.id,
      occurrenceDate: regOccs[0].originalDate,
    });
  }
  payments.push({
    id: nextPayId(),
    date: addDaysISO(nineMonthsAgo, 10),
    amount: 650000,
    note: 'Dashcam + installation',
    targetType: 'part',
    targetId: 'part_car_dashcam',
  });

  // Loan from Sam: 3 partial payments
  payments.push(
    {
      id: nextPayId(),
      date: addMonthsISO(today, -3),
      amount: 500000,
      note: 'First repayment',
      targetType: 'part',
      targetId: 'part_sam_loan',
    },
    {
      id: nextPayId(),
      date: addMonthsISO(today, -2),
      amount: 350000,
      note: 'Mid-month transfer to Sam',
      targetType: 'part',
      targetId: 'part_sam_loan',
    },
    {
      id: nextPayId(),
      date: addDaysISO(today, -14),
      amount: 400000,
      note: 'Third partial payment',
      targetType: 'part',
      targetId: 'part_sam_loan',
    }
  );

  // Old Laptop: fully paid
  payments.push({
    id: nextPayId(),
    date: fifteenMonthsAgo,
    amount: 4200000,
    note: 'Paid in full',
    targetType: 'part',
    targetId: 'part_old_laptop',
  });

  // Projections: start at start of current cutoff so current cutoff past items exist and Today sits cleanly in range
  const { currentPeriod } = getNextPaydayInfo(
    today,
    settings.cutoffDays,
    settings.defaultWeekendRule
  );
  const projStart = currentPeriod ? currentPeriod.startDate : addDaysISO(today, -7);
  const projEnd = addMonthsISO(today, 4);

  const projections: Projection[] = [
    {
      id: 'proj_main',
      name: 'Next 4 months',
      startDate: projStart,
      endDate: projEnd,
      parentProjectionId: null,
      includeExpenseDues: true,
      startSources: [
        { label: 'Payroll bank', amount: 4500000 },
        { label: 'Cash on hand', amount: 500000 },
        { label: 'E-wallet', amount: 300000 },
      ],
      startNote: 'Payroll bank, cash on hand and e-wallet combined',
      endNote: 'Target minimum buffer: ₱20,000',
    },
    {
      id: 'proj_scenario_console',
      name: 'Next 4 months – buy console in 2 months',
      startDate: projStart,
      endDate: projEnd,
      parentProjectionId: 'proj_main',
      includeExpenseDues: true,
      startSources: [
        { label: 'Payroll bank', amount: 4500000 },
        { label: 'Cash on hand', amount: 500000 },
        { label: 'E-wallet', amount: 300000 },
      ],
      startNote: 'Starting sources copied from Next 4 months',
      endNote: 'Includes ₱36,000 Console + Extra Controller purchase in 2 months',
    },
  ];

  // Helper to build items for a projection
  const buildBaseItems = (projectionId: string, prefix: string): ProjectionItem[] => [
    {
      id: `${prefix}_salary`,
      projectionId,
      type: 'add',
      name: 'Salary (Semi-monthly)',
      amount: 3500000,
      note: '10th & 25th; weekend moves to Monday',
      recurrence: {
        freq: 'semi_monthly',
        interval: 1,
        startDate: projStart,
        byMonthDays: [10, 25],
        weekendRule: 'next_business_day',
      },
    },
    {
      id: `${prefix}_rent`,
      projectionId,
      type: 'minus',
      name: 'Apartment Rent',
      amount: 1200000,
      note: 'Monthly on the 5th',
      recurrence: {
        freq: 'monthly',
        interval: 1,
        startDate: projStart,
        byMonthDays: [5],
        weekendRule: 'none',
      },
    },
    {
      id: `${prefix}_groceries`,
      projectionId,
      type: 'minus',
      name: 'Weekly Groceries',
      amount: 250000,
      note: 'Weekly market & supermarket run',
      recurrence: {
        freq: 'weekly',
        interval: 1,
        startDate: addDaysISO(projStart, 2),
        weekendRule: 'none',
      },
    },
    {
      id: `${prefix}_utilities`,
      projectionId,
      type: 'minus',
      name: 'Electricity & Fiber Internet',
      amount: 450000,
      note: 'Monthly on the 20th',
      recurrence: {
        freq: 'monthly',
        interval: 1,
        startDate: projStart,
        byMonthDays: [20],
        weekendRule: 'next_business_day',
      },
    },
  ];

  const mainItems = buildBaseItems('proj_main', 'item_main');
  const scenItems = buildBaseItems('proj_scenario_console', 'item_scen');
  scenItems.push({
    id: 'item_scen_console',
    projectionId: 'proj_scenario_console',
    type: 'minus',
    name: 'Console + Extra Controller Purchase',
    amount: 3600000,
    note: 'Planned purchase in 2 months',
    recurrence: {
      freq: 'once',
      interval: 1,
      startDate: adjustWeekend(addMonthsISO(today, 2), 'next_business_day'),
      weekendRule: 'none',
    },
  });

  const projectionItems: ProjectionItem[] = [...mainItems, ...scenItems];

  // Demo of a one-off edit: the first past expense in the current cutoff cost more than planned
  const overrides: OccurrenceOverride[] = [];
  for (const item of mainItems) {
    if (item.type !== 'minus') continue;
    const past = expand(item.recurrence, projStart, addDaysISO(today, -1)).find(
      (occ) => occ.effectiveDate < today
    );
    if (!past) continue;
    overrides.push({
      itemId: item.id,
      originalDate: past.originalDate,
      plannedAmount: item.amount + 28000, // +₱280 more than planned
      note: 'Included extra household supplies',
    });
    break;
  }

  // Also ensure at least one past occurrence on projStart is present if today == projStart
  // (already handled cleanly if projStart < today)
  void elevenMonthsAgo;

  return {
    version: 3,
    settings,
    expenses,
    parts,
    plans,
    payments,
    projections,
    projectionItems,
    overrides,
    exclusions: [],
    checkpoints: [],
  };
}
