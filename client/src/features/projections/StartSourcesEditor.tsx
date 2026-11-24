import { Plus, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Modal, MoneyInput } from '../../components';
import { useApp } from '../../context/AppContext';
import { Money, Projection, StartSource } from '@shared/types';

/** A start source being edited; `key` keeps React rows stable while labels change. */
export interface DraftSource {
  key: string;
  label: string;
  amount: Money;
}

let draftKeySeq = 0;
const nextKey = () => `src_${++draftKeySeq}`;

export function toDraftSources(sources: StartSource[]): DraftSource[] {
  if (sources.length === 0) return [{ key: nextKey(), label: '', amount: 0 }];
  return sources.map((s) => ({ key: nextKey(), label: s.label, amount: s.amount }));
}

/**
 * Turns the editor rows into start sources. Empty rows are dropped; a single unnamed row is
 * a plain lump sum and is called "Starting balance". Several rows each need a name.
 */
export function finalizeSources(draft: DraftSource[]): { sources: StartSource[]; error?: string } {
  const rows = draft
    .map((d) => ({ label: d.label.trim(), amount: d.amount }))
    .filter((d) => d.label !== '' || d.amount !== 0);
  if (rows.length === 1 && rows[0].label === '') {
    return { sources: [{ label: 'Starting balance', amount: rows[0].amount }] };
  }
  if (rows.some((r) => r.label === '')) {
    return { sources: [], error: 'Give each starting source a name.' };
  }
  return { sources: rows };
}

interface StartSourcesEditorProps {
  value: DraftSource[];
  onChange: (next: DraftSource[]) => void;
}

export const StartSourcesEditor: React.FC<StartSourcesEditorProps> = ({ value, onChange }) => {
  const { formatAmount } = useApp();
  const total = value.reduce((s, d) => s + d.amount, 0);

  const update = (key: string, patch: Partial<DraftSource>) =>
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => {
    const next = value.filter((d) => d.key !== key);
    onChange(next.length ? next : [{ key: nextKey(), label: '', amount: 0 }]);
  };
  const add = () => onChange([...value, { key: nextKey(), label: '', amount: 0 }]);

  return (
    <div>
      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
        Starting Balance
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
        One lump sum, or several sources (e.g. bank, cash on hand) that add up to the total.
      </p>
      <div className="space-y-2">
        {value.map((d) => (
          <div key={d.key} className="flex items-center gap-2">
            <input
              type="text"
              value={d.label}
              onChange={(e) => update(d.key, { label: e.target.value })}
              placeholder={value.length === 1 ? 'Name (optional)' : 'e.g., Payroll bank'}
              aria-label="Source name"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100"
            />
            <MoneyInput
              compact
              className="w-36 shrink-0"
              value={d.amount}
              onChange={(v) => update(d.key, { amount: v })}
            />
            <button
              type="button"
              onClick={() => remove(d.key)}
              disabled={value.length === 1 && d.label === '' && d.amount === 0}
              className="p-1.5 shrink-0 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
              title="Remove source"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Add source
        </button>
        {value.length > 1 && (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            Total{' '}
            <span className="font-mono-num tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {formatAmount(total)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

interface StartSourcesModalProps {
  open: boolean;
  projection: Projection;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit the start sources of an existing projection. */
export const StartSourcesModal: React.FC<StartSourcesModalProps> = ({
  open,
  projection,
  onClose,
  onSaved,
}) => {
  const { toast } = useApp();
  const [draft, setDraft] = useState<DraftSource[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraftSources(projection.startSources));
    setError('');
  }, [open, projection.startSources]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { sources, error: err } = finalizeSources(draft);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    try {
      await api.updateProjection(projection.id, { startSources: sources });
      toast('Starting balance updated');
      onSaved();
      onClose();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Failed to save starting balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Starting Balance"
      subtitle={`Where the money for "${projection.name}" starts from.`}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <StartSourcesEditor
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setError('');
          }}
        />
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
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
