import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { DateInput, Modal } from '../../components';
import { useApp } from '../../context/AppContext';
import { ISODate, Projection } from '@shared/types';

interface ProjectionDetailsModalProps {
  open: boolean;
  projection: Projection;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit a projection's name and date range. */
export const ProjectionDetailsModal: React.FC<ProjectionDetailsModalProps> = ({
  open,
  projection,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();
  const [name, setName] = useState(projection.name);
  const [startDate, setStartDate] = useState<ISODate>(projection.startDate);
  const [endDate, setEndDate] = useState<ISODate>(projection.endDate);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(projection.name);
    setStartDate(projection.startDate);
    setEndDate(projection.endDate);
    setError('');
  }, [open, projection]);

  const narrowed = startDate > projection.startDate || endDate < projection.endDate;

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
    setSaving(true);
    try {
      await api.updateProjection(projection.id, { name: name.trim(), startDate, endDate });
      toast('Projection updated');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update projection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Projection" subtitle="Rename it or change its date range.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Projection Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            maxLength={150}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateInput
            label="Start Date"
            value={startDate}
            onChange={(d) => {
              setStartDate(d);
              setError('');
            }}
            required
          />
          <DateInput
            label="End Date"
            value={endDate}
            min={startDate}
            onChange={(d) => {
              setEndDate(d);
              setError('');
            }}
            required
          />
        </div>

        {narrowed && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Items dated outside the new range are hidden, not deleted. They come back if you widen the
            range again.
          </p>
        )}

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
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
