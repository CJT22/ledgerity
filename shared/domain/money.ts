import { Money } from '../types';

export function formatMoney(
  cents: Money,
  currencyCode = 'PHP',
  locale = 'en-PH',
  options?: { showSign?: boolean; minimumFractionDigits?: number }
): string {
  const amount = cents / 100;
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));

    if (cents < 0) return `-${formatted}`;
    if (options?.showSign && cents > 0) return `+${formatted}`;
    return formatted;
  } catch {
    const absStr = (Math.abs(cents) / 100).toFixed(2);
    const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';
    return `${sign}${currencyCode} ${absStr}`;
  }
}

export function formatCompactMoney(
  cents: Money,
  currencyCode = 'PHP',
  locale = 'en-PH'
): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      notation: Math.abs(amount) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amount) >= 10000 ? 1 : 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${Math.round(amount)}`;
  }
}

export function parseMoneyInput(input: string): Money {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function centsToDecimalString(cents: Money): string {
  return (cents / 100).toFixed(2);
}

export function getCurrencySymbol(currencyCode = 'PHP', locale = 'en-PH'): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}
