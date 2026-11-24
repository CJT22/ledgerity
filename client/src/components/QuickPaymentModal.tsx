import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { todayISODate } from '@shared/domain';
import { ISODate, Money, PaymentTargetType } from '@shared/types';
import { DateInput } from './DateInput';
import { Modal } from './Modal';
import { MoneyInput } from './MoneyInput';

export interface PaymentDraftTarget {
  title: string;
  subtitle?: string;
  targetType: PaymentTargetType;
  targetId: string;
  occurrenceDate?: ISODate;
  suggestedAmount: Money;
}

interface QuickPaymentModalProps {
  target: PaymentDraftTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

export const QuickPaymentModal: React.FC<QuickPaymentModalProps> = ({
  target,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();
  const [date, setDate] = useState<ISODate>(todayISODate());
  const [amount, setAmount] = useState<Money>(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (target) {
      setDate(todayISODate());
      setAmount(target.suggestedAmount);
      setNote('');
      setError('');
    }
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    setSaving(true);
    try {
      await api.logPayment({
        date,
        amount,
        note: note.trim() || undefined,
        targetType: target.targetType,
        targetId: target.targetId,
        occurrenceDate: target.occurrenceDate,
      });
      toast('Payment logged');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Log Payment"
      subtitle={`${target.title}${target.subtitle ? ` · ${target.subtitle}` : ''}`}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <MoneyInput
          label="Amount"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setError('');
          }}
          required
          error={error}
        />

        <DateInput label="Payment Date" value={date} onChange={setDate} required />


        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reference number or remark"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
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
            className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
