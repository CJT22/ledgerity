import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import React from 'react';
import { useApp } from '../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-lg text-sm text-slate-900 dark:text-slate-100"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {t.variant === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            {t.variant === 'error' && (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            {t.variant === 'info' && <Info className="w-4 h-4 text-sky-500 shrink-0" />}
            <span className="truncate">{t.message}</span>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
