import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getCurrencySymbol, parseMoneyInput } from '@shared/domain';
import { Money } from '@shared/types';

interface MoneyInputProps {
  value: Money;
  onChange: (cents: Money) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
  compact?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  id,
  label,
  placeholder = '0.00',
  disabled = false,
  required = false,
  error,
  className = '',
  compact = false,
}) => {
  const { settings } = useApp();
  const symbol = getCurrencySymbol(settings.currencyCode, settings.locale);
  const [text, setText] = useState<string>(() =>
    value === 0 ? '' : (value / 100).toFixed(2)
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value === 0 ? '' : (value / 100).toFixed(2));
    }
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, decimal point, and optional minus if needed
    if (/^-?\d*\.?\d{0,2}$/.test(raw) || raw === '') {
      setText(raw);
      onChange(parseMoneyInput(raw));
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const cents = parseMoneyInput(text);
    onChange(cents);
    setText(cents === 0 ? '' : (cents / 100).toFixed(2));
  };

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
        >
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-xs font-medium text-slate-500 dark:text-slate-400">
          {symbol}
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-lg border bg-white dark:bg-slate-950 font-mono-num tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${
            compact ? 'py-1.5 pl-8 pr-2.5 text-xs' : 'py-2 pl-9 pr-3 text-sm'
          } ${
            error
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-300 dark:border-slate-700'
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
};
