import { Monitor, Moon, Sun } from 'lucide-react';
import React from 'react';
import { useApp } from '../context/AppContext';

interface ThemeToggleProps {
  /** Icons only (phone header). */
  compact?: boolean;
  /** Stretch to the container width with three equal segments (sidebar). */
  fullWidth?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, fullWidth = false }) => {
  const { settings, updateSettings } = useApp();
  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="w-3.5 h-3.5 shrink-0" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-3.5 h-3.5 shrink-0" /> },
    { value: 'system', label: 'System', icon: <Monitor className="w-3.5 h-3.5 shrink-0" /> },
  ];

  return (
    <div
      className={`${
        fullWidth ? 'flex w-full' : 'inline-flex items-center'
      } gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700`}
      role="group"
      aria-label="Theme preference"
    >
      {options.map((opt) => {
        const active = settings.theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => void updateSettings({ theme: opt.value })}
            title={`Theme: ${opt.label}`}
            aria-label={compact ? `Theme: ${opt.label}` : undefined}
            aria-pressed={active}
            className={`inline-flex items-center justify-center ${
              fullWidth ? 'flex-auto gap-1' : 'gap-1.5'
            } ${compact ? 'p-1.5' : fullWidth ? 'px-2 py-1.5' : 'px-2.5 py-1.5'} text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              active
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {opt.icon}
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
};
