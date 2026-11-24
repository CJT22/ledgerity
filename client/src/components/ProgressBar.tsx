import React from 'react';

export interface ProgressSegment {
  key: string;
  label: string;
  value: number;
  colorClass: string;
  dashed?: boolean;
}

interface ProgressBarProps {
  segments: ProgressSegment[];
  heightClass?: string;
  showLegend?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  segments,
  heightClass = 'h-2',
  showLegend = false,
  className = '',
}) => {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);

  return (
    <div className={className}>
      <div
        className={`w-full ${heightClass} rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
      >
        {total > 0 &&
          segments.map((seg) => {
            const pct = (Math.max(0, seg.value) / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={seg.key}
                style={{ width: `${pct}%` }}
                title={`${seg.label}`}
                className={`${seg.colorClass} ${
                  seg.dashed ? 'opacity-70 border-l border-dashed border-white/60 dark:border-slate-950/60' : ''
                } transition-all duration-300`}
              />
            );
          })}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {segments
            .filter((s) => s.value > 0)
            .map((seg) => (
              <span key={seg.key} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${seg.colorClass}`} aria-hidden="true" />
                <span>{seg.label}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
};
