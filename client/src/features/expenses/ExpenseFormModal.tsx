import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components';
import { useApp } from '../../context/AppContext';
import { Expense } from '@shared/types';

const EMOJI_CHOICES = ['🖥️', '🚗', '🎮', '🤝', '💻', '🏠', '📱', '✈️', '🎓', '🏥', '🛠️', '🛒'];
const COLOR_CHOICES = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

interface ExpenseFormModalProps {
  open: boolean;
  expense?: Expense | null;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  open,
  expense,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🖥️');
  const [color, setColor] = useState('#0ea5e9');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(expense?.name ?? '');
      setDescription(expense?.description ?? '');
      setIcon(expense?.icon ?? '🖥️');
      setColor(expense?.color ?? '#0ea5e9');
      setNotes(expense?.notes ?? '');
      setError('');
    }
  }, [open, expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Expense name is required.');
      return;
    }
    setSaving(true);
    try {
      const saved = expense
        ? await api.updateExpense(expense.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            icon,
            color,
            notes: notes.trim() || undefined,
          })
        : await api.createExpense({
            name: name.trim(),
            description: description.trim() || undefined,
            icon,
            color,
            archived: false,
            notes: notes.trim() || undefined,
          });
      toast(expense ? 'Expense updated' : 'Expense created');
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Edit Expense' : 'New Expense'}
      subtitle="Group related parts, installment plans, and recurring fees under one expense."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., Gaming PC, Car, Home Renovation"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Icon
          </label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition-colors ${
                  icon === em
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Accent Color
          </label>
          <div className="flex items-center gap-2">
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary of what this expense covers"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

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
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : expense ? 'Save Changes' : 'Create Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
