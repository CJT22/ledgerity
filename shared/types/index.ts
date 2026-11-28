export type Money = number; // integer minor units (cents)
export type ISODate = string; // 'YYYY-MM-DD'
export type WeekendRule = 'none' | 'previous_business_day' | 'next_business_day';

export interface RecurrenceRule {
  /**
   * 'biweekly' is legacy: it is no longer offered in the UI and is read as weekly with
   * interval × 2 (see normalizeRecurrence). 'custom' uses the hand-picked `dates` list.
   */
  freq: 'once' | 'daily' | 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly' | 'yearly' | 'custom';
  interval: number; // every N
  startDate: ISODate;
  endDate?: ISODate | null;
  count?: number | null;
  byMonthDays?: number[]; // e.g., [10, 25]; -1 = last day of month
  byWeekday?: number[]; // 0=Sun..6=Sat
  /** Only for freq 'custom': the exact dates, sorted ascending. startDate mirrors the first. */
  dates?: ISODate[];
  weekendRule: WeekendRule;
}

export interface Settings {
  currencyCode: string;
  locale: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'system';
  cutoffDays: number[]; // default [10, 25]
  defaultWeekendRule: WeekendRule; // default 'none'
  upcomingHorizonMonths: number; // default 12
  /** Allow other devices on the same network (e.g. your phone) to open the app. Requires restart. */
  lanAccess: boolean;
  /** False until the first-run welcome screen has been completed. */
  setupComplete: boolean;
}

export interface Expense {
  id: string;
  name: string;
  description?: string;
  icon: string; // emoji
  color: string;
  archived: boolean;
  notes?: string;
}

export type PartKind = 'one_time' | 'recurring';
export type PaymentMode = 'full' | 'installment' | 'flexible' | null;

export interface Part {
  id: string;
  expenseId: string;
  name: string;
  notes?: string;
  kind: PartKind;
  isPlanned: boolean;
  price: Money; // cash price, or amount per occurrence if recurring
  paymentMode: PaymentMode;
  recurrence?: RecurrenceRule;
}

export type InterestMode = 'none' | 'fixed_amount' | 'add_on_rate' | 'from_installment_amount';
export type PlanFrequency = 'monthly' | 'semi_monthly' | 'biweekly' | 'weekly';

export interface PlanCharge {
  id: string;
  date: ISODate;
  amount: Money;
  reason: string;
}

export interface InstallmentPlan {
  id: string;
  expenseId: string;
  name: string;
  partAllocations: { partId: string; amount: Money }[];
  principal: Money;
  downPayment: Money;
  downPaymentDate?: ISODate;
  interestMode: InterestMode;
  interestValue: number; // cents for fixed_amount; monthly % for add_on_rate
  installmentAmount?: Money; // entered when mode = from_installment_amount
  fees: Money;
  feesSpread: 'first_due' | 'all_dues';
  termCount: number;
  frequency: PlanFrequency;
  firstDueDate: ISODate;
  weekendRule: WeekendRule;
  notes?: string;
  charges: PlanCharge[];
}

export type DueStatus = 'upcoming' | 'due_today' | 'overdue' | 'partial' | 'paid';

export interface PlanDue {
  planId: string;
  seq: number;
  dueDate: ISODate;
  amount: Money;
  kind: 'down_payment' | 'installment';
  paid: Money;
  status: DueStatus;
}

export type PaymentTargetType = 'part' | 'plan_due' | 'plan_charge' | 'recurring_occurrence';

export interface Payment {
  id: string;
  date: ISODate;
  amount: Money;
  note?: string;
  targetType: PaymentTargetType;
  targetId: string;
  occurrenceDate?: ISODate;
}

export interface Projection {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  parentProjectionId?: string | null;
  includeExpenseDues: boolean;
  /** Where the starting money comes from. Their amounts add up to the starting balance. */
  startSources: StartSource[];
  startNote?: string;
  endNote?: string;
}

export interface StartSource {
  label: string;
  amount: Money;
}

export type ProjectionItemType = 'add' | 'minus';

