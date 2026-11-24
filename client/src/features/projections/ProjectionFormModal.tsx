import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { DateInput, Modal } from '../../components';
import { useApp } from '../../context/AppContext';
import { addMonthsISO, todayISODate } from '@shared/domain';
import { ISODate, Projection } from '@shared/types';
import { DraftSource, finalizeSources, StartSourcesEditor, toDraftSources } from './StartSourcesEditor';

interface ProjectionFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (proj: Projection) => void;
}

export const ProjectionFormModal: React.FC<ProjectionFormModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { toast } = useApp();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<ISODate>(todayISODate());
  const [endDate, setEndDate] = useState<ISODate>(addMonthsISO(todayISODate(), 4));
  const [includeExpenseDues, setIncludeExpenseDues] = useState(true);
  const [sources, setSources] = useState<DraftSource[]>(() => toDraftSources([]));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    const t = todayISODate();
    setStartDate(t);
    setEndDate(addMonthsISO(t, 4));
    setIncludeExpenseDues(true);
    setSources(toDraftSources([]));
    setError('');
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Projection name is required.');
      return;
    }
    if (!startDate || !endDate || endDate <= startDate) {
      setError('End date must be after start date.');
      return;
    }
    const { sources: startSources, error: sourceError } = finalizeSources(sources);
    if (sourceError) {
      setError(sourceError);
      return;
    }
    setSaving(true);
    try {
      const created = await api.createProjection({
        name: name.trim(),
        startDate,
        endDate,
        parentProjectionId: null,
        includeExpenseDues,
        startSources,
      });
      toast('Projection created');
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create projection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Cashflow Projection"
      subtitle="Forecast balances across cutoff periods with recurring income, bills, and linked expenses."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Projection Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., Q1 2027 Cashflow"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateInput label="Start Date" value={startDate} onChange={setStartDate} required />
          <DateInput
            label="End Date"
            value={endDate}
            min={startDate}
            onChange={setEndDate}
            required
          />
        </div>

        <StartSourcesEditor
          value={sources}
          onChange={(next) => {
            setSources(next);
            setError('');
          }}
        />

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeExpenseDues}
            onChange={(e) => setIncludeExpenseDues(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>Automatically include dues from Expenses</span>
        </label>

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
            {saving ? 'Creating...' : 'Create Projection'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
