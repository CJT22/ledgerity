import { ISODate, WeekendRule } from '../types';
import {
  addDaysISO,
  adjustWeekend,
  clampDayInMonth,
  diffDaysISO,
  parseISODate,
} from './date';

export interface CutoffPeriodDef {
  id: string;
  startDate: ISODate;
  endDate: ISODate;
  paydayDate: ISODate;
  label: string;
}

/**
 * Generates cutoff periods covering [from, to] based on cutoffDays (e.g., [10, 25]).
 * Each payday is adjusted by weekendRule; the period starts on the adjusted payday
 * and ends the day before the next adjusted payday.
 */
export function getCutoffPeriods(
  from: ISODate,
  to: ISODate,
  cutoffDays: number[],
  weekendRule: WeekendRule
): CutoffPeriodDef[] {
  const days = (cutoffDays.length > 0 ? [...cutoffDays] : [10, 25]).sort((a, b) => a - b);
  const startD = parseISODate(from);
  // Look back 2 months so the period containing `from` is always included
  let year = startD.getFullYear();
  let month = startD.getMonth() - 2;
  while (month < 0) {
    month += 12;
    year -= 1;
  }

  const endD = parseISODate(to);
  const limitYear = endD.getFullYear();
  const limitMonth = endD.getMonth() + 2;

  const paydays: ISODate[] = [];
  let guard = 0;
  while ((year < limitYear || (year === limitYear && month <= limitMonth)) && guard < 200) {
    guard++;
    for (const d of days) {
      const raw = clampDayInMonth(year, month, d);
      const adjusted = adjustWeekend(raw, weekendRule);
      if (paydays.length === 0 || paydays[paydays.length - 1] !== adjusted) {
        paydays.push(adjusted);
      }
    }
    month += 1;
    if (month >= 12) {
      month = 0;
      year += 1;
    }
  }

  paydays.sort();
  const periods: CutoffPeriodDef[] = [];
  for (let i = 0; i < paydays.length - 1; i++) {
    const pStart = paydays[i];
    const nextPayday = paydays[i + 1];
    const pEnd = addDaysISO(nextPayday, -1);
    if (pEnd < from) continue;
    if (pStart > to) break;
    periods.push({
      id: `${pStart}_${pEnd}`,
      startDate: pStart,
      endDate: pEnd,
      paydayDate: pStart,
      label: `${pStart} — ${pEnd}`,
    });
  }

  return periods;
}

export function getNextPaydayInfo(
  today: ISODate,
  cutoffDays: number[],
  weekendRule: WeekendRule
): { nextPayday: ISODate | null; daysUntil: number | null; currentPeriod: CutoffPeriodDef | null } {
  const lookAhead = addDaysISO(today, 65);
  const periods = getCutoffPeriods(addDaysISO(today, -35), lookAhead, cutoffDays, weekendRule);
  const currentPeriod = periods.find((p) => today >= p.startDate && today <= p.endDate) ?? null;
  const futurePaydayPeriod = periods.find((p) => p.paydayDate > today) ?? null;
  const nextPayday = futurePaydayPeriod ? futurePaydayPeriod.paydayDate : null;
  const daysUntil = nextPayday ? diffDaysISO(nextPayday, today) : null;
  return { nextPayday, daysUntil, currentPeriod };
}
