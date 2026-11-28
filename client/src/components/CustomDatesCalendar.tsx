import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ISODate } from '@shared/types';
import { parseISODate, toISODate, todayISODate } from '@shared/domain';
import { useApp } from '../context/AppContext';

interface CustomDatesCalendarProps {
  /** Selected dates, sorted ascending. Selections in every month are kept, not just the visible one. */
  value: ISODate[];
  onChange: (dates: ISODate[]) => void;
  /** Dates outside [min, max] are dimmed and can't be picked; navigation stops at those months. */
  min?: ISODate;
  max?: ISODate;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A month with more dates than this is shown as a count in the summary. */
const MAX_DAYS_LISTED = 6;
/** Month groups shown before "Show all" (about two lines in the drawer). */
const MAX_GROUPS_COLLAPSED = 3;

type MonthKey = string; // 'YYYY-MM'

const monthKeyOf = (iso: ISODate): MonthKey => iso.slice(0, 7);
const monthIndex = (key: MonthKey) => {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
};
const keyFromIndex = (idx: number): MonthKey =>
  `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;

const pickInitialMonth = (value: ISODate[], min?: ISODate, max?: ISODate): MonthKey => {
  if (value.length > 0) return monthKeyOf(value[0]);
  let key = monthKeyOf(todayISODate());
  if (min && key < monthKeyOf(min)) key = monthKeyOf(min);
  if (max && key > monthKeyOf(max)) key = monthKeyOf(max);
  return key;
};

export const CustomDatesCalendar: React.FC<CustomDatesCalendarProps> = ({
  value,
  onChange,
  min,
  max,
}) => {
  const { formatDate } = useApp();
  const [month, setMonth] = useState<MonthKey>(() => pickInitialMonth(value, min, max));
  const [expanded, setExpanded] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const today = todayISODate();

  // If the allowed range changes, keep the visible month inside it.
  useEffect(() => {
    if (min && month < monthKeyOf(min)) setMonth(monthKeyOf(min));
    else if (max && month > monthKeyOf(max)) setMonth(monthKeyOf(max));
  }, [min, max, month]);

  const [year, monthNum] = month.split('-').map(Number);
  const first = parseISODate(`${month}-01`);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const leading = first.getDay();

  const canPrev = !min || month > monthKeyOf(min);
  const canNext = !max || month < monthKeyOf(max);
  const shift = (delta: number) => setMonth(keyFromIndex(monthIndex(month) + delta));

  const toggle = (iso: ISODate) => {
    const next = selected.has(iso) ? value.filter((d) => d !== iso) : [...value, iso].sort();
    onChange(next);
  };

  const inMonthCount = value.filter((d) => monthKeyOf(d) === month).length;

  // ---- summary, grouped by month ----
  const groups = useMemo(() => {
    const map = new Map<MonthKey, number[]>();
    for (const d of value) {
      const k = monthKeyOf(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(Number(d.slice(8, 10)));
    }
    return Array.from(map.entries());
  }, [value]);
  const multiYear = groups.length > 0 && groups[0][0].slice(0, 4) !== groups[groups.length - 1][0].slice(0, 4);
  const groupLabel = (k: MonthKey) => {
    const [y, m] = k.split('-').map(Number);
    return multiYear ? `${MONTHS_SHORT[m - 1]} '${String(y).slice(2)}` : MONTHS_SHORT[m - 1];
  };
  const visibleGroups = expanded ? groups : groups.slice(0, MAX_GROUPS_COLLAPSED);
  const hiddenCount = groups.length - visibleGroups.length;

  const cells: (ISODate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(year, monthNum - 1, i + 1))),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Pick dates <span className="text-rose-500">*</span>
        </span>
      </div>

      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 select-none">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canPrev}
            aria-label="Previous month"
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100" aria-live="polite">
            {MONTHS_LONG[monthNum - 1]} {year}
            {inMonthCount > 0 && (
              <span className="ml-1.5 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                · {inMonthCount} picked
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={!canNext}
            aria-label="Next month"
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-[10px] font-medium uppercase text-slate-400 dark:text-slate-500 py-0.5">
              {w}
            </div>
          ))}
          {cells.map((iso, i) => {
            if (!iso) return <div key={`blank-${i}`} />;
            const isSelected = selected.has(iso);
            const outOfRange = (min && iso < min) || (max && iso > max);
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                disabled={Boolean(outOfRange) && !isSelected}
                onClick={() => toggle(iso)}
                aria-pressed={isSelected}
                aria-label={formatDate(iso)}
                className={`h-8 rounded-md text-xs font-mono-num tabular-nums transition-colors ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-semibold hover:bg-emerald-700'
                    : outOfRange
                      ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${isToday && !isSelected ? 'ring-1 ring-inset ring-emerald-500/70' : ''}`}
              >
                {Number(iso.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400" aria-live="polite">
        {value.length === 0 ? (
          <span>Tap days to select them. You can pick days across several months.</span>
        ) : (
          <>
            <div>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {value.length} {value.length === 1 ? 'date' : 'dates'}
              </span>
              {value.length > 1 && (
                <>
                  {' · '}
                  {formatDate(value[0])} – {formatDate(value[value.length - 1])}
                </>
              )}
              {value.length === 1 && <> · {formatDate(value[0])}</>}
              {' · '}
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setExpanded(false);
                }}
                className="text-rose-600 dark:text-rose-400 hover:underline"
              >
                Clear
              </button>
            </div>
            <div>
              {visibleGroups.map(([k, days], i) => (
                <React.Fragment key={k}>
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600"> · </span>}
                  <button
                    type="button"
                    onClick={() => setMonth(k)}
                    title="Show this month"
                    className={`hover:text-emerald-600 dark:hover:text-emerald-400 ${
                      k === month ? 'text-slate-700 dark:text-slate-200' : ''
                    }`}
                  >
                    {days.length > MAX_DAYS_LISTED
                      ? `${groupLabel(k)} (${days.length} dates)`
                      : `${groupLabel(k)} ${days.join(', ')}`}
                  </button>
                </React.Fragment>
              ))}
              {(hiddenCount > 0 || expanded) && groups.length > MAX_GROUPS_COLLAPSED && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {expanded
                      ? 'Show less'
                      : `+${hiddenCount} more ${hiddenCount === 1 ? 'month' : 'months'} · Show all`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
