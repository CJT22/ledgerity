/**
 * Request-body validation (zod). Optional fields accept `null` (the HTTP client sends null
 * for "cleared" fields); the models store null and read it back as "absent".
 */
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date like 2026-11-24')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()), 'Invalid date');
const money = z.number().int('Amounts must be whole centavos');
const nonNegMoney = money.nonnegative();
const id = z.string().min(1).max(200);
const text = (max = 500) => z.string().max(max);
const optText = (max = 2000) => z.string().max(max).nullish();
const weekendRule = z.enum(['none', 'previous_business_day', 'next_business_day']);

export const recurrenceRuleSchema = z
  .object({
    freq: z.enum(['once', 'daily', 'weekly', 'biweekly', 'semi_monthly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(120),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    count: z.number().int().min(1).max(10000).nullish(),
    byMonthDays: z.array(z.number().int().min(-1).max(31)).max(31).nullish(),
    byWeekday: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
    weekendRule,
  })
  .refine((r) => !r.endDate || r.endDate >= r.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

const settingsBase = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  locale: text(35),
  dateFormat: text(40),
  theme: z.enum(['light', 'dark', 'system']),
  cutoffDays: z.array(z.number().int().min(1).max(31)).min(1).max(4),
  defaultWeekendRule: weekendRule,
  upcomingHorizonMonths: z.number().int().min(1).max(120),
  lanAccess: z.boolean(),
  setupComplete: z.boolean(),
});
// NOTE: never put .default() in a *Base schema: zod v4 applies defaults inside .partial(),
// which would silently overwrite fields on every PATCH.
export const settingsPatchSchema = settingsBase.partial();
/** Settings inside a backup file; older files (AI Studio demo) have no lanAccess. */
const settingsInBackupSchema = settingsBase.extend({
  lanAccess: z.boolean().default(false),
  setupComplete: z.boolean().default(true),
});


const expenseBase = z.object({
  name: text(150).min(1),
  description: optText(),
  icon: text(16).min(1),
  color: text(32),
  archived: z.boolean(),
  notes: optText(5000),
});
export const expenseCreateSchema = expenseBase.extend({ archived: z.boolean().default(false) });
export const expensePatchSchema = expenseBase.partial();

const partBase = z.object({
  expenseId: id,
  name: text(150).min(1),
  notes: optText(5000),
  kind: z.enum(['one_time', 'recurring']),
  isPlanned: z.boolean(),
  price: nonNegMoney,
  paymentMode: z.enum(['full', 'installment', 'flexible']).nullable(),
  recurrence: recurrenceRuleSchema.nullish(),
});
export const partCreateSchema = partBase.refine((p) => p.kind !== 'recurring' || !!p.recurrence, {
  message: 'Recurring parts need a recurrence rule',
  path: ['recurrence'],
});
export const partPatchSchema = partBase.omit({ expenseId: true }).partial();

const chargeSchema = z.object({
  id,
  date: isoDate,
  amount: nonNegMoney,
  reason: text(200).min(1),
});
export const chargeCreateSchema = chargeSchema.omit({ id: true });

const planBase = z.object({
  expenseId: id,
  name: text(150).min(1),
  partAllocations: z.array(z.object({ partId: id, amount: nonNegMoney })).max(200),
  principal: nonNegMoney,
  downPayment: nonNegMoney,
  downPaymentDate: isoDate.nullish(),
  interestMode: z.enum(['none', 'fixed_amount', 'add_on_rate', 'from_installment_amount']),
  interestValue: z.number().min(0),
  installmentAmount: nonNegMoney.nullish(),
  fees: nonNegMoney,
  feesSpread: z.enum(['first_due', 'all_dues']),
  termCount: z.number().int().min(1).max(600),
  frequency: z.enum(['monthly', 'semi_monthly', 'biweekly', 'weekly']),
  firstDueDate: isoDate,
  weekendRule,
  notes: optText(5000),
});
export const planCreateSchema = planBase;
export const planPatchSchema = planBase
  .omit({ expenseId: true })
  .extend({ charges: z.array(chargeSchema).max(500) })
  .partial();

const paymentBase = z.object({
  date: isoDate,
  amount: money.positive('Payment amount must be greater than zero'),
  note: optText(),
  targetType: z.enum(['part', 'plan_due', 'plan_charge', 'recurring_occurrence']),
  targetId: id,
  occurrenceDate: isoDate.nullish(),
});
export const paymentCreateSchema = paymentBase;
export const paymentPatchSchema = paymentBase.partial();

const startSourceSchema = z.object({ label: text(100).trim().min(1, 'Name each source'), amount: money });
const projectionBase = z.object({
  name: text(150).min(1),
  startDate: isoDate,
  endDate: isoDate,
  parentProjectionId: id.nullish(),
  includeExpenseDues: z.boolean(),
  startSources: z.array(startSourceSchema).max(100),
  startNote: optText(),
  endNote: optText(),
});
const dateOrder = (p: { startDate?: string; endDate?: string }) =>
  !p.startDate || !p.endDate || p.endDate >= p.startDate;
const dateOrderMsg = { message: 'End date must be on or after the start date', path: ['endDate'] };
export const projectionCreateSchema = projectionBase.refine(dateOrder, dateOrderMsg);
export const projectionPatchSchema = projectionBase.partial().refine(dateOrder, dateOrderMsg);
export const duplicateSchema = z.object({ name: optText(150) });

const itemBase = z.object({
  projectionId: id,
  type: z.enum(['add', 'minus']),
  name: text(150).min(1),
  amount: nonNegMoney,
  note: optText(),
  recurrence: recurrenceRuleSchema,
});
export const itemCreateSchema = itemBase;
export const itemPatchSchema = itemBase.omit({ projectionId: true }).partial();

export const overrideSchema = z.object({
  itemId: id,
  originalDate: isoDate,
  skipped: z.boolean().nullish(),
  movedToDate: isoDate.nullish(),
  plannedAmount: nonNegMoney.nullish(),
  status: z.enum(['planned', 'done']),
  actualAmount: nonNegMoney.nullish(),
  actualDate: isoDate.nullish(),
  note: optText(),
});

export const exclusionSchema = z.object({
  projectionId: id,
  sourceType: z.enum(['plan_due', 'plan_charge', 'recurring_part']),
  sourceId: id,
  occurrenceDate: isoDate,
});

export const checkpointCreateSchema = z.object({
  projectionId: id,
  date: isoDate,
  actualBalance: money,
  note: optText(),
});

export const affordabilitySchema = z.object({
  projectionId: id,
  date: isoDate,
  amount: nonNegMoney,
  label: optText(200),
});

/** Full backup file (JSON export). */
export const appStateSchema = z.object({
  version: z.number().int().default(2),
  settings: settingsInBackupSchema,
  expenses: z.array(expenseBase.extend({ id })),
  parts: z.array(partBase.extend({ id })),
  plans: z.array(planBase.extend({ id, charges: z.array(chargeSchema).default([]) })),
  payments: z.array(paymentBase.extend({ id })),
  projections: z.array(projectionBase.extend({ id })),
  projectionItems: z.array(itemBase.extend({ id })),
  overrides: z.array(overrideSchema).default([]),
  exclusions: z.array(exclusionSchema).default([]),
  checkpoints: z.array(checkpointCreateSchema.extend({ id })).default([]),
});
