import React from 'react';
import { useApp } from '../context/AppContext';
import { ISODate } from '@shared/types';

interface DateInputProps {
  value: ISODate;
  onChange: (date: ISODate) => void;
  id?: string;
  label?: string;
  required?: boolean;
  min?: ISODate;
  max?: ISODate;
  disabled?: boolean;
  error?: string;
  className?: string;
  showFormattedHint?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  id,
  label,
  required = false,
  min,
  max,
  disabled = false,
  error,
  className = '',
  showFormattedHint = true,
}) => {
  const { formatDate } = useApp();

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor={id}
            className="text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
            {required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          {showFormattedHint && value && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatDate(value)}
            </span>
          )}
        </div>
      )}
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${
          error
            ? 'border-rose-500 dark:border-rose-500'
            : 'border-slate-300 dark:border-slate-700'
        }`}
      />
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
};
