import React from 'react';

interface ProgressRingProps {
  current: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  colorClass?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  current,
  total,
  size = 64,
  strokeWidth = 6,
  label,
  sublabel,
  colorClass = 'stroke-emerald-500',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  const offset = circumference * (1 - ratio);

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-300`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xs font-semibold font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
          {label ?? `${current}/${total}`}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
