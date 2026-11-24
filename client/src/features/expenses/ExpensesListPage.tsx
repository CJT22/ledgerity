import { Plus, Receipt, Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import {
  Card,
  EmptyState,
  ProgressBar,
  StatCard,
  StatusBadge,
} from '../../components';
import { useApp } from '../../context/AppContext';
import { todayISODate } from '@shared/domain';
import { ExpenseStatus, ExpenseSummary } from '@shared/types';
import { ExpenseFormModal } from './ExpenseFormModal';

export const ExpensesListPage: React.FC = () => {
  const { formatAmount, formatDate } = useApp();
  const navigate = useNavigate();

  const [summaries, setSummaries] = useState<ExpenseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getExpenses();
      setSummaries(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summaries.filter((es) => {
      if (!showArchived && es.expense.archived) return false;
      if (statusFilter !== 'all' && es.status !== statusFilter) return false;
      if (
        q &&
        !es.expense.name.toLowerCase().includes(q) &&
        !(es.expense.description ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [summaries, showArchived, statusFilter, search]);

  const totals = useMemo(() => {
    const visible = summaries.filter((s) => (showArchived ? true : !s.expense.archived));
    return {
      paid: visible.reduce((sum, s) => sum + s.paidSoFar, 0),
      remaining: visible.reduce((sum, s) => sum + s.remainingCommitted, 0),
      planned: visible.reduce((sum, s) => sum + s.plannedEstimated, 0),
      financing: visible.reduce((sum, s) => sum + s.costOfFinancing, 0),
    };
  }, [summaries, showArchived]);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Expenses
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track multi-part purchases, installment plans, recurring fees, and planned wishlists
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>New expense</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Paid So Far"
          value={formatAmount(totals.paid)}
          tone="positive"
        />
        <StatCard
          label="Remaining Committed"
          value={formatAmount(totals.remaining)}
        />
        <StatCard
          label="Planned (Estimated)"
          value={formatAmount(totals.planned)}
          tone="planned"
        />
        <StatCard
          label="Cost of Financing"
          value={formatAmount(totals.financing)}
          tone="warning"
          subtext="Interest, fees & late charges"
        />
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'planned', label: 'Planned' },
                { value: 'fully_paid', label: 'Fully paid' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.value
                    ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Show archived</span>
          </label>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Expense Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-5 h-5" />}
          title="No expenses match your filter"
          description="Create a new expense to organize parts, installment plans, or recurring bills."
          actionLabel="New expense"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((es) => {
            const principalRemaining = Math.max(0, es.remainingCommitted - es.financingRemaining);
            const isOverdueNext = !!es.nextDueDate && es.nextDueDate < todayISODate();
            return (
              <Link key={es.expense.id} to={`/expenses/${es.expense.id}`} className="block">
                <Card className="h-full hover:border-slate-300 dark:hover:border-slate-700 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shrink-0"
                          aria-hidden="true"
                        >
                          {es.expense.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {es.expense.name}
                            </h2>
                            {es.expense.archived && (
                              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                                · Archived
                              </span>
                            )}
                          </div>
                          {es.expense.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {es.expense.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {es.overdueCount > 0 && (
                          <StatusBadge
                            status="overdue"
                            label={`${es.overdueCount} overdue`}
                          />
                        )}
                        <StatusBadge status={es.status} />
                      </div>
                    </div>

                    {/* Paid So Far Headline */}
                    <div className="mt-4 flex items-baseline justify-between gap-4">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Paid so far
                        </div>
                        <div className="text-2xl font-bold font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatAmount(es.paidSoFar)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {es.remainingCommitted > 0
                            ? 'Remaining committed'
                            : es.plannedEstimated > 0
                              ? 'Planned estimate'
                              : 'True total'}
                        </div>
                        <div className="text-sm font-semibold font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
                          {es.remainingCommitted > 0
                            ? formatAmount(es.remainingCommitted)
                            : es.plannedEstimated > 0
                              ? formatAmount(es.plannedEstimated)
                              : formatAmount(es.trueTotal)}
                        </div>
                      </div>
                    </div>

                    {/* Stacked Progress Bar */}
                    <div className="mt-3">
                      <ProgressBar
                        showLegend
                        segments={[
                          {
                            key: 'paid',
                            label: `Paid ${formatAmount(es.paidSoFar)}`,
                            value: es.paidSoFar,
                            colorClass: 'bg-emerald-500',
                          },
                          {
                            key: 'rem',
                            label: `Remaining ${formatAmount(principalRemaining)}`,
                            value: principalRemaining,
                            colorClass: 'bg-slate-300 dark:bg-slate-600',
                          },
                          {
                            key: 'interest',
                            label: `Interest & fees left ${formatAmount(es.financingRemaining)}`,
                            value: es.financingRemaining,
                            colorClass: 'bg-amber-400',
                          },
                          {
                            key: 'planned',
                            label: `Planned ${formatAmount(es.plannedEstimated)}`,
                            value: es.plannedEstimated,
                            colorClass: 'bg-violet-400',
                            dashed: true,
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Next Due Footer */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {es.partSummaries.length} part{es.partSummaries.length === 1 ? '' : 's'}
                      {es.costOfFinancing > 0 && ` · Financing ${formatAmount(es.costOfFinancing)} total`}
                    </span>
                    {es.nextDueDate ? (
                      <span
                        className={`font-medium ${
                          isOverdueNext
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {isOverdueNext ? 'Overdue since' : 'Next'} {formatDate(es.nextDueDate)} ·{' '}
                        <span className="font-mono-num tabular-nums">{formatAmount(es.nextDueAmount)}</span>
                      </span>
                    ) : (
                      <span>No pending dues</span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ExpenseFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(created) => {
          void load();
          navigate(`/expenses/${created.id}`);
        }}
      />
    </div>
  );
};
