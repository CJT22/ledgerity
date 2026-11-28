import {
  CopyPlus,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Scale,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api';
import {
  Card,
  DateInput,
  EmptyState,
  Modal,
  MoneyInput,
  StatCard,
} from '../../components';
import { useApp } from '../../context/AppContext';
import { formatShortDate, todayISODate } from '@shared/domain';
import {
  ISODate,
  Money,
  OccurrenceOverride,
  ProjectionItem,
  ProjectionResult,
  ProjectionRow,
} from '@shared/types';
import { CheckpointModal } from './CheckpointModal';
import { ProjectionItemDrawer } from './ProjectionItemDrawer';
import { StartSourcesModal } from './StartSourcesEditor';
import { ProjectionDetailsModal } from './ProjectionDetailsModal';
import { CutoffList, LedgerList, RowFilter, RowHandlers } from './ProjectionRowList';

function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ProjectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatAmount, formatCompact, formatDate, resolvedTheme, toast, confirm } = useApp();

  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'cutoff' | 'ledger'>('cutoff');
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');

  // Drawers & modals
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [editingSeriesItem, setEditingSeriesItem] = useState<ProjectionItem | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [startSourcesOpen, setStartSourcesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Occurrence edit modal
  const [editingOccRow, setEditingOccRow] = useState<ProjectionRow | null>(null);
  const [occSkipped, setOccSkipped] = useState(false);
  const [occMovedDate, setOccMovedDate] = useState<ISODate>('');
  const [occPlannedAmount, setOccPlannedAmount] = useState<Money>(0);
  const [occNote, setOccNote] = useState('');

  // Editable start/end notes
  const [editingStartNote, setEditingStartNote] = useState(false);
  const [startNoteDraft, setStartNoteDraft] = useState('');
  const [editingEndNote, setEditingEndNote] = useState(false);
  const [endNoteDraft, setEndNoteDraft] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.runProjection(id);
      setResult(res);
      setStartNoteDraft(res.projection.startNote ?? '');
      setEndNoteDraft(res.projection.endNote ?? '');
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemById = useMemo(() => {
    const map = new Map<string, ProjectionItem>();
    for (const it of result?.items ?? []) map.set(it.id, it);
    return map;
  }, [result]);

  const overrideByKey = useMemo(() => {
    const map = new Map<string, OccurrenceOverride>();
    for (const ov of result?.overrides ?? []) {
      map.set(`${ov.itemId}::${ov.originalDate}`, ov);
    }
    return map;
  }, [result]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  if (!result) {
    return (
      <EmptyState
        icon={<Scale className="w-5 h-5" />}
        title="Projection not found"
        description="This projection may have been removed."
        actionLabel="Back to Projections"
        onAction={() => navigate('/projections')}
      />
    );
  }

  const { projection, rows, cutoffGroups, timeline, summary } = result;
  const today = todayISODate();
  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';

  const handleToggleIncludeDues = async () => {
    await api.updateProjection(projection.id, {
      includeExpenseDues: !projection.includeExpenseDues,
    });
    toast(
      !projection.includeExpenseDues
        ? 'Expense dues included in projection'
        : 'Expense dues hidden from projection'
    );
    void load();
  };

  const handleDuplicateScenario = async () => {
    const dup = await api.duplicateProjection(
      projection.id,
      `${projection.name} – Scenario`
    );
    toast('Duplicated as scenario');
    navigate(`/projections/${dup.id}`);
  };

  const handleExportCsv = async () => {
    const csv = await api.exportProjectionCsv(projection.id);
    downloadTextFile(
      `${projection.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`,
      csv
    );
    toast('CSV exported');
  };

  const handleSaveNote = async (which: 'start' | 'end') => {
    if (which === 'start') {
      await api.updateProjection(projection.id, { startNote: startNoteDraft.trim() || undefined });
      setEditingStartNote(false);
    } else {
      await api.updateProjection(projection.id, { endNote: endNoteDraft.trim() || undefined });
      setEditingEndNote(false);
    }
    toast('Note saved');
    void load();
  };

  const handleToggleExclusion = async (row: ProjectionRow) => {
    if (!row.linkedSourceType || !row.linkedSourceId) return;
    const excludedNow = await api.toggleExclusion({
      projectionId: projection.id,
      sourceType: row.linkedSourceType,
      sourceId: row.linkedSourceId,
      occurrenceDate: row.originalDate,
    });
    toast(excludedNow ? 'Excluded from this projection' : 'Re-included in projection');
    void load();
  };

  const openEditOccurrence = (row: ProjectionRow) => {
    setEditingOccRow(row);
    setOccSkipped(row.skipped);
    setOccMovedDate(row.effectiveDate);
    setOccPlannedAmount(row.plannedAmount);
    setOccNote(row.note ?? '');
  };

  const handleSaveOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOccRow || !editingOccRow.itemId) return;
    const existing = overrideByKey.get(
      `${editingOccRow.itemId}::${editingOccRow.originalDate}`
    );
    await api.upsertOverride({
      ...existing,
      itemId: editingOccRow.itemId,
      originalDate: editingOccRow.originalDate,
      skipped: occSkipped,
      movedToDate: occMovedDate !== editingOccRow.originalDate ? occMovedDate : undefined,
      plannedAmount: occPlannedAmount,
      note: occNote.trim() || undefined,
    });
    setEditingOccRow(null);
    toast('Occurrence updated');
    void load();
  };

  const handleDeleteSeries = async (item: ProjectionItem) => {
    const ok = await confirm({
      title: `Delete "${item.name}" series?`,
      message: 'This removes all occurrences of this item from the projection.',
      confirmLabel: 'Delete Series',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteProjectionItem(item.id);
    toast('Series deleted');
    void load();
  };

  // Neutral colour for the balance line
  const totalColor = isDark ? '#e2e8f0' : '#0f172a';

  // Chart data
  const chartData = timeline.map((pt) => {
    const row: Record<string, string | number | boolean | undefined> = {
      date: pt.date,
      Total: pt.total / 100,
      hasPayday: pt.hasPayday,
      hasBigMinus: pt.hasBigMinus,
      bigMinusLabel: pt.bigMinusLabel,
    };
    return row;
  });

  const paydayMarkers = timeline.filter((pt) => pt.hasPayday);
  const bigMinusMarkers = timeline.filter((pt) => pt.hasBigMinus);

  const rowHandlers: RowHandlers = {
    onEditOccurrence: openEditOccurrence,
    onEditSeries: (itemId) => {
      const series = itemById.get(itemId);
      if (series) {
        setEditingSeriesItem(series);
        setItemDrawerOpen(true);
      }
    },
    onDeleteSeries: (itemId) => {
      const series = itemById.get(itemId);
      if (series) void handleDeleteSeries(series);
    },
    onToggleExclusion: (row) => void handleToggleExclusion(row),
    onDeleteCheckpoint: async (checkpointId) => {
      await api.deleteCheckpoint(checkpointId);
      toast('Checkpoint removed');
      void load();
    },
  };

  const hasOverride =
    editingOccRow?.itemId !== undefined &&
    overrideByKey.has(`${editingOccRow.itemId}::${editingOccRow.originalDate}`);

  const handleResetOccurrence = async () => {
    if (!editingOccRow?.itemId) return;
    await api.deleteOverride(editingOccRow.itemId, editingOccRow.originalDate);
    setEditingOccRow(null);
    toast('Date reset to the series');
    void load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            <Link to="/projections" className="hover:underline">
              Projections
            </Link>{' '}
            / <span>{projection.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {projection.name}
            </h1>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              title="Edit name and dates"
              aria-label="Edit projection name and dates"
              className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatDate(projection.startDate)} – {formatDate(projection.endDate)}
            {projection.parentProjectionId && ' · Scenario'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingSeriesItem(null);
              setItemDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add item</span>
          </button>
          <button
            type="button"
            onClick={() => setCheckpointOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Set actual balance</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicateScenario()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span>Duplicate as scenario</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Start Balance"
          value={formatAmount(summary.startTotal)}
          subtext={
            <div className="space-y-1">
              {projection.startSources.length > 1 && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                  {projection.startSources.map((s, i) => (
                    <span key={i}>
                      {s.label}: {formatCompact(s.amount)}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setStartSourcesOpen(true)}
                className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline text-left"
              >
                Edit sources
              </button>
              {editingStartNote ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={startNoteDraft}
                    onChange={(e) => setStartNoteDraft(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-0.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveNote('start')}
                    className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[11px]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingStartNote(true)}
                  className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 underline decoration-dotted text-left"
                >
                  {projection.startNote || 'Add start note'}
                </button>
              )}
            </div>
          }
        />

        <StatCard
          label="Projected End Balance"
          value={formatAmount(summary.endBalance)}
          tone={summary.endBalance < 0 ? 'negative' : 'positive'}
          subtext={
            editingEndNote ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="text"
                  value={endNoteDraft}
                  onChange={(e) => setEndNoteDraft(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-0.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveNote('end')}
                  className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[11px]"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingEndNote(true)}
                className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 underline decoration-dotted text-left"
              >
                {projection.endNote || 'Add end note'}
              </button>
            )
          }
        />

        <StatCard
          label="Lowest Point"
          value={formatAmount(summary.lowestBalance)}
          tone={summary.lowestBalance < 0 ? 'negative' : 'warning'}
          subtext={`on ${formatDate(summary.lowestBalanceDate)}`}
        />

        <StatCard
          label="Total Inflows"
          value={`+${formatAmount(summary.totalIn)}`}
          tone="positive"
          subtext="Money coming in"
        />

        <StatCard
          label="Total Outflows"
          value={`−${formatAmount(summary.totalOut)}`}
          tone="negative"
          subtext="Bills, dues & purchases"
        />
      </div>

      {/* Balance Chart */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Projected Balance Timeline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Shaded bands show cutoff periods · Green dots = paydays · Red dots = major outflows
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 22, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="projTotalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={totalColor} stopOpacity={isDark ? 0.18 : 0.12} />
                  <stop offset="95%" stopColor={totalColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              {/* Alternating shaded cutoff period bands */}
              {cutoffGroups.map((g, idx) =>
                idx % 2 === 0 ? (
                  <ReferenceArea
                    key={g.id}
                    x1={g.startDate}
                    x2={g.endDate}
                    fill={isDark ? '#1e293b' : '#f1f5f9'}
                    fillOpacity={isDark ? 0.45 : 0.7}
                  />
                ) : null
              )}

              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatShortDate(String(v))}
                tick={{ fontSize: 11, fill: axisTickColor }}
                minTickGap={30}
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
                labelFormatter={(l) => formatDate(String(l))}
                formatter={(val, name) => [
                  formatAmount(Math.round(Number(val) * 100)),
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              <ReferenceLine y={0} stroke="#ef4444" strokeOpacity={0.5} />

              {today >= projection.startDate && today <= projection.endDate && (
                <ReferenceLine
                  x={today}
                  stroke={isDark ? '#38bdf8' : '#0284c7'}
                  strokeDasharray="4 4"
                  label={{
                    value: 'Today',
                    position: 'top',
                    fill: isDark ? '#38bdf8' : '#0284c7',
                    fontSize: 11,
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey="Total"
                name="Total Balance"
                stroke={totalColor}
                strokeWidth={2.5}
                fill="url(#projTotalGrad)"
              />

              {paydayMarkers.map((pt) => (
                <ReferenceDot
                  key={`pd_${pt.date}`}
                  x={pt.date}
                  y={pt.total / 100}
                  r={4}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}

              {bigMinusMarkers.map((pt) => (
                <ReferenceDot
                  key={`bm_${pt.date}`}
                  x={pt.date}
                  y={pt.total / 100}
                  r={4.5}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* View Toggle & Include Expense Dues Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('cutoff')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'cutoff'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            By cutoff
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ledger')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'ledger'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Ledger
          </button>
        </div>

        <div className="inline-flex items-center gap-1" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['add', 'Income'],
              ['minus', 'Expenses'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRowFilter(value)}
              aria-pressed={rowFilter === value}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                rowFilter === value
                  ? value === 'add'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : value === 'minus'
                      ? 'bg-rose-600 border-rose-600 text-white'
                      : 'bg-slate-900 dark:bg-slate-100 border-transparent text-white dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={projection.includeExpenseDues}
            onChange={() => void handleToggleIncludeDues()}
            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
          />
          <span>Include dues from Expenses</span>
        </label>
      </div>

      {rows.length === 0 ? (
        <Card padding="none">
          <div className="p-6">
            <EmptyState
              icon={<Plus className="w-5 h-5" />}
              title="Nothing projected yet"
              description="Add income or bills to see them here."
              actionLabel="Add item"
              onAction={() => {
                setEditingSeriesItem(null);
                setItemDrawerOpen(true);
              }}
            />
          </div>
        </Card>
      ) : viewMode === 'cutoff' ? (
        <CutoffList
          groups={cutoffGroups}
          today={today}
          filter={rowFilter}
          handlers={rowHandlers}
          formatAmount={formatAmount}
        />
      ) : (
        <LedgerList
          rows={rows}
          today={today}
          filter={rowFilter}
          handlers={rowHandlers}
          formatAmount={formatAmount}
        />
      )}

      {/* Drawers & Modals */}
      <ProjectionItemDrawer
        open={itemDrawerOpen}
        projectionId={projection.id}
        defaultDate={projection.startDate}
        rangeStart={projection.startDate}
        rangeEnd={projection.endDate}
        item={editingSeriesItem}
        onClose={() => setItemDrawerOpen(false)}
        onSaved={() => void load()}
      />

      <ProjectionDetailsModal
        open={detailsOpen}
        projection={projection}
        onClose={() => setDetailsOpen(false)}
        onSaved={() => void load()}
      />

      <StartSourcesModal
        open={startSourcesOpen}
        projection={projection}
        onClose={() => setStartSourcesOpen(false)}
        onSaved={() => void load()}
      />

      <CheckpointModal
        open={checkpointOpen}
        projectionId={projection.id}
        minDate={projection.startDate}
        maxDate={projection.endDate}
        onClose={() => setCheckpointOpen(false)}
        onSaved={() => void load()}
      />

      {/* Single Occurrence Edit Modal */}
      <Modal
        open={Boolean(editingOccRow)}
        onClose={() => setEditingOccRow(null)}
        title="Edit This Date"
        subtitle={
          editingOccRow
            ? `${editingOccRow.name} · Original date ${formatDate(editingOccRow.originalDate)}`
            : undefined
        }
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveOccurrence} className="space-y-4">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={occSkipped}
              onChange={(e) => setOccSkipped(e.target.checked)}
              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <span>Skip this occurrence (strike through)</span>
          </label>

          {!occSkipped && (
            <>
              <DateInput
                label="Date"
                value={occMovedDate}
                min={projection.startDate}
                max={projection.endDate}
                onChange={setOccMovedDate}
              />
              <MoneyInput
                label="Planned Amount for this occurrence"
                value={occPlannedAmount}
                onChange={setOccPlannedAmount}
              />
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Note
            </label>
            <input
              type="text"
              value={occNote}
              onChange={(e) => setOccNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {hasOverride && (
              <button
                type="button"
                onClick={() => void handleResetOccurrence()}
                className="mr-auto inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                title="Undo changes to this date and follow the series again"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to series
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditingOccRow(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
