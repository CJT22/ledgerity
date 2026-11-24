import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { parseISODate, toISODate } from '@shared/domain';
import { ISODate, UpcomingDueItem } from '@shared/types';

interface MiniCalendarProps {
  today: ISODate;
  paydayDates: ISODate[];
  dues: UpcomingDueItem[];
}

export const MiniCalendar: React.FC<MiniCalendarProps> = ({
  today,
  paydayDates,
  dues,
}) => {
  const { formatAmount, formatDate } = useApp();
  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(parseISODate(today)));
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(today);

  const paydaySet = useMemo(() => new Set(paydayDates), [paydayDates]);
  const duesByDate = useMemo(() => {
    const map = new Map<ISODate, UpcomingDueItem[]>();
    for (const d of dues) {
      const list = map.get(d.dueDate) ?? [];
      list.push(d);
      map.set(d.dueDate, list);
    }
    return map;
  }, [dues]);

  const days = useMemo(() => {
    const mStart = startOfMonth(cursorMonth);
    const mEnd = endOfMonth(cursorMonth);
    return eachDayOfInterval({
      start: startOfWeek(mStart),
      end: endOfWeek(mEnd),
    });
  }, [cursorMonth]);

  const selectedDues = selectedDate ? (duesByDate.get(selectedDate) ?? []) : [];
  const selectedIsPayday = selectedDate ? paydaySet.has(selectedDate) : false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {format(cursorMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursorMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCursorMonth(startOfMonth(parseISODate(today)));
              setSelectedDate(today);
            }}
            className="px-2 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursorMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, i) => (
          <div
            key={`${wd}-${i}`}
            className="text-[11px] font-medium text-slate-400 dark:text-slate-500 py-1"
          >
            {wd}
          </div>
        ))}
        {days.map((d) => {
          const iso = toISODate(d);
          const inMonth = isSameMonth(d, cursorMonth);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const isPayday = paydaySet.has(iso);
          const dayDues = duesByDate.get(iso) ?? [];
          const hasOverdue = dayDues.some((it) => it.status === 'overdue');
          const hasDue = dayDues.length > 0;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDate(iso)}
              className={`relative h-9 rounded-lg flex flex-col items-center justify-center text-xs font-mono-num tabular-nums transition-colors ${
                isSelected
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white font-semibold'
                  : isToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800'
                    : inMonth
                      ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              <span>{d.getDate()}</span>
              {(isPayday || hasDue) && (
                // Absolutely positioned so dates with markers stay aligned with the rest
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                  {isPayday && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                      title="Payday"
                    />
                  )}
                  {hasDue && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasOverdue ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      title={hasOverdue ? 'Overdue due' : 'Expense due'}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Payday
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Overdue
        </span>
      </div>

      {selectedDate && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {formatDate(selectedDate)}
          </div>
          {!selectedIsPayday && selectedDues.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No paydays or dues on this date.
            </p>
          ) : (
            <div className="space-y-1">
              {selectedIsPayday && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  Payday inflow scheduled
                </div>
              )}
              {selectedDues.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300"
                >
                  <span className="truncate">
                    {d.expenseIcon} {d.title}
                  </span>
                  <span
                    className={`font-mono-num tabular-nums shrink-0 ${
                      d.status === 'overdue'
                        ? 'text-rose-600 dark:text-rose-400 font-medium'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {formatAmount(d.remaining)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
