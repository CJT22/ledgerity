import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { DateInput, Drawer, MoneyInput } from '../../components';
import { useApp } from '../../context/AppContext';
import { buildSchedule, todayISODate } from '@shared/domain';
import {
  InstallmentPlan,
  InterestMode,
  ISODate,
  Money,
  Part,
  PlanFrequency,
  WeekendRule,
} from '@shared/types';

interface PlanDrawerProps {
  open: boolean;
  expenseId: string;
  parts: Part[];
  plan?: InstallmentPlan | null;
  onClose: () => void;
  onSaved: () => void;
}

export const PlanDrawer: React.FC<PlanDrawerProps> = ({
  open,
  expenseId,
  parts,
  plan,
  onClose,
  onSaved,
}) => {
  const { settings, formatAmount, formatDate, toast } = useApp();

  const oneTimeParts = useMemo(
    () => parts.filter((p) => p.kind === 'one_time'),
    [parts]
  );

  const [name, setName] = useState('');
  const [selectedMap, setSelectedMap] = useState<Record<string, Money>>({});
  const [downPayment, setDownPayment] = useState<Money>(0);
  const [downPaymentDate, setDownPaymentDate] = useState<ISODate>(todayISODate());
  const [interestMode, setInterestMode] = useState<InterestMode>('none');
  const [interestValue, setInterestValue] = useState<number>(0);
  const [installmentAmount, setInstallmentAmount] = useState<Money>(0);
  const [fees, setFees] = useState<Money>(0);
  const [feesSpread, setFeesSpread] = useState<'first_due' | 'all_dues'>('all_dues');
  const [termCount, setTermCount] = useState<number>(12);
  const [frequency, setFrequency] = useState<PlanFrequency>('monthly');
  const [firstDueDate, setFirstDueDate] = useState<ISODate>(todayISODate());
  const [weekendRule, setWeekendRule] = useState<WeekendRule>(settings.defaultWeekendRule);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (plan) {
      setName(plan.name);
      const map: Record<string, Money> = {};
      for (const a of plan.partAllocations) map[a.partId] = a.amount;
      setSelectedMap(map);
      setDownPayment(plan.downPayment);
      setDownPaymentDate(plan.downPaymentDate || plan.firstDueDate);
      setInterestMode(plan.interestMode);
      setInterestValue(plan.interestValue);
      setInstallmentAmount(plan.installmentAmount ?? 0);
      setFees(plan.fees);
      setFeesSpread(plan.feesSpread);
      setTermCount(plan.termCount);
      setFrequency(plan.frequency);
      setFirstDueDate(plan.firstDueDate);
      setWeekendRule(plan.weekendRule);
      setNotes(plan.notes ?? '');
    } else {
      setName('');
      const defaultSelected: Record<string, Money> = {};
      const candidate = oneTimeParts.find((p) => p.paymentMode === 'installment') ?? oneTimeParts[0];
      if (candidate) defaultSelected[candidate.id] = candidate.price;
      setSelectedMap(defaultSelected);
      setDownPayment(0);
      setDownPaymentDate(todayISODate());
      setInterestMode('add_on_rate');
      setInterestValue(0.5);
      setInstallmentAmount(0);
      setFees(0);
      setFeesSpread('all_dues');
      setTermCount(12);
      setFrequency('monthly');
      setFirstDueDate(todayISODate());
      setWeekendRule(settings.defaultWeekendRule);
      setNotes('');
    }
    setError('');
  }, [open, plan, oneTimeParts, settings]);

  const partAllocations = useMemo(
    () =>
      Object.entries(selectedMap)
        .filter(([, amt]) => amt > 0)
        .map(([partId, amount]) => ({ partId, amount })),
    [selectedMap]
  );

  const principal = useMemo(
    () => partAllocations.reduce((s, a) => s + a.amount, 0),
    [partAllocations]
  );

  const previewPlan: InstallmentPlan = useMemo(
    () => ({
      id: plan?.id ?? 'preview',
      expenseId,
      name: name || 'Preview Plan',
      partAllocations,
      principal,
      downPayment,
      downPaymentDate: downPayment > 0 ? downPaymentDate : undefined,
      interestMode,
      interestValue,
      installmentAmount: interestMode === 'from_installment_amount' ? installmentAmount : undefined,
      fees,
      feesSpread,
      termCount: Math.max(1, termCount),
      frequency,
      firstDueDate: firstDueDate || todayISODate(),
      weekendRule,
      notes,
      charges: plan?.charges ?? [],
    }),
    [
      plan,
      expenseId,
      name,
      partAllocations,
      principal,
      downPayment,
      downPaymentDate,
      interestMode,
      interestValue,
      installmentAmount,
      fees,
      feesSpread,
      termCount,
      frequency,
      firstDueDate,
      weekendRule,
      notes,
    ]
  );

  const previewSchedule = useMemo(
    () => buildSchedule(previewPlan, [], todayISODate()),
    [previewPlan]
  );

  const togglePart = (p: Part) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[p.id] !== undefined) {
        delete next[p.id];
      } else {
        next[p.id] = p.price;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Plan name is required.');
      return;
    }
    if (partAllocations.length === 0 || principal <= 0) {
      setError('Select at least one part with a positive allocation.');
      return;
    }
    if (downPayment >= principal) {
      setError('Down payment must be less than the principal.');
      return;
    }
    if (termCount < 1) {
      setError('Term count must be at least 1.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        expenseId,
        name: name.trim(),
        partAllocations,
        principal,
        downPayment,
        downPaymentDate: downPayment > 0 ? downPaymentDate : undefined,
        interestMode,
        interestValue,
        installmentAmount:
          interestMode === 'from_installment_amount' ? installmentAmount : undefined,
        fees,
        feesSpread,
        termCount,
        frequency,
        firstDueDate,
        weekendRule,
        notes: notes.trim() || undefined,
      };
      if (plan) {
        await api.updateInstallmentPlan(plan.id, payload);
        toast('Installment plan updated');
      } else {
        await api.createInstallmentPlan(payload);
        toast('Installment plan created');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={plan ? 'Edit Installment Plan' : 'New Installment Plan'}
      subtitle="One plan can cover multiple parts with live schedule & interest preview."
      widthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Plan Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., 12-Month Store Installment, Auto Loan 36m"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Multi-part selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Covered Parts &amp; Allocations <span className="text-rose-500">*</span>
            </label>
            <span className="text-xs font-mono-num tabular-nums text-slate-500 dark:text-slate-400">
              Principal: <strong>{formatAmount(principal)}</strong>
            </span>
          </div>
          {oneTimeParts.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Add at least one one-time part first before creating an installment plan.
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {oneTimeParts.map((p) => {
                const checked = selectedMap[p.id] !== undefined;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePart(p)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono-num">
                        ({formatAmount(p.price)})
                      </span>
                    </label>
                    {checked && (
                      <MoneyInput
                        compact
                        className="w-36 shrink-0"
                        value={selectedMap[p.id]}
                        onChange={(amt) =>
                          setSelectedMap((prev) => ({ ...prev, [p.id]: amt }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Down payment + Terms + Frequency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput
            label="Down Payment"
            value={downPayment}
            onChange={setDownPayment}
          />
          {downPayment > 0 && (
            <DateInput
              label="Down Payment Date"
              value={downPaymentDate}
              onChange={setDownPaymentDate}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Terms (Installments)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={termCount}
              onChange={(e) => setTermCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PlanFrequency)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="monthly">Monthly</option>
              <option value="semi_monthly">Twice a month (15 days apart)</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <DateInput
            label="First Due Date"
            value={firstDueDate}
            onChange={setFirstDueDate}
            required
          />
        </div>

        {/* Interest Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Interest Calculation
            </label>
            <select
              value={interestMode}
              onChange={(e) => setInterestMode(e.target.value as InterestMode)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="none">0% (No interest)</option>
              <option value="add_on_rate">Monthly add-on rate (%)</option>
              <option value="fixed_amount">Fixed total interest amount</option>
              <option value="from_installment_amount">From known installment amount</option>
            </select>
          </div>

          {interestMode === 'add_on_rate' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Monthly Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={interestValue}
                onChange={(e) => setInterestValue(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {interestMode === 'fixed_amount' && (
            <MoneyInput
              label="Total Interest Amount"
              value={interestValue}
              onChange={setInterestValue}
            />
          )}

          {interestMode === 'from_installment_amount' && (
            <MoneyInput
              label="Installment Amount (per due)"
              value={installmentAmount}
              onChange={setInstallmentAmount}
            />
          )}
        </div>

        {/* Fees + Weekend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput label="Processing / Setup Fees" value={fees} onChange={setFees} />
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Fees Allocation
            </label>
            <select
              value={feesSpread}
              onChange={(e) => setFeesSpread(e.target.value as 'first_due' | 'all_dues')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="all_dues">Spread across all dues</option>
              <option value="first_due">Add to first due</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Weekend Rule
            </label>
            <select
              value={weekendRule}
              onChange={(e) => setWeekendRule(e.target.value as WeekendRule)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="none">Keep exact weekend date</option>
              <option value="next_business_day">Next business day (Sat/Sun → Monday after)</option>
              <option value="previous_business_day">Previous business day (Sat/Sun → Friday before)</option>
            </select>
          </div>
        </div>

        {/* Live Calculator Preview */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Live Schedule Preview
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {termCount} installment{termCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Per installment</div>
              <div className="font-mono-num tabular-nums font-semibold text-sm text-slate-900 dark:text-slate-100">
                {formatAmount(previewSchedule.regularInstallmentAmount)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Interest + Fees</div>
              <div className="font-mono-num tabular-nums font-semibold text-sm text-amber-600 dark:text-amber-400">
                {formatAmount(previewSchedule.totalInterest + previewSchedule.totalFees)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Total Cost</div>
              <div className="font-mono-num tabular-nums font-semibold text-sm text-slate-900 dark:text-slate-100">
                {formatAmount(previewSchedule.totalPayable)}
              </div>
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-medium">#</th>
                  <th className="px-2.5 py-1.5 text-left font-medium">Due Date</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previewSchedule.dues.map((d) => (
                  <tr key={d.seq}>
                    <td className="px-2.5 py-1.5 text-slate-500">
                      {d.kind === 'down_payment' ? 'DP' : d.seq}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300">
                      {formatDate(d.dueDate)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
                      {formatAmount(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : plan ? 'Save Plan' : 'Create Plan'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};
