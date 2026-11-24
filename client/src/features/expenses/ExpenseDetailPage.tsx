import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api';
import {
  Card,
  DataTable,
  DateInput,
  EmptyState,
  Modal,
  MoneyInput,
  PaymentDraftTarget,
  ProgressBar,
  ProgressRing,
  QuickPaymentModal,
  StatCard,
  StatusBadge,
} from '../../components';
import { useApp } from '../../context/AppContext';
import { computePlanDueKey, formatShortDate, todayISODate } from '@shared/domain';
import {
  ExpenseDetailPayload,
  InstallmentPlan,
  ISODate,
  Money,
  Part,
  PartSummary,
  Payment,
} from '@shared/types';
import { AffordabilityPanel } from './AffordabilityPanel';
import { ExpenseFormModal } from './ExpenseFormModal';
import { PartDrawer } from './PartDrawer';
import { PlanDrawer } from './PlanDrawer';

const PIE_COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

export const ExpenseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    formatAmount,
    formatCompact,
    formatDate,
    resolvedTheme,
    toast,
    confirm,
  } = useApp();

  const [detail, setDetail] = useState<ExpenseDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [partDrawerOpen, setPartDrawerOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InstallmentPlan | null>(null);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
  const [payTarget, setPayTarget] = useState<PaymentDraftTarget | null>(null);

  // Add charge modal
  const [chargePlanId, setChargePlanId] = useState<string | null>(null);
  const [chargeDate, setChargeDate] = useState<ISODate>(todayISODate());
  const [chargeAmount, setChargeAmount] = useState<Money>(0);
  const [chargeReason, setChargeReason] = useState('');

  // Edit payment modal
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState<Money>(0);
  const [editPayDate, setEditPayDate] = useState<ISODate>(todayISODate());
  const [editPayNote, setEditPayNote] = useState('');

  // Inline editing for parts
  const [inlinePartEdit, setInlinePartEdit] = useState<{
    id: string;
    name: string;
    price: Money;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getExpense(id);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const partMap = useMemo(() => {
    const map = new Map<string, Part>();
    for (const p of detail?.parts ?? []) map.set(p.id, p);
    return map;
  }, [detail]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <EmptyState
        icon={<Edit3 className="w-5 h-5" />}
        title="Expense not found"
        description="This expense may have been deleted."
        actionLabel="Back to Expenses"
        onAction={() => navigate('/expenses')}
      />
    );
  }

  const { expense, parts, plans, payments, summary } = detail;
  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';

  const handleArchiveToggle = async () => {
    await api.updateExpense(expense.id, { archived: !expense.archived });
    toast(expense.archived ? 'Expense restored from archive' : 'Expense archived');
    void load();
  };

  const handleDeleteExpense = async () => {
    const ok = await confirm({
      title: `Delete "${expense.name}"?`,
      message: 'This will permanently delete this expense, all its parts, plans, and payment logs.',
      confirmLabel: 'Delete Expense',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteExpense(expense.id);
    toast('Expense deleted');
    navigate('/expenses');
  };

  const handleInlinePartSave = async () => {
    if (!inlinePartEdit) return;
    if (!inlinePartEdit.name.trim() || inlinePartEdit.price <= 0) {
      toast('Name and positive price required', 'error');
      return;
    }
    await api.updatePart(inlinePartEdit.id, {
      name: inlinePartEdit.name.trim(),
      price: inlinePartEdit.price,
    });
    setInlinePartEdit(null);
    toast('Part updated');
    void load();
  };

  const handleDeletePart = async (part: Part) => {
    const ok = await confirm({
      title: `Delete part "${part.name}"?`,
      message: 'Payments tied directly to this part will also be removed.',
      confirmLabel: 'Delete Part',
      destructive: true,
    });
    if (!ok) return;
    await api.deletePart(part.id);
    toast('Part deleted');
    void load();
  };

  const handleDeletePlan = async (plan: InstallmentPlan) => {
    const ok = await confirm({
      title: `Delete plan "${plan.name}"?`,
      message: 'This removes the installment schedule and its recorded due payments.',
      confirmLabel: 'Delete Plan',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteInstallmentPlan(plan.id);
    toast('Installment plan deleted');
    void load();
  };

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargePlanId || chargeAmount <= 0 || !chargeReason.trim()) {
      toast('Enter a reason and positive amount', 'error');
      return;
    }
    await api.addPlanCharge(chargePlanId, {
      date: chargeDate,
      amount: chargeAmount,
      reason: chargeReason.trim(),
    });
    setChargePlanId(null);
    setChargeAmount(0);
    setChargeReason('');
    toast('Charge added to plan');
    void load();
  };

  const handleSaveEditedPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || editPayAmount <= 0) return;
    await api.updatePayment(editingPayment.id, {
      amount: editPayAmount,
      date: editPayDate,
      note: editPayNote.trim() || undefined,
    });
    setEditingPayment(null);
    toast('Payment updated');
    void load();
  };

  const handleDeletePayment = async (pay: Payment) => {
    const ok = await confirm({
      title: 'Delete payment?',
      message: `Remove ${formatAmount(pay.amount)} payment logged on ${formatDate(pay.date)}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deletePayment(pay.id);
    toast('Payment deleted');
    void load();
  };

  // Chart 1: Donut of cost by part + financing slice
  const donutData = [
    ...summary.partSummaries
      .filter((ps) => !ps.part.isPlanned && ps.part.price > 0)
      .map((ps, idx) => ({
        name: ps.part.name,
        value: Math.round((ps.part.kind === 'recurring' ? ps.paid + ps.remaining : ps.part.price) / 100),
        color: PIE_COLORS[idx % PIE_COLORS.length],
      })),
    ...(summary.costOfFinancing > 0
      ? [
          {
            name: 'Interest & Fees',
            value: Math.round(summary.costOfFinancing / 100),
            color: '#f59e0b',
          },
        ]
      : []),
  ];

  // Chart 2: Horizontal bars of Paid vs Remaining per part
  const partBarsData = summary.partSummaries
    .filter((ps) => !ps.part.isPlanned)
    .map((ps) => ({
      name: ps.part.name.length > 18 ? `${ps.part.name.slice(0, 17)}…` : ps.part.name,
      Paid: Math.round(ps.paid / 100),
      Remaining: Math.round(ps.remaining / 100),
    }));

  // Chart 3: Cumulative paid over time + dashed projected future dues
  const cumulativeData = summary.cumulativeSeries.map((pt) => ({
    date: pt.date,
    Paid: pt.paidCumulative !== null ? pt.paidCumulative / 100 : null,
    Projected: pt.projectedCumulative !== null ? pt.projectedCumulative / 100 : null,
  }));

  const recurringParts = summary.partSummaries.filter((ps) => ps.part.kind === 'recurring');
  const flexibleParts = summary.partSummaries.filter(
    (ps) => !ps.part.isPlanned && ps.part.paymentMode === 'flexible'
  );
  const plannedParts = summary.partSummaries.filter((ps) => ps.part.isPlanned);

  const getPaymentTargetLabel = (p: Payment): string => {
    if (p.targetType === 'part' || p.targetType === 'recurring_occurrence') {
      const part = partMap.get(p.targetId);
      return part ? part.name : 'Part payment';
    }
    if (p.targetType === 'plan_due') {
      const [planId, seq] = p.targetId.split(':');
      const pl = plans.find((x) => x.id === planId);
      return pl ? `${pl.name} (${seq === '0' ? 'Down payment' : `#${seq}`})` : 'Installment';
    }
    if (p.targetType === 'plan_charge') {
      for (const pl of plans) {
        const ch = pl.charges.find((c) => c.id === p.targetId);
        if (ch) return ch.reason;
      }
      return 'Plan charge';
    }
    return 'Payment';
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            <Link to="/expenses" className="hover:underline">
              Expenses
            </Link>{' '}
            / <span>{expense.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              {expense.icon}
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {expense.name}
                </h1>
                <StatusBadge status={summary.status} />
                {expense.archived && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">· Archived</span>
                )}
              </div>
              {expense.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {expense.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditExpenseOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => void handleArchiveToggle()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {expense.archived ? (
              <>
                <ArchiveRestore className="w-3.5 h-3.5" />
                <span>Unarchive</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteExpense()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Header Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Paid So Far"
          value={formatAmount(summary.paidSoFar)}
          tone="positive"
          size="lg"
          subtext={`${payments.length} payment${payments.length === 1 ? '' : 's'} logged`}
        />
        <StatCard
          label="Remaining Committed"
          value={formatAmount(summary.remainingCommitted)}
          tone={summary.overdueCount > 0 ? 'negative' : 'default'}
          subtext={
            summary.nextDueDate
              ? `${summary.nextDueDate < todayISODate() ? 'Overdue since' : 'Next'} ${formatDate(
                  summary.nextDueDate
                )} (${formatAmount(summary.nextDueAmount)})`
              : 'No committed dues left'
          }
        />
        <StatCard
          label="Planned (Estimated)"
          value={formatAmount(summary.plannedEstimated)}
          tone="planned"
          subtext={`${plannedParts.length} wishlist item${plannedParts.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="True Total (Committed)"
          value={formatAmount(summary.trueTotal)}
          subtext="Paid + remaining committed"
        />
        <StatCard
          label="Cost of Financing"
          value={formatAmount(summary.costOfFinancing)}
          tone={summary.costOfFinancing > 0 ? 'warning' : 'default'}
          subtext="Interest, fees & charges"
        />
      </div>

      {/* Charts Row */}
      {(donutData.length > 0 || cumulativeData.length > 1) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Cost Breakdown by Part
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Includes interest &amp; fees slice
            </p>
            {donutData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={2}
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(v) => formatAmount(Math.round(Number(v) * 100))}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-10 text-center">No committed parts yet.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Paid vs. Remaining per Part
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Committed items progress
            </p>
            {partBarsData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={partBarsData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatCompact(Math.round(Number(v) * 100))}
                      tick={{ fontSize: 10, fill: axisTickColor }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={112}
                      tick={{ fontSize: 11, fill: axisTickColor }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(v) => formatAmount(Math.round(Number(v) * 100))}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="Paid" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Remaining" stackId="a" fill={isDark ? '#475569' : '#cbd5e1'} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-10 text-center">No committed parts yet.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Cumulative Paid &amp; Future Dues
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Solid = actual paid · Dashed = scheduled dues
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeData} margin={{ top: 8, right: 24, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatShortDate(String(v))}
                    tick={{ fontSize: 10, fill: axisTickColor }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(Math.round(Number(v) * 100))}
                    tick={{ fontSize: 10, fill: axisTickColor }}
                    width={58}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    labelFormatter={(l) => formatDate(String(l))}
                    formatter={(v) =>
                      v !== null ? formatAmount(Math.round(Number(v) * 100)) : '—'
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="Paid"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Projected"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Parts Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Parts &amp; Line Items
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click a part’s edit icon to adjust name or price inline
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingPart(null);
              setPartDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add part</span>
          </button>
        </div>

        <DataTable<PartSummary>
          rows={summary.partSummaries}
          getRowKey={(ps) => ps.part.id}
          getRowClassName={(ps) =>
            ps.part.isPlanned
              ? 'border-l-2 border-dashed border-l-violet-400 dark:border-l-violet-600'
              : ''
          }
          emptyState={
            <EmptyState
              icon={<Plus className="w-5 h-5" />}
              title="No parts yet"
              description="Add one-time items, planned wishlist pieces, or recurring fees to this expense."
              actionLabel="Add first part"
              onAction={() => {
                setEditingPart(null);
                setPartDrawerOpen(true);
              }}
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Part',
              render: (ps) => {
                if (inlinePartEdit?.id === ps.part.id) {
                  return (
                    <input
                      type="text"
                      value={inlinePartEdit.name}
                      onChange={(e) =>
                        setInlinePartEdit({ ...inlinePartEdit, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleInlinePartSave();
                        if (e.key === 'Escape') setInlinePartEdit(null);
                      }}
                      className="w-full rounded border border-emerald-500 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                    />
                  );
                }
                return (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {ps.part.name}
                    </div>
                    {ps.part.notes && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {ps.part.notes}
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'type',
              header: 'Type',
              render: (ps) => {
                if (ps.part.isPlanned) return <StatusBadge status="planned_tag" label="Planned" />;
                if (ps.part.kind === 'recurring') {
                  return (
                    <span className="text-xs text-slate-600 dark:text-slate-300 capitalize">
                      Recurring ({ps.part.recurrence?.freq.replace('_', '-')})
                    </span>
                  );
                }
                const modeLabel =
                  ps.part.paymentMode === 'installment'
                    ? 'Installment'
                    : ps.part.paymentMode === 'flexible'
                      ? 'Flexible'
                      : 'One-time';
                return <span className="text-xs text-slate-600 dark:text-slate-300">{modeLabel}</span>;
              },
            },
            {
              key: 'price',
              header: 'Price',
              align: 'right',
              render: (ps) => {
                if (inlinePartEdit?.id === ps.part.id) {
                  return (
                    <MoneyInput
                      compact
                      className="w-32 ml-auto"
                      value={inlinePartEdit.price}
                      onChange={(v) => setInlinePartEdit({ ...inlinePartEdit, price: v })}
                    />
                  );
                }
                return (
                  <span className="font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
                    {formatAmount(ps.part.price)}
                    {ps.part.kind === 'recurring' && (
                      <span className="text-[11px] text-slate-400"> /occ</span>
                    )}
                  </span>
                );
              },
            },
            {
              key: 'interest',
              header: 'Interest Share',
              align: 'right',
              render: (ps) => (
                <span className="font-mono-num tabular-nums text-xs text-amber-600 dark:text-amber-400">
                  {ps.shareOfInterest > 0 ? formatAmount(ps.shareOfInterest) : '—'}
                </span>
              ),
            },
            {
              key: 'paid',
              header: 'Paid',
              align: 'right',
              render: (ps) => (
                <span className="font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatAmount(ps.paid)}
                </span>
              ),
            },
            {
              key: 'remaining',
              header: 'Remaining',
              align: 'right',
              render: (ps) => (
                <span className="font-mono-num tabular-nums text-slate-700 dark:text-slate-300">
                  {ps.part.isPlanned ? '—' : formatAmount(ps.remaining)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (ps) => {
                if (ps.part.isPlanned) return <StatusBadge status="planned" />;
                if (ps.overdueCount > 0)
                  return <StatusBadge status="overdue" label={`${ps.overdueCount} overdue`} />;
                if (ps.remaining === 0 && ps.paid > 0) return <StatusBadge status="paid" />;
                return <StatusBadge status="active" />;
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (ps) => {
                if (inlinePartEdit?.id === ps.part.id) {
                  return (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleInlinePartSave()}
                        className="px-2 py-1 text-xs rounded bg-emerald-600 text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setInlinePartEdit(null)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="inline-flex items-center gap-1">
                    {!ps.part.isPlanned &&
                      ps.part.kind === 'one_time' &&
                      ps.part.paymentMode !== 'installment' &&
                      ps.remaining > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPayTarget({
                              title: ps.part.name,
                              subtitle: expense.name,
                              targetType: 'part',
                              targetId: ps.part.id,
                              suggestedAmount: ps.remaining,
                            })
                          }
                          className="px-2 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 mr-1"
                        >
                          Pay
                        </button>
                      )}
                    <button
                      type="button"
                      title="Inline edit price & name"
                      onClick={() =>
                        setInlinePartEdit({
                          id: ps.part.id,
                          name: ps.part.name,
                          price: ps.part.price,
                        })
                      }
                      className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                    >
                      Quick edit
                    </button>
                    <button
                      type="button"
                      title="Open full part editor"
                      onClick={() => {
                        setEditingPart(ps.part);
                        setPartDrawerOpen(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete part"
                      onClick={() => void handleDeletePart(ps.part)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      </section>

      {/* Installment Plans Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Installment Plans
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A single plan can finance one or multiple parts together
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingPlan(null);
              setPlanDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New installment plan</span>
          </button>
        </div>

        {summary.planSchedules.length === 0 ? (
          <EmptyState
            icon={<Plus className="w-5 h-5" />}
            title="No installment plans"
            description="Split one or more parts into scheduled payments with automatic interest & fee allocation."
            actionLabel="Create installment plan"
            onAction={() => {
              setEditingPlan(null);
              setPlanDrawerOpen(true);
            }}
          />
        ) : (
          <div className="space-y-4">
            {summary.planSchedules.map((sched) => {
              const expanded = Boolean(expandedPlanIds[sched.plan.id]);
              return (
                <Card key={sched.plan.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <ProgressRing
                        current={sched.paidCount}
                        total={sched.plan.termCount}
                        sublabel="paid"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {sched.plan.name}
                          </h3>
                          {sched.overdueCount > 0 && (
                            <StatusBadge
                              status="overdue"
                              label={`${sched.overdueCount} overdue`}
                            />
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                            {formatAmount(sched.totalPaid)}
                          </span>{' '}
                          paid of{' '}
                          <span className="font-mono-num tabular-nums font-medium text-slate-700 dark:text-slate-200">
                            {formatAmount(sched.totalPayable)}
                          </span>
                          {' · '}
                          Interest + fees + charges:{' '}
                          <span className="font-mono-num tabular-nums text-amber-600 dark:text-amber-400">
                            {formatAmount(
                              sched.totalInterest + sched.totalFees + sched.totalCharges
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>Covers parts:</span>
                          {sched.plan.partAllocations.map((a) => {
                            const pt = partMap.get(a.partId);
                            return (
                              <span
                                key={a.partId}
                                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                              >
                                {pt?.name ?? a.partId} ({formatAmount(a.amount)})
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setChargePlanId(sched.plan.id);
                          setChargeDate(todayISODate());
                          setChargeAmount(0);
                          setChargeReason('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Add charge
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlan(sched.plan);
                          setPlanDrawerOpen(true);
                        }}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        title="Edit plan"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePlan(sched.plan)}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-rose-600"
                        title="Delete plan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPlanIds((prev) => ({
                            ...prev,
                            [sched.plan.id]: !expanded,
                          }))
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        <span>{expanded ? 'Hide schedule' : 'View schedule'}</span>
                        {expanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Charges / Penalties List */}
                  {sched.plan.charges.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                        Charges &amp; Penalties
                      </div>
                      <div className="space-y-1.5">
                        {sched.plan.charges.map((ch) => {
                          const chPaid = payments
                            .filter((p) => p.targetType === 'plan_charge' && p.targetId === ch.id)
                            .reduce((s, p) => s + p.amount, 0);
                          const chRem = Math.max(0, ch.amount - chPaid);
                          return (
                            <div
                              key={ch.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-950/60 px-3 py-2"
                            >
                              <div>
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {ch.reason}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  · {formatDate(ch.date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono-num tabular-nums font-medium text-amber-600 dark:text-amber-400">
                                  {formatAmount(ch.amount)}
                                </span>
                                {chRem === 0 ? (
                                  <StatusBadge status="paid" />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPayTarget({
                                        title: ch.reason,
                                        subtitle: sched.plan.name,
                                        targetType: 'plan_charge',
                                        targetId: ch.id,
                                        suggestedAmount: chRem,
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700"
                                  >
                                    Log payment
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await api.deletePlanCharge(sched.plan.id, ch.id);
                                    toast('Charge removed');
                                    void load();
                                  }}
                                  className="text-slate-400 hover:text-rose-600"
                                  title="Delete charge"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Expandable Schedule Table */}
                  {expanded && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <th className="py-2 px-2 text-left font-medium">#</th>
                            <th className="py-2 px-2 text-left font-medium">Due Date</th>
                            <th className="py-2 px-2 text-right font-medium">Amount</th>
                            <th className="py-2 px-2 text-right font-medium">Paid</th>
                            <th className="py-2 px-2 text-left font-medium">Status</th>
                            <th className="py-2 px-2 text-right font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {sched.dues.map((due) => {
                            const rem = Math.max(0, due.amount - due.paid);
                            return (
                              <tr key={due.seq}>
                                <td className="py-2 px-2 text-slate-500 font-mono-num">
                                  {due.kind === 'down_payment' ? 'DP' : `${due.seq}/${sched.plan.termCount}`}
                                </td>
                                <td className="py-2 px-2 text-slate-900 dark:text-slate-100">
                                  {formatDate(due.dueDate)}
                                </td>
                                <td className="py-2 px-2 text-right font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
                                  {formatAmount(due.amount)}
                                </td>
                                <td className="py-2 px-2 text-right font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                                  {due.paid > 0 ? formatAmount(due.paid) : '—'}
                                </td>
                                <td className="py-2 px-2">
                                  <StatusBadge status={due.status} />
                                </td>
                                <td className="py-2 px-2 text-right">
                                  {rem > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPayTarget({
                                          title:
                                            due.kind === 'down_payment'
                                              ? `${sched.plan.name} (Down payment)`
                                              : `${sched.plan.name} #${due.seq}`,
                                          subtitle: expense.name,
                                          targetType: 'plan_due',
                                          targetId: computePlanDueKey(sched.plan.id, due.seq),
                                          occurrenceDate: due.dueDate,
                                          suggestedAmount: rem,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
                                    >
                                      Log payment
                                    </button>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recurring Fees & Flexible Balances */}
      {(recurringParts.length > 0 || flexibleParts.length > 0) && (
        <div
          className={`grid grid-cols-1 gap-6 ${
            recurringParts.length > 0 && flexibleParts.length > 0 ? 'lg:grid-cols-2' : ''
          }`}
        >
          {recurringParts.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Recurring Fees
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recurringParts.map((ps) => (
                  <div
                    key={ps.part.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ps.part.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Paid so far: {formatAmount(ps.paid)} · Upcoming:{' '}
                        {formatAmount(ps.remaining)}
                        {ps.nextDueDate && ` · Next: ${formatDate(ps.nextDueDate)}`}
                      </div>
                    </div>
                    {ps.nextDueDate && ps.nextDueAmount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPayTarget({
                            title: ps.part.name,
                            subtitle: `${expense.name} · ${formatDate(ps.nextDueDate)}`,
                            targetType: 'recurring_occurrence',
                            targetId: ps.part.id,
                            occurrenceDate: ps.nextDueDate ?? undefined,
                            suggestedAmount: ps.nextDueAmount,
                          })
                        }
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                      >
                        Log payment
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {flexibleParts.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Flexible Balances
              </h2>
              <div className="space-y-4">
                {flexibleParts.map((ps) => (
                  <div key={ps.part.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {ps.part.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num tabular-nums">
                          {formatAmount(ps.paid)} paid of {formatAmount(ps.part.price)} ·{' '}
                          {formatAmount(ps.remaining)} left
                        </div>
                      </div>
                      {ps.remaining > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPayTarget({
                              title: ps.part.name,
                              subtitle: 'Flexible payment',
                              targetType: 'part',
                              targetId: ps.part.id,
                              suggestedAmount: Math.min(ps.remaining, 250000),
                            })
                          }
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
                        >
                          Pay any amount
                        </button>
                      )}
                    </div>
                    <ProgressBar
                      segments={[
                        {
                          key: 'paid',
                          label: 'Paid',
                          value: ps.paid,
                          colorClass: 'bg-emerald-500',
                        },
                        {
                          key: 'rem',
                          label: 'Remaining',
                          value: ps.remaining,
                          colorClass: 'bg-slate-200 dark:bg-slate-700',
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Can I Afford It? Panel on planned parts/expenses */}
      {plannedParts.length > 0 && (
        <AffordabilityPanel
          defaultLabel={
            plannedParts.length === 1
              ? `${expense.name}: ${plannedParts[0].part.name}`
              : `${expense.name} (Planned items)`
          }
          defaultAmount={summary.plannedEstimated}
        />
      )}

      {/* Payments Log */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Payments Log ({payments.length})
        </h2>
        <DataTable<Payment>
          rows={payments}
          getRowKey={(p) => p.id}
          emptyState={
            <EmptyState
              icon={<Plus className="w-5 h-5" />}
              title="No payments logged yet"
              description="Log payments from parts, installment schedules, or recurring fees."
            />
          }
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (p) => (
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {formatDate(p.date)}
                </span>
              ),
            },
            {
              key: 'target',
              header: 'Target',
              render: (p) => (
                <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {getPaymentTargetLabel(p)}
                </span>
              ),
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (p) => (
                <span className="font-mono-num tabular-nums text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatAmount(p.amount)}
                </span>
              ),
            },
            {
              key: 'note',
              header: 'Note',
              render: (p) => (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {p.note || '—'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (p) => (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPayment(p);
                      setEditPayAmount(p.amount);
                      setEditPayDate(p.date);
                      setEditPayNote(p.note ?? '');
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit payment"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePayment(p)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Delete payment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>

      {/* Modals & Drawers */}
      <ExpenseFormModal
        open={editExpenseOpen}
        expense={expense}
        onClose={() => setEditExpenseOpen(false)}
        onSaved={() => void load()}
      />

      <PartDrawer
        open={partDrawerOpen}
        expenseId={expense.id}
        part={editingPart}
        onClose={() => setPartDrawerOpen(false)}
        onSaved={() => void load()}
      />

      <PlanDrawer
        open={planDrawerOpen}
        expenseId={expense.id}
        parts={parts}
        plan={editingPlan}
        onClose={() => setPlanDrawerOpen(false)}
        onSaved={() => void load()}
      />

      <QuickPaymentModal
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onSaved={() => void load()}
      />

      {/* Add Charge Modal */}
      <Modal
        open={Boolean(chargePlanId)}
        onClose={() => setChargePlanId(null)}
        title="Add Late Fee / Charge"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddCharge} className="space-y-4">
          <DateInput label="Charge Date" value={chargeDate} onChange={setChargeDate} required />
          <MoneyInput label="Amount" value={chargeAmount} onChange={setChargeAmount} required />
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reason <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={chargeReason}
              onChange={(e) => setChargeReason(e.target.value)}
              placeholder="e.g., Late payment penalty"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setChargePlanId(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Add Charge
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        open={Boolean(editingPayment)}
        onClose={() => setEditingPayment(null)}
        title="Edit Payment"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveEditedPayment} className="space-y-4">
          <MoneyInput label="Amount" value={editPayAmount} onChange={setEditPayAmount} required />
          <DateInput label="Date" value={editPayDate} onChange={setEditPayDate} required />
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Note
            </label>
            <input
              type="text"
              value={editPayNote}
              onChange={(e) => setEditPayNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingPayment(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Save Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
