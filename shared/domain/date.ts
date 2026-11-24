import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDay,
  getDaysInMonth,
  isValid,
} from 'date-fns';
import { ISODate, WeekendRule } from '../types';

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISODate(): ISODate {
  return toISODate(new Date());
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISODate(iso), days));
}

export function addWeeksISO(iso: ISODate, weeks: number): ISODate {
  return toISODate(addWeeks(parseISODate(iso), weeks));
}

export function addMonthsISO(iso: ISODate, months: number): ISODate {
  return toISODate(addMonths(parseISODate(iso), months));
}

export function addYearsISO(iso: ISODate, years: number): ISODate {
  return toISODate(addYears(parseISODate(iso), years));
}

export function diffDaysISO(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISODate(a), parseISODate(b));
}

export function clampDayInMonth(year: number, monthIndex0: number, day: number): ISODate {
  const daysInMonth = getDaysInMonth(new Date(year, monthIndex0, 1));
  const targetDay = day === -1 ? daysInMonth : Math.min(Math.max(1, day), daysInMonth);
  return toISODate(new Date(year, monthIndex0, targetDay));
}

export function endOfMonthISO(iso: ISODate): ISODate {
  return toISODate(endOfMonth(parseISODate(iso)));
}

export function adjustWeekend(iso: ISODate, rule: WeekendRule): ISODate {
  if (rule === 'none') return iso;
  const date = parseISODate(iso);
  const dow = getDay(date); // 0=Sun, 6=Sat
  if (dow !== 0 && dow !== 6) return iso;

  if (rule === 'next_business_day') {
    const offset = dow === 6 ? 2 : 1; // Sat -> Mon (+2), Sun -> Mon (+1)
    return toISODate(addDays(date, offset));
  }
  // previous_business_day
  const offset = dow === 6 ? -1 : -2; // Sat -> Fri (-1), Sun -> Fri (-2)
  return toISODate(addDays(date, offset));
}

export function formatDisplayDate(iso: ISODate | null | undefined, dateFormat = 'MMM d, yyyy'): string {
  if (!iso) return '—';
  const date = parseISODate(iso);
  if (!isValid(date)) return iso;
  try {
    return format(date, dateFormat);
  } catch {
    return format(date, 'MMM d, yyyy');
  }
}

export function formatShortDate(iso: ISODate): string {
  return formatDisplayDate(iso, 'MMM d');
}

export function compareISO(a: ISODate, b: ISODate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}