export interface ProjectionItem {
  id: string;
  projectionId: string;
  type: ProjectionItemType;
  name: string;
  amount: Money;
  note?: string;
  recurrence: RecurrenceRule;
}

export interface OccurrenceOverride {
  itemId: string;
  originalDate: ISODate;
  skipped?: boolean;
  movedToDate?: ISODate;
  plannedAmount?: Money;
  status: 'planned' | 'done';
  actualAmount?: Money;
  actualDate?: ISODate;
  note?: string;
}

export interface LinkedExclusion {
  projectionId: string;
  sourceType: 'plan_due' | 'plan_charge' | 'recurring_part';
  sourceId: string;
  occurrenceDate: ISODate;
}

export interface BalanceCheckpoint {
  id: string;
  projectionId: string;
  date: ISODate;
  actualBalance: Money;
  note?: string;
}

// Computed domain result types

export interface RecurrenceOccurrence {
  originalDate: ISODate;
  effectiveDate: ISODate;
}

export interface PlanScheduleResult {
  plan: InstallmentPlan;
  dues: PlanDue[];
  remainingPrincipal: Money;
  totalInterest: Money;
  totalFees: Money;
  totalCharges: Money;
  totalPayable: Money;
  totalPaid: Money;
  totalRemaining: Money;
  regularInstallmentAmount: Money;
  paidCount: number;
  overdueCount: number;
  nextDue: PlanDue | null;
  partFinancingShares: Record<string, Money>;
}

export type ExpenseStatus = 'planned' | 'active' | 'fully_paid';

export interface PartSummary {
  part: Part;
  paid: Money;
  remaining: Money;
  plannedAmount: Money;
  shareOfInterest: Money;
  totalCost: Money;
  nextDueDate: ISODate | null;
  nextDueAmount: Money;
  overdueCount: number;
  upcomingOccurrencesCount: number;
}

export interface ExpenseCumulativePoint {
  date: ISODate;
  paidCumulative: Money | null;
  projectedCumulative: Money | null;
  label: string;
}

export interface ExpenseSummary {
  expense: Expense;
  status: ExpenseStatus;
  paidSoFar: Money;
  remainingCommitted: Money;
  plannedEstimated: Money;
  trueTotal: Money;
  costOfFinancing: Money;
  /** Part of costOfFinancing not yet paid (included in remainingCommitted). */
  financingRemaining: Money;
  nextDueDate: ISODate | null;
  nextDueAmount: Money;
  nextDueLabel: string | null;
  overdueCount: number;
  partSummaries: PartSummary[];
  planSchedules: PlanScheduleResult[];
  cumulativeSeries: ExpenseCumulativePoint[];
}

export interface ExpenseDetailPayload {
  expense: Expense;
  parts: Part[];
  plans: InstallmentPlan[];
  payments: Payment[];
  summary: ExpenseSummary;
}

export type ProjectionRowSource =
  | 'item'
  | 'linked_plan_due'
  | 'linked_plan_charge'
  | 'linked_recurring_part'
  | 'checkpoint';

export interface ProjectionRow {
  rowKey: string;
  source: ProjectionRowSource;
  itemId?: string;
  originalDate: ISODate;
  effectiveDate: ISODate;
  type: ProjectionItemType | 'adjustment';
  name: string;
  plannedAmount: Money;
  actualAmount?: Money;
  actualDate?: ISODate;
  effectiveAmount: Money;
  status: 'planned' | 'done';
  skipped: boolean;
  excluded: boolean;
  unconfirmed: boolean;
  isLinkedFromExpense: boolean;
  linkedExpenseId?: string;
  linkedExpenseName?: string;
  linkedSourceType?: 'plan_due' | 'plan_charge' | 'recurring_part';
  linkedSourceId?: string;
  checkpointId?: string;
  note?: string;
  runningTotal: Money;
  isPayday?: boolean;
}

export interface CutoffPeriodGroup {
  id: string;
  label: string;
  startDate: ISODate;
  endDate: ISODate;
  paydayDate: ISODate;
  startBalance: Money;
  endBalance: Money;
  totalIn: Money;
  totalOut: Money;
  rows: ProjectionRow[];
}

