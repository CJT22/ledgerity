import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { DateInput, Modal, MoneyInput } from '../../components';
import { useApp } from '../../context/AppContext';
import { todayISODate } from '@shared/domain';
import { ISODate, Money } from '@shared/types';

interface CheckpointModalProps {
  open: boolean;
  projectionId: string;
  minDate: ISODate;
  maxDate: ISODate;
  onClose: () => void;
  onSaved: () => void;
}

export const CheckpointModal: React.FC<CheckpointModalProps> = ({
  open,
  projectionId,
  minDate,
  maxDate,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();

  const [date, setDate] = useState<ISODate>(todayISODate());
  const [actualBalance, setActualBalance] = useState<Money>(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = todayISODate();
    setDate(t >= minDate && t <= maxDate ? t : minDate);
    setActualBalance(0);
    setNote('Actual total on hand');
    setError('');
  }, [open, minDate, maxDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Date is required.');
      return;
    }
    setSaving(true);
    try {
      await api.createCheckpoint({
        projectionId,
        date,
        actualBalance,
        note: note.trim() || undefined,
      });
      toast('Balance checkpoint added');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create checkpoint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set Actual Balance (Checkpoint)"
      subtitle="Enter how much you actually had in total on a date. The projection adds an adjustment row and continues from that amount."
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <DateInput
          label="Checkpoint Date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={setDate}
          required
        />

        <MoneyInput
          label="Actual Total Balance on Date"
          value={actualBalance}
          onChange={setActualBalance}
          required
        />

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply Checkpoint'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
