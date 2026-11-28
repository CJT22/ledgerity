import {
  AlertCircle,
  Check,
  Clock,
  Link2,
  Sparkles,
} from 'lucide-react';
import React from 'react';
import { DueStatus, ExpenseStatus } from '@shared/types';

interface StatusBadgeProps {
  status: DueStatus | ExpenseStatus | 'linked' | 'planned_tag' | 'done';
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  switch (status) {
    case 'paid':
    case 'fully_paid':
    case 'done':
      return (
        <span className="inline-flex items-center align-middle gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label ?? (status === 'fully_paid' ? 'Fully paid' : status === 'done' ? 'Done' : 'Paid')}</span>
        </span>
      );
    case 'overdue':
      return (
        <span className="inline-flex items-center align-middle gap-1 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap shrink-0">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          <span>{label ?? 'Overdue'}</span>
        </span>
      );
    case 'due_today':
      return (
        <span className="inline-flex items-center align-middle gap-1 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0">
          <Clock className="w-3 h-3" aria-hidden="true" />
          <span>{label ?? 'Due today'}</span>
        </span>
      );
    case 'partial':
      return (
        <span className="inline-flex items-center align-middle gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{label ?? 'Partial'}</span>
        </span>
      );
    case 'planned':
    case 'planned_tag':
      return (
        <span className="inline-flex items-center align-middle gap-1 rounded-md border border-dashed border-violet-400 dark:border-violet-700 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300 whitespace-nowrap shrink-0">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          <span>{label ?? 'Planned'}</span>
        </span>
      );
    case 'linked':
      return (
        <span className="inline-flex items-center align-middle gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
          <Link2 className="w-3 h-3" aria-hidden="true" />
          <span>{label ?? 'From Expenses'}</span>
        </span>
      );
    case 'active':
      return (
        <span className="inline-flex items-center align-middle gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap shrink-0">
          <span>{label ?? 'Active'}</span>
        </span>
      );
    case 'upcoming':
    default:
      return (
        <span className="inline-flex items-center align-middle gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          <span>{label ?? 'Upcoming'}</span>
        </span>
      );
  }
};
