import { AlertTriangle, ArrowRight, CalendarClock, CreditCard } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api';
import {
  Card,
  EmptyState,
  PaymentDraftTarget,
  ProgressBar,
  QuickPaymentModal,
  StatCard,
  StatusBadge,
} from '../../components';
import { useApp } from '../../context/AppContext';
import { formatShortDate } from '@shared/domain';
import { DashboardData, UpcomingDueItem } from '@shared/types';
import { MiniCalendar } from './MiniCalendar';

export const DashboardPage: React.FC = () => {
  const { formatAmount, formatCompact, formatDate, resolvedTheme } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<PaymentDraftTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPayDue = (due: UpcomingDueItem) => {
    setPayTarget({
      title: due.title,
      subtitle: due.expenseName,
      targetType: due.targetType,
      targetId: due.targetId,
      occurrenceDate: due.occurrenceDate,
      suggestedAmount: due.remaining,
    });
  };

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';

  const chartData =
    data.activeProjection?.timeline.map((pt) => ({
      date: pt.date,
      label: formatShortDate(pt.date),
      balance: pt.total / 100,
      rawTotal: pt.total,
    })) ?? [];

  const allCalendarDues = [...data.overdueDues, ...data.upcomingDues30Days];

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            As of {formatDate(data.today)} · {data.currentCutoffLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/expenses"
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            View Expenses
          </Link>
          {data.activeProjection && (
            <Link
              to={`/projections/${data.activeProjection.projection.id}`}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              Open Projection
            </Link>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Projected Balance Today"
          value={data.activeProjection ? formatAmount(data.totalBalance) : '—'}
          tone={data.totalBalance < 0 ? 'negative' : 'default'}
          subtext={
            <div className="space-y-1">
              {data.activeProjection ? (
                <div>
                  {data.activeProjection.projection.name} · confirmed items only
                </div>
              ) : (
                <div>Create a projection to see this</div>
              )}
              {data.pendingConfirmationCount > 0 && (
                <div className="text-amber-700 dark:text-amber-300">
                  Not yet confirmed:{' '}
                  <span className="font-mono-num tabular-nums whitespace-nowrap">
                    {formatAmount(data.pendingConfirmationNet, { showSign: true })}
                  </span>{' '}
                  ({data.pendingConfirmationCount} item
                  {data.pendingConfirmationCount === 1 ? '' : 's'})
                </div>
              )}
            </div>
          }
        />

        <StatCard
          label="Cutoff & Next Payday"
          value={
            data.daysUntilNextPayday === null
              ? '—'
              : data.daysUntilNextPayday === 0
                ? 'Payday today'
                : `${data.daysUntilNextPayday} day${data.daysUntilNextPayday === 1 ? '' : 's'} to payday`
          }
          tone="positive"
          subtext={
            <span>
              {data.nextPaydayDate ? `${formatDate(data.nextPaydayDate)} · ` : ''}
              Projected at cutoff end:{' '}
              <strong className="font-mono-num tabular-nums text-slate-700 dark:text-slate-200">
                {formatAmount(data.moneyLeftThisCutoff)}
              </strong>
            </span>
          }
        />

        <StatCard
          label={
            data.activeProjection
              ? `End Balance (${data.activeProjection.projection.name})`
              : 'Projection End Balance'
          }
          value={
            data.activeProjection
              ? formatAmount(data.activeProjection.summary.endBalance)
              : '—'
          }
          tone={
            data.activeProjection && data.activeProjection.summary.endBalance < 0
              ? 'negative'
              : 'default'
          }
          subtext={
            data.activeProjection
              ? `Low: ${formatAmount(data.activeProjection.summary.lowestBalance)} on ${formatShortDate(
                  data.activeProjection.summary.lowestBalanceDate
                )}`
              : 'Create a projection to forecast balance'
          }
        />

        <StatCard
          label="Overdue Dues"
          value={formatAmount(data.totalOverdueAmount)}
          tone={data.overdueCount > 0 ? 'negative' : 'positive'}
          subtext={
            data.overdueCount > 0
              ? `${data.overdueCount} item${data.overdueCount === 1 ? '' : 's'} needing payment`
              : 'All committed dues are up to date'
          }
        />
      </div>

      {/* Main Chart + Calendar Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.activeProjection
                  ? `${data.activeProjection.projection.name} — Projected Cashflow`
                  : 'Projected Cashflow'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily combined balance with today marker
              </p>
            </div>
            {data.activeProjection && (
              <Link
                to={`/projections/${data.activeProjection.projection.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <span>Full ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 22, right: 16, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashBalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatShortDate(String(v))}
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    minTickGap={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(Math.round(Number(v) * 100))}
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    width={64}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                    }}
                    labelFormatter={(label) => formatDate(String(label))}
                    formatter={(val) => [
                      formatAmount(Math.round(Number(val) * 100)),
                      'Total Balance',
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine
                    x={data.today}
                    stroke={isDark ? '#38bdf8' : '#0284c7'}
                    strokeDasharray="4 4"
                    label={{
                      value: 'Today',
                      position: 'top',
                      fill: isDark ? '#38bdf8' : '#0284c7',
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Total Balance"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#dashBalGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<CalendarClock className="w-5 h-5" />}
              title="No active projection"
              description="Create a cashflow projection to see your future balance curve."
            />
          )}
        </Card>

        <Card>
          <MiniCalendar
            today={data.today}
            paydayDates={data.paydayDatesInRange}
            dues={allCalendarDues}
          />
        </Card>
      </div>

      {/* Overdue & Upcoming Dues Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Overdue Dues ({data.overdueDues.length})
              </h2>
            </div>
          </div>

          {data.overdueDues.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              Nothing overdue right now.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.overdueDues.map((due) => (
                <DueRow
                  key={due.id}
                  due={due}
                  overdue
                  amount={formatAmount(due.remaining)}
                  dateText={`Due ${formatDate(due.dueDate)}`}
                  onPay={() => openPayDue(due)}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Dues (Next 30 Days)
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {data.upcomingDues30Days.length} scheduled
            </span>
          </div>

          {data.upcomingDues30Days.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No dues scheduled within the next 30 days.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.upcomingDues30Days.slice(0, 6).map((due) => (
                <DueRow
                  key={due.id}
                  due={due}
                  amount={formatAmount(due.remaining)}
                  dateText={formatDate(due.dueDate)}
                  onPay={() => openPayDue(due)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Expense Progress + Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Expense Progress
            </h2>
            <Link
              to="/expenses"
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              All expenses
            </Link>
          </div>
          <div className="space-y-4">
            {data.expenseSummaries.map((es) => (
              <Link
                key={es.expense.id}
                to={`/expenses/${es.expense.id}`}
                className="block rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0" aria-hidden="true">
                      {es.expense.icon}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {es.expense.name}
                    </span>
                    <span className="shrink-0">
                      <StatusBadge status={es.status} />
                    </span>
                  </div>
                  <div className="text-xs font-mono-num tabular-nums sm:text-right sm:shrink-0">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatAmount(es.paidSoFar)}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500"> paid</span>
                    {es.remainingCommitted > 0 && (
                      <span className="text-slate-500 dark:text-slate-400">
                        {' '}
                        · {formatAmount(es.remainingCommitted)} left
                      </span>
                    )}
                    {es.plannedEstimated > 0 && (
                      <span className="text-violet-600 dark:text-violet-400">
                        {' '}
                        · {formatAmount(es.plannedEstimated)} planned
                      </span>
                    )}
                  </div>
                </div>
                <ProgressBar
                  segments={[
                    {
                      key: 'paid',
                      label: `Paid: ${formatAmount(es.paidSoFar)}`,
                      value: es.paidSoFar,
                      colorClass: 'bg-emerald-500',
                    },
                    {
                      key: 'remaining',
                      label: `Remaining: ${formatAmount(
                        Math.max(0, es.remainingCommitted - es.financingRemaining)
                      )}`,
                      value: Math.max(0, es.remainingCommitted - es.financingRemaining),
                      colorClass: 'bg-slate-300 dark:bg-slate-600',
                    },
                    {
                      key: 'interest',
                      label: `Interest & fees left: ${formatAmount(es.financingRemaining)}`,
                      value: es.financingRemaining,
                      colorClass: 'bg-amber-400',
                    },
                    {
                      key: 'planned',
                      label: `Planned: ${formatAmount(es.plannedEstimated)}`,
                      value: es.plannedEstimated,
                      colorClass: 'bg-violet-400',
                      dashed: true,
                    },
                  ]}
                />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Payments
            </h2>
          </div>
          {data.recentPayments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No payments logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentPayments.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {p.expenseIcon ? `${p.expenseIcon} ` : ''}
                      {p.targetLabel}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDate(p.date)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatAmount(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <QuickPaymentModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onSaved={() => void load()}
      />
    </div>
  );
};

/** One due in the Overdue / Upcoming lists. Badge sits on the meta line so it never shifts. */
const DueRow: React.FC<{
  due: UpcomingDueItem;
  overdue?: boolean;
  amount: string;
  dateText: string;
  onPay: () => void;
}> = ({ due, overdue = false, amount, dateText, onPay }) => (
  <div className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
    <div className="min-w-0">
      <Link
        to={`/expenses/${due.expenseId}`}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline min-w-0"
        title={due.title}
      >
        <span aria-hidden="true" className="shrink-0">
          {due.expenseIcon}
        </span>
        <span className="truncate">{due.title}</span>
      </Link>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
        <StatusBadge status={overdue ? 'overdue' : due.status} />
        <span>
          {dateText} · {due.subtitle}
        </span>
      </div>
    </div>
    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
      <span
        className={`text-sm font-semibold font-mono-num tabular-nums ${
          overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {amount}
      </span>
      <button
        type="button"
        onClick={onPay}
        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
          overdue
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        Log payment
      </button>
    </div>
  </div>
);
