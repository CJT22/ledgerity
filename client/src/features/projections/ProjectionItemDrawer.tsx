import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Drawer, MoneyInput, RecurrencePicker } from '../../components';
import { useApp } from '../../context/AppContext';
import { todayISODate } from '@shared/domain';
import {
  Money,
  ProjectionItem,
  ProjectionItemType,
  RecurrenceRule,
} from '@shared/types';

interface ProjectionItemDrawerProps {
  open: boolean;
  projectionId: string;
  defaultDate?: string;
  item?: ProjectionItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ProjectionItemDrawer: React.FC<ProjectionItemDrawerProps> = ({
  open,
  projectionId,
  defaultDate,
  item,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();

  const [type, setType] = useState<ProjectionItemType>('minus');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<Money>(0);
  const [note, setNote] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceRule>({
    freq: 'once',
    interval: 1,
    startDate: defaultDate || todayISODate(),
    weekendRule: 'none',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setType(item.type);
      setName(item.name);
      setAmount(item.amount);
      setNote(item.note ?? '');
      setRecurrence(item.recurrence);
    } else {
      setType('minus');
      setName('');
      setAmount(0);
      setNote('');
      setRecurrence({
        freq: 'once',
        interval: 1,
        startDate: defaultDate || todayISODate(),
        weekendRule: 'none',
      });
    }
    setError('');
  }, [open, item, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (recurrence.endDate && recurrence.endDate < recurrence.startDate) {
      setError('End date must be on or after start date.');
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<ProjectionItem, 'id'> = {
        projectionId,
        type,
        name: name.trim(),
        amount,
        note: note.trim() || undefined,
        recurrence,
      };
      if (item) {
        await api.updateProjectionItem(item.id, payload);
        toast('Projection item updated');
      } else {
        await api.createProjectionItem(payload);
        toast('Projection item added');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item ? 'Edit Projection Series' : 'Add Projection Item'}
      subtitle="Add a recurring or one-time inflow or expense."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('add')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              type === 'add'
                ? 'bg-emerald-600 text-white border-transparent'
                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            + Income / Add
          </button>
          <button
            type="button"
            onClick={() => setType('minus')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              type === 'minus'
                ? 'bg-rose-600 text-white border-transparent'
                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            − Expense / Minus
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Label <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., Salary, Rent, Groceries"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <MoneyInput
          label="Planned Amount"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setError('');
          }}
          required
        />

        <RecurrencePicker value={recurrence} onChange={setRecurrence} allowOnce={true} />

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

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
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
            {saving ? 'Saving...' : item ? 'Save Series' : 'Add Item'}
          </button>
        </div>
      </form>
    </Drawer>
  );
};
