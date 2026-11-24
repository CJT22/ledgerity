import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'planned';
  size?: 'md' | 'lg';
  /**
   * Font for the value. Defaults to monospaced digits for amounts/numbers and the regular
   * font for word-like values ("Nov 24, 2026", "1d to payday").
   */
  valueFont?: 'mono' | 'sans';
  className?: string;
}

const looksLikeWords = (v: string) => /[A-Za-z]{3,}/.test(v);

/**
 * Width of one monospaced character in em (JetBrains Mono is 0.6em; a little extra covers
 * tight tracking and currency symbols drawn from a fallback font).
 */
const MONO_CHAR_EM = 0.64;

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = 'default',
  size = 'md',
  valueFont,
  className = '',
}) => {
  const valueToneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : tone === 'planned'
            ? 'text-violet-600 dark:text-violet-400'
            : 'text-slate-900 dark:text-slate-100';

  const font = valueFont ?? (looksLikeWords(value) ? 'sans' : 'mono');

  return (
    // Content is top-aligned so values line up across a row of cards, whatever the subtext.
    // The card is a size container so amounts can shrink to fit narrow cards (see below).
    <div
      className={`@container rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col min-w-0 ${
        tone === 'planned' ? 'border-dashed border-violet-300 dark:border-violet-800' : ''
      } ${className}`}
    >
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate" title={label}>
        {label}
      </div>
      <div
        className={`mt-1.5 font-semibold tracking-tight leading-tight ${
          font === 'mono'
            ? 'font-mono-num tabular-nums whitespace-nowrap'
            : 'font-[family-name:var(--font-display)] break-words'
        } ${size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} ${valueToneClass}`}
        title={value}
      >
        {font === 'mono' ? (
          // Amounts never wrap mid-number: keep the normal size, but shrink to the card width
          <span
            style={{
              fontSize: `min(1em, calc(100cqi / ${(MONO_CHAR_EM * Math.max(value.length, 1)).toFixed(2)}))`,
            }}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </div>
      {subtext && (
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-snug">
          {subtext}
        </div>
      )}
    </div>
  );
};