export interface ProjectionTimelinePoint {
  date: ISODate;
  total: Money;
  cutoffBandIndex: number;
  hasPayday?: boolean;
  hasBigMinus?: boolean;
  bigMinusLabel?: string;
}

export interface ProjectionSummary {
  startTotal: Money;
  endBalance: Money;
  lowestBalance: Money;
  lowestBalanceDate: ISODate;
  totalIn: Money;
  totalOut: Money;
}

export interface ProjectionResult {
  projection: Projection;
  items: ProjectionItem[];
  overrides: OccurrenceOverride[];
  exclusions: LinkedExclusion[];
  checkpoints: BalanceCheckpoint[];
  rows: ProjectionRow[];
  cutoffGroups: CutoffPeriodGroup[];
  timeline: ProjectionTimelinePoint[];
  summary: ProjectionSummary;
}

export interface AffordabilityResult {
  date: ISODate;
  amount: Money;
  balanceBeforeOnDate: Money;
  balanceAfterOnDate: Money;
  lowestBalanceAfter: Money;
  lowestBalanceAfterDate: ISODate;
  endBalance: Money;
  goesNegative: boolean;
  firstNegativeDate: ISODate | null;
  verdict: 'comfortable' | 'tight' | 'negative';
}

export interface UpcomingDueItem {
  id: string;
  dueDate: ISODate;
  amount: Money;
  paid: Money;
  remaining: Money;
  status: DueStatus;
  title: string;
  subtitle: string;
  expenseId: string;
  expenseName: string;
  expenseIcon: string;
  targetType: PaymentTargetType;
  targetId: string;
  occurrenceDate?: ISODate;
}

export interface DashboardData {
  today: ISODate;
  totalBalance: Money;
  daysUntilNextPayday: number | null;
  nextPaydayDate: ISODate | null;
  moneyLeftThisCutoff: Money;
  currentCutoffLabel: string;
  activeProjection: ProjectionResult | null;
  totalOverdueAmount: Money;
  overdueCount: number;
  upcomingDues30Days: UpcomingDueItem[];
  overdueDues: UpcomingDueItem[];
  expenseSummaries: ExpenseSummary[];
  recentPayments: (Payment & {
    expenseId?: string;
    expenseName?: string;
    expenseIcon?: string;
    targetLabel: string;
  })[];
  paydayDatesInRange: ISODate[];
  /** Past items (up to today) not yet marked done; excluded from the current balance. */
  pendingConfirmationCount: number;
  /** Net effect those items would have if confirmed (adds positive, minus negative). */
  pendingConfirmationNet: Money;
}

export interface ProjectionComparison {
  projections: ProjectionResult[];
  baselineId: string;
  mergedTimeline: {
    date: ISODate;
    values: Record<string, Money>;
  }[];
  metrics: {
    projectionId: string;
    name: string;
    endBalance: Money;
    endBalanceDiff: Money;
    lowestBalance: Money;
    lowestBalanceDate: ISODate;
    totalIn: Money;
    totalOut: Money;
  }[];
}

export interface AppState {
  version: number;
  settings: Settings;
  expenses: Expense[];
  parts: Part[];
  plans: InstallmentPlan[];
  payments: Payment[];
  projections: Projection[];
  projectionItems: ProjectionItem[];
  overrides: OccurrenceOverride[];
  exclusions: LinkedExclusion[];
  checkpoints: BalanceCheckpoint[];
}

// Server / system types

export interface BackupInfo {
  fileName: string;
  kind: 'auto' | 'manual' | 'pre-restore';
  createdAt: string; // ISO datetime
  sizeBytes: number;
}

export interface SystemInfo {
  version: string;
  schemaVersion: number;
  dataDir: string;
  databaseFile: string;
  port: number;
  lanAccess: boolean;
  /** lanAccess setting at the time the server started (changes need a restart). */
  lanAccessActive: boolean;
  lanUrls: string[];
  localUrl: string;
}
