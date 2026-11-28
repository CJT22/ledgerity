import { getDay } from 'date-fns';
import { ISODate, RecurrenceOccurrence, RecurrenceRule } from '../types';
import {
  addDaysISO,
  addMonthsISO,
  addWeeksISO,
  addYearsISO,
  adjustWeekend,
  clampDayInMonth,
  parseISODate,
} from './date';

/**
 * Rewrites legacy rules into their current form without changing which dates they produce:
 * 'biweekly' (every 2N weeks) becomes 'weekly' with interval 2N. Custom rules get their dates
 * sorted and de-duplicated, with startDate set to the first one.
 */
export function normalizeRecurrence(rule: RecurrenceRule): RecurrenceRule {
  if (rule.freq === 'biweekly') {
    return {
      ...rule,
      freq: 'weekly',
      interval: 2 * Math.max(1, rule.interval || 1),
      byWeekday: undefined,
    };
  }
  if (rule.freq === 'custom') {
    const dates = Array.from(new Set(rule.dates ?? [])).sort();
    return {
      ...rule,
      interval: 1,
      dates,
      startDate: dates[0] ?? rule.startDate,
      endDate: null,
      count: null,
      byMonthDays: undefined,
      byWeekday: undefined,
    };
  }
  return rule;
}

/**
 * Expands a RecurrenceRule into occurrences falling within [from, to] (inclusive on effectiveDate or originalDate).
 * Keeps `originalDate` as the stable occurrence key while providing `effectiveDate` after weekendRule.
 */
export function expand(
  rule: RecurrenceRule,
  from: ISODate,
  to: ISODate
): RecurrenceOccurrence[] {
  if (from > to) return [];
  const interval = Math.max(1, rule.interval || 1);
  const hardEnd = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (rule.startDate > hardEnd) return [];

  const maxCount = rule.count && rule.count > 0 ? rule.count : Infinity;
  const results: RecurrenceOccurrence[] = [];
  let generatedCount = 0;

  const pushIfInRange = (originalDate: ISODate): boolean => {
    if (rule.endDate && originalDate > rule.endDate) return false;
    if (generatedCount >= maxCount) return false;
    generatedCount++;
    const effectiveDate = adjustWeekend(originalDate, rule.weekendRule);
    // Include if either original or effective lands inside [from, to]
    // (or strictly effectiveDate in [from, to] so weekend shifts at window edges stay clean)
    if (effectiveDate >= from && effectiveDate <= to) {
      results.push({ originalDate, effectiveDate });
    }
    return true;
  };

  if (rule.freq === 'once') {
    pushIfInRange(rule.startDate);
    return results;
  }

  if (rule.freq === 'custom') {
    const dates = Array.from(new Set(rule.dates ?? [])).sort();
    for (const d of dates) pushIfInRange(d);
    return results;
  }

  if (rule.freq === 'daily') {
    let cur = rule.startDate;
    let guard = 0;
    while (cur <= hardEnd && generatedCount < maxCount && guard < 5000) {
      guard++;
      pushIfInRange(cur);
      cur = addDaysISO(cur, interval);
    }
    return results;
  }

  if (rule.freq === 'weekly' || rule.freq === 'biweekly') {
    const stepWeeks = rule.freq === 'biweekly' ? 2 * interval : interval;
    if (rule.byWeekday && rule.byWeekday.length > 0 && rule.freq === 'weekly') {
      const startD = parseISODate(rule.startDate);
      const startDow = getDay(startD);
      const weekAnchor = addDaysISO(rule.startDate, -startDow);
      let weekIdx = 0;
      let guard = 0;
      while (generatedCount < maxCount && guard < 2000) {
        guard++;
        const baseWeek = addWeeksISO(weekAnchor, weekIdx * stepWeeks);
        if (baseWeek > addDaysISO(hardEnd, 7)) break;
        const sortedDays = [...rule.byWeekday].sort((a, b) => a - b);
        for (const wd of sortedDays) {
          const cand = addDaysISO(baseWeek, wd);
          if (cand < rule.startDate) continue;
          if (cand > hardEnd || generatedCount >= maxCount) break;
          pushIfInRange(cand);
        }
        weekIdx++;
      }
      return results;
    }

    let cur = rule.startDate;
    let guard = 0;
    while (cur <= hardEnd && generatedCount < maxCount && guard < 2000) {
      guard++;
      pushIfInRange(cur);
      cur = addWeeksISO(cur, stepWeeks);
    }
    return results;
  }

  if (rule.freq === 'semi_monthly') {
    const days = (rule.byMonthDays && rule.byMonthDays.length > 0 ? rule.byMonthDays : [10, 25])
      .slice()
      .sort((a, b) => {
        if (a === -1) return 1;
        if (b === -1) return -1;
        return a - b;
      });
    const startD = parseISODate(rule.startDate);
    let year = startD.getFullYear();
    let month = startD.getMonth();
    let guard = 0;
    while (generatedCount < maxCount && guard < 600) {
      guard++;
      const monthFirst = clampDayInMonth(year, month, 1);
      if (monthFirst > addDaysISO(hardEnd, 5)) break;
      const seen = new Set<ISODate>();
      for (const d of days) {
        const cand = clampDayInMonth(year, month, d);
        if (seen.has(cand)) continue;
        seen.add(cand);
        if (cand < rule.startDate) continue;
        if (cand > hardEnd || generatedCount >= maxCount) break;
        pushIfInRange(cand);
      }
      month += interval;
      while (month >= 12) {
        month -= 12;
        year += 1;
      }
    }
    return results;
  }

  if (rule.freq === 'monthly') {
    const startD = parseISODate(rule.startDate);
    const targetDays =
      rule.byMonthDays && rule.byMonthDays.length > 0
        ? rule.byMonthDays
        : [startD.getDate()];
    let step = 0;
    let guard = 0;
    while (generatedCount < maxCount && guard < 600) {
      guard++;
      const anchor = parseISODate(addMonthsISO(clampDayInMonth(startD.getFullYear(), startD.getMonth(), 1), step * interval));
      const y = anchor.getFullYear();
      const m = anchor.getMonth();
      if (clampDayInMonth(y, m, 1) > addDaysISO(hardEnd, 5)) break;

      const sorted = [...targetDays].sort((a, b) => {
        if (a === -1) return 1;
        if (b === -1) return -1;
        return a - b;
      });
      const seen = new Set<ISODate>();
      for (const d of sorted) {
        const cand = clampDayInMonth(y, m, d);
        if (seen.has(cand)) continue;
        seen.add(cand);
        if (cand < rule.startDate) continue;
        if (cand > hardEnd || generatedCount >= maxCount) break;
        pushIfInRange(cand);
      }
      step++;
    }
    return results;
  }

  if (rule.freq === 'yearly') {
    const startD = parseISODate(rule.startDate);
    const targetDay = startD.getDate();
    const targetMonth = startD.getMonth();
    let step = 0;
    let guard = 0;
    while (generatedCount < maxCount && guard < 150) {
      guard++;
      const yearAnchor = parseISODate(addYearsISO(rule.startDate, step * interval));
      const cand = clampDayInMonth(yearAnchor.getFullYear(), targetMonth, targetDay);
      if (cand > hardEnd) break;
      if (cand >= rule.startDate) {
        pushIfInRange(cand);
      }
      step++;
    }
    return results;
  }

  return results;
}
