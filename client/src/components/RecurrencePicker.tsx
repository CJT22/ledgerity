import React from 'react';
import { RecurrenceRule, WeekendRule } from '@shared/types';
import { DateInput } from './DateInput';

interface RecurrencePickerProps {
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
  allowOnce?: boolean;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Freq = RecurrenceRule['freq'];

/** Single list of schedule choices (replaces the old presets + Repeat Pattern dropdown). */
const FREQ_OPTIONS: { value: Freq; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semi_monthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const dayLabel = (d: number) => (d === -1 ? 'last day' : ordinal(d));

/** "every month" / "every 2nd month" style phrase. */
const everyNth = (n: number, unit: string) => (n === 1 ? `every ${unit}` : `every ${ordinal(n)} ${unit}`);

/**
 * Unit shown after the "Repeat every" number, plus a plain-English summary
 * of what the interval actually produces for the chosen pattern.
 */
const describeInterval = (rule: RecurrenceRule): { unit: string; summary: string } => {
  const n = Math.max(1, rule.interval || 1);
  const plural = (word: string) => (n === 1 ? word : `${word}s`);
  switch (rule.freq) {
    case 'daily':
      return { unit: plural('day'), summary: n === 1 ? 'Every day' : `Every ${n} days` };
    case 'weekly':
      return { unit: plural('week'), summary: n === 1 ? 'Every week' : `Every ${n} weeks` };
    case 'biweekly':
      return { unit: plural('2-week period'), summary: `Every ${n * 2} weeks` };
    case 'semi_monthly': {
      const days = (rule.byMonthDays && rule.byMonthDays.length > 0 ? rule.byMonthDays : [10, 25])
        .map(dayLabel)
        .join(' & ');
      return { unit: plural('month'), summary: `On the ${days}, ${everyNth(n, 'month')}` };
    }
    case 'monthly': {
      const day = rule.byMonthDays?.[0] ?? Number(rule.startDate.split('-')[2] || 1);
      return { unit: plural('month'), summary: `On the ${dayLabel(day)}, ${everyNth(n, 'month')}` };
    }
    case 'yearly':
      return { unit: plural('year'), summary: n === 1 ? 'Every year' : `Every ${n} years` };
    default:
      return { unit: '', summary: '' };
  }
};

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({
  value,
  onChange,
  allowOnce = true,
}) => {
  const startDay = () => Number(value.startDate.split('-')[2] || 1);

  /**
   * Switch frequency and reset the fields that only make sense for the old one,
   * so leftovers (e.g. semi-monthly cutoff days) never leak into the new schedule.
   */
  const selectFreq = (freq: Freq) => {
    if (freq === value.freq) return;
    const base: RecurrenceRule = { ...value, freq, interval: 1, byMonthDays: undefined, byWeekday: undefined };
    if (freq === 'semi_monthly') base.byMonthDays = [10, 25];
    else if (freq === 'monthly') base.byMonthDays = [startDay()];
    onChange(base);
  };

  const endMode = value.count ? 'count' : value.endDate ? 'date' : 'never';
  const intervalInfo = describeInterval(value);
  const intervalId = React.useId();
  const options = FREQ_OPTIONS.filter((o) => allowOnce || o.value !== 'once');

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4">
      <div>
        <div
          id={`${intervalId}-freq`}
          className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          How often
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-1" role="group" aria-labelledby={`${intervalId}-freq`}>
          {options.map((opt) => {
            const active = value.freq === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectFreq(opt.value)}
                aria-pressed={active}
                className={`sm:flex-auto px-1.5 py-1.5 text-xs font-medium whitespace-nowrap rounded-lg border transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateInput
          label="Start Date"
          value={value.startDate}
          onChange={(startDate) => onChange({ ...value, startDate })}
          required
        />

        {value.freq === 'monthly' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Day of month (-1 = last)
            </label>
            <input
              type="number"
              min={-1}
              max={31}
              value={value.byMonthDays?.[0] ?? startDay()}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n === 0) return;
                onChange({ ...value, byMonthDays: [Math.max(-1, Math.min(31, n))] });
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        {value.freq === 'semi_monthly' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cutoff Days (comma-separated)
            </label>
            <input
              type="text"
              value={(value.byMonthDays ?? [10, 25]).join(', ')}
              onChange={(e) => {
                const nums = e.target.value
                  .split(',')
                  .map((s) => Number.parseInt(s.trim(), 10))
                  .filter((n) => !Number.isNaN(n) && (n === -1 || (n >= 1 && n <= 31)));
                if (nums.length > 0) {
                  onChange({ ...value, byMonthDays: nums.slice(0, 2) });
                }
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num text-slate-900 dark:text-slate-100"
            />
          </div>
        )}
      </div>

      {value.freq !== 'once' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={intervalId}
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Repeat every
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={intervalId}
                  type="number"
                  min={1}
                  max={52}
                  value={value.interval}
                  onChange={(e) =>
                    onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
                  }
                  aria-describedby={`${intervalId}-summary`}
                  className="w-20 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{intervalInfo.unit}</span>
              </div>
              <p
                id={`${intervalId}-summary`}
                className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {intervalInfo.summary}
              </p>
            </div>
          </div>

          {value.freq === 'weekly' && (
            <div>
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Weekdays (optional)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_NAMES.map((name, idx) => {
                  const selected = value.byWeekday?.includes(idx) ?? false;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        const cur = value.byWeekday ?? [];
                        const next = selected
                          ? cur.filter((d) => d !== idx)
                          : [...cur, idx].sort((a, b) => a - b);
                        onChange({ ...value, byWeekday: next.length > 0 ? next : undefined });
                      }}
                      className={`px-2 py-1 text-xs rounded-md border ${
                        selected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ends
              </label>
              <select
                value={endMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  if (mode === 'never') {
                    onChange({ ...value, endDate: null, count: null });
                  } else if (mode === 'date') {
                    onChange({ ...value, endDate: value.startDate, count: null });
                  } else {
                    onChange({ ...value, endDate: null, count: 6 });
                  }
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="never">Open-ended (no end)</option>
                <option value="date">On specific date</option>
                <option value="count">After N occurrences</option>
              </select>
            </div>

            {endMode === 'date' && (
              <DateInput
                label="End Date"
                value={value.endDate ?? value.startDate}
                min={value.startDate}
                onChange={(endDate) => onChange({ ...value, endDate })}
              />
            )}

            {endMode === 'count' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Occurrences Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={value.count ?? 6}
                  onChange={(e) =>
                    onChange({ ...value, count: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Weekend Adjustment
        </label>
        <select
          value={value.weekendRule}
          onChange={(e) =>
            onChange({ ...value, weekendRule: e.target.value as WeekendRule })
          }
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="none">Keep exact weekend date</option>
          <option value="next_business_day">Next business day (Sat/Sun → Monday after)</option>
          <option value="previous_business_day">Previous business day (Sat/Sun → Friday before)</option>
        </select>
      </div>
    </div>
  );
};
