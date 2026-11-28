import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Drawer, MoneyInput, RecurrencePicker } from '../../components';
import { useApp } from '../../context/AppContext';
import { normalizeRecurrence, todayISODate } from '@shared/domain';
import { Money, Part, PartKind, PaymentMode, RecurrenceRule } from '@shared/types';

interface PartDrawerProps {
  open: boolean;
  expenseId: string;
  part?: Part | null;
  onClose: () => void;
  onSaved: () => void;
}

export const PartDrawer: React.FC<PartDrawerProps> = ({
  open,
  expenseId,
  part,
  onClose,
  onSaved,
}) => {
  const { settings, toast } = useApp();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<PartKind>('one_time');
  const [isPlanned, setIsPlanned] = useState(false);
  const [price, setPrice] = useState<Money>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceRule>({
    freq: 'monthly',
    interval: 1,
    startDate: todayISODate(),
    weekendRule: settings.defaultWeekendRule,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(part?.name ?? '');
      setKind(part?.kind ?? 'one_time');
      setIsPlanned(part?.isPlanned ?? false);
      setPrice(part?.price ?? 0);
      setPaymentMode(part?.paymentMode ?? 'full');
      setNotes(part?.notes ?? '');
      setRecurrence(
        part?.recurrence ? normalizeRecurrence(part.recurrence) : {
          freq: 'monthly',
          interval: 1,
          startDate: todayISODate(),
          weekendRule: settings.defaultWeekendRule,
        }
      );
      setError('');
    }
  }, [open, part, settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Part name is required.');
      return;
    }
    if (price <= 0) {
      setError('Price must be greater than zero.');
      return;
    }
    if (kind === 'recurring' && recurrence.freq === 'custom' && !recurrence.dates?.length) {
      setError('Pick at least one date on the calendar.');
      return;
    }
    if (kind === 'recurring' && recurrence.endDate && recurrence.endDate < recurrence.startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<Part, 'id'> = {
        expenseId,
        name: name.trim(),
        notes: notes.trim() || undefined,
        kind,
        isPlanned,
        price,
        paymentMode: kind === 'one_time' ? (paymentMode || 'full') : null,
        recurrence: kind === 'recurring' ? recurrence : undefined,
      };
      if (part) {
        await api.updatePart(part.id, payload);
        toast('Part updated');
      } else {
        await api.createPart(payload);
        toast('Part added');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save part');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={part ? 'Edit Part' : 'Add Part'}
      subtitle="Add a one-time item, planned purchase, flexible balance, or recurring fee."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Part Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., 27&quot; Monitor, Insurance, Processing Fee"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('one_time')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              kind === 'one_time'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            One-time purchase
          </button>
          <button
            type="button"
            onClick={() => {
              setKind('recurring');
              setIsPlanned(false);
            }}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              kind === 'recurring'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            Recurring fee
          </button>
        </div>

        <MoneyInput
          label={kind === 'recurring' ? 'Amount per occurrence' : 'Cash / Estimated Price'}
          value={price}
          onChange={(v) => {
            setPrice(v);
            setError('');
          }}
          required
        />

        {kind === 'one_time' && (
          <>
            <label className="flex items-start gap-2.5 rounded-lg border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPlanned}
                onChange={(e) => setIsPlanned(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <div>
                <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  Planned / Wishlist (not yet bought)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Kept separate from committed totals until purchased.
                </div>
              </div>
            </label>

            {!isPlanned && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMode ?? 'full'}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="full">Pay in full / lump sum</option>
                  <option value="flexible">Flexible balance (pay any amount)</option>
                  <option value="installment">Installment plan</option>
                </select>
              </div>
            )}
          </>
        )}

        {kind === 'recurring' && (
          <RecurrencePicker
            value={recurrence}
            onChange={setRecurrence}
            allowOnce={false}
          />
        )}


        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
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
            {saving ? 'Saving...' : part ? 'Save Part' : 'Add Part'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};
